# Dropbox report mirroring — setup

FMX generates reports into Supabase Storage as the source of truth. When Dropbox is also configured, each generated `.docx` is mirrored to your Dropbox folder so it appears on your Mac automatically via the Dropbox client.

Estimated setup time: 10 minutes.

## Step 1 — Create a Dropbox app

1. Go to **https://www.dropbox.com/developers/apps**
2. Click **Create app**
3. Choose access type:
   - **Scoped access** — recommended
4. Choose type of access needed:
   - **App folder** (safer — restricts to a dedicated `/Apps/<AppName>/` folder), OR
   - **Full Dropbox** (gives access to your whole Dropbox — use if you want reports to land inside your existing `/FMX/04_CLIENTS/KGF/` folder)
5. **App name:** `FMX Report Mirror`
6. Click **Create app**

For CMS, pick **Full Dropbox** so reports can land inside your existing FMX/KGF folder structure. The App folder option would create a separate `/Apps/FMX Report Mirror/` folder outside your existing layout.

## Step 2 — Configure permissions

On the app's settings page:

1. Scroll to the **Permissions** tab (top of page)
2. Tick the following scopes:
   - `files.content.write` (upload files)
   - `files.content.read` (optional — needed if we later want to read back)
3. Click **Submit** at the bottom

## Step 3 — Generate an access token

On the **Settings** tab of your app:

1. Scroll to **OAuth 2** section
2. Under **Access token expiration**, choose **No expiration** (long-lived) if available. Some apps only offer short-lived tokens; if so, use the refresh-token flow (more setup — ask Carl for help).
3. Click **Generate** next to "Generated access token"
4. Copy the token immediately — starts with `sl.` and is ~140 characters long
5. Save it somewhere safe (password manager)

## Step 4 — Add to Vercel

1. https://vercel.com/carl-proberts-projects/fmx/settings/environment-variables
2. Add new variable:
   - **Name:** `DROPBOX_ACCESS_TOKEN`
   - **Value:** paste the token
   - **Environments:** Production (tick Preview + Development too if you want)
3. Add second variable (optional):
   - **Name:** `DROPBOX_REPORTS_ROOT`
   - **Value:** `/FMX/04_CLIENTS/KGF/Client-wide/_reports`
   - Skip this if you're OK with the default (which is the same value).

## Step 5 — Redeploy

Env var changes only take effect on new deployments. Trigger one by pushing any change to the repo, or in Vercel → Deployments → click ⋯ on the latest → **Redeploy**.

## Step 6 — Test

1. Open https://fmx.cmsfiji.com/reports
2. Generate any single report (e.g. Gunu House for current month)
3. Wait for success
4. Check on your Mac: **`~/Commercial Managemen Dropbox/FMX/04_CLIENTS/KGF/Client-wide/_reports/YYYY-MM/`** — the file should appear within seconds (Dropbox client syncs continuously)

## Troubleshooting

**File not appearing in Dropbox** — check the Vercel function logs. If you see a warning like `Dropbox mirror failed: ...`, the error message tells you why (bad token, path invalid, quota exceeded).

**Token expired / rejected** — Dropbox is rotating some legacy tokens to short-lived ones. If yours expires, regenerate at dropbox.com/developers/apps and update the env var.

**Wrong folder** — set `DROPBOX_REPORTS_ROOT` explicitly to override the default. Path must be absolute (start with `/`) and represent a real folder in your Dropbox (Dropbox creates missing subfolders automatically).

## What gets mirrored

Every report generated from FMX gets uploaded to:

```
{DROPBOX_REPORTS_ROOT}/{YYYY-MM}/{filename}.docx
```

Example:

```
/FMX/04_CLIENTS/KGF/Client-wide/_reports/2026-08/KGF-GH-2026-08-Report.docx
```

If a file with the same name already exists, it's overwritten (so regenerating a report for a month replaces the previous version rather than creating duplicates).

## Security notes

- The Dropbox access token gives full write access to your Dropbox (if you picked Full Dropbox scope). Treat like a password.
- Never commit the token to git. Only store in Vercel env vars and your `.env.local`.
- Rotate if leaked: go to dropbox.com/developers/apps → your app → revoke the token, generate a new one, update Vercel.

## What Dropbox does NOT get

- Supabase remains the source of truth. If Dropbox goes offline or rate-limits, reports still generate and land in Supabase Storage. The Dropbox mirror is a convenience, not a dependency.
- The mirror doesn't sync deletions. If you delete a file from Dropbox, it stays in Supabase. If we ever want two-way sync, that's a separate build.
