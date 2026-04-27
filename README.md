# FMX Admin App (v0)

Read-only admin dashboard for the FMX facility management platform. Demo-grade — KGF data only, no auth, server-rendered pages backed by Supabase.

## Pages

- `/` — Portfolio dashboard with stats and per-property cards
- `/properties` — Property list
- `/properties/[code]` — Single property detail (FCA, defects, assets, service contracts)
- `/defects` — All defects across the portfolio
- `/assets` — All assets across the portfolio

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
4. Deploy. Vercel will build and provide a `*.vercel.app` URL.
5. **Custom domain:** in Vercel → Settings → Domains → add `fmx.cmsfiji.com`. Vercel will give you a `CNAME` value (e.g. `cname.vercel-dns.com`). Add that as a CNAME record on `cmsfiji.com` DNS for the `fmx` subdomain. Propagation takes 5–30 min.

## Security

- The service-role key is **server-only**. Never imported in Client Components, never sent to the browser. The Supabase client in `src/lib/supabase.ts` is server-only.
- The site uses `robots: noindex, nofollow` to keep it out of search engines.
- For demo purposes there is no user authentication. Before opening to anyone outside Carl + Mark, add Supabase Auth (email-allowlist or magic link) — see roadmap below.

## Roadmap

| # | Item |
|---|---|
| 1 | Supabase Auth — email allowlist |
| 2 | Inline editing for defects (status updates) |
| 3 | Work-order CRUD |
| 4 | Photo viewer (Supabase Storage) |
| 5 | Reports list with download links |
| 6 | WhatsApp dispatch trigger |
| 7 | Mobile-native inspection capture (replaces Excel workbooks) |
| 8 | Multi-tenant (other clients) with row-level isolation |

## Notes

- Built April 2026 as v0 demo for the KGF management contract conversation.
- See `KGF/Client-wide/Inspections/` for the data-capture workflow that feeds this UI.
- See `KGF/Client-wide/_tooling/fmx-monthly-report/` for the report generator that produces monthly Word documents from the same database.
