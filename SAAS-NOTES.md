# SAAS Notes

Lightweight log of what would need to change to turn FMX into a multi-tenant product one day. Not a plan to execute. Just so Future-Carl doesn't have to rediscover each hardcoded assumption when he builds the sibling `fmx-platform` project.

Target shape per Carl's intent (2026-10-13): modest — "tool for my own future clients", 3–10 CMS-operated accounts over the next couple of years, not a self-serve SaaS. Decision: run KGF alone for 6 more months before any multi-tenant work.

## Hardcoded single-tenant assumptions

- **Portfolio code `'KGF'`** hardcoded in `src/lib/reports/data.ts` and report generation. Would become `tenant_id` lookup.
- **Property short codes `GH / KH / NH`** mapped to Dropbox folder names in `src/lib/dropbox.ts` (`PROPERTY_FOLDER_NAMES`). Needs to be data-driven per tenant.
- **Dropbox report path** defaults to `/FMX/04_CLIENTS/KGF/Client-wide/4. Reporting/FMX` — bakes tenant into the path. Per-tenant tokens + roots needed.
- **Dropbox photo path** same issue — `/FMX/04_CLIENTS/KGF/{Property}/02_Photos/...`
- **`QUICK_ADD_SECRET`** is a shared operator password. Per-tenant Supabase Auth (magic link) needed before any external user can log in.
- **Single Supabase project** — all data in one DB, no RLS tenant scoping yet. Either stay single-DB with `tenant_id` + RLS, or go per-tenant project.
- **Single WhatsApp number** (CMS). SaaS customers would need their own WABA + token per tenant, or we broker everything through one number with routing — the first is simpler, the second is cheaper for the customer.
- **Vercel project** is Carl's personal — fine for a managed-service model, needs rethinking for self-serve.

## What transfers cleanly

- Defect lifecycle + severity + FCA import pattern
- Vendor WhatsApp dispatch + inbound auto-promote + 2-photo gate (works per-tenant, needs per-tenant WABA)
- Report generation (template-driven, just change the portfolio code)
- PM schedule / maintenance dashboard
- Mobile UX patterns (noStore everywhere, native select, 16px inputs, revalidatePath discipline)
- Prefill URL contract + highlight banner

## What a new client onboarding looks like today (managed-service model)

If Carl takes a second client this quarter without any SaaS work:

1. New Supabase project (or new schema in the existing project)
2. Fork env vars; new `QUICK_ADD_SECRET`
3. Add `PROPERTY_FOLDER_NAMES` entries for the new client's property codes
4. New Vercel project OR new domain pointed at a different branch
5. Dropbox folder structure under `/FMX/04_CLIENTS/{NewClient}/...`
6. Fresh WhatsApp Business Account for the client's number (or share CMS's for now)

That's maybe one afternoon per new client. Fine for 3-5 clients. Breaks at 10+. The SaaS build happens between client 5 and client 10 if the demand is there.

## Open questions for later

- Shared WABA with routing-by-property, or one WABA per client? (Meta cost + verification is the main variable)
- Multi-tenant Supabase: one DB with RLS, or one DB per tenant? (RLS is cheaper, per-tenant DB is safer for isolation stories)
- Pricing model if we ever list it: per property, per defect, flat per month, or implementation + support fees only?
- Does Carl want to be the operator-of-record for all customers, or let them run themselves? (Changes everything)
