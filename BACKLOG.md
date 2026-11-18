# FMX backlog

One line per story. INVEST form — Independent, Negotiable, Valuable, Estimable, Small, Testable.

- **Status:** `idea` · `next` · `in-progress` · `done` · `parked` · `blocked`
- **Type:** `story` (product feature) · `bug` · `tech-debt` · `data` (backfill / reconcile) · `field` (on-site capture)
- **Size:** XS (<2 hrs) · S (<1 day) · M (1–3 days) · L (>3 days — split before starting)

---

## Strategic directive — 2026-11-17 (Carl)

Shift in product direction, source: "What the Top 1% of Apps Do Differently" note.

**Thesis.** Perfect one mobile, offline-first field capture loop — **Scan → Check → Snap → Done → Report** — before building anything else. Every tap must pay back the person doing it (closed job, auto-raised report, updated register) with no re-keying. Desktop console is a separate, dense surface for managers; the phone is for crews.

**Named architectural gap.** The current app is online-only. Offline-first is non-negotiable for Fiji / outer-island use. Raised as FMX-041 (epic).

**Named brand risk.** The US company "Facilities Management Express, LLC" (gofmx.com, founded 2012, 1,000-2,000+ customers) already owns the FMX name in this exact category. Raised as FMX-040 (decision).

**The 10x axis for KGF today.** A client-branded monthly report that writes itself from field taps, replacing hours of Word formatting. FMX-023 shipped the layout; FMX-042 wires the capture loop that feeds it.

**Anti-patterns to actively avoid** (now binding):

- Digitising every Excel/Word tool as its own module (form-zoo). Unify on one inspection/template engine.
- Online-only field screens. A single lost inspection on Rabi kills trust.
- Free-text-heavy forms for low-literacy crews.
- Dashboards that require extra data entry rather than consuming field capture.
- Copying a dark, keyboard-first aesthetic into a sunlight, glove-wearing field app.
- Buying tracking hardware before QR-scan discipline is proven.
- Presenting default-factor carbon numbers as measured.

**Phase targets** (reference):
- Phase 0 (0-6wk) — rename decision, mobile-responsive inspection with large targets, auto-generated branded PDF from monthly template
- Phase 1 (6-16wk) — offline-first field app, QR site/asset labels, fail → auto-job, WhatsApp share links
- Phase 2 (3-6mo) — traceability pilot (Vanua Levu yard → Rabi), landed-cost rollup, GLEC default carbon
- Phase 3 (6-12mo) — exec KPI dashboards, contractor scorecards, Xero invoice handoff, primary-data ferry factors, Fijian/Hindi UI, tool check-in/out
- Longer bets — BLE/GPS for high-value plant, AI photo defect tagging, voice-to-form, Pacific FM template marketplace

---

## Design principles (apply to every story)

Confirmed with Carl 2026-11-17 and binding on everything that follows.

1. **Mobile-first.** The FM lives on a phone on-site. Every page, every new UI element, every form is designed for a 375pt narrow viewport first; desktop is the enhanced case, not the primary target. Thumbs reach the bottom of the screen more easily than the top; primary actions sit low on mobile. Touch targets ≥ 44pt. One-handed navigation is a requirement, not a nice-to-have.
2. **Two taps maximum to any navigation destination.** From anywhere in the app, reaching any common *destination* (dashboard, client hub, property hub, defect detail, defects list, generate a report) takes ≤ 2 taps. The nav and the dashboard are the two escape hatches that uphold this rule for navigation. Create actions (log defect, add vendor, etc.) live on the dashboard, not the nav, and are allowed to take an extra tap from deep pages — Carl confirmed 2026-11-17 that a cleaner nav is worth the trade-off because adding is less frequent than navigating. Any navigation flow that requires 3+ taps to reach something routine is a bug and raises a cleanup story.
3. **Scannable, not dense.** Lists over tables on mobile, one piece of information per line, severity / status conveyed with badges, not sentences.
4. **No modals for things that can be pages.** Modals are a desktop convention that break mobile — the back button should always work.
5. **Say as much as we can with as little as possible.** (Carl 2026-11-17.) Prefer glyphs and content to words that only restate the obvious: `+` not `+ Add`, a client name not "Portfolio: Acme", `→` not `View all →`, a magnifier icon not "Search". Headings get removed when the thing itself is the header. Every word on screen earns its place or disappears.
6. **Status = colour + icon + word, always together.** (Strategic directive 2026-11-17.) ✓ OK (green), ⚠ DUE (amber), ✗ EXPIRED/FAIL (red). Meaning survives colour-blindness, glare and low literacy.
7. **Field surfaces use a high-contrast light theme, not dark mode.** (Strategic directive 2026-11-17.) Sunlight, gloves, shared devices. Primary field actions 56-64dp (bigger than the 44pt mobile minimum). Thumb-zone placement at the bottom of the viewport.
8. **Capture pays back the capturer.** (Strategic directive 2026-11-17.) Every form, scan, or photo must produce something useful to the person entering it — closed job, auto-generated report, updated scorecard — not just fill a database.
9. **Append-only in the field, field-level merge, explicit sync states.** (Strategic directive 2026-11-17.) "Saved on device" → "Waiting to sync" → "Submitted" is visible per record. Inspections, scans and readings are append-only; shared records merge field-by-field, never last-writer-wins. Silently discarding offline work is the top trust-breaking bug.
10. **Plain-language copy, written once, translated via a string table from day one.** (Strategic directive 2026-11-17.) English today; iTaukei / Fiji Hindi when the field pilot starts. Voice notes alongside text inputs for low-literacy crews.

Every story's acceptance criteria assume these principles — they don't need to be restated. A violation of them is a defect, not a trade-off.

---

## Open

### [FMX-013] Attach photos to an email-sourced defect from the defect page

- Type: story · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes:** New `PhotoAppender` client component on `/defects/[number]` directly below the gallery. `+ Photo` button uses `<input capture="environment">` so mobile Safari/Chrome opens the rear camera straight away; multi-select works for library picks. Client-side JPEG compression (2000px max, 0.82 quality — same pattern as `/new-defect`) runs before upload. Previews + remove-X before committing. `appendDefectPhotos` server action uploads to the shared `defect-photos` bucket, appends URLs to `defects.photo_urls` (never replaces), reads existing array first for safety. Resolved defects are read-only — appender hidden, action rejects. Works for all active statuses including `draft` so email-ingested defects can gain on-site evidence pre-promotion. `revalidatePath` hits defect detail + list + dashboard so photos appear immediately. Mobile batch cap 10 per upload.

**As** an FM
**I want** to add one or more photos to a defect after it has landed in FMX from a forwarded tenant email (`fmx@cmsfiji.com`)
**So that** the record carries the evidence I collect on my next site visit, not only what the tenant happened to send

**Acceptance criteria**

- Given I'm on `/defects/<number>` for any defect sourced from email, when I tap "Add photos" I can select one or more images from my phone's library or capture with the camera
- Photos upload to the same Supabase storage bucket used by `/new-defect` and are appended to `defects.photo_urls` (existing photos preserved, not replaced)
- Works for defects in `draft`, `open`, and `work_ordered` status; resolved defects are read-only
- Upload captures `uploaded_by` + `uploaded_at` per photo so provenance survives into reports
- Photos show in the detail page gallery immediately after upload (no manual refresh) and flow through to the platform report's "Completed this month" section and Dispatch WhatsApp message bodies
- Mobile: single-tap "Take photo" option; batch upload of 10+ photos completes without timing out
- Stretch (defer if it bloats the story): offline drafts upload client-side and retry when back online

**Notes**

- Current gap confirmed: `src/app/defects/[number]/page.tsx` has no upload widget; only `/new-defect` and `/update-defect` do.
- Reuse the `/new-defect` uploader as a client component; add a server action `appendPhotosToDefect(defectId, urls[])`.

---

### [FMX-020] Group / sort defects list by severity, trade or date logged

- Type: story · Size: M · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl) · Depends on: FMX-021

**Done notes:** `/defects` has new Group by chips (None · Severity · Trade · Property · Month logged) and Sort by chips (Date newest · Date oldest · Severity critical first · Last updated · Defect number). URL-persisted via `?group=…&sort=…` so views are bookmarkable; defaults omitted. Fetch pulls `trade` + `updated_at` as well. When group=none the existing flat list/table renders unchanged (desktop table, mobile cards from FMX-032). When grouped, rows render under a card per group with the group name + count header, list-cards inside — trade shows inline per row so it's visible from any grouping. Group orders: severity critical→minor, month newest first, untagged trade sinks to bottom. Sort applies within every group. "Clear filters" now resets group + sort too. localStorage per-browser memory of last choice deferred — not critical and URL bookmarks cover most cases.

**As** an FM
**I want** to group or sort the defects list by severity, trade, or date logged (and property / status, which already filter)
**So that** I can scan the list the way my brain needs it that day — triage mode (severity), dispatch mode (trade), or review mode (recent first)

**Acceptance criteria**

- `/defects` has a "Group by" selector alongside the existing filter chips: options **None** (default, flat list), **Severity**, **Trade**, **Property**, **Month logged**
- When a grouping is active the rows render under collapsible headers with a count per group; the existing filters still narrow what appears inside each group
- A separate "Sort by" selector: **Date logged ↓** (default), **Date logged ↑**, **Severity (critical first)**, **Last updated**, **Defect number**
- Selection persists in the URL (`?group=trade&sort=severity_desc`) so a view can be bookmarked and shared, and the back button works
- Selection remembered per browser via `localStorage` so the FM lands back in their preferred view next session, overridden by any URL params present
- Works on mobile — selectors collapse into a single "View" sheet below `sm:` breakpoint
- Empty-state copy adapts: "No open critical defects" rather than the generic empty message

**Notes**

- Grouping-by-trade depends on FMX-021 (`defects.trade` column + backfill). If FMX-021 slips, ship this story with Severity + Property + Month groupings only and add Trade in a follow-up.
- Grouping respects the active status filter: grouping by severity under `status=resolved` is useful for post-mortems.

---

### [FMX-021] Add `trade` column to defects — reusing the free-text vocabulary from providers

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17

**Done notes:** Migration `fmx021_add_defects_trade` added `defects.trade text` (nullable, mirrors `providers.trade`). Backfill pass classified 133 of 195 defects (~68%) from keywords in title+description against 9 trade buckets (HVAC, Fire, Plumbing, Electrical, Genset, Garden and Landscaping, General building / roofing, Waste / skip bin hire, General Handyman). 62 unclassified rows left NULL for the FM to tag manually. Breakdown: Plumbing 57 · Electrical 31 · HVAC 17 · General building 12 · Fire 8 · Handyman 4 · Waste 2 · Garden 1 · Genset 1. `/new-defect` form has a Trade input with datalist populated from distinct `providers.trade` values. Create action persists the value.

**Follow-up (not blocking):** FMX-037 raised for the remaining three paths — update-defect form inline trade edit, promote-from-draft, email-ingest — plus the dispatch-page vendor pre-filter by matching trade.

**As** an FM
**I want** every defect tagged with a trade using the same vocabulary the providers register already uses
**So that** defects group cleanly against the right vendor list for dispatch, and reports break down by discipline

**Acceptance criteria**

- Supabase: add `defects.trade` as free-text, nullable, no new enum (mirrors `providers.trade`)
- Form inputs (`/new-defect`, `/update-defect`, promote-from-draft, email-ingest) show a datalist of distinct trades currently in `providers.trade` so Carl can pick an existing value or type a new one — same behaviour the providers form already uses
- Backfill pass classifies existing defects from `title` + `description` keywords and maps to the closest existing `providers.trade` string; Carl reviews a sample before the full run
- Platform report breaks down "Open by trade" and "Completed this month by trade"
- Dispatch page pre-filters the provider dropdown to vendors whose `trade` matches the defect's trade, with a "Show all" toggle

**Notes**

- Free-text, not enum, because the providers vocabulary is already free-text and the two must stay in sync. Tidying the vocabulary itself (casing, splitting "HVAC — AC supply, install, service" from "HVAC") is a separate follow-up, not blocking this story.

---

### [FMX-023] Adopt the KGF FM Performance Report layout as the canonical template

- Type: story · Size: M · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl) · Reference: `KGF_FM_Performance_Report_2026-11-16.pdf`

**Done notes:** Both `propertyReport()` and `portfolioReport()` rewritten to the 10-section layout: Title → Headline strip → YTD KPI cards → Month KPI cards → Portfolio snapshot table → Monthly spotlight (auto bullets) → Capital works table → Active service contracts → Priority open items → Forward look → Source footer. Snapshot now carries `ytdByProperty`, `ytdPortfolio`, `capitalWorks` (installed assets with `install_date <= month-end`). Spotlight auto-derives from resolved defects + capital installs + per-property new-logged. Forward look auto-seeds from overdue service contracts + open critical items with an "edit to tailor" note. Cost-vs-rent and "under CMS" caveat dropped per Carl 2026-11-17.

**Follow-ups (new stories to raise if wanted):**
- Editable monthly spotlight narrative (overrides auto bullets)
- `forward_look_items` table + admin page to tailor the forward-look section

**As** an FM presenting monthly performance to a client
**I want** every generated report to follow the compact 3-page FM Performance layout Carl reviewed on 16 Nov
**So that** every client gets the same concise, story-led format instead of a heavier legacy platform-report structure

