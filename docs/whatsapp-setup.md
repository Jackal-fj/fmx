# WhatsApp Cloud API — Meta Setup Guide

FMX uses Meta's WhatsApp Cloud API (Graph API v21) to dispatch defect messages to vendors and receive their replies via webhook. This guide walks through the one-time setup on Meta's side.

Estimated time: 30–60 min of active work, then 1–3 business days waiting for Meta business verification.

## Prerequisites

Before starting, you'll need:

- Commercial Management Solutions Pte Limited **company registration document** (PDF)
- Access to the **new dedicated WhatsApp number** currently registered on the WhatsApp Business App (you'll deregister from that app before it can be used on Cloud API)
- Ability to receive SMS + voice calls on that number for OTP verification
- A Facebook personal account (to log into Meta Business Manager)
- Admin access to Vercel and Supabase for FMX (already set up)

## Step 1 — Deregister the number from the WhatsApp Business App

**Do this first.** A number can only be registered on either the Business App or the Cloud API, not both. If it's on the Business App, Cloud API registration will fail.

1. Open the WhatsApp Business App on your phone
2. Settings → Account → **Delete my account**
3. Enter the phone number and confirm
4. Chat history is lost — do this after you've captured anything important

## Step 2 — Set up Meta Business Manager

1. Go to https://business.facebook.com
2. Log in with your personal Facebook account (or create one; this is only for admin access)
3. **Create a new Business Account** for **Commercial Management Solutions Pte Limited**
4. Fill in the business details exactly as on the company registration document:
   - Legal business name: `Commercial Management Solutions Pte Limited`
   - Business address, phone, email
5. Add yourself as admin (already the case if you created it)

## Step 3 — Business Verification

Meta needs to verify the business is real before letting you send WhatsApp messages beyond a small trial quota.

1. In Business Manager → **Settings** → **Business Info** → **Verification Center**
2. Click **Start Verification**
3. Upload the company registration document (PDF)
4. Provide any additional information Meta asks for (usually just contact details)
5. Submit

Meta takes **1–3 business days** to verify. You'll get a notification when it's done.

While you wait, you can complete the remaining steps below — some can be done in "test mode" against a Meta-provided test number, but the actual production dispatch to real vendors requires verification to be complete.

## Step 4 — Create a Meta App

1. Go to https://developers.facebook.com/apps
2. **Create App** → select **Business** as the type
3. App name: `FMX Dispatch` (or similar)
4. Contact email: `carl@cmsfiji.com`
5. Business account: pick the Commercial Management Solutions one you just created
6. Skip other product wizards

## Step 5 — Add the WhatsApp product

1. In the new app's dashboard, **Add Product** → **WhatsApp** → **Set up**
2. You'll be taken to the WhatsApp → API Setup page
3. Under **Send and receive messages**, Meta gives you a **test phone number** by default — this is for trial. Note the **Phone number ID** and the **temporary access token**.

For testing during development, you can use the Meta test number. For production, you need to add your CMS dedicated number:

4. **Add phone number** → follow the wizard to add the CMS Fiji number:
   - Number verification via SMS or voice call
   - Display name: `Commercial Management Solutions`
   - Category: `Real Estate`
   - Business description (256 chars): same one you used on the Business App
5. Once added and verified, note the new production **Phone number ID**

## Step 6 — Get a permanent access token

The token from step 5 is temporary (expires in 24 hours). For production, generate a permanent System User token:

1. Business Manager → **Settings** → **Users** → **System Users** → **Add**
2. Name: `FMX Dispatch System User`
3. Role: `Admin`
4. Once created, click the system user → **Generate new token**
5. Select the FMX Dispatch app you created
6. Token expiration: **Never**
7. Permissions: check `whatsapp_business_messaging` and `whatsapp_business_management`
8. Generate — copy the token immediately (Meta only shows it once)
9. Assign this system user to the WhatsApp Business Account: Settings → Business Assets → WhatsApp Accounts → your account → Assign People → the system user → check both permissions

This token is what goes in `WHATSAPP_ACCESS_TOKEN`.

## Step 7 — Configure the webhook

1. In the app dashboard → WhatsApp → **Configuration**
2. **Callback URL:** `https://fmx.cmsfiji.com/api/whatsapp/webhook`
3. **Verify token:** paste the value you'll set in `WHATSAPP_WEBHOOK_VERIFY_TOKEN`. Generate one with:
   ```
   openssl rand -hex 16
   ```
   Use the same value in your Vercel env var.
4. Click **Verify and save** — Meta calls the URL with a challenge. If the token matches, verification succeeds.
5. Under **Webhook fields**, subscribe to at least:
   - `messages` (inbound messages from vendors)
   - `message_status` (delivery/read receipts on your outbound)

## Step 8 — Collect the app secret

For webhook signature verification:

1. App dashboard → **App Settings** → **Basic**
2. Copy the **App Secret** (click Show, requires password)
3. This goes in `WHATSAPP_APP_SECRET`

## Step 9 — Add all four env vars to Vercel

1. https://vercel.com/carl-proberts-projects/fmx/settings/environment-variables
2. Add all four with **Production** ticked (and Preview if you want):

| Variable | Value |
|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | from step 5 (production number) |
| `WHATSAPP_ACCESS_TOKEN` | permanent token from step 6 |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | random string from step 7 |
| `WHATSAPP_APP_SECRET` | app secret from step 8 |

3. Redeploy (or wait for next git push)

## Step 10 — Test end-to-end

1. Go to https://fmx.cmsfiji.com/vendors and confirm you have at least one vendor with a **WhatsApp number in +679... E.164 format**
2. Open any defect at `/defects/DEF-2026-XXXX`
3. Click **Dispatch to vendor via WhatsApp**
4. Pick the vendor, review the message, click Send
5. The vendor should receive the message on their WhatsApp within seconds, followed by any attached photos
6. Ask the vendor to reply — their reply should appear on the defect detail page under **WhatsApp thread** within seconds

## Troubleshooting

**"WhatsApp not configured"** — env vars aren't set in Vercel, or the deploy hasn't picked them up. Redeploy.

**"Text send failed: Invalid access token"** — token is wrong, expired, or the system user isn't assigned to the WhatsApp Business Account (step 6 step 9).

**"Text send failed: (#131030) Recipient phone number not in allowed list"** — Meta requires phone numbers on an allowed list during development. Add your test numbers in the WhatsApp API Setup page, or complete Business Verification to lift this restriction.

**Webhook not receiving inbound messages** — check the webhook URL is exactly `https://fmx.cmsfiji.com/api/whatsapp/webhook`, verify token matches, and the `messages` webhook field is subscribed.

**Signature verification fails** — WHATSAPP_APP_SECRET in Vercel doesn't match the value from the Meta app Settings → Basic page.

## Rate limits and costs

- Meta gives 1000 free service conversations per month
- Each dispatch (text + N photos) counts as one "conversation" for the first 24-hour window
- Beyond 1000/mo: pricing depends on country of recipient (Fiji ~USD 0.03/conversation)
- Full pricing: https://developers.facebook.com/docs/whatsapp/pricing

## Security notes

- The access token is production credentials — treat it like a password. Never commit to git, never share in screenshots.
- The webhook verify token is a shared secret between FMX and Meta. Rotate if it ever leaks.
- Inbound messages are received over HTTPS and verified via HMAC-SHA256 signature against the app secret. Unsigned requests are rejected.
