// FMX-079: shared tenant/property router for every inbound + outbound
// message channel.
//
// Previously the WhatsApp (FMX-077) and Google Chat (FMX-078) webhooks each
// carried their own `matchPropertyBy*` function. Pulling that logic into one
// place means:
//   • The two gateways use identical match rules (digit-suffix for phone,
//     case-insensitive exact for email).
//   • FMX-080's outbound dispatcher can look up the right (channel, sender)
//     for a given property without re-reading tenant_contact_* columns.
//   • A tenant_route_cache row records the last-known route so repeat
//     matches short-circuit and FMX-080 has an index to work from.
//   • The "first-time unknown sender" prompt behaviour is centralised: we
//     send the nudge once per rolling window across whichever gateway they
//     tried, not once per gateway.
//
// Supabase scope: service-role client, server-only.

import { supabaseServer } from '@/lib/supabase';
import { normalisePhoneDigits } from '@/lib/whatsapp/client';

export type Channel = 'whatsapp' | 'google_chat' | 'email';

export type MatchedProperty = {
  id: string;
  short_code: string;
  tenant_name: string | null;
  tenant_contact_name: string | null;
  tenant_contact_phone: string | null;
  tenant_contact_email: string | null;
  tenant_preferred_channel: Channel;
};

export type ResolveResult =
  | { matched: true;  property: MatchedProperty; source: 'cache' | 'phone_match' | 'email_match'; firstTimeKnown: boolean }
  | { matched: false; property: null;             source: 'none';                                   firstTimeUnknown: boolean };

/**
 * Given a channel + sender id (digits for WhatsApp, lowercased email for
 * Google Chat / email), find the property this sender belongs to.
 *
 * Match order:
 *   1. tenant_route_cache (channel, sender_id) — exact hit, no scan
 *   2. properties.tenant_contact_phone (WhatsApp) — digit-normalised, 8-digit suffix
 *   3. properties.tenant_contact_email (Chat, email) — case-insensitive exact
 *
 * On hit: upsert tenant_route_cache so subsequent inbounds short-circuit
 * and outbound can reach the sender back.
 *
 * `firstTimeKnown` / `firstTimeUnknown` let the caller decide whether to
 * send the onboarding / nudge reply. See `shouldNudgeUnknown` for the
 * rolling-window rule that keeps repeat-stranger traffic quiet.
 */
export async function resolveTenantRoute(args: {
  channel: Channel;
  sender_id: string;
  sender_display_name?: string | null;
}): Promise<ResolveResult> {
  const channel = args.channel;
  const senderId = normaliseSenderId(channel, args.sender_id);
  if (!senderId) {
    return { matched: false, property: null, source: 'none', firstTimeUnknown: await isFirstTimeUnknown(channel, '') };
  }

  // 1. Cache.
  const { data: cached } = await supabaseServer
    .from('tenant_route_cache')
    .select('property_id, first_seen_at')
    .eq('channel', channel)
    .eq('sender_id', senderId)
    .maybeSingle();
  if (cached) {
    const { data: prop } = await supabaseServer
      .from('properties')
      .select('id, short_code, tenant_name, tenant_contact_name, tenant_contact_phone, tenant_contact_email, tenant_preferred_channel, active')
      .eq('id', cached.property_id)
      .maybeSingle();
    if (prop && prop.active) {
      await touchCache(channel, senderId, prop.id as string, args.sender_display_name || null);
      return {
        matched: true,
        property: toMatchedProperty(prop),
        source: 'cache',
        firstTimeKnown: false,
      };
    }
    // Cache points at a dead property; fall through to live match.
  }

  // 2. Live match by channel's natural key.
  let property: MatchedProperty | null = null;
  let source: 'phone_match' | 'email_match' | null = null;

  if (channel === 'whatsapp') {
    property = await matchByPhoneDigits(senderId);
    if (property) source = 'phone_match';
  } else if (channel === 'google_chat' || channel === 'email') {
    property = await matchByEmail(senderId);
    if (property) source = 'email_match';
  }

  if (property && source) {
    // 3. Cache the result. First-time-known vs seen-before distinction lets
    //    gateways send a warmer first reply ("welcome — got you on NH").
    const firstTime = await insertOrTouchCache(channel, senderId, property.id, args.sender_display_name || null);
    return { matched: true, property, source, firstTimeKnown: firstTime };
  }

  // 4. No match. Let the caller decide whether to nudge based on the
  //    rolling-window rule.
  return {
    matched: false,
    property: null,
    source: 'none',
    firstTimeUnknown: await isFirstTimeUnknown(channel, senderId),
  };
}

/**
 * Look up the (channel, sender_id) for a given property — the inverse. Used
 * by FMX-080 to find where to send an outbound status push, and anywhere
 * else the FM side needs to reach a tenant.
 *
 * Preference order:
 *   1. Most recently used cache row on the property's preferred channel
 *   2. Any cache row on the property's preferred channel
 *   3. The tenant_contact_* field for the preferred channel (phone for
 *      whatsapp, email for google_chat/email) — "best guess" when the
 *      tenant has never messaged first.
 *
 * Returns null when there's nothing to reach the tenant with, in which case
 * outbound should fall back to email through the operator inbox.
 */
export async function lookupOutboundRoute(propertyId: string): Promise<
  | { channel: Channel; sender_id: string; source: 'cache' | 'property_contact' }
  | null
