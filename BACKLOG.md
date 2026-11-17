# FMX backlog

One line per story. INVEST form — Independent, Negotiable, Valuable, Estimable, Small, Testable.

- **Status:** `idea` · `next` · `in-progress` · `done` · `parked` · `blocked`
- **Type:** `story` (product feature) · `bug` · `tech-debt` · `data` (backfill / reconcile) · `field` (on-site capture)
- **Size:** XS (<2 hrs) · S (<1 day) · M (1–3 days) · L (>3 days — split before starting)

---

## Design principles (apply to every story)

Confirmed with Carl 2026-11-17 and binding on everything that follows.

1. **Mobile-first.** The FM lives on a phone on-site. Every page, every new UI element, every form is designed for a 375pt narrow viewport first; desktop is the enhanced case, not the primary target. Thumbs reach the bottom of the screen more easily than the top; primary actions sit low on mobile. Touch targets ≥ 44pt. One-handed navigation is a requirement, not a nice-to-have.
2. **Two taps maximum to any navigation destination.** From anywhere in the app, reaching any common *destination* (dashboard, client hub, property hub, defect detail, defects list, generate a report) takes ≤ 2 taps. The nav and the dashboard are the two escape hatches that uphold this rule for navigation. Create actions (log defect, add vendor, etc.) live on the dashboard, not the nav, and are allowed to take an extra tap from deep pages — Carl confirmed 2026-11-17 that a cleaner nav is worth the trade-off because adding is less frequent than navigating. Any navigation flow that requires 3+ taps to reach something routine is a bug and raises a cleanup story.
3. **Scannable, not dense.** Lists over tables on mobile, one piece of information per line, severity / status conveyed with badges, not sentences.
4. **No modals for things that can be pages.** Modals are a desktop convention that break mobile — the back button should always work.

Every story's acceptance criteria assume these principles — they don't need to be restated. A violation of them is a defect, not a trade-off.

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

- Type: tech-debt · Size: S · Status: next · Raised: 2026-11-17 · Follows: FMX-021

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
