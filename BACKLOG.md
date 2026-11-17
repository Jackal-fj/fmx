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

- Type: story · Size: M · Status: next · Raised: 2026-11-17 (Carl) · Reference: `KGF_FM_Performance_Report_2026-11-16.pdf`

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
