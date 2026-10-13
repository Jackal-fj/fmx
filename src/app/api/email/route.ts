// Postmark Inbound webhook. Receives JSON on every email delivered to
// fmx@cmsfiji.com (forwarded via Google Workspace to Postmark's inbound
// address, then POSTed here).
//
// Decision rules:
//   1. Store the raw email in email_inbox (dedupe on Postmark MessageID)
//   2. If subject/body contains an existing DEF-xxxx → attach as thread note
//   3. Else if sender matches a known provider → mark provider_id (vendor reply)
//   4. Else create a DRAFT defect with best-guess property/severity/title
//   5. Image attachments → Supabase Storage → appended to defect photos
//   6. Carl reviews via /email-inbox and promotes draft → open

import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase';
import {
  verifyQuerySecret,
  extractDefectRef,
  detectProperty,
  detectSeverity,
  titleFromEmail,
  topMessageOnly,
  extractForwardedFrom,
  isOperatorAddress,
  isLikelySignatureImage,
  classifySender,
  type PostmarkInbound,
} from '@/lib/postmark';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

const IMAGE_MIMES = /^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i;

export async function POST(request: NextRequest) {
  // 1. Auth check — query-param secret (Postmark rejects user:pass@ URLs).
  if (!verifyQuerySecret(request.url)) {
    console.warn('[email] Postmark webhook: bad or missing ?secret=');
    return new Response('Forbidden', { status: 403 });
  }

  // 2. Parse body.
  let payload: PostmarkInbound;
  try {
    payload = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const messageId = payload.MessageID;
  if (!messageId) {
    return NextResponse.json({ ok: false, error: 'Missing MessageID' }, { status: 400 });
  }

  // 3. Dedupe — Postmark can retry.
  const { data: existing } = await supabaseServer
    .from('email_inbox')
    .select('id')
    .eq('postmark_message_id', messageId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const fromEmail = payload.FromFull?.Email || payload.From || null;
  const fromName = payload.FromFull?.Name || null;
  const toEmail = payload.ToFull?.[0]?.Email || payload.To || null;
  const subject = payload.Subject || null;
  const fullBody = payload.StrippedTextReply || payload.TextBody || null;
  const htmlBody = payload.HtmlBody || null;

  // 4a. Trim multi-message threads down to the newest message. Classification
  //     + description use the top message only; the full body stays in
  //     email_inbox.text_body for audit.
  const topBody = topMessageOnly(fullBody) || fullBody;

  // 4b. If the direct sender is an operator address (Carl forwarding on behalf
  //     of a tenant/KGF), pull the real reporter out of the forwarded block
  //     and use that for classification and reporting.
  const forwardedFrom = isOperatorAddress(fromEmail) ? extractForwardedFrom(fullBody) : null;
  const effectiveFromEmail = forwardedFrom?.email || fromEmail;
  const effectiveFromName = forwardedFrom?.name || fromName;

  // 4c. Classification pass over subject + top message.
  const defRef = extractDefectRef(subject, topBody);
  const propertyGuessFromText = detectProperty(subject, topBody);

  // 4d. Sender classification — map known KGF staff + tenant domains to a
  //     reporter kind + property hint. Falls back to body-keyword detection.
  const senderInfo = classifySender(effectiveFromEmail);
  // Property order of precedence: explicit DEF-ref > body/subject keyword >
  // tenant-domain mapping. (Tenant domain is a HINT, not a guarantee — a KH
  // tenant might email about a NH issue, so prefer explicit keyword matches.)
  const propertyGuess = propertyGuessFromText || senderInfo.tenant_property;
  const severityGuess = detectSeverity(subject, topBody);

  let matchedProviderId: string | null = null;
  if (effectiveFromEmail) {
    const { data: provider } = await supabaseServer
      .from('providers')
      .select('id')
      .ilike('email', effectiveFromEmail)
      .maybeSingle();
    if (provider) matchedProviderId = provider.id;
  }

  const classification = {
    def_ref: defRef,
    property_guess: propertyGuess,
    property_source: propertyGuessFromText ? 'body_keyword' : (senderInfo.tenant_property ? 'tenant_domain' : null),
    severity_guess: severityGuess,
    is_known_provider: !!matchedProviderId,
    sender_kind: senderInfo.kind,                 // 'landlord' | 'tenant' | 'operator' | 'unknown'
    sender_domain: senderInfo.domain,
    attachment_count: payload.Attachments?.length || 0,
    operator_forward: !!forwardedFrom,
    effective_from: forwardedFrom ? `${forwardedFrom.name || ''} <${forwardedFrom.email}>` : null,
  };

  // 5. Insert the raw email row early — audit trail even if later steps fail.
  //    Store the full body so nothing is lost; classification + description use
  //    the trimmed top message.
  const { data: inboxRow, error: insErr } = await supabaseServer
    .from('email_inbox')
    .insert({
      postmark_message_id: messageId,
      received_at: payload.Date ? new Date(payload.Date).toISOString() : new Date().toISOString(),
      from_email: effectiveFromEmail,
      from_name: effectiveFromName,
      to_email: toEmail,
      subject,
      text_body: fullBody,
      html_body: htmlBody,
      classification,
      status: 'pending',
      raw_payload: payload as any,
    })
    .select('id')
    .single();

  if (insErr || !inboxRow) {
    console.error('[email] email_inbox insert failed:', insErr);
    return NextResponse.json({ ok: false, error: 'insert failed' }, { status: 500 });
  }

  // 6. Route the email.
  try {
    let matchedDefectId: string | null = null;
    let createdDefectId: string | null = null;
    let defectNumberForMirror: string | null = null;
    let propertyForMirror: string | null = propertyGuess;

    if (defRef) {
      // Attach to existing defect.
      const { data: existingDefect } = await supabaseServer
        .from('defects')
        .select(`
          id, defect_number, status, photo_urls,
          property:property_id ( short_code )
        `)
        .eq('defect_number', defRef)
        .maybeSingle();

      if (existingDefect) {
        matchedDefectId = existingDefect.id;
        defectNumberForMirror = existingDefect.defect_number;
        const prop = (existingDefect.property as unknown) as { short_code: string } | null;
        if (prop?.short_code) propertyForMirror = prop.short_code;

        // Log a note on the defect's update trail — so emails show in history.
        await supabaseServer.from('defect_updates').insert({
          defect_id: existingDefect.id,
          provider_id: matchedProviderId,
          status_from: existingDefect.status,
          status_to: existingDefect.status,
          notes: `[Email from ${effectiveFromName || effectiveFromEmail || 'unknown'}] ${subject || ''}\n\n${topBody || ''}`.slice(0, 4000),
          source: 'email_inbound',
        });
      }
    }

    if (!matchedDefectId) {
      // Create a draft defect for Carl to review.
      let propertyId: string | null = null;
      if (propertyGuess) {
        const { data: prop } = await supabaseServer
          .from('properties')
          .select('id, short_code')
          .eq('short_code', propertyGuess)
          .maybeSingle();
        propertyId = prop?.id || null;
      }

      const title = titleFromEmail(subject, topBody);
      // Description is the trimmed top-message only — Carl's review step is
      // where he reads the deeper thread via /email-inbox's raw_payload link.
      const description = [
        `(Imported from email — ${effectiveFromName || effectiveFromEmail || 'unknown sender'})`,
        forwardedFrom ? `(Forwarded by ${fromName || fromEmail})` : null,
        '',
        topBody || '(no body)',
      ].filter(Boolean).join('\n').slice(0, 4000);

      const { data: newDefect, error: dErr } = await supabaseServer
        .from('defects')
        .insert({
          title,
          description,
          severity: severityGuess || 'moderate',
          status: 'draft',
          property_id: propertyId,
          identified_at: new Date().toISOString(),
        })
        .select('id, defect_number')
        .single();

      if (dErr || !newDefect) {
        throw new Error(`Draft defect insert failed: ${dErr?.message || 'unknown'}`);
      }
      createdDefectId = newDefect.id;
      defectNumberForMirror = newDefect.defect_number;
    }

    // 7. Image attachments → Supabase Storage → appended to defect photos.
    const targetDefectId = matchedDefectId || createdDefectId;
    const persistedPhotos: string[] = [];
    const attachmentManifest: any[] = [];

    for (const att of payload.Attachments || []) {
      const isImage = IMAGE_MIMES.test(att.ContentType);
      // MVP: only upload images. Non-image attachments (PDFs, docs) are noted
      // in the manifest for your review but not persisted to storage until we
      // add a second bucket for them.
      if (!isImage) {
        attachmentManifest.push({
          filename: att.Name,
          mime_type: att.ContentType,
          size: att.ContentLength,
          note: 'non-image attachment — not persisted (see raw_payload for base64)',
        });
        continue;
      }
      // Filter inline signature images — Gmail / Outlook / Apple Mail embed
      // branded signature logos as inline attachments (image001.png, image.png,
      // or anything with a ContentID). Keep them in the audit manifest but
      // don't push to the defect photo gallery.
      if (isLikelySignatureImage(att.Name, att.ContentLength, att.ContentID)) {
        attachmentManifest.push({
          filename: att.Name,
          mime_type: att.ContentType,
          size: att.ContentLength,
          content_id: att.ContentID || null,
          note: 'inline signature image — not added to defect gallery',
        });
        continue;
      }
      try {
        const bytes = Buffer.from(att.Content, 'base64');
        const safeName = att.Name.replace(/[^\w.\-]+/g, '_').slice(0, 120);
        const yearMonth = new Date().toISOString().slice(0, 7);
        const storagePath = `${defectNumberForMirror || 'unlinked'}/${yearMonth}/email-${Date.now()}-${safeName}`;

        const { error: upErr } = await supabaseServer.storage
          .from('defect-photos')
          .upload(storagePath, bytes, { contentType: att.ContentType, upsert: false });

        if (!upErr) {
          const { data: pub } = supabaseServer.storage.from('defect-photos').getPublicUrl(storagePath);
          attachmentManifest.push({
            filename: att.Name,
            mime_type: att.ContentType,
            size: att.ContentLength,
            storage_path: storagePath,
            bucket: 'defect-photos',
            url: pub?.publicUrl || null,
          });
          if (pub?.publicUrl) persistedPhotos.push(pub.publicUrl);
        } else {
          console.warn(`[email] Attachment upload failed for ${safeName}:`, upErr.message);
          attachmentManifest.push({ filename: att.Name, mime_type: att.ContentType, size: att.ContentLength, error: upErr.message });
        }
      } catch (e: any) {
        console.warn(`[email] Attachment handling failed:`, e?.message);
      }
    }

    // 8. Append persisted images to the defect gallery.
    if (targetDefectId && persistedPhotos.length > 0) {
      const { data: curr } = await supabaseServer
        .from('defects')
        .select('photo_urls')
        .eq('id', targetDefectId)
        .maybeSingle();
      const existingPhotos: string[] = Array.isArray(curr?.photo_urls) ? curr!.photo_urls : [];
      await supabaseServer
        .from('defects')
        .update({ photo_urls: [...existingPhotos, ...persistedPhotos] })
        .eq('id', targetDefectId);
    }

    // 9. Mark the inbox row with the outcome.
    await supabaseServer
      .from('email_inbox')
      .update({
        status: 'processed',
        matched_defect_id: matchedDefectId,
        created_defect_id: createdDefectId,
        matched_provider_id: matchedProviderId,
        attachments: attachmentManifest,
      })
      .eq('id', inboxRow.id);

    // 10. Bust cache so new rows show up on next page load.
    revalidatePath('/email-inbox');
    revalidatePath('/defects');
    if (defectNumberForMirror) revalidatePath(`/defects/${defectNumberForMirror}`);

    return NextResponse.json({
      ok: true,
      inbox_id: inboxRow.id,
      matched_defect_id: matchedDefectId,
      created_defect_id: createdDefectId,
      defect_number: defectNumberForMirror,
      photos_attached: persistedPhotos.length,
    });
  } catch (e: any) {
    console.error('[email] Routing failed:', e);
    await supabaseServer
      .from('email_inbox')
      .update({ status: 'error', error_message: e?.message || 'Unknown error' })
      .eq('id', inboxRow.id);
    return NextResponse.json({ ok: false, error: e?.message || 'routing failed' }, { status: 500 });
  }
}

// Postmark may also hit GET for config checks — respond politely.
export async function GET() {
  return new Response('FMX email inbound endpoint. POST only.', { status: 200 });
}
