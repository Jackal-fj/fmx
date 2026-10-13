# FMX — Repo Guide for Claude

A one-shot cold-start briefing so you can land fixes without re-learning the layout. Read this before anything else.

## What FMX is

Facilities Management eXchange — a Next.js 14 App Router app that Carl (sole operator, CMS Fiji) uses to run facilities management for KGF's three Suva properties: **GH** (Gunu House), **KH** (Korobasaga), **NH** (Naibati House). Portfolio code is **KGF**.

Owner: Carl Probert — carl@cmsfiji.com. Single-tenant, single-operator. He uses it mostly on his phone.

Live at **fmx.cmsfiji.com**. Hosted on Vercel (region syd1). DB is Supabase project **`uoxycinbtvjfihakkuft`** ("fmx", ap-southeast-2, Postgres 17).

## Stack

- Next.js 14.2.5, App Router, Server Components + Server Actions
- Supabase (`@supabase/supabase-js`) — Postgres, RLS, Storage (`reports` bucket)
- Tailwind for styling (navy/accent/muted palette — see `tailwind.config.ts`)
- `docx` package for Word report generation
- Vercel hosting; `vercel.json` for region pinning

No tests, no CI beyond Vercel build. ESLint runs on build (there's a known non-blocking warning about old config syntax — ignore).

## Repo layout

```
src/
  app/
    api/whatsapp/        - Meta Cloud API webhook (verify + inbound messages)
    assets/              - asset list + /[id] detail + /[id]/edit
    defects/             - defect list + /[number] detail
    dispatch/[number]/   - send defect to vendor via WhatsApp
    maintenance/         - PM schedule dashboard
    new-asset/           - add asset form
    new-defect/          - log defect form (with photos)
    new-vendor/          - add vendor form
    properties/[code]/   - per-property page
    reports/             - monthly report generation + download
    service-log/         - log service event for an asset
    update-defect/       - update defect status (resolve/work_ordered)
    vendors/             - vendor list + /[id] detail + /[id]/edit
    layout.tsx           - root layout with Nav
    page.tsx             - dashboard
  components/
    nav.tsx              - top nav with FMX dropdown + action buttons
    badge.tsx            - status/severity/condition pill
  lib/
    supabase.ts          - server client (service role key)
    whatsapp.ts          - Meta Cloud API client
    dropbox.ts           - Dropbox v2 upload (reports mirror)
    asset-code.ts        - auto-generated asset codes
    reports/
      data.ts            - fetch snapshot for a reporting period
      generate.ts        - buildPropertyReport, buildPortfolioReport (docx)
```

## Data model (Supabase)

Key tables — look at the actual schema with `list_tables` or `execute_sql` before changing:

- `properties` — GH, KH, NH + the KGF virtual portfolio row. `short_code` is the public identifier.
- `spaces` — floors/rooms within a property.
- `assets` — equipment (AC, lifts, pumps, lights, gensets…). `asset_code` auto-generated. Soft-delete via `active=false`.
- `asset_service_events` — history. `event_type` is `service` | `install` | `upgrade` | `replacement` | `inspection`.
- `defects` — maintenance issues. `status` is `open` | `work_ordered` | `resolved`. `severity` is `critical` | `major` | `moderate` | `minor`.
- `defect_updates` — audit trail of status changes + vendor assignments.
- `providers` — vendors/contractors. WhatsApp dispatch uses `whatsapp_number`.
- `whatsapp_messages` — full thread per defect (inbound + outbound).
- `report_runs` — log of every report generation (month, scope, storage_path, size).

Storage buckets:
- `reports` — generated docx files at `{YYYY-MM}/{filename}`. Signed-URL download via server action.
- `defect-photos` — defect evidence images.
- `asset-photos` — asset identification photos.

## Non-obvious conventions

### 1. Cache control — this is the big one
Vercel's edge cache was serving stale defect/asset state (classic "resolved in DB but shows open in UI"). The fix is defense-in-depth. Every page that reads live DB state MUST have:

```typescript
import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export default async function Page(...) {
  noStore();
  // ...
}
```

And every state-changing server action MUST call `revalidatePath()` for every page that reads the affected data, before redirecting. Example from `src/app/update-defect/actions.ts`:

```typescript
revalidatePath('/defects');
revalidatePath(`/defects/${defect.defect_number}`);
revalidatePath('/update-defect');
revalidatePath('/');
revalidatePath('/maintenance');
revalidatePath('/properties', 'layout');
```

If you add a new live-data page, apply the pattern.

### 2. The QUICK_ADD_SECRET gate
Any page that writes requires `?key={QUICK_ADD_SECRET}` in the URL. The nav bar builds those URLs automatically when `QUICK_ADD_SECRET` env var is set. Server-side, read it with:
```typescript
const required = process.env.QUICK_ADD_SECRET;
if (!required || key !== required) redirect('/');
```
This is a shared-secret pattern, not real auth. Fine for a single-operator tool, not production-grade.

### 3. Mobile-first
Carl uses it on his phone. Inputs must be ≥16px (`text-base`, not `text-sm`) or iOS zooms in. Avoid `<datalist>` — iOS Safari is flaky; use native `<select>`. Form submit buttons must stay above the fold.

### 4. Server actions return `{ ok, error }`, never throw bare
Client components wrap calls in `try/catch` so an unexpected throw never leaves a button stuck on "Saving…". Pattern:
```typescript
startTransition(async () => {
  try {
    const result = await action(fd);
    if (!result.ok) { setErr(result.error); return; }
    router.push(...);
    router.refresh();
  } catch (e: any) {
    setErr(`Failed: ${e?.message || 'Unknown error'}`);
  }
});
```

### 5. Dropbox report mirror
Reports save to Supabase Storage (source of truth) and best-effort mirror to Dropbox at `/FMX/04_CLIENTS/KGF/Client-wide/4. Reporting/FMX/{YYYY-MM}/`. Mirror only runs if `DROPBOX_ACCESS_TOKEN` is set. Non-blocking — Supabase copy is authoritative.

## Deploy

```bash
cd "/Users/hd/Commercial Managemen Dropbox/FMX/04_CLIENTS/KGF/Client-wide/_tooling/fmx-app"
git add . && git commit -m "..." && git push
```

Vercel auto-deploys from `main`. Takes ~90 seconds. No preview environments — push goes straight to prod.

## Env vars (Vercel)

- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — DB
- `QUICK_ADD_SECRET` — write gate
- `WHATSAPP_PHONE_NUMBER_ID` + `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` — Meta Cloud API
- `DROPBOX_ACCESS_TOKEN` + optional `DROPBOX_REPORTS_ROOT` — report mirror

## When Carl says something is "showing wrong"

Default first hypothesis = cache. Verify with a direct DB query:
```
mcp__8c7080bc-20e0-478a-bdcf-bdf8f0bc2e7e__execute_sql
  project_id: uoxycinbtvjfihakkuft
  query: SELECT ... FROM defects WHERE defect_number = 'DEF-...'
```
If DB matches what Carl expects but UI doesn't, it's cache. Check that the page has the noStore directives above AND that the mutating action called revalidatePath.

## When Carl says something "won't save"

Default first hypothesis = client validation silently blocked it (datalist state mismatch, missing field) or server action threw without surfacing. Check the DB — if nothing was inserted, the save didn't reach Supabase. Harden the form with the try/catch pattern above and surface the error in a red banner.

## Open backlog as of 2026-10-13

See `BACKLOG.md` at the repo root (if present).

High-priority not-yet-done:
- Inbound WhatsApp replies auto-updating defect status
- Email ingestion (vendor replies, invoices) into the platform
- Full WhatsApp production wiring (currently on Meta test number)
