# FMX Backlog

Things we've talked about but haven't shipped. New ideas go here instead of being lost in chat. Oldest at the top.

## Priority

### Inbound comms → platform
- **Email ingestion — remaining work**: Postmark Transactional send-back notifications ("Draft DEF-xxxx created from KGF email — Review in FMX") after Postmark approves the account; non-image attachment persistence (PDF quotes from vendors to a new storage bucket); LLM classification for messy senders.
- **Client WhatsApp inbound** — only matters if we drop email as initiating channel. Deferred.
- **WhatsApp interactive-list compliance checklist** — soft gate currently enforces 2-photo minimum. For critical defects (fire panel, backup power), consider Meta's `interactive` list messages so vendor must tap through confirmations like "panel reset: Y/N", "test alarm triggered: Y/N" before resolve is accepted.
- **Photo backfill from pre-persistence period** — WhatsApp inbound photos received before the Supabase-persistence commit were stored only as Meta links which have now expired. Not recoverable, but worth a one-off DB cleanup to flag defects with dead `media_urls`.

### WhatsApp production
- Deregister CMS number from WhatsApp Business App
- Add CMS number to Cloud API
- Generate permanent System User token (not short-lived)
- Add 4 WA env vars to Vercel (currently on test number)
- End-to-end dispatch test from a real defect

### Dropbox mirror hardening
- Current token is Dropbox-generated short-lived — will silently stop working
- Build refresh-token flow so it never expires

## Nice-to-have

- Per-property FM Reports mirror (into each property's `05_FM Reports/` folder, not just Client-wide)
- Backlog `report_runs` cleanup — some early runs were tiny (13KB) failed attempts; prune or flag
- Asset depreciation schedule page (replacement cost + install_date already captured)
- Compliance calendar — expiring certs + insurance from `providers` table
- Service event photos: deduplicate when same photo attached to defect resolution + service log

## Shipped (recent)

- Draft defect review+promote page at /defects/[number]/promote with full field edit (title/property/severity/floor/area/category/description) + source-email context panel + reject-draft danger zone; drafts hidden from main defects list + dashboard + property pages ← 2026-10-13
- Postmark email ingestion: /api/email webhook, email_inbox table, draft defect state, sender/DEF-ref/property/severity classification, image attachment persistence, /email-inbox review page ← 2026-10-13
- /new-defect accepts prefill URL params (title/description/property/severity/floor/area/category) + DEF-ref auto-redirect to detail page with highlight → one-tap flow from a KGF email via iOS Shortcut ← 2026-10-13
- Raise WO quick-action on filtered defects list + highlight banner on defect detail when linked with ?highlight=1 ← 2026-10-13
- WhatsApp inbound auto-promote defect status + 2-photo soft gate + Meta media download + Supabase Storage persistence + Dropbox per-property photo mirror ← 2026-10-13
- noStore + fetchCache=force-no-store on all live-data pages (defects, assets, vendors, their detail pages) ← 2026-09-29
- new-vendor form hardened for mobile (native select, try/catch, 16px inputs) ← 2026-10-13
- Vendor detail page + edit/delete
- Portfolio-wide filters on defects (status/property/severity) and assets (status/property/condition/type)
- Full FCA import for GH, KH, NH (duplicates removed, lighting resolutions applied)
- In-app report generation (property + portfolio) with Dropbox mirror
