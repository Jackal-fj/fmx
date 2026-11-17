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
