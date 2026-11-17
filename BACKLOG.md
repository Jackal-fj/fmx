# FMX backlog

One line per story. INVEST form — Independent, Negotiable, Valuable, Estimable, Small, Testable.

- **Status:** `idea` · `next` · `in-progress` · `done` · `parked` · `blocked`
- **Type:** `story` (product feature) · `bug` · `tech-debt` · `data` (backfill / reconcile) · `field` (on-site capture)
- **Size:** S (<1 day) · M (1–3 days) · L (>3 days — split before starting)

---

## Open

### [FMX-013] Attach photos to an email-sourced defect from the defect page

- Type: story · Size: S · Status: next · Raised: 2026-11-17 (Carl)

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

- Type: story · Size: M · Status: next · Raised: 2026-11-17 (Carl) · Depends on: FMX-021

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

- Type: tech-debt · Size: S · Status: next · Raised: 2026-11-17

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

### [FMX-026] Inline edit mode on the agreement view page

- Type: story · Size: M · Status: next · Raised: 2026-11-17 · Follows: FMX-025

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