**Target layout (canonical sections, in this order)**

1. **Title block** — Client short name + " – FM Performance Report"; properties listed; reporting period; agreement reference; prepared by
2. **Headline strip** — single highlighted paragraph: YTD resolved / open, portfolio balance comment, capital count, service-contract count, FM vs gross rent %
3. **KPIs — Year to date** — 4-card row: Defects resolved (crit/maj/mod/min split) · Open defects (same split) · Capital items (one-line theme) · FM vs Gross Rent (with benchmark range)
4. **KPIs — Current month** — 4-card row: Defects resolved (severity split) · Defects logged (by property) · Capital / CAPEX (headline item) · Invoiced (ex-VAT, with components)
5. **Portfolio snapshot** — table: Property · Tenant(s) · Open now · Resolved YTD · Resolved in month · Logged in month, with Portfolio total row
6. **Monthly spotlight** — 4–6 bullet themes (Capital works · Tenant improvement · Life-safety · Electrical/fit-out · Grounds and costs). Each bullet names the defect refs, contractor, date and value
7. **Cost against rent — YTD view** — table: Property · Monthly rent VEP · CMS allocation /mo, with Portfolio total and % of gross rent; benchmark footer line
8. **Capital works delivered under CMS** — table: Install date · Property · Item · Make/Model · Contractor
9. **Active service contracts (agreement ref)** — table: Service · Property · Provider · Commercials
10. **Priority open items (critical and major)** — table: Ref · Property · Title
11. **Forward look — next 6 months** — table: Item · Status and indicative value
12. **Footer** — data source, confirmation dates, prepared-by line, agreement ref

**Acceptance criteria**

- `/reports` "FM Performance" output matches the layout above, section by section, for any client + period
- Typography matches the reviewed PDF: sanitised (no em-dashes, no semicolons, no section marks, no smart quotes), navy headings, muted body
- KPI cards render as light-tinted bands (green-tinted for YTD, amber-tinted for current month) with small-caps labels and large numeric values
- All counts, splits and values come from the live DB (`defects`, `assets`, `service_contracts`, `properties`, `clients`, `tenancies`) — zero hard-coded figures
- Current-month section only renders when `period_month < today's month` (preserves the existing hard block on current / future months)
- The "Monthly spotlight" bullets come from a narrative generator that reads the month's resolved defects, capital installs and invoice lines, grouped into the five themes; a draft is editable before export (stretch — ship with auto only first)
- Report generates in under 10 seconds for a 3-property portfolio
- Output fits on exactly 3 pages at A4 for KGF-scale portfolios; larger portfolios paginate cleanly

**Notes**

- Reference PDF is filed in the client's "4. Reporting" folder (dated 2026-11-16).
- Replaces the longer Platform Report format as the default FM monthly deliverable. The old Platform Report stays available as a secondary option for deep-dives.
- Depends on FMX-022 for the clean request flow (client → month → scope → type).

---

### [FMX-022] Reports page — clean request flow, separate download history

- Type: story · Size: S · Status: in-progress → done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes:** `report_runs` table already existed. `/reports` now opens straight on the request flow (Client → Month → Scope → Generate) with a single "View history" card at the bottom showing run count + last generated date. Full log moved to `/reports/history` (per-client, grouped by month, re-download preserved). Reused existing GenerateForm + DownloadButton.

**As** an FM
**I want** a clean fresh flow to request a report — client → month → rollup or specific property → generate
**So that** the reports page doesn't accumulate visual noise from every past download, and the next report is always one clean path

**Acceptance criteria**

