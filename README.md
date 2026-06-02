# FMX Admin App (v0)

Read-only admin dashboard for the FMX facility management platform. Demo-grade — KGF data only, no auth, server-rendered pages backed by Supabase.

## Pages

- `/` — Portfolio dashboard with stats, recent-defects ticker, and per-property cards
- `/properties` — Property list
- `/properties/[code]` — Single property detail (FCA, defects, assets, service contracts)
- `/defects` — All defects across the portfolio
- `/defects/[number]` — Per-defect detail, photos and status-change audit trail
- `/assets` — All assets across the portfolio
- `/new-defect?key=<secret>` — **Quick Add Defect** mobile form, server-action write to Supabase
- `/update-defect?key=<secret>` — **Quick Update Defect** picker + photo-gated status change

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- Supabase (server-side, service-role key)
- Vercel deployment target

## Local development

```bash
npm install
cp .env.local.example .env.local
# Open .env.local and paste the Supabase service-role key from
# https://supabase.com/dashboard/project/uoxycinbtvjfihakkuft/settings/api
npm run dev
# Open http://localhost:3000
```

## Deployment to Vercel

1. Push this directory to `github.com/Jackal-fj/fmx`:
   ```bash
   git init
   git add .
   git commit -m "feat: FMX admin v0 — read-only KGF dashboard"
   git branch -M main
   git remote add origin https://github.com/Jackal-fj/fmx.git
   git push -u origin main
   ```
2. In Vercel, **New Project** → Import the `Jackal-fj/fmx` repo.
3. Set environment variables in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://uoxycinbtvjfihakkuft.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = paste from Supabase dashboard
   - `QUICK_ADD_SECRET` = long random string (32+ chars); same value locally and on Vercel. Generate with `openssl rand -hex 24`.
4. Deploy. Vercel will build and provide a `*.vercel.app` URL.
5. **Custom domain:** in Vercel → Settings → Domains → add `fmx.cmsfiji.com`. Vercel will give you a `CNAME` value (e.g. `cname.vercel-dns.com`). Add that as a CNAME record on `cmsfiji.com` DNS for the `fmx` subdomain. Propagation takes 5–30 min.

## Quick Add Defect — mobile workflow

The `/new-defect` route is a mobile-first form for logging defects on the fly between formal inspection cycles. The route is gated by `QUICK_ADD_SECRET`: requests without `?key=<secret>` are redirected to the dashboard.

**iPhone home-screen shortcut:**

1. Open `https://fmx.cmsfiji.com/new-defect?key=<secret>` in Safari on iPhone
2. Tap the Share icon → **Add to Home Screen**
3. Rename to "Log Defect" → Add
4. Tap the icon from your home screen to open the form directly

The form captures Property, Title, Severity (required) plus optional Description, Floor, Area, Category. Server-action writes to Supabase; on success you see the new defect reference number. The dashboard's "Recent defects" section reflects it within seconds.

If the secret leaks (e.g. accidentally shared in a screenshot), rotate it: regenerate via `openssl rand -hex 24`, update in Vercel env vars + your local `.env.local`, and re-bookmark the new URL. Old bookmarks stop working.

## Quick Update Defect — photo-gated status change

The `/update-defect` route lets you change a defect's status to **In Progress** or **Resolved** from your phone with photo evidence. Gated by the same `QUICK_ADD_SECRET`.

Flow:

1. Tap **Update** in the nav (or open `/update-defect?key=<secret>`)
2. Pick a defect from the list (grouped by property, severity-sorted)
3. Choose new status: **In Progress** (work commenced) or **Resolved** (closed out)
4. Tap **+ Add photo** — opens OS native picker (camera or gallery, 1–5 photos)
5. Optional notes (e.g. contractor name, what was fixed)
6. Submit — at least one photo is required by both the form and the database `defect_updates_photos_required` check constraint

Photos are client-side compressed (max 1600 px width, JPEG quality 0.85) before upload to Supabase Storage bucket `defect-photos`, typically reducing 8–12 MB phone originals to 300–800 KB. The `defect_updates` table captures the audit trail: status_from, status_to, notes, photo URLs, timestamp.

Resolved defects also populate `defects.resolved_at` and `defects.resolution_notes`. All photos roll into the defect detail page at `/defects/[number]` and the next monthly report.

**Android home-screen shortcut:**

1. Open `https://fmx.cmsfiji.com/update-defect?key=<secret>` in Chrome on Android
2. Tap ⋮ menu → **Add to Home screen**
3. Rename to "Update Defect" → Add
4. Tap the icon to jump straight to the picker

## Security

- The service-role key is **server-only**. Never imported in Client Components, never sent to the browser. The Supabase client in `src/lib/supabase.ts` is server-only.
- The site uses `robots: noindex, nofollow` to keep it out of search engines.
- The `QUICK_ADD_SECRET` gate is a low-bar auth — fine for sole-operator use, not appropriate for VA or multi-user access. Before opening to anyone outside Carl, replace with Supabase Auth (email-allowlist or magic link) — see roadmap below.

## Roadmap

| # | Item |
|---|---|
| 1 | Supabase Auth — email allowlist (replaces QUICK_ADD_SECRET) |
| 2 | Quick Add — photo upload to Supabase Storage |
| 3 | Quick Update — change defect status from phone |
| 4 | Inline editing for defects on the property pages |
| 5 | Work-order CRUD |
| 6 | Reports list with download links |
| 7 | WhatsApp dispatch trigger |
| 8 | Mobile-native inspection capture (replaces Excel workbooks) |
| 9 | Multi-tenant (other clients) with row-level isolation |

## Notes

- Built April 2026 as v0 demo for the KGF management contract conversation.
- See `KGF/Client-wide/Inspections/` for the data-capture workflow that feeds this UI.
- See `KGF/Client-wide/_tooling/fmx-monthly-report/` for the report generator that produces monthly Word documents from the same database.