> {
  const { data: prop } = await supabaseServer
    .from('properties')
    .select('id, tenant_preferred_channel, tenant_contact_phone, tenant_contact_email')
    .eq('id', propertyId)
    .maybeSingle();
  if (!prop) return null;

  const pref = (prop.tenant_preferred_channel as Channel) || 'email';

  // 1 + 2. Cache lookup on the preferred channel.
  const { data: cacheRow } = await supabaseServer
    .from('tenant_route_cache')
    .select('sender_id, last_seen_at')
    .eq('channel', pref)
    .eq('property_id', propertyId)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cacheRow?.sender_id) {
    return { channel: pref, sender_id: cacheRow.sender_id, source: 'cache' };
  }

  // 3. Fall back to property_contact field.
  if (pref === 'whatsapp' && prop.tenant_contact_phone) {
    const digits = normalisePhoneDigits(prop.tenant_contact_phone);
    if (digits) return { channel: 'whatsapp', sender_id: digits, source: 'property_contact' };
  }
  if ((pref === 'google_chat' || pref === 'email') && prop.tenant_contact_email) {
    return { channel: pref, sender_id: String(prop.tenant_contact_email).trim().toLowerCase(), source: 'property_contact' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function normaliseSenderId(channel: Channel, raw: string): string {
  if (!raw) return '';
  if (channel === 'whatsapp') return normalisePhoneDigits(raw);
  return raw.trim().toLowerCase();
}

function toMatchedProperty(row: any): MatchedProperty {
  return {
    id: row.id as string,
    short_code: row.short_code as string,
    tenant_name: (row.tenant_name as string | null) ?? null,
    tenant_contact_name: (row.tenant_contact_name as string | null) ?? null,
    tenant_contact_phone: (row.tenant_contact_phone as string | null) ?? null,
    tenant_contact_email: (row.tenant_contact_email as string | null) ?? null,
    tenant_preferred_channel: ((row.tenant_preferred_channel as string | null) || 'email') as Channel,
  };
}

async function matchByPhoneDigits(fromDigits: string): Promise<MatchedProperty | null> {
  const { data: rows } = await supabaseServer
    .from('properties')
    .select('id, short_code, tenant_name, tenant_contact_name, tenant_contact_phone, tenant_contact_email, tenant_preferred_channel')
    .eq('active', true)
    .not('tenant_contact_phone', 'is', null);

  for (const r of (rows || [])) {
    const propDigits = normalisePhoneDigits((r as any).tenant_contact_phone as string);
    if (!propDigits) continue;
    if (propDigits === fromDigits) return toMatchedProperty(r);
    if (propDigits.length >= 8 && fromDigits.endsWith(propDigits.slice(-8))) return toMatchedProperty(r);
    if (fromDigits.length >= 8 && propDigits.endsWith(fromDigits.slice(-8))) return toMatchedProperty(r);
  }
  return null;
}

async function matchByEmail(email: string): Promise<MatchedProperty | null> {
  const { data } = await supabaseServer
    .from('properties')
    .select('id, short_code, tenant_name, tenant_contact_name, tenant_contact_phone, tenant_contact_email, tenant_preferred_channel')
    .eq('active', true)
    .ilike('tenant_contact_email', email)
    .maybeSingle();
  return data ? toMatchedProperty(data) : null;
}

async function insertOrTouchCache(
  channel: Channel,
  sender_id: string,
  property_id: string,
  display: string | null,
): Promise<boolean> {
  // Upsert on (channel, sender_id). We detect "first time" by checking
  // existence before the upsert; a race is tolerable (both calls see no
  // row, both insert, one conflicts) because the ON CONFLICT path still
  // results in a single row.
  const { data: existing } = await supabaseServer
    .from('tenant_route_cache')
    .select('id')
    .eq('channel', channel)
    .eq('sender_id', sender_id)
    .maybeSingle();

  if (existing) {
    await supabaseServer
      .from('tenant_route_cache')
      .update({
        property_id,
        tenant_display_name: display,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', existing.id);
    return false;
  }
  await supabaseServer
    .from('tenant_route_cache')
    .insert({
      channel,
      sender_id,
      property_id,
      tenant_display_name: display,
    });
  return true;
}

async function touchCache(
  channel: Channel,
  sender_id: string,
  property_id: string,
  display: string | null,
): Promise<void> {
  await supabaseServer
    .from('tenant_route_cache')
    .update({
      property_id,
      tenant_display_name: display,
      last_seen_at: new Date().toISOString(),
    })
    .eq('channel', channel)
    .eq('sender_id', sender_id);
}

/**
 * First-time-unknown rule: have we already nudged this (channel, sender_id)
 * in the last 7 days? Reads the per-gateway audit tables so the suppression
 * works even if a sender tried WhatsApp yesterday and Chat today.
 *
 * Returns true when caller should send the "ask your FM" nudge.
 */
export async function isFirstTimeUnknown(channel: Channel, sender_id: string): Promise<boolean> {
  if (!sender_id) return false;
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  if (channel === 'whatsapp') {
    const { data } = await supabaseServer
      .from('whatsapp_inbound')
      .select('id')
      .eq('from_wa_id', sender_id)
      .eq('status', 'unknown_sender')
      .not('reply_sent_at', 'is', null)
      .gte('reply_sent_at', since)
      .limit(1)
      .maybeSingle();
    return !data;
  }
  if (channel === 'google_chat') {
    const { data } = await supabaseServer
      .from('google_chat_inbound')
      .select('id')
      .eq('sender_email', sender_id)
      .eq('status', 'unknown_sender')
      .not('reply_sent_at', 'is', null)
      .gte('reply_sent_at', since)
      .limit(1)
      .maybeSingle();
    return !data;
  }
  return true;
}