- `/reports` opens on the request flow by default, not on a history list:
  1. **Client** picker (defaults to the only active client when there's one; otherwise shows cards)
  2. **Reporting month** picker (defaults to the most recent closed month)
  3. **Scope**: rollup for the whole client, or a specific property (property picker filtered to that client)
  4. **Report type** (FM Performance · Platform Report · Monthly Invoice pack, whatever we already produce)
  5. **Generate** — produces the file and offers download + "Save to client folder" as the two explicit actions
- Past downloads do NOT show on this page by default
- A separate `/reports/history` page (or a collapsed "Recent reports" drawer below the request flow) shows the log: date generated, who generated it, client · month · scope · type, re-download link, and a soft-delete action
- Every generated report is logged to a `report_runs` table (id, client_id, property_id or null, period_month, report_type, generated_at, generated_by, file_path, size_bytes, status)
- The request flow resets on completion — generating one report doesn't leave filters stuck on the next request
- Mobile: each step is a single sheet; no horizontal scrolling

**Notes**

- Current state (to confirm before building): the existing `/reports` page lists every previous run inline, which Carl flagged as noise.
- `report_runs` table is new; migration is part of this story.
- "Save to client folder" uses the Dropbox client-scoped path already wired for the OOFI / KGF filing conventions.

---

### [FMX-024] Epic — Multi-audience access: client portal and tenant intake

- Type: epic · Size: L (split before building) · Status: idea · Raised: 2026-11-17 (Carl)

**As** the FM operating FMX
**I want** FMX to serve three distinct audiences — the FM team (today), the client/landlord, and the tenant — with the right surface for each
**So that** clients see what matters to them, tenants can log and track issues without a login, and the FM team stops being a message-relay for every tenant request

**Working shape (to be refined)**

- **FM team (today).** Full platform. All clients, all properties, write everywhere. Role: `fm_admin`.
- **Client / landlord (next).** Read-only web view of their portfolio: open defects, resolved YTD, service contracts, reports library, capital works. No ability to log or update. Scoped to `client_id` by a signed link or a lightweight auth. Role: `client_viewer`.
- **Tenant (later).** No in-app UI for most cases. The surface is a messaging app the tenant already uses — **WhatsApp** for commercial tenants in Fiji, or **Google Chat** where the tenant's organisation already runs on Google Workspace (Ministry tenants, corporate-IT tenants). A property-specific entry point (dedicated WhatsApp number per property, or a Google Chat space per property) accepts free text + photos, creates a `draft` defect tagged to that property + tenant, and replies with the defect number. Status updates (work ordered, dispatched, resolved) push back to the same channel. Carl keeps the approval gate on the first few until the intake prompts are proven.

**Why messaging over a tenant portal**

- Fiji tenant adoption curve on a new app is slow; everyone has WhatsApp, and Ministry tenants live in Google Workspace.
- Zero account management, no password resets, no forgotten URLs.
- Photo intake is native and compressed sensibly.
- Already proven inbound path: email-to-FMX works, WhatsApp-to-FMX and Chat-to-FMX are the same pattern with different gateways.
- Per-tenant routing: pick the channel the tenant already uses. FHRADC + MWCP are candidates for Google Chat; DPP is a WhatsApp candidate.

**Open questions to resolve before splitting into stories**

- Which clients get a portal first? KGF landlord (Kinetic Growth Fund) is the obvious pilot.
- Auth for client portal: magic-link email, Supabase Auth, or a per-client signed URL? Preference: magic-link so there's a real user record with an audit trail.
- WhatsApp gateway: Meta Cloud API (one number, routes by property code the tenant sends on open) vs one WABA number per property (cleaner UX, more admin). Reference: current Postmark pattern handles the email-side analogue.
- Google Chat gateway: a Chat app (bot) added to a per-property space, with slash commands (`/log`, `/status`, `/photo`) and inline cards for confirmations. Auth via Google Workspace domain; Ministry tenants likely need an IT-sign-off conversation before the bot gets installed.
- Channel selection per tenant: `tenancies.preferred_channel` (`whatsapp` / `google_chat` / `email`) — one tenant, one channel, chosen on onboarding.
- Tenant identification: match by sender WhatsApp number against `tenancies.contact_phone`, or by Google Workspace sender email against `tenancies.contact_email`, with a first-time prompt if unknown.
- What does the tenant see back? Confirmation on log, dispatch notice, resolution notice. Anything else risks being noise.
- RLS: Supabase row-level security policies for `client_viewer` scoped to client_id, and for any future `tenant_reporter` scoped to property_id.

**Likely story split (to raise when scoping)**

1. `client_viewer` role + RLS policies + magic-link login
2. `/client/[short_code]` read-only landing with portfolio snapshot, open defects, service contracts, reports library
3. `tenancies.preferred_channel` column + admin UI to set per-tenancy
4. WhatsApp intake gateway (Meta Cloud API webhook → draft defect with photos)
5. Google Chat intake gateway (Chat app / bot → draft defect with photos)
6. Tenant identification + property routing (number / email match, fallback prompt) — shared across both gateways
7. Outbound status notifications (dispatched, resolved) via WhatsApp template messages and Chat cards, routed by `preferred_channel`
8. Audit log of every tenant-initiated and client-viewed event

**Notes**

- Reference: existing `/dispatch/[number]` page already uses wa.me click-through for outbound; this epic extends that pattern to inbound and to automated updates.
- Keep the FM approval gate on anything a tenant initiates until the intake prompts are proven — same posture as the email ingest path today.

---

### [FMX-025] Client hub shows agreements as status only; dedicated view-only agreement page with gated edit

- Type: story · Size: M · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes:** Client hub `/clients/[code]` agreement block collapsed to a compact clickable row per agreement — `<code>` · status badge · type · name · one-line fee summary · `→` chevron. Whole row is the click target (44pt touch), opens the new view-only page at `/clients/[code]/agreements/[agreement_code]`. New page renders every agreement field as read-only text with linked service lines beneath; Edit button in the header is gated by `canEditAgreement()` which today reads the session key (any session with it = fm_admin). Status labels use the confirmed mapping: Active · Pending · Suspended · Expired · Terminated. Edit button currently routes to the existing `/manage?open=agreements` editor — inline-edit-on-the-same-page is deferred to FMX-026.

**As** an FM looking at a client hub
**I want** the agreement block on the client page to collapse to one status line per agreement (Active, Pending, Expired, Terminated)
**So that** the hub is a scannable summary, not a wall of contract detail — and the full agreement lives behind its own link where it can be read without the risk of accidental edits

**Acceptance criteria**

- `/clients/[code]` replaces the inline agreement detail block with a compact list: `<agreement_code> · <name>` · status badge (Active / Pending / Negotiation / Suspended / Expired / Terminated) · one-line fee summary (e.g. "FJD 1,200/mo + 10% mgmt on CAPEX > FJD 50k")
- The whole agreement row is the click target: clicking the row (anywhere on it) opens `/clients/[code]/agreements/[agreement_code]`. No separate "View →" link cluttering the row — the hover state and cursor make it discoverable
- Keyboard-accessible: the row is a focusable link with `aria-label="Open agreement <code>"`, Enter/Space navigates
- New page `/clients/[code]/agreements/[agreement_code]` renders the full agreement as **view-only by default**: all fields rendered as plain text, no form controls visible, no Save button
- Page has an `Edit` button in the header, shown only to users whose role includes agreement-edit permission (today: `fm_admin`; see FMX-024 for the role model)
- Clicking `Edit` switches the page into edit mode: fields become editable, Save and Cancel buttons appear, originals restored on Cancel
- A user without edit permission never sees the Edit button and lands directly on the read-only view
- The existing `/clients/[code]/manage` flow stays for setup / onboarding, but the day-to-day agreement surface is the new view-only page
- All checklist items that currently deep-link into `/manage?open=agreements` are retargeted to the new page's Edit mode when the user has permission, and to the read-only view otherwise
- Mobile: the collapsed status list stacks vertically; the whole row stays clickable with a comfortable touch target (min 44pt); the view-only agreement page prints cleanly on A4 so it can be PDFed if needed

**Notes**

- Pairs naturally with FMX-024 (role model). While FMX-024 is parked, treat every current session as `fm_admin` so the Edit button is visible — behaviour switches to permission-gated as soon as the role column lands.
- Status label mapping **confirmed 2026-11-17** (Carl): Active=`active` · Pending=`negotiation` | `tender` · Suspended=`suspended` · Expired=`ended` · Terminated=`lost`. Both `negotiation` and `tender` enum values surface as the single "Pending" label.
- Keeps the audit-ready posture: anyone reading the agreement doesn't risk changing it, and every change still happens through an explicit mode switch.

---

### [FMX-027] Nav polish — one-click back button + consolidated "+ Add" menu

- Type: story · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes:** Back chevron added at the far left of the nav on every page except Dashboard. Uses `router.back()` with a client-side `window.history.length` check — when there's no history (fresh deep-link load or share URL), falls back to an inferred parent per the routing rules in the AC (agreement → client hub, `/clients/[code]/*` → client hub, `/properties/[code]/*` → property hub, `/defects/[number]` → `/defects`, etc.). 44pt touch target, focus ring, aria-label "Back".

Right side: replaced `[Update] [+ Log defect] [More ▾]` with a single `+ Add ▾` dropdown, grouped **Defect** (Log · Update) / **Register** (Asset · Vendor) / **Service** (Log event) / **Client** (New client). Each item carries a one-line hint. Mobile hamburger pins the Add groups to the top of the drawer so one-handed use works.

Cleanup deferred to a follow-up: in-page quick-action rows on `/clients/[code]` and `/properties/[code]` still carry their `+ Log defect` / `+ Job` / `+ Contact` buttons. That's a separate pass — raised as FMX-028. Breadcrumb links (`← Kinetic Growth Fund`, `← Back to defect`) stay for now too; they're redundant with the global back button but not harmful. FMX-029 for the breadcrumb cleanup. The `+ New property` and `+ New agreement` entries proposed in the original AC are also left for FMX-028 since those routes don't exist yet as standalone forms.

**As** an FM moving between pages all day
**I want** a single-click back button in the top nav that returns me to where I came from (client hub, defects list, wherever) without having to renavigate from the top-level menu, and every "add / create" action collected into one dedicated place instead of scattered across the top bar and the inside of pages
**So that** navigation is one-handed on mobile, I don't lose my place drilling into detail, and I'm not scanning the top bar to work out which button creates what

**Acceptance criteria — Back button**

- A back chevron appears at the far left of the nav (before FMX wordmark) on every page except the dashboard, always in the same position so muscle memory works across pages
- Primary behaviour: `router.back()` — one tap returns the user to where they came from (client hub → agreement → tap back → client hub; defects list → defect detail → tap back → defects list, with filters preserved)
- Fallback when there is no history (direct deep-link load, new tab, refreshed detail page): a sensible parent inferred from the current route:
  - `/clients/[code]/agreements/*` → `/clients/[code]`
  - `/clients/[code]/*` → `/clients/[code]` (if deeper), else `/clients`
  - `/properties/[code]/*` → `/properties/[code]`, else `/properties`
  - `/defects/[number]` → `/defects`
  - `/reports/history` → `/reports`
  - else → `/` (dashboard)
- The existing in-page breadcrumb links (`← Kinetic Growth Fund`, `← Back to defect`) are redundant once this lands and can be removed in a cleanup pass
- Keyboard-accessible, visible focus ring, 44pt touch target on mobile

**Acceptance criteria — Consolidated + Add menu**

- All create / add actions move into one `+ Add ▾` dropdown on the right of the nav, replacing both the inline `+ Log defect` primary button and the `More ▾` dropdown
- Contents of `+ Add ▾` (grouped):
  - **Defect** — Log defect · Update defect
  - **Register** — Add asset · Add vendor · Add contact
  - **Service** — Log service event
  - **Client** — New client · New agreement · New property
- Each item has a one-line hint underneath (same pattern as current More dropdown)
- Icon is a `+` glyph, label text `Add` — same visual weight as other nav items, not a primary coloured button
- In-page "quick actions" rows on `/clients/[code]` and `/properties/[short_code]` drop their add buttons (+ Log defect, + Job, + Contact, + Defect) — those moves to the global `+ Add` menu. In-page rows keep only destinations (Defects, Reports, Manage)

**Notes**

- Removes the current `Update` and `+ Log defect` buttons from the right side of the nav; they live under `+ Add` now.
- Preserves every existing route and server action; this is UI relocation only.
- Mobile hamburger: `+ Add` becomes a full-width section at the top of the mobile menu.

---

### [FMX-026] Inline edit mode on the agreement view page

- Type: story · Size: M · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-025

**Done notes:** Edit button on `/clients/[code]/agreements/[agreement_code]` now toggles `?edit=1` on the same URL (back button works). When editing, the view-only grid is replaced by `AgreementEditor` client component — every field is an input (dates / numbers / selects / checkbox / textareas), prefilled from the current agreement. Sticky bottom Save/Cancel bar (thumb zone per design principle 1). Server action `updateAgreement` validates: status/type/billing in their enums, end ≥ start, mgmt-fee 0-100, no negatives on money/terms, billing day 1-31. Successful save redirects back to the view URL and refreshes; Cancel does the same without saving. Status options surface Carl's confirmed labels (Active · Pending(negotiation) · Pending(tender) · Suspended · Expired · Terminated). The old Edit → `/manage?open=agreements` route is retired for this entity.

**As** an FM with agreement-edit permission
**I want** the Edit button on `/clients/[code]/agreements/[agreement_code]` to switch the current page into edit mode (inline fields, Save + Cancel)
**So that** making a change doesn't force me out to the broader `/manage` flow and back

**Acceptance criteria**

- Clicking Edit toggles the page into edit mode via `?edit=1` query param — same URL, back button works
- Every field on the view becomes an input (date / number / text / enum select) with current value prefilled
- Save button calls a server action that updates `client_agreements`, revalidates the client hub, and returns to view mode
- Cancel restores originals and returns to view mode without hitting the DB
- Validation enforces: start_date < end_date, monthly_value_estimate >= 0, management_fee_pct 0-100, payment_terms_days >= 0
- Errors render inline against the offending field; no all-or-nothing banners
- Disabled for users without edit permission (button never renders)
- Preserves the existing `/manage` flow unchanged

**Notes**

- Interim behaviour (shipped with FMX-025): Edit button routes to `/manage?open=agreements`. Replace that with the inline mode once this story lands.

---

### [FMX-028] Cleanup — drop in-page quick-add buttons now that `+ Add` menu is global

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-027

**Done notes:** Quick-actions row on `/clients/[code]` now carries destinations only (Defects · Reports · Manage); + Log defect / + Job / + Contact gone. Per-site `+ Defect` button on each property row removed. On `/properties/[code]` the primary `+ Log defect here` button is removed; "All defects" destination stays. New property / New agreement entries in + Add menu still parked until those standalone create forms exist.

**AC**

- Remove the `+ Log defect` / `+ Job` / `+ Contact` / `+ Defect` buttons from the Quick Actions row on `/clients/[code]`
- Remove the same-shape buttons from `/properties/[short_code]`
- Keep destination links (Defects, Reports, Manage) — only add buttons go
- Add `+ New property` and `+ New agreement` entries to the global `+ Add` menu once those standalone create forms exist (currently only the manage flow creates them)

---

### [FMX-029] Cleanup — remove per-page breadcrumb links superseded by global back button

- Type: tech-debt · Size: XS · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-027

**Done notes:** Removed the `← Back to …` header links from 14 pages: client hub, agreement view, client new, client manage, reports history, defect detail, dispatch, update-defect, promote-draft, new-vendor, new-asset, asset detail, asset edit, vendor detail, vendor edit, service-log entry, maintenance bulk-set. `←` links inside 404 / not-found cards kept (they're mid-page error affordances, not nav redundancy). Multi-level breadcrumbs on `/properties/[code]` kept (they provide context beyond just "back").

**AC**

- Remove `← Clients`, `← Kinetic Growth Fund`, `← Back to defect` style breadcrumb links from `/clients/[code]`, `/clients/[code]/agreements/[agreement_code]`, `/defects/[number]`, `/dispatch/[number]`, `/reports/history`
- Keep the global back button (FMX-027) as the single back affordance
- Audit every page's header: if there's a `← Something` link that only goes back one level, it goes

---

### [FMX-030] Audit — mobile-first + 2-tap route to every destination

- Type: story · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes — tap-count audit (post-FMX-027 nav state)**

Nav state used: `[← Back] FMX [Dashboard · Portfolio▾ · Work▾ · Resources▾ · Reports] [+ Add▾]`. FMX wordmark = Dashboard link. Dashboard tiles + recent-defects rows + client-strip cards + property cards all clickable (FMX-012).

| Destination | From Dashboard | From a deep page (defect detail) | Verdict |
|---|---|---|---|
| Dashboard | 0 | 1 (FMX wordmark) | ✓ |
| Clients list | 2 (Portfolio▾ → Clients) | 2 (FMX → Clients card on strip) † | ✓ |
| Specific recent client (KGF/OOFI) | 1 (client strip card) | 2 (FMX → KGF card) | ✓ |
| Properties list | 2 (Portfolio▾ → Properties) | 3 (Back → Portfolio▾ → Properties) ✗ | **fail** |
| Specific recent property | 1 (property card) | 2 (FMX → property card) | ✓ |
| Defects list (open, default) | 1 (Open defects tile) | 2 (FMX → tile) | ✓ |
| Defects list filtered critical | 1 (Critical tile) | 2 | ✓ |
| Specific recent defect (last 14d) | 1 (recent-defects row) | 2 (FMX → recent row) | ✓ |
| **Arbitrary non-recent defect** | 3 (Work▾ → Defects → row) ✗ | 3 (FMX → Work▾ → Defects → row) ✗ | **fail** |
| Maintenance list | 2 (Work▾ → Maintenance) | 2 | ✓ |
| Assets list | 2 (Work▾ → Assets) | 2 | ✓ |
| Arbitrary asset | 3 (Work▾ → Assets → row) ✗ | 3 ✗ | **fail** |
| Vendors list | 2 (Resources▾ → Vendors) | 2 | ✓ |
| Arbitrary vendor | 3 (Resources▾ → Vendors → row) ✗ | 3 ✗ | **fail** |
| Email Inbox | 2 (Resources▾ → Email Inbox) | 2 | ✓ |
| Reports | 1 (direct link) | 1 | ✓ |
| Report history | 2 (Reports → View history) | 2 | ✓ |
| Agreement for a visible client | 2 (client card → agreement row) | 3 (FMX → card → row) ✗ | **fail from deep** |
| Any + Add action (defect/asset/vendor/service/client) | 2 (+ Add▾ → item) | 2 | ✓ |

† "Clients card on strip" relies on the dashboard's horizontal client strip. On a 4+ client portfolio the target client may not be in the first 1-2 cards and requires horizontal scroll — counts as 1 tap but add thumb scroll time.

**Headline findings**

- **Four destinations fail the 2-tap rule from the dashboard**: Properties list (minor; recent properties are already 1 tap), and crucially *any arbitrary defect / asset / vendor / contact* when it isn't in the dashboard's recent list. That's the biggest gap — once a defect scrolls off the recent-14-days window, it's always 3+ taps.
- **From a deep page**: anything not reachable from the dashboard tiles slips to 3 taps. The back-button + nav-dropdowns pair isn't enough.
- **Root cause**: nav dropdowns insert an intermediate tap (open dropdown → pick item → ...). Every intermediate tap costs us the 2-tap budget.

**Mobile layout audit (code review at 375pt baseline, confirmed where possible from component widths)**

| Page | Concern | Severity |
|---|---|---|
| `/` Dashboard | Recent defects uses `<table>`; 5 columns at 375pt will crush or overflow horizontally. KPI stat cards 2-col on sm — fine. | **medium** — redo as list-cards below `md:` |
| `/defects` | Table-based list; same width issue. Filter chips wrap but become tall. | **medium** — mobile list-card layout |
| `/clients/[code]` | Collapsed agreement rows: good. Service lines table nested in agreement groups: narrow but readable. Jobs list: table-ish. | **low-medium** |
| `/properties/[code]` | FCA table + Components grid: multi-column at desktop, likely overflows on 375pt. | **medium** |
| `/clients/[code]/agreements/[agreement_code]` | 1-col at sm. ✓ | ✓ |
| `/reports` + `/reports/history` | Form + card list. ✓ | ✓ |
| `/vendors`, `/assets`, `/maintenance` | All table-dominant. | **medium** |
| `/email-inbox` | Message list. Check attachment layout. | low |
| Add forms (new-defect, new-asset, new-vendor, service-log) | Likely OK — single-column forms. Primary button on bottom? To check. | low |

**Follow-up cleanup stories raised (FMX-031 through FMX-035)**

- **FMX-031** — Global search/command palette (⌘K / tap on nav search icon) — fixes every "arbitrary defect/asset/vendor" fail in one move. Size M.
- **FMX-032** — Mobile list-card layout for the Defects list — replaces `<table>` below `md:` breakpoint. Size S.
- **FMX-033** — Mobile list-card layout for Vendors, Assets, Maintenance lists. Size S.
- **FMX-034** — Dashboard "Recent defects" as list-cards on mobile; table only on `md:` and up. Size XS.
- **FMX-035** — Property page FCA + components table: mobile layout fix. Size S.

Agreement-view-from-deep failure resolved by FMX-031 (search opens any client instantly). Properties-list-from-deep fail fixed by either promoting Properties to a top-level nav item (Portfolio becomes direct link to Properties, Clients tucked under + Add or a secondary link) — captured as a decision inside FMX-031.

**As** an FM using FMX on a phone on-site
**I want** every common destination reachable in ≤ 2 taps from anywhere, and every page sized and laid out for mobile first
**So that** the app is fast enough to use one-handed while standing in front of equipment

**Acceptance criteria — Tap-count audit**

- Enumerate every "common destination": dashboard · each client hub · each property hub · defect detail (via Recent on dashboard) · defects list · maintenance list · assets list · vendors list · reports list · email inbox · add any entity (defect / asset / vendor / client / service event)
- From the dashboard, document the tap count to each; anything > 2 raises a sub-story to shorten
- From a deep page (e.g. defect detail), same measurement; back button + nav Group dropdowns together should keep the count ≤ 2 for every destination
- Known candidates for a shortening story: reaching the agreement view (currently Dashboard → KGF client card → Agreement row = 3 taps — may need a dashboard-level "Open agreement" shortcut on the client strip card, or a search bar)

**Acceptance criteria — Mobile layout audit**

- Every page renders cleanly on 375pt viewport (iPhone SE baseline): no horizontal scroll, no cut-off tables, no overflowing badges
- Table-heavy pages (defects list, service contracts, open items reports) use a mobile list-card layout below `md:` rather than cramming a wide table
- Every tap target ≥ 44 × 44 pt, confirmed on nav, dashboard tiles, list rows, form controls
- Primary actions on forms sit at the bottom of the viewport, reachable with the thumb; secondary actions (Cancel) are smaller / less prominent
- No modals — any flow currently in a modal becomes its own route

**Deliverable**

- A written audit (markdown table in BACKLOG) listing every destination and its current tap count from dashboard + from a representative deep page
- Each failing destination raised as its own cleanup story (FMX-031+), sized XS/S
- Each layout defect raised the same way

---

### [FMX-036] Move "+ Add" off the nav and onto the dashboard

- Type: story · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 (Carl)

**Done notes (final shape):** `+ Add ▾` dropdown and related state removed from `components/nav.tsx` entirely — nav is now navigation-only (`[← Back] FMX [Dashboard · Portfolio · Work · Resources · Reports]`). Mobile hamburger no longer carries the Add section either. Dashboard carries a single `+ Add ▾` dropdown tile (new `components/add-dropdown.tsx` client component) below the client strip. Hover opens it on desktop; tap opens it on mobile. Dropdown contents: **+ Defect · + Asset · + Vendor · + Client**. Update-defect and log-service deliberately not here — they happen from the defect's own detail page ("Update status") and the asset's own detail page ("Log service event"), which both already exist.

**As** an FM
**I want** the top navigation to carry navigation only — no create actions — and every "+ Add" action collected into a dedicated block on the dashboard
**So that** the nav bar is uncluttered and single-purpose (get me somewhere), and adding something is a deliberate stop at the dashboard, not a dropdown I keep opening while trying to navigate

**Acceptance criteria**

- Remove the `+ Add ▾` dropdown from the top nav entirely. Nav becomes: `[← Back] FMX [Dashboard · Portfolio ▾ · Work ▾ · Resources ▾ · Reports]` — navigation only
- Dashboard grows a prominent `+ Add` section, near the top, above the Recent defects table but below the client strip
- The + Add block renders as a responsive grid of action tiles — one tap per action, no dropdown:
  - **+ Log defect** (primary tint)
  - **+ Update defect**
  - **+ Add asset**
  - **+ Add vendor**
  - **+ Log service event**
  - **+ New client**
- Each tile has an icon (optional, text-only is fine), label, and one-line hint; min 44pt touch target; 2-col on mobile, 3-col on tablet, 6-col on desktop
- Tapping a tile goes straight to the create form (no intermediate menu)
- Deep-page access to add actions: FMX wordmark → + Add tile = 2 taps to the Add block, 3 total to a specific create. Carl confirmed this trade-off is acceptable — cleaner nav outweighs the deep-page add speed
- Mobile hamburger menu no longer carries "+ Add" entries; the Add block on the dashboard is the only source

**Notes**

- Supersedes the right-side `+ Add ▾` cluster introduced by FMX-027. Keep the Back button; only the Add menu moves.
- Design principles updated 2026-11-17 to reflect that the 2-tap rule applies to *navigation destinations*; create actions are allowed 3 taps from deep pages because they live on the dashboard.

---

### [FMX-031] Global search / command palette — reach any entity in 2 taps

- Type: story · Size: M · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-030

**Done notes:** New `components/search-palette.tsx` (client) + `app/api/search/route.ts` (server). Magnifier icon on the right of the nav (replaces the position the old + Add dropdown occupied — nav now reads `[←] FMX [center nav] [🔍]`). Opens a centred sheet with autofocused text input. Debounced 150ms ilike search across `defects`, `clients`, `properties`, `client_agreements`, `assets`, `providers`. Results grouped by type (icon + label + sub), max 5 per group. Arrow-key navigation, Enter opens, Esc closes, `/` opens from anywhere. Recently opened items (5) stored in `localStorage` and shown when the input is empty. Click a result = navigate + close in one gesture = meets the 2-tap rule for every arbitrary entity from the audit (open search = 1, pick result = 2).

**As** an FM on mobile
**I want** a search icon in the nav that opens a search sheet and lets me jump to any defect, asset, vendor, client, property, or agreement by typing a few characters
**So that** no matter how deep I am in the app, any entity is ≤ 2 taps: tap search, tap the result

**AC**

- Search icon in the top nav (magnifier glyph); keyboard shortcut `/` on desktop
- Opens a bottom sheet on mobile / centred modal-page on desktop, with a single text input autofocused
- Types resolved by prefix match: defect number (DEF-2026-0211), asset code, vendor name, client short code, property short code, agreement code, person name
- Results grouped by type with icon, max 5 per group, keyboard-navigable
- Enter opens the top result; tap opens the picked result
- Recently opened entities appear when the input is empty (5 most recent, stored in `localStorage` per browser)
- Tapping a result navigates and closes the sheet in one gesture — meets the 2-tap rule

**Fixes:** every "arbitrary defect / asset / vendor" 3-tap failure from the audit.

---

### [FMX-032] Mobile list-card layout for the Defects list

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-030

**Done notes:** Below `md:`, `/defects` renders each defect as a stacked list card — ref chip + severity badge + property + status/date on the top line, title on the next line. Resolved rows show resolved-date. "Raise WO" dispatch button floats bottom-right when the defect is open. `md:` and up keeps the full table. Filter chips unchanged.

**AC**

- Below `md:` breakpoint, `/defects` renders each defect as a card (ref + severity badge · property chip · title wrapped · age + date)
- Table layout retained for `md:` and up
- Filter chips stay above the list on both layouts
- No horizontal scroll at 375pt

---

### [FMX-033] Mobile list-card layout for Vendors, Assets, Maintenance

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-030

**Done notes:** Vendors `/vendors` — name + rating + trade/contact + whatsapp/email, stacks cleanly on 375pt, table kept above `md:`. Assets `/assets` — asset code chip + condition badge + property + name + type/make-model, same pattern. Maintenance `/maintenance` — dropped the nested `<table>` entirely (rows were already single-cell dominant) and uses flexbox `<ul>` for both the Assets and Service-contracts blocks so Due chip + Log-service button stay to the right on mobile without clipping.

**AC**

- Below `md:` breakpoint, each list renders as cards per its own schema
- Vendors: name + trade + rating + contact-chip (📞 / WhatsApp)
- Assets: name + property + condition badge + next-service date
- Maintenance: asset + property + due date + status badge
- Table layout retained for `md:` and up

---

### [FMX-034] Dashboard "Recent defects" as list-cards on mobile

- Type: tech-debt · Size: XS · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-030

**Done notes:** Dashboard Recent-defects renders as stacked list rows below `md:`, table kept above. Row = defect number chip + severity badge + property + date on the top line, title below. Whole row clickable, preserves FMX-012 behaviour. No horizontal overflow at 375pt.

**AC**

- Below `md:` breakpoint, Recent defects renders as rows: defect number + severity badge · title · property · date
- No horizontal overflow at 375pt
- Whole row remains the click target (preserves FMX-012)

---

### [FMX-035] Mobile layout fix — property page FCA + components

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17 · Follows: FMX-030

**Done notes:** FCA summary strip wraps to 3×1 on mobile and 3×1-horizontal above sm. Components 3-col table → stacked flex row (component name + rating badge + score) that reads at any width. Defects list on property page now mobile list-cards (ref chip + severity + status + title). Assets register on property page: list cards (asset code + name + make-model + condition badge). Service contracts on property page: 1-line title + fee + 1-line sub (frequency, next service). No horizontal overflow at 375pt on any section.

**AC**

- `/properties/[code]` FCA block and the 9-component grid stack vertically below `md:` breakpoint
- Component rating badges keep their colour; score values right-aligned
- No horizontal scroll at 375pt

---

### [FMX-037] Finish `defects.trade` rollout — promote / update / email / dispatch

- Type: tech-debt · Size: S · Status: done 2026-11-17 (3 of 5) · Raised: 2026-11-17 · Follows: FMX-021

**Done notes (3 of 5):**

1. **Inline Set-trade on defect detail** — New `TradeEditor` client component + `setDefectTrade` server action. Chip in the badge row reads `+ Set trade` (amber) when NULL, the trade value (muted) when set. Tap to edit inline with a datalist of distinct `providers.trade` values. Fixes the 62 unclassified backfill without having to go through update-defect.
2. **Required trade on promote-from-draft** — Form field with datalist, required before promotion. Server action validates and persists.
3. **Dispatch vendor pre-filter by trade** — When defect carries a trade, vendor dropdown default-filters to providers whose `trade` contains the defect's trade (or vice versa — two-way substring match handles "HVAC" vs "HVAC — AC supply + install"). "Show all vendors" toggle in the label row flips to the unfiltered list. Current selection auto-clears when filtered out. Helper text shows "Filtered to vendors matching 'HVAC' (3 of 14)".

**Still open — raised as separate smaller stories:**

- **FMX-038** — Email-ingest classifier: apply the same keyword rules used in FMX-021 backfill to the Postmark inbound action so new drafts arrive pre-tagged. XS.
- **FMX-039** — Platform-report "Open by trade" and "Completed this month by trade" breakdowns. XS.

---

### [FMX-040] Decision — rename FMX (US trademark conflict)

- Type: decision · Size: XS (research) + variable (rename work) · Status: in-progress 2026-11-17

**Context.** Facilities Management Express, LLC (gofmx.com), Ohio, founded 2012, markets "FMX Work Manager" and other "FMX" modules into the same K-12/facility/government category with 1,000-2,000+ customers. The 2024 strategy paper targets a $40M exit — brand clash puts that at risk.

**Trademark search plan**

Run against the term being considered (current "FMX" first for exposure assessment, then any shortlist). Minimum registries:

- **Fiji IP Office** — https://ipofiji.gov.fj — trademark register search. Fiji uses the Nice Classification.
- **IP Australia** — https://search.ipaustralia.gov.au/trademarks/search/quick — regional influence, closest major market.
- **IPONZ (NZ)** — https://app.iponz.govt.nz/app/Extra/Default.aspx?op=EXTRA_pq_tm — same region.
- **USPTO TESS** — https://tmsearch.uspto.gov — the gofmx.com entity sits here.
- **WIPO Global Brand Database** — https://branddb.wipo.int — catches international registrations covering Fiji.

Classes to search (Nice):

- **Class 9** — downloadable software (the app itself)
- **Class 35** — business administration, consultancy (CMS's facilities-management services)
- **Class 42** — SaaS, software-as-a-service, hosting (the platform tier)
- Secondary: **Class 37** (building maintenance / repair services) if the platform is bundled with CMS's own on-site services.

Also do a .com / .co / .app / .fj domain availability check for the shortlist, and a Google + LinkedIn + App Store + Play Store name check so we don't collide with an unregistered but trading name.

**Name candidates (first draft — 5 options, all distinctive, short, trademark-pickable)**

| Candidate | Rationale | Risk / check |
|---|---|---|
| **Keel** | Marine metaphor (fits Pacific context + the traceability yard-to-site custody chain); 4 letters; `keel.app`, `keel.io` likely bright-line conflicts (keel.sh is an unrelated data-ops tool). | Check Keel Technologies (keel.so). |
| **Yomi** | Short, soft, maps to "to carry / to read" in Japanese (resonates with scan+register); zero clash with existing FM/CMMS vendors I know of. | Yomi Inc is a US medical robotics company — different class. Check overlap. |
| **Tapu** | iTaukei word (sacred, bound, prescribed) — meaningful to the Fiji market, honours local language per principle #10; three letters. | Potentially sensitive cultural term — validate with iTaukei speakers before adopting (Fijian Affairs Board input advised). |
| **Vaka** | iTaukei for "boat / vessel" — same thesis, more universally positive connotation. | Already used by a few NGOs in the Pacific — check overlap in class 9/35/42 specifically. |
| **Fieldstack** | Descriptive but ownable; evokes the hero-workflow stack (scan → check → snap → done → report); available in `.app` space at time of writing (verify). | Likely some Fieldstack-adjacent names exist in US CMMS — search carefully. |

Shortlist criteria (narrow 5 → 2 for formal search):

- One-syllable or two-syllable, under 7 letters
- Clean across all 3 trademark registries + USPTO in classes 9/35/42
- Domain `.app` or `.io` available; `.com` available or buyable
- Not a pre-existing trading name in Pacific facilities management
- Pronounceable in English, iTaukei and Fiji Hindi (principle #10)

**Audit checklist — occurrences of "FMX" to replace if the rename lands**

- `fmx-app/` folder name in repo (and any CI config)
- `package.json` name, `README.md`
- Supabase project name, storage bucket names (`defect-photos`, `reports`)
- Dropbox folder `_tooling/fmx-app`, report filenames (`KGF-*-FM-Report.docx`)
- Email signatures referencing "FMX"
- `fmx@cmsfiji.com` inbound address → new address + Postmark route
- Xero contact references, invoice line descriptions
- Vercel project name + deployed URL
- Every "FMX" text literal in `src/components/nav.tsx`, page titles, meta tags, the generator footer in `generate.ts`

**Decision gate.** Shortlist of 2 names needs to be chosen before Phase 1 field pilot (per the strategic directive). No external brand spend / no printed QR labels until this closes.

**Next action from me (Carl):** confirm trademark classes above are the right coverage, pick 1-2 candidates for formal search, and point me at any additional name constraints (investor preferences, domain budget, existing CMS sub-brands to avoid colliding with).

---

### [FMX-041] Epic — Offline-first field architecture (now a parent)

- Type: epic · Size: L · Status: split into FMX-046..051 · Raised: 2026-11-17

Split complete. Six stories below carry the work. Deliver in order — each unblocks the next.

---

### [FMX-046] IndexedDB local-first write queue

- Type: story · Size: M · Status: done 2026-11-18 (infrastructure landed; per-feature migration continues in follow-ups) · Part of: FMX-041 · Raised: 2026-11-17

**Done notes (infrastructure):**

- **Dexie** added as a dep (`dexie@^4.4.7`). New `fmx` IndexedDB database, v1 schema: `queue` table (auto-id, `kind`, `status`, `nextAttemptAt`, `dedupeKey` indices) + generic `kv` table.
- `src/lib/offline/db.ts` — client-only Dexie singleton, exports `db()` guarded against SSR.
- `src/lib/offline/queue.ts` — public API:
  - `registerHandler(kind, fn)` — call sites register a handler by name
  - `enqueue(kind, payload, { dedupeKey? })` — stores a JSON-serialisable op locally, kicks the runner
  - `summary() / listEntries() / retry(id) / discard(id) / onChange(cb)` for the UI
  - `startRunner()` — exponential-backoff drain, kicks on `window.online` + 30s heartbeat
  - Max 10 attempts, 2s→5min capped backoff with jitter, dedupe-key collapse so repeated edits of the same record coalesce
- `src/components/sync-indicator.tsx` — chip mounted in the nav. Hidden when online + nothing pending. States follow design principle #6 (colour + icon + word): `Offline` muted · `Syncing N` amber · `N sync failed` red. Also starts the retry runner on first mount.

**Per-feature migrations split out as follow-ups** — the queue infra is live, but each call site still writes directly today. Migration stories to route them through `enqueue()`:

- **FMX-059** — Migrate photo appender (FMX-013) onto the queue (uses `kind: 'defect.photos.append'`). Lets offline photo captures retry cleanly.
- **FMX-060** — Migrate inline trade editor (FMX-037) onto the queue (`kind: 'defect.trade.set'`, dedupe by defect number).
- **FMX-061** — Migrate update-defect status-change onto the queue (`kind: 'defect.status.update'`).
- **FMX-062** — Migrate agreement editor (FMX-026) onto the queue (`kind: 'agreement.update'`).

These are each S-sized — the pattern is: write a thin server-action wrapper that `enqueue()`s, register its handler on module load, swap the call site. Can be shipped as needed without blocking any of the hero-workflow stories.

---

### [FMX-063] Default inspection template picker on property + asset

- Type: story · Size: XS · Status: done 2026-11-18 · Follows: FMX-054

**Done notes:** Two new server actions in `src/app/inspections/assignment-actions.ts`: `setPropertyDefaultTemplate(shortCode, templateId, key)` + `setAssetDefaultTemplate(id, templateId, key)` — both write to the FKs added by the FMX-054 migration. Shared `<DefaultTemplatePicker/>` client component mounted on both the property hub (`/properties/[code]`) and the asset detail (`/assets/[id]`) pages. When no template is assigned it shows the picker; when assigned it collapses to a one-row card with the template name + Change link.

---

### [FMX-064] Scanner → Start-inspection shortcut

- Type: story · Size: S · Status: done 2026-11-18 · Follows: FMX-054, FMX-063

**Done notes:** Same `<DefaultTemplatePicker/>` renders a primary **Start inspection →** button whenever a default template is set. Scanning a property or asset QR (FMX-053) now lands on a page that's **one more tap** to the FMX-055 checklist runner — the strategy note's "Scan → Check → Snap → Done → Report" loop is now a tight 3-tap physical workflow from label to first question. The Start link prefills `/inspect/new?template=<id>&property=<short_code>` (or `&asset=<id>&property=<short_code>` for asset-scoped runs) so the New Session form opens with the right scope already picked.

---

### [FMX-067] Voice notes per inspection item

- Type: story · Size: S · Status: done 2026-11-19 · Follows: FMX-055, FMX-072

**Done notes:**

- New `VoiceRecorder` client component (`src/app/inspect/[session_id]/voice-recorder.tsx`) — single-take `MediaRecorder` with rolling timer. Prefers `audio/webm;codecs=opus`, falls back to the browser default (Safari). Record / Stop (0:12) button toggle, preview `<audio>` + Re-record / Clear after capture. Stream + object URLs cleaned up on unmount. Handles `NotAllowedError` and the "no mediaDevices" case explicitly.
- New `/api/inspection-voice` route — same auth + path convention as `/api/inspection-photo` but single blob, 15 MB cap, writes to `defect-photos` bucket under `inspection/<session>/<item>/voice-<ts>.{webm|m4a|ogg|mp3}`.
- New server action `attachVoiceToResult(resultId, url, key)` — mirrors `attachPhotoToResult` for the single `voice_note_url` column (added by FMX-048).
- New queue handler `voice.upload` — reads the blob, posts to the voice endpoint, attaches the URL via the server action, evicts on success. Missing blob = treat as done (lost storage shouldn't loop forever).
- Runner integration — `Draft.voice: Blob | null`, VoiceRecorder mounted under the per-item Photos row. On Next the blob stages to Dexie via `storeBlob()` and one `enqueue('voice.upload', …, dedupeKey: 'voice.upload.<result_id>')` goes out so re-recording per answer collapses cleanly. Voice buffer clears after save alongside the photos.

**Behaviour today:**

- Inspector hits Record → speaks → Stop → preview plays back → Next saves the answer and queues the audio for background upload (offline-safe via FMX-072 pattern).
- One voice note per answered item. Already-saved voice notes aren't shown in the runner when revisiting an item (same pattern as photos) — they live on the result row.

---

### [FMX-068] Offline wiring for inspection writes

- Type: story · Size: M · Status: done 2026-11-18 (Phase A) · Part of: FMX-055 / FMX-046 follow-ups

**Done notes — Phase A (data writes):**

- **`FieldCaptureBoot`** client component mounted in root layout registers four queue handlers on first paint and starts the runner:
  - `inspection.recordResult` → `recordResult`
  - `inspection.completeSession` → `completeSession`
  - `inspection.raiseDefects` → `raiseDefectsFromSession`
  - `scan.record` → `recordScan`
- **Runner migration** — `saveCurrent()` now calls `enqueue('inspection.recordResult', …, { dedupeKey: 'inspection.recordResult.<session>.<item>' })` and resolves immediately. The item answer saves locally in IndexedDB; the UI advances to the next question without waiting on the network. Re-answering an item collapses on the dedupe key, so the final answer is the one that syncs.
- **Close migration** — `completeSession` + `raiseDefectsFromSession` both enqueued with separate dedupe keys. Two handlers so the fail→job pipeline still runs cleanly even if the tab closes between them.
- **Scanner wiring (closes FMX-066 too)** — every resolved scan now enqueues `scan.record` with `{ target_kind, target_id, target_path, context: 'scan_jump', scanned_at }`. Idempotent via client-assigned uuid.
- **Sync chip** (FMX-046) was already in the nav — now shows live counts as inspection writes queue up offline and drain when the connection returns.

**Still inline (not queued) — Phase B scope:**

- **Photos** (per-item inspection photos + attendance photo) still upload via inline `fetch('/api/inspection-photo')`. Binary blobs aren't JSON-serialisable; the queue payloads need a separate Dexie blob table + a handler that reads the blob, uploads, writes back the public URL, and only then marks the result for sync. Raised as **FMX-072 (M)**.

**Result today:** a KGF-size inspection run with no photos works fully offline — the inspector can answer every question, close with signature, and every row syncs when connectivity returns. Photo-required items still need a connection; FMX-072 removes that constraint.

---

### [FMX-072] Offline photo pipeline (inspection + attendance)

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-068

**Done notes:**

- **Dexie v2 migration** — new `blobs` table on the `fmx` database (`id, blob, mime, size, createdAt`). Dexie preserves the v1 queue + kv tables across the version bump.
- **`src/lib/offline/blobs.ts`** — three helpers: `storeBlob(blob)` returns a client uuid; `getBlob(id)` reads it back; `deleteBlob(id)` evicts on ACK.
- **`photo.upload` queue handler** — reads the blob by id, POSTs to `/api/inspection-photo`, dispatches to the right attach action based on `target`:
  - `target: 'result'` → `attachPhotoToResult(resultId, url, key)` (appends to `inspection_results.photo_urls`, deduped so retries no-op)
  - `target: 'attendance'` → `attachAttendancePhoto(sessionId, url, key)` (sets `inspection_sessions.attendance_photo_url`)
  - On success the local blob is evicted from IndexedDB. If the blob is missing (e.g. storage cleared), the handler treats it as success rather than looping forever.
- **Two new server actions** — `attachPhotoToResult` + `attachAttendancePhoto` in `src/lib/field-capture/actions.ts`. Both idempotent.
- **Runner migration** — per-item photos now `storeBlob()` the compressed file + `enqueue('photo.upload', { target: 'result', result_id, session_id, blob_id })`. The result row commits with `photo_urls: []`; the handler attaches each URL as it uploads.
- **Attendance photo migration** — `completeSession` lands with `attendance_photo_url: null` and the attendance photo stages to IndexedDB via `stageAttendancePhoto()`; handler fills the URL on upload ACK.
- **End state:** a full inspection run including photos works offline. Inspector captures photos on the plane / underground / in the bush → session + answers queue locally → photos stage to IndexedDB → everything flushes when connectivity returns. Sync chip in the nav shows pending count throughout.

**Dropped from AC as unneeded for current ship:** per-photo sync chip on each preview. The global nav indicator covers the "am I synced" question at the level users actually ask it. If per-photo granularity becomes important, raise a follow-up.

**AC**

- New `pending_blobs` table in Dexie (id, blob, mime, created_at). Photos captured offline write to this table instead of uploading immediately.
- New queue kind `photo.upload` with a handler that reads the blob by id, POSTs to `/api/inspection-photo`, writes the resolved URL back to the owning `inspection_results.photo_urls` row (also via the queue)
- Runner UI shows a per-photo sync chip until each ACK; attendance photo too
- Local blobs evict from Dexie after server ACK
- Works end-to-end on a plane / underground / in-bush: inspector captures photos, hits Close, closes app, comes back online — everything syncs

---

### [FMX-066] Wire scanner to record scan events

- Type: tech-debt · Size: XS · Status: done 2026-11-18 · Folded into FMX-068

**Done notes:** Scanner now enqueues `scan.record` on each resolved scan. See FMX-068 Phase A for details.

---

### [FMX-059] Migrate photo appender onto the write queue

- Type: tech-debt · Size: S · Status: done 2026-11-18 · Follows: FMX-013, FMX-046

**Done notes:** `PhotoAppender` (defect detail page) now stages each compressed photo to Dexie via `storeBlob()` then enqueues `defect.photos.append` with the batch of `blob_ids`. Handler rebuilds the FormData the existing `appendDefectPhotos` action expects, reads each blob, submits, and evicts on ACK. Offline-safe — defect photos captured on-site survive airplane mode the same way inspection photos do.

**AC**

- `appendDefectPhotos` wrapped so the call site enqueues locally; photos stored in IndexedDB until the handler flushes them to Supabase Storage
- Queue handler registered under `kind: 'defect.photos.append'`
- Photos kept in local blobs until server ACK (ties to FMX-049 scope)
- User sees the photo in the gallery immediately, with a sync chip on each preview until server-confirmed

---

### [FMX-060] Migrate inline trade editor onto the write queue

- Type: tech-debt · Size: XS · Status: done 2026-11-18 · Follows: FMX-037, FMX-046

**Done notes:** `TradeEditor` now `enqueue('defect.trade.set', { defect_number, trade, key }, { dedupeKey: 'defect.trade.<number>' })` on save instead of awaiting the server action. Last edit per defect wins thanks to the dedupe. Chip closes optimistically.

**AC**

- `setDefectTrade` call enqueues `{ defectNumber, trade }` with `dedupeKey = \`defect.trade.${defectNumber}\`` so the last edit wins
- Handler registered under `kind: 'defect.trade.set'`
- Optimistic UI stays unchanged — the chip already shows the new value immediately

---

### [FMX-061] Migrate update-defect status-change onto the write queue

- Type: tech-debt · Size: S · Status: done 2026-11-18 · Follows: FMX-046

**Done notes:**

- New `/api/defect-photo` endpoint — simple `defect_id + key + photos` upload to the shared `defect-photos` bucket under `${defect_id}/${ts}-${i}.ext` (matches the path convention the old monolithic `updateDefect` action was writing to).
- New JSON server action `applyDefectStatusUpdate({ defect_id, defect_number, new_status, notes, provider_id, photo_urls, key })` in `src/app/update-defect/actions.ts`. Same validation + audit-row + status-flip + resolution-notes logic as the old `updateDefect`, but takes already-resolved photo URLs instead of raw File objects and doesn't redirect (caller is a background worker).
- New queue handler `defect.status.update` owns the whole sequence: reads blobs from Dexie → uploads via `/api/defect-photo` → calls `applyDefectStatusUpdate` with the resolved URLs → evicts blobs on success. One op per update attempt so photos and status-flip either both land or both retry; a mid-flight failure never leaves a status flipped without evidence.
- Form migrated — compress → `storeBlob()` each photo → `enqueue('defect.status.update', { … blob_ids }, dedupeKey: 'defect.status.update.<id>.<attempt-ts>')`. Form redirects straight to the success page optimistically; handler drains in the background.
- Idempotency: the dedupe key intentionally includes `Date.now()` so a retry attempt doesn't collapse with a different attempt — each "mark resolved" is its own op. If the status flip retries after the photo upload succeeded, duplicate URL entries sink into `defects.photo_urls` as a deduped set.
- Last of the four write-path migrations — **FMX-059, FMX-060, FMX-061, FMX-062 all now on the queue**. Every user-visible write on the app is offline-safe except: `/new-defect` (keep inline because draft-creation is a tiny FormData form with no blobs) and the admin manage flows.

**AC**

- Status change + evidence photos enqueued as one op with per-field payload
- Handler registered under `kind: 'defect.status.update'`
- Photo blobs stored alongside in IndexedDB until the handler flushes

---

### [FMX-062] Migrate agreement editor onto the write queue

- Type: tech-debt · Size: XS · Status: done 2026-11-18 · Follows: FMX-026, FMX-046

**Done notes:** `AgreementEditor` save now enqueues `agreement.update` with `dedupeKey = agreement.update.<agreement_id>` so rapid save clicks coalesce to one op. Redirect back to the view URL happens optimistically; the handler drains in the background.

**AC**

- `updateAgreement` call enqueues with `dedupeKey = \`agreement.${agreementCode}\`` so rapid edits coalesce
- Handler registered under `kind: 'agreement.update'`

**As** a crew member
**I want** every create / update action I take in the field written to local storage before anything leaves my phone
**So that** nothing waits on a network round-trip and nothing is lost when the connection drops

**AC**

- Dexie (or idb-keyval) wrapper exposing `enqueue(entity, op, payload)` and per-entity reads that merge local-pending + last-known-server state
- All existing server actions wrapped in a client-side queue: write local, show optimistic state, fire the server call in the background
- Queue has retry with exponential backoff, deduplicates idempotent ops, persists across app restarts
- Failed ops surface in a per-record error state (not silent); user can retry or discard
- Zero regressions on desktop: when online, UX feels identical to today

---

### [FMX-047] Sync-state chip (design-system entry)

- Type: story · Size: S · Status: next · Part of: FMX-041 · Depends on: FMX-046

**AC**

- Reusable `<SyncChip state="local|queued|sent|failed" />` component. Three visible states follow design principle #9: "Saved on device" → "Waiting to sync" → "Submitted" (plus "Sync failed — retry").
- Rendered next to every record created / edited while offline, until confirmed server-side
- Colour + icon + word per design principle #6
- Also rendered globally in the nav as a counter when any queue > 0 ("3 waiting")

---

### [FMX-048] Append-only data model for field capture

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-041

**Done notes:** Migration `fmx048_append_only_field_capture` adds four tables, every row immutable after insert (design principle #9 — late offline rows can never overwrite completed work):

- **`inspection_sessions`** — one run of a template. Client-assigned uuid. `started_at` immediately, `completed_at` on finish. Signature + attendance photo + notes attach on completion.
- **`inspection_results`** — one answered checklist item. Carries a **snapshot** of `question` + `kind` so late-syncing rows render correctly even if the template was edited after capture. `failed` + `failure_reason` + nullable `defect_id` for the FMX-056 auto-raise pipeline. Answer value lives in one of `answer_bool` / `answer_number` / `answer_text` matching `kind`. Photos as `text[]`.
- **`scan_events`** — one QR scan. `target_kind` enum (property / asset / client / agreement / defect / vendor / other), `target_id`, optional lat/lng + `context` (e.g. `inspection_start`, `dispatch_check`, `yard_receive`). Powers both scan analytics today and the Phase-2 custody chain tomorrow.
- **`readings`** — one meter/gauge reading against an asset. Free-text `kind` (hours / kWh / fuel_litres / etc), numeric + text + unit fields. Feeds consumption, hours-run and service-interval triggers.

**Idempotency.** Every write is an `upsert(onConflict: 'id')` on the client-assigned uuid. Phones mint uuids via `crypto.randomUUID()` so FMX-046's queue can retry safely — the second attempt just no-ops.

**Thin server actions in `src/lib/field-capture/actions.ts`:** `startSession`, `completeSession`, `recordResult`, `recordScan`, `recordReading`. Each validates the payload shape and the secret key, then upserts. Types shared with the client in `src/lib/field-capture/types.ts`.

**No UI in this ship.** FMX-055 (checklist runner), FMX-057 (close-with-evidence), FMX-058 (report assembler) are the consumers. FMX-053 scanner now has a `recordScan` to call too — raised as a tiny follow-up.

**Follow-ups:**

- **FMX-066** — Wire FMX-053 scanner to call `recordScan(...)` so every scan lands in `scan_events`. XS.

**AC**

- New tables: `inspection_results` (immutable per-item answer rows), `scan_events` (who/what/where/when), `readings` (meter / gauge values)
- Existing mutable records (defects, assets) keep their current shape; audit via the append-only tables going forward
- Migration creates the tables + indexes; backfill not required
- Supersedes last-writer-wins for anything touched in the field — a late-syncing phone can't overwrite a completed job

---

### [FMX-049] Resumable photo uploads with local-retain-until-ACK

- Type: story · Size: M · Status: next · Part of: FMX-041 · Depends on: FMX-046

**AC**

- Photos uploaded as chunks via Supabase Storage resumable endpoint
- Original kept in IndexedDB until the server returns a successful ACK, then evicted
- Upload progress visible per photo; pause/resume handles airplane mode
- Separate from the record-sync queue — a slow photo doesn't block job close
- Works with the client-side JPEG compression pipeline already in `/new-defect` and FMX-013

---

### [FMX-050] Service worker + PWA manifest + install prompt

- Type: story · Size: S · Status: done 2026-11-18 · Part of: FMX-041

**Done notes:**

- **Manifest** — `src/app/manifest.ts` served at `/manifest.webmanifest`. Standalone display, portrait orientation, FMX navy theme, 4 icon sizes (SVG + 192/512/maskable-512 PNG), 3 categories. Apple-touch icon at 180×180 covers iOS add-to-home-screen.
- **Icons generated** — `public/icon.svg` is the single source; ImageMagick converts in `public/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (padded for platform masks), `apple-icon.png`. Rebuild when the brand changes.
- **Service worker** — `public/sw.js`. Install precaches the shell (`/`, `/offline`, manifest, icons). `activate` purges old cache versions. Fetch strategy: navigation = network-first → cached shell → offline page; static = cache-first; `/api/*` + HMR = passthrough; non-GET = passthrough (writes go to FMX-046 queue, not the SW). Cache key `fmx-shell-v1` — bump on every shell-changing deploy.
- **Registration** — `src/components/sw-register.tsx` registers `/sw.js` in production only (keeps `next dev` sane). New workers activate via `SKIP_WAITING` + `controllerchange` reload — users aren't interrupted mid-inspection, the next idle is when the new build takes over.
- **Offline fallback page** — `/offline` is a static page precached by the SW so a navigation that fails returns a real page, not a browser error.
- **Layout wired** — `src/app/layout.tsx` adds Viewport (no zoom-out, 1.0 initial scale — field use), icons metadata, Apple web-app hints, mounts `<ServiceWorkerRegister />`.
- **Install prompt deferred to stretch** — modern Android Chrome auto-prompts when install criteria are met, and iOS doesn't allow programmatic prompts. If a visible "Install FMX" button is wanted, raised as a follow-up (needs a `beforeinstallprompt` capture).

**AC**

- Service worker precaches the app shell + static assets; app opens with no connection
- `manifest.json` with app name, icon set, standalone display
- "Add to Home Screen" prompt on first visit with the quick-add key
- Offline fallback page lists which queued items are pending
- Updates handled gracefully: new SW activates on next idle, not mid-inspection

---

### [FMX-051] Field-level merge resolver for shared records

- Type: tech-debt · Size: M · Status: idea · Part of: FMX-041 · Depends on: FMX-046, FMX-048

**AC**

- When two devices change different fields of the same asset / defect concurrently, both changes survive the merge
- Conflict resolution rules documented per table (last-writer-wins only for status, additive for notes, union for photo_urls, max for condition_rating)
- Conflicts that can't auto-resolve surface in a Conflicts queue for Carl, not silently discarded (per design principle #9)

---

### [FMX-042] Epic — Scan → Check → Snap → Done → Report (now a parent)

- Type: epic · Size: L · Status: split into FMX-052..058 · Depends on: FMX-041 · Raised: 2026-11-17

Split complete. Seven stories below carry the work. FMX-052 and FMX-054 can start in parallel with the offline epic; the rest wait on at least FMX-046 (local queue) + FMX-048 (append-only tables).

---

### [FMX-052] QR label generator — sites, assets, tool kits, consignments

- Type: story · Size: S · Status: done 2026-11-18 · Part of: FMX-042

**Done notes:**

- `qrcode` + `@types/qrcode` added as deps. SVG QR codes rendered server-side.
- New page **`/labels`** under Resources in the nav. Filter chips: **Kind** (Property · Asset · Client · Agreement), optional **Property** filter when kind=asset, **Size** (A4 grid — 3 across · Large — 1 per page).
- Each label is a QR + big readable code + sub-line. Payload is an absolute URL (uses `NEXT_PUBLIC_APP_URL` or `VERCEL_URL`); scanning in any phone QR app jumps straight to the record. Warning chip shown when neither env var is set so the operator knows relative URLs will only scan on the same host.
- Print button fires `window.print()`. CSS media query (A4, 10mm margin) hides the nav, footer, filters, controls — only the label sheet prints.
- `print:break-after-page` on Large size → one QR per A4 sheet. A4 grid uses 3-up Tailwind grid so it slices neatly onto Avery-style sticker stock (fine-tune to a specific stock in a follow-up once Carl picks the label).
- Nav string `nav.labels = 'QR Labels'` added to the i18n catalogue.

**Tool-kit / consignment label kinds deferred** — those tables don't exist yet. When FMX-042's inspection schema or the Phase-2 traceability consignment model lands, add two new `kind` branches to `/labels` in a follow-up.

**Next wired-together story:** FMX-053 (scanner page + resolver) so the labels are useful without a third-party QR app.

**AC**

- `/labels` page: pick entity type (site / asset / tool / consignment), filter / multi-select, render a printable A4 sheet of QR codes with human-readable code beneath each
- QR payload is a signed URL — `fmx.app/q/<short-id>` — short-id resolves to the right entity, works offline via service worker lookup
- Printable sheet uses Avery L7651 (65-up) layout as default; A4 single column as fallback for weatherproof labels
- Re-print respects version: a re-printed label resolves to the same entity; a reassigned asset gets a new short-id

---

### [FMX-053] Scanner page + resolver

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-042 · Depends on: FMX-052

**Done notes:**

- `jsqr@^1.4.0` added for the fallback decoder.
- New page `/scan` (under Resources → Scan) opens the rear camera via `getUserMedia({ facingMode: 'environment' })`.
- Decoder strategy: prefers native `BarcodeDetector` (Chromium / Android Chrome) for performance; falls back to jsQR running on canvas pixels for Safari and older browsers.
- Payload resolver accepts full URLs or bare paths. Strips origin so a QR printed on dev host still works on prod and vice versa. Allow-list of FMX route shapes prevents a stray business-card QR navigating anywhere random.
- Recognised kinds: Dashboard · Client · Property · Defect · Agreement · Asset · Vendor · Dispatch · Update-defect.
- On successful scan, caches `{ href, label, at }` in `localStorage` (last 5), stops the camera stream, navigates. No re-tap confirmation — crews pick the printed label, tap once, land on the record.
- Unknown codes stay on-screen with a hint ("Unrecognised label — this QR isn't in your catalogue. Read: …"), scanner keeps running so the FM can try another.
- Recent scans rendered below the viewport as a one-tap re-open list.
- Three error states handled: `denied` (permission), `unsupported` (no getUserMedia / non-HTTPS), `error` (any getUserMedia rejection).
- `nav.scan = 'Scan'` added to i18n catalogue.

**Sibling piece live:** FMX-052 QR labels generator. Print a sheet, stick them on sites/assets, scan from `/scan` to jump straight in. The 2-tap destination rule is now met for any physical thing with a QR on it: tap Scan nav → tap-free resolve → open.

**AC**

- `/scan` opens the device camera with a QR overlay via `BarcodeDetector` API (Android Chrome) with a fallback JS decoder for iOS
- Successful scan navigates to the matching entity's native page (asset detail, inspection runner, consignment handling)
- Unknown codes show "Unrecognised label — print status: this QR isn't in your catalogue"
- Recent scans list under the camera for one-tap re-open
- Works offline (resolver reads IndexedDB from FMX-046 cache)

---

### [FMX-054] `inspection_templates` table + CRUD

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-042

**Done notes:**

- Migration `fmx054_inspection_templates` adds two tables:
  - `inspection_templates` — `id`, `name`, `description`, `scope` (property/asset/any), `active`, timestamps.
  - `inspection_template_items` — `id`, `template_id` FK (cascade), `sort_order`, `question`, `kind` (yes_no/rating/number/text), `required`, `photo_required`, `trade` (feeds FMX-021/056), `fail_if` JSONB, `notes`, timestamps. `(template_id, sort_order)` unique.
- Also adds nullable `default_inspection_template_id` FKs to both `properties` and `assets` so a scan can walk straight into the right checklist without a menu (wired by FMX-053 scanner in a follow-up).
- Server actions (`src/app/inspections/actions.ts`): create / update / clone templates; add / update / delete / reorder items. Secret-key gated. Enum validation against DB CHECK constraints.
- Admin page `/inspections` (under Work → Inspections) lists templates + inline create form.
- `/inspections/[id]` — header view/edit toggle, inline items editor: click to edit question, change kind (auto-sets a sensible default fail condition per kind), toggle Required / Photo required, free-text trade, ▲▼ reorder, ✕ delete, + Add at bottom. Optimistic UI with server sync on blur/change.
- Clone button on each template detail page — duplicates header + all items with "(copy)" suffix.
- Read-only view when no admin key, same pattern as the agreement page (FMX-025).

**Follow-ups raised:**

- **FMX-063** — Done 2026-11-18. See entry below.
- **FMX-064** — Done 2026-11-18. See entry below.
- **FMX-065** — Done 2026-11-19 (paste-text first pass). File upload (.docx / .xlsx) deferred to **FMX-073 (S)** — same page, add a file-upload field that reads the file server-side and feeds the same preview.

---

### [FMX-065] Template import — paste-text first pass

- Type: story · Size: M · Status: done 2026-11-19 (paste-text) · Follows: FMX-054

**Done notes:**

- New server action `createTemplateWithItems({ name, description?, scope?, items, key })` — bulk create in one call so a 20-line paste isn't 20 round-trips. Inserts the template header, then one batch of items with `sort_order` spaced by 10, `kind='yes_no'` default + `fail_if: { no: true }`. Returns the new template id.
- New page `/inspections/import` — pastebox with live preview. Parser strips common bullet prefixes (• · ● ○ * - en/em dash), numbering (`1.`, `1)`, `(1)`, `1:`, `1 `), and keeps only the first CSV cell when a line has commas (so Excel paste-with-status column works). Blank lines ignored.
- "Import from text" link added to the Inspection templates list page.
- Scope + description + name fields match the existing New Template form.
- Live preview table shows every parsed item with its final position. Submit disabled until a name + ≥ 1 item are present.
- On success, redirects straight into the new template's editor so the FM can tweak item kinds (rating / number / text) and set required / photo flags in place.

**Deferred:** `.docx` / `.xlsx` / `.pdf` file upload — raised as **FMX-073 (S)**. The paste-text pass covers the practical Carl workflow: open the Word doc, select the list, copy, paste.

---

### [FMX-073] Template import — file upload (.docx / .xlsx / .csv / .txt)

- Type: story · Size: S · Status: done 2026-11-19 · Follows: FMX-065

**Done notes:**

- `mammoth@^1.13.0` + `xlsx@^0.18.5` added as deps. Pure JS, no native bindings.
- New `/api/inspection-template-parse` route — accepts a file + the secret key, returns `{ lines: string[], source }`. Dispatch:
  - `.docx` → `mammoth.extractRawText({ buffer })` → split lines + trim + drop blanks
  - `.xlsx` / `.xls` / `.csv` → `XLSX.sheet_to_json(header: 1)` on the first sheet → first non-empty cell of each row
  - `.txt` / `.md` / `text/*` → UTF-8 decode → split lines
  - 10 MB cap, secret-key gated, unsupported types return 415
- Import form gets a muted "…or upload a file" card above the pastebox. On file pick, POSTs to the endpoint, **appends** parsed lines to the existing pastebox (so Carl can mix multiple sources), auto-fills the template Name from the filename when empty. Shows "Parsing…" during the round-trip and "✓ Loaded from <filename>" after.
- Rest of the flow unchanged — FMX-065's bullet/numbering/CSV stripping + preview + bulk create action handles everything from there.

**Deferred:** `.pdf` — needs `pdf-parse` or similar, which bundles optional native paths. Raise if Carl actually has PDF-only checklists.

**AC**

- New tables: `inspection_templates` (header + metadata) + `inspection_template_items` (ordered checklist items, each with: question, kind (yes-no / rating / number / text), required, photo-required flag, fail-if condition)
- Admin page `/inspections/templates` to create / edit / archive templates
- Clone-from-template so Carl's current Word checklists become FMX templates without rewriting
- Each site / asset can have one assigned template (field on properties / assets)

---

### [FMX-055] Checklist runner (one question per screen)

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-042 · Depends on: FMX-054, FMX-046, FMX-048

**Done notes:** The hero-workflow loop is live end-to-end, minus auto-raise and close-with-evidence (FMX-056, FMX-057 — split out intentionally).

- **Start screen** `/inspect/new` — pick template, (optional) property / asset, inspector name. Deep-link prefill via `?template=&property=&asset=` so FMX-053 scanner lands crews straight here. Scope-aware required fields (property-scoped template → property is required).
- **Runner** `/inspect/[session_id]` — one question per screen, big answer controls (Yes/No pills, 1-5 rating buttons, numeric pad input, text box). Progress bar above. Thumb-zone action bar (Back · Skip · Next →). Required items block skip and block the complete button.
- **Per-item photos** — `+ Photo` opens rear camera via `capture="environment"`, batched upload, client-side JPEG compression (2000px / 0.82 quality). New upload endpoint `/api/inspection-photo` writes to the shared `defect-photos` bucket under `inspection/<session>/<item>/...`.
- **Fail detection** runs client-side against the item's `fail_if` rule — pills light up amber on the failing answer and the result row saves with `failed = true` + `failure_reason`. (Auto-job creation is FMX-056; for now these just flag.)
- **Idempotent save** — every question commits to `inspection_results` on Next via `recordResult` (FMX-048), each with a fresh `crypto.randomUUID()`. Back-then-Next doesn't re-upload photos because the client photo buffer clears after a successful save.
- **Review screen** at the end — tappable list of every item with a status glyph (✓ green · missing red · fail amber). Jump back to fix anything.
- **Complete** — `completeSession` stamps `completed_at`. Signature + attendance photo deferred to FMX-057.
- **Dashboard + Add** gained an **Inspection** entry so a new run is 2 taps from anywhere.
- **New property-id helper** `/api/property-id?code=XX` — tiny lookup used by the start form to resolve short_code → uuid.

**Visible but deferred:**

- Voice notes per item — shipped as **FMX-067** on 2026-11-19 (see entry below).
- Offline — see FMX-068 (now done — Phase A shipped the data-write queue migration; Phase B / FMX-072 moves photo blobs onto the queue too).
- Auto-job on fail — **FMX-056** (next in queue).
- Signature + attendance photo on complete — **FMX-057**.

**AC**

- `/inspect/[id]` runs through the template item-by-item: large question + large answer controls (yes/no, 1-5 rating, number pad, text) + optional photo + optional voice note
- Progress bar + "skip" where template allows; required items block completion
- Writes to `inspection_results` as each item is answered (append-only, offline-safe via FMX-046)
- Complete button is bottom-of-viewport primary action (principle #1); shows a final summary before commit
- Linear nav, no sub-menus (strategic directive: progressive disclosure ≤ 2 levels)

---

### [FMX-056] Fail → auto-job pipeline

- Type: story · Size: S · Status: done 2026-11-18 · Part of: FMX-042 · Depends on: FMX-055, FMX-021

**Done notes:**

- New server action `raiseDefectsFromSession(sessionId, key)` in `src/lib/field-capture/actions.ts`:
  - Pulls session + every `failed = true` result where `defect_id IS NULL`
  - Resolves the property (session's `property_id`, or falls back to `asset.property_id` for asset-only sessions)
  - Reads trade overrides from `inspection_template_items.trade` in one batch query
  - Creates one `defect` per failed row (`status='open'`, title prefixed `FAIL — `, description captures the fail reason + inspector text + inspection session id + inspector name)
  - Severity derivation: rating ≤ 1 → `critical`, rating = 2 → `major`, rating ≥ 3 → `moderate`; yes_no fail → `major`; number fail → `major`; text → `moderate`
  - Copies `inspection_results.photo_urls` straight across to `defects.photo_urls`
  - Backfills `inspection_results.defect_id` with the new defect's id so the audit trail round-trips
  - **Idempotent** — rows that already have a `defect_id` are skipped, so partial failure + retry is safe
  - `revalidatePath` hits `/defects` and `/`
- **Runner wired** — Complete now calls `completeSession` then `raiseDefectsFromSession` in sequence. Non-fatal on error.
- **Done screen enriched** — lists every auto-raised defect (number · severity · title) with one-tap links into each one. "No fail items — nothing raised" when the inspection was clean.

**Scan → Check → Snap → Done → Report milestone:** with FMX-056 live, failed items from any inspection are now real defects in the register the moment the inspector hits Complete. The only piece still missing from the hero-workflow loop is the report pulling from capture (FMX-058) and signature/attendance on close (FMX-057).

**Follow-ups:**

- **FMX-069 (S)** — Done 2026-11-19.

**Done notes — FMX-069 — Inspector override before commit:**

- `raiseDefectsFromSession` signature gains an optional `overrides?: Record<template_item_id, { severity?, trade? }>`. When present, the per-fail-row severity and trade used by the defect insert come from the override; otherwise fall back to the existing `deriveSeverity` + `template_items.trade` logic. Idempotency preserved (still skipped if `defect_id` already set on the result).
- `inspection.raiseDefects` queue handler payload accepts `overrides` and threads them through to the server action.
- Runner's review screen: the plain "N items failed" banner is replaced by an editable "Will raise N defects" card. For each failing item it renders a two-column grid (Severity select / Trade free-text) prefilled from the derived values. Inspector tweaks any row before Close & sign; the overrides are packed into the enqueue payload on close (only non-default, failure-matching entries get sent).
- Local `deriveSeverityLocal(item, draft)` mirrors the server's rating-first ladder so the review-screen default matches what the server would compute with no override.

**AC**

- Any inspection item that fails (yes-no `no`, rating below threshold, text matching a fail condition) auto-creates a `defect` record on completion
- Pre-filled: title from item question, description from the inspector's note, photos from the item, property from the inspection, trade from the template item (defaults picker if template didn't carry one)
- Severity suggested from the fail magnitude (critical for red items, major for amber, moderate otherwise); inspector can override before commit
- Links back to the originating `inspection_results` row so the audit trail is clean

---

### [FMX-057] Close-with-evidence (signature + attendance photo)

- Type: story · Size: S · Status: done 2026-11-18 · Part of: FMX-042

**Done notes:**

- New `SignaturePad` client component (`src/app/inspect/[session_id]/signature-pad.tsx`) — HTML5 `<canvas>` with pointer events so touch, pen and mouse all paint. DPR-scaled for crisp strokes. Exposes `clear()`, `toDataURL()`, `isEmpty()` via `useImperativeHandle`. `touch-none` class stops the page scrolling while the signer is signing.
- **Review → Close & sign** — Complete button on the review screen now jumps to a dedicated close screen instead of writing straight away.
- **Close screen** carries three fields:
  - Attendance photo (required) — rear-camera capture via `capture="environment"`, client-side JPEG compression, Replace button after first shot
  - Signature (required) — the SignaturePad above
  - Optional note — plain textarea
- **Close inspection** button:
  - Uploads attendance photo via the existing `/api/inspection-photo` endpoint (reuses session id, synthetic `item_id=attendance`) → public URL
  - Captures signature as base64 PNG dataURL (fits inside `inspection_sessions.signature_data_url`)
  - Calls `completeSession` with all three + the note
  - Then runs `raiseDefectsFromSession` (FMX-056) as before
- **"Close without evidence"** escape — small muted link under the primary button. Confirm dialog, then stamps the session's `notes` with `CLOSED WITHOUT EVIDENCE — <reason or 'no reason given'>` so the audit trail flags the gap.
- **Done screen enriched** — "Closed with" card renders the attendance photo thumbnail + signature image + any closing note, above the existing auto-raised defects list.

**Hero workflow milestone:** Scan → Check → Snap → **Done (with sig + attendance + auto-raised jobs)** → Report. Only FMX-058 (report consumes field capture) remains for the end-to-end loop to feed the monthly report automatically.

**AC**

- Job / inspection close requires: attendance photo + signature-on-glass + optional note
- Signature captured via `<canvas>` (touch + mouse)
- Attendance photo captured via the FMX-013 PhotoAppender pattern
- Close stamp written to `defect_updates` (existing table) with source = `close_with_evidence`
- Can't close without both; "Close anyway" is explicit and audited

---

### [FMX-058] Report assembler consumes field capture

- Type: story · Size: M · Status: done 2026-11-18 · Part of: FMX-042 · Depends on: FMX-055, FMX-057, FMX-023

**Done notes:**

- New `InspectionRun` type on the ReportSnapshot: `session_id, completed_at, template_name, inspector_name, short_code, asset_label, item_count, fail_count, raised_defect_numbers, attendance_photo_url`.
- `fetchReportSnapshot` now pulls `inspection_sessions` with `completed_at` in `[monthStart, monthEnd)`, scoped to the client's properties — property-scoped sessions straight in, asset-scoped sessions resolved via `asset.property_id`. Per-session item counts + failed counts + raised defect numbers rolled up in a single `inspection_results` query. Attendance photo URL carried through for future evidence inlining.
- **Monthly spotlight auto-generates a bullet per completed inspection:**
  - `Inspection. <template name> at <asset label (property)> or <property short_code> on <YYYY-MM-DD> [by <inspector>]. N items checked, K failed.[ Raised: DEF-… .]`
  - Example target shape from the strategic directive: *"Fire alarm test completed at KH 12 Nov (IFS-Ligaki). 2 extinguishers found expired, replaced same day."* — the auto bullet reads close to that, with hard references to the raised defect numbers rather than a hand-crafted narrative.
- Property-scoped report variant filters `inspectionsThisMonth` to that property's short_code so per-property monthly reports don't name the whole portfolio's inspections.
- Zero new tables; this is purely data-layer + spotlight generator.

**Hero-workflow milestone reached.** Scan → Check → Snap → Done → **Report** now writes itself from capture. A monthly inspection recorded through FMX-055 lands as a spotlight bullet in next month's FM Performance Report with no re-keying.

**Follow-ups:**

- **FMX-070 (S)** — Done 2026-11-19. New `inspectionEvidence(...)` section builder renders a per-inspection row below the Monthly spotlight: shaded caption row (template · scope · date · inspector) + two-cell photo row (attendance photo via `imageAtSize()` fetch, signature image via new `signatureParagraph()` base64 decoder). Silent when no inspection in the month carries either. Snapshot gains `signature_data_url` on each `InspectionRun`. Portfolio + per-property report variants both render the strip; per-property filters by `short_code`.
- **FMX-071 (S)** — "Open by trade" + "Completed this month by trade" tables (same as FMX-039, raised again against the inspection-aware snapshot).

**AC**

- Monthly performance report (FMX-023) reads directly from `inspection_results`, `defect_updates` and `scan_events` for the Monthly spotlight bullets — no re-keying
- Spotlight bullets written straight from captured evidence: "Fire alarm test completed at KH 12 Nov (IFS-Ligaki). 2 extinguishers found expired, replaced same day."
- Signatures and attendance photos linked from the report as evidence URLs
- **Target: client report generated in < 10 minutes of review** once a month's inspections are complete (strategic directive target)

---

### [FMX-038] Email-ingest trade classifier

---

### [FMX-042] Epic — The hero workflow: Scan → Check → Snap → Done → Report

- Type: epic · Size: L (split before building) · Status: idea · Raised: 2026-11-17 · Depends on: FMX-041

**As** an FM / inspector / contractor
**I want** to open the app, scan a QR on a site or asset, answer a short checklist, take photos, tap Done
**So that** the inspection is complete, failed items auto-raise jobs, the compliance register updates, and the monthly client report writes itself — no re-keying anywhere

**Target behaviour**

- Printable per-site, per-asset, per-tool-kit, per-consignment QR labels
- Scanner opens the day's assigned inspection or the matching asset/consignment record
- 5-8 field checklist (not 30), one question per screen on mobile, photo + voice note per item
- Fail → auto-create a job assigned to the right trade, pre-filled from the inspection
- Signature + photo of attendance closes the job
- Report writes itself: FMX-023 layout, data from today's capture, no Word editing

**Likely story split**

1. QR label generator (per asset/site/consignment, printable sheet)
2. Scanner page + resolver (scan → routes to inspection or asset record)
3. `inspection_templates` + `inspection_results` tables (append-only, per principle #9)
4. Checklist runner UI (one-question-per-screen mobile, photo + voice note per item)
5. Fail → auto-job pipeline (writes work_orders / dispatch draft)
6. Close-with-evidence (signature + photo attendance)
7. Report assembler reads capture → FMX-023 layout, zero Word editing

**Target metric.** Weekly site inspection completed **in under 5 minutes on site**; monthly client report produced **in under 10 minutes** of review.

---

### [FMX-043] HEART metrics instrumentation

- Type: story · Size: M · Status: idea · Raised: 2026-11-17

Adopt Google's HEART framework as FMX's UX scorecard. One dashboard; feeds every retro.

**AC**

- **Happiness** — quarterly 1-question survey per role; Ellis "very disappointed" score (target ≥ 40%)
- **Engagement** — inspections + scans per active user per week
- **Adoption** — % of sites / contractors / consignments live in FMX
- **Retention** — % of field users still active in month 3
- **Task success** — median inspection time, report turnaround, sync failure rate, % of jobs closed with photo evidence
- Private FMX-internal dashboard — separate from client-facing reports

---

### [FMX-044] iTaukei + Fiji Hindi UI (string table from day one)

- Type: tech-debt · Size: S · Status: done 2026-11-17 · Raised: 2026-11-17

**Done notes:** Zero-dependency string catalogue + `t()` helper now live. Files:

- `src/lib/i18n/strings.ts` — typed English catalogue (`Strings` type), empty `DeepPartial<Strings>` stubs for `fj` (iTaukei / Vosa Vakaviti) and `hi` (Fiji Hindi), `LOCALE_COOKIE`, `LOCALE_LABELS`, `DEFAULT_LOCALE = 'en'`.
- `src/lib/i18n/t.ts` — `makeT(locale)` returns a translator with English fallback and `{{param}}` interpolation. Missing keys render the key itself so dev spots them fast.
- `src/lib/i18n/server.ts` — `getT()` for server components (reads cookie via `next/headers`).
- `src/lib/i18n/use-t.ts` — `useT()` hook for client components (reads cookie via `document.cookie`).
- `src/components/locale-switcher.tsx` — reusable menu that writes the cookie and reloads. Not mounted by default (we'll add it to an account menu when translations arrive); available for mounting now if you want a dev toggle.

Pattern proven live in `src/components/nav.tsx`: every nav label (Dashboard · Portfolio · Work · Resources · Reports · Clients · Properties · Defects · Maintenance · Assets · Vendors · Email Inbox), Back aria-label, and mobile Menu aria-label all go through `t()`. Future stories pull strings through the same helper — no new i18n plumbing needed.

**Follow-ups (not blocking):**

- When translators engage, drop Fijian/Hindi values into `strings.ts` under the `fj` / `hi` stubs — only the keys they've translated.
- Add `LocaleSwitcher` to an account menu when one exists.
- Add an ESLint rule to flag hard-coded literals in `src/components/` and `src/app/` so new strings always route through `t()`.

Even before translations land, extract every UI string to a single table (next-intl or equivalent) so the Phase 3 bilingual rollout isn't a rewrite. Fallback to English until translators are engaged.

**AC**

- String catalogue established, every user-visible word in the app pulled through it
- Locale switcher in the account menu (English today; iTaukei + Fiji Hindi stubs ready)
- No hard-coded user-facing strings in React components; lint rule added if feasible

---

### [FMX-038] Email-ingest trade classifier

- Type: tech-debt · Size: XS · Status: done 2026-11-18 · Raised: 2026-11-17 · Follows: FMX-037

**Done notes:**

- New `src/lib/trade/classify.ts` exports `classifyTrade(...texts)` — same 9-bucket keyword vocabulary used in the FMX-021 SQL backfill (HVAC · Fire · Plumbing · Electrical · Genset · Garden and Landscaping · General building / roofing · Waste / skip bin hire · General Handyman). First-match-wins, more specific rules before general. Returns null when nothing hits.
- Email inbound handler (`/api/email`) now runs the classifier over subject + top-message body + computed title, and inserts the draft defect with `trade: tradeGuess` populated. NULL stays allowed — the FMX-037 promote screen makes trade required before the draft becomes open, so an unclassifiable draft still can't slip through into the register untagged.
- Classifier module is shared — inspections, future WhatsApp intake (FMX-024), and the FMX-021 backfill all point to the same vocabulary. Any future enrichment of the vocabulary happens in one file.

**AC**

- Postmark inbound handler (or whichever server action creates the draft defect) runs the same keyword classifier used in the FMX-021 backfill — HVAC, Fire, Plumbing, Electrical, Genset, Garden, Roofing, Waste, Handyman
- Draft saves with a best-guess `trade` populated; FM confirms / overrides on promote-from-draft (FMX-037)
- No regression: if the title/description doesn't match any keyword, trade stays NULL and the FM supplies it on promote (FMX-037 makes it required there)

---

### [FMX-039] Platform-report trade breakdowns

- Type: tech-debt · Size: XS · Status: done 2026-11-18 · Raised: 2026-11-17 · Follows: FMX-037

**Done notes:**

- New `TradeCount` type on the snapshot. Snapshot now exposes `openByTrade` (open at month-end) and `resolvedByTradeThisMonth`, both scoped to the client's properties and sorted by count desc with an "— Untagged" bucket sunk to the bottom so data-quality gaps show without crowding tagged work.
- Defect query selects extended with `trade`; `OpenDefect` and `ResolvedDefect` types gained a `trade` field.
- **New report section — "By trade"** — side-by-side tables (Open by trade · Resolved this month by trade) rendered between Portfolio snapshot and Monthly spotlight. Each table shows Trade · Count, plus a Total row. Hides entirely when both lists are empty.
- Portfolio and per-property report variants both carry the section. Per-property rollup re-computes from the already-filtered open + resolved lists so the property report mirrors the portfolio view without new queries.

**AC**

- FM Performance Report adds two breakdown blocks: "Open by trade" (horizontal bar or compact table of trade → count) and "Completed this month by trade"
- Positioned under the Portfolio snapshot table, before the Monthly spotlight
- Untagged defects shown as "— Untagged" with the count, so Carl knows what still needs tagging

---

**AC**

- Inline "Set trade" control on `/defects/[number]` for backfilling existing defects (no status-change required)
- Promote-from-draft page `/defects/[number]/promote` carries a required trade field before promotion
- Email ingest action (`fmx@cmsfiji.com` → draft defect) runs the same keyword classifier used in the FMX-021 backfill and sets trade on the draft
- Dispatch page `/dispatch/[number]` pre-filters its provider dropdown to vendors whose `providers.trade` matches the defect's trade, with a "Show all" toggle
- Platform report breaks down "Open by trade" and "Completed this month by trade"

---

### [FMX-014] Backfill Nilesh invoice to DEF-2026-0032 / 0047 / 0058

- Type: data · Size: S · Status: blocked (waiting on evidence) · Raised: 2026-11-17

**As** an FM
**I want** the exact completion dates, scope lines and cost against the three Nilesh-closed defects
**So that** the platform report and the monthly claim both reconcile against a real supplier invoice

**AC**

- Carl locates the Nilesh invoice covering these three defect numbers
- `resolved_at`, `resolution_notes`, `cost_fjd` populated per defect
- Invoice filed under `KGF/<property>/5. Maintenance/Invoices/` with consistent naming

---

### [FMX-015] Backfill Narayans plumbing invoice dates on NH middle-floor sink + related

- Type: data · Size: S · Status: blocked (waiting on evidence) · Raised: 2026-11-17

**AC**

- Carl locates the Narayans invoice(s)
- Map line items to the plumbing defects raised at NH; set `resolved_at` and `resolution_notes`
- Invoice filed; cost tracked against the NH service contract where in-scope, flagged as additional where out-of-scope

---

### [FMX-016] Capture AC data plates — KH-AC-L1-OFF1, L1-DIR, L1-SOFF1, L2-BR3

- Type: field · Size: S · Status: next (bundle with next KH site visit) · Raised: 2026-11-17

**As** an FM
**I want** model and serial captured for the four KH AC units still listed with a placeholder plate
**So that** the AC register is complete and warranty / spares traceability holds for the whole fleet

**AC**

- Per unit: clear photo of the data plate + unit label
- `assets.model`, `assets.serial_number`, `assets.manufacturer`, `assets.capacity_kw` populated
- Any unit found to be a Whirlpool flagged for service inclusion in next Quick Cool scope

---

### [FMX-017] Reconcile KH-AC-LINC25A / LINC25B placeholders against likely L1-OFF1 / L1-DIR locations

- Type: data · Size: S · Status: next · Raised: 2026-11-17 · Depends on: FMX-016

**AC**

- After FMX-016 captures, confirm whether LINC25A/B are the same physical units as L1-OFF1 / L1-DIR
- If yes: merge records (keep the location-coded asset_id, drop the LINC placeholder, preserve service history)
- If no: correct the location of LINC25A/B

---

### [FMX-018] Capture GH-AC-NEW26 (KEG) model / serial

- Type: field · Size: S · Status: next (bundle with next GH site visit) · Raised: 2026-11-17

**AC**

- Clear photo of the data plate on the KEG unit at GH
- `assets.model`, `serial_number`, `manufacturer`, `capacity_kw`, `install_date` populated

---

### [FMX-019] Capture KH-FA-PANEL model / serial

- Type: field · Size: S · Status: next (bundle with next KH visit) · Raised: 2026-11-17

**AC**

- Clear photo of the main fire alarm panel at KH including ident label
- Asset record for the panel created or updated with manufacturer, model, serial, install year
- Confirms fire-compliance evidence set alongside hose + extinguisher records

---

## Done

### [FMX-011] Grouped navigation (Portfolio / Work / Resources)

- Type: story · Size: S · Completed: 2026-11-17

Collapsed 9 flat links to 5 slots (Dashboard · Portfolio ▾ · Work ▾ · Resources ▾ · Reports). Dropped the responsive breakpoint from `xl` to `md` so tablets show the full nav; mobile hamburger opens a grouped menu. Left FMX wordmark is now a direct Dashboard link, not a duplicate dropdown. Right-side actions unchanged.

Touched: `src/components/nav.tsx`.

---

### [FMX-012] Drillable dashboard — clickable stat cards + defect rows

- Type: story · Size: S · Completed: 2026-11-17

Stat tiles link: Sites → `/properties`; Open defects → `/defects`; Critical open → `/defects?severity=critical`; Major open → `/defects?severity=major`. Recent-defects table rows link defect number, severity badge, title and date to `/defects/<number>`; property code still links to the property page.

Touched: `src/app/page.tsx`.

---
