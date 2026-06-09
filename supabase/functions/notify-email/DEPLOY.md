# notify-email — deploy & webhook runbook

This Edge Function sends an email via **Resend** whenever a row is inserted into
`public.notification`. It is **deliver-only**: the DB (`_notify`) already decided the
recipient, message, and type; this function just resolves the one recipient's email and
sends. See `index.ts` for the contract.

**Status: live.** Deployed and wired to the Database Webhook; confirmed by real
`approved` / `ready_for_review` sends in the Resend logs.

---

## What makes it work (the three pieces)

1. **The function** — deployed to Supabase Edge Functions as `notify-email`.
2. **The secret** — `RESEND_API_KEY` set on the function.
3. **The webhook** — a Database Webhook on `public.notification` (INSERT) that POSTs each
   new row to the function. Without this, rows are inserted but no email is sent.

Plus: the Resend sending domain must be verified.

---

## Prerequisites

- **Resend domain `mail.mood.mt` is verified** (Resend → Domains → green). Sender is
  `Mood <noreply@mail.mood.mt>`. Until a domain is verified, Resend only delivers to the
  account owner.
- **Supabase CLI** installed and authenticated:
  ```bash
  brew install supabase/tap/supabase   # macOS
  supabase login
  ```
- Project ref: `vwicrmwjatrphjviedce`.

---

## 1. Secret

`RESEND_API_KEY` must be set on the Edge Function (`SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are auto-injected by the platform — do not set them).

```bash
supabase secrets set RESEND_API_KEY=re_xxx --project-ref vwicrmwjatrphjviedce
supabase secrets list --project-ref vwicrmwjatrphjviedce   # verify
```

> Never commit the key. Set it via the CLI or the dashboard (Edge Functions → Secrets).

## 2. Deploy the function

```bash
supabase functions deploy notify-email --project-ref vwicrmwjatrphjviedce
```

Leave JWT verification at its default (on) — the Database Webhook sends Supabase's
service-role `Authorization` header, which satisfies it. Re-run this command after any
edit to `index.ts` (changes only take effect once redeployed).

Function URL: `https://vwicrmwjatrphjviedce.supabase.co/functions/v1/notify-email`

## 3. Database Webhook — `notify_email_on_insert`

Supabase dashboard → **Database → Webhooks → Create a new hook**:

| Field | Value |
|---|---|
| Name | `notify_email_on_insert` |
| Table | `public.notification` |
| Events | **Insert** only |
| Type | **Supabase Edge Functions** → `notify-email` |
| Method | `POST` |
| Headers | leave defaults — the dashboard injects the service-role `Authorization` header |
| Timeout | default (~5000 ms) |

This creates a trigger on `public.notification` that POSTs the inserted row to the
function. The function reads `payload.record` (the new notification row).

> Configure the webhook via the **dashboard**, not a committed migration — the SQL form
> embeds the service-role key in the trigger definition, which must not live in the repo.

---

## Test end-to-end

1. In the app, do something that emits a notification **to someone other than yourself**
   (the emitter is always skipped): e.g. move a post to **Client review** (notifies the
   client) or add a **comment** (notifies the other side).
2. Confirm the recipient receives the email (subject + body match the in-app bell; it has
   an "Open in Mood" button linking to `/?post=<content_item_id>`).
3. Logs: Supabase → Edge Functions → `notify-email` → **Logs** — expect
   `notify-email: sent "<type>" to <email> (resend id …)`. Cross-check Resend → Logs.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Row inserted, no email, no function log | Webhook missing/disabled, or not on INSERT of `public.notification`. |
| Log: `Resend send failed (4xx)` | `RESEND_API_KEY` wrong/missing, or domain not verified, or `from` not on the verified domain. |
| Log: `no recipient email` | The recipient's `auth.users` row has no email. |
| Nothing emitted at all | You triggered the event as the only recipient — `_notify` skips the actor. |

## Behaviour notes (don't "fix" these)

- Returns **HTTP 200 on every path**, including send failure, so a bad send never triggers
  webhook retries / duplicate emails. Failures are logged, not retried.
- Subject **and** body both come from `notification.body`, so email matches the bell exactly.
- It must **not** re-derive who/whether to notify, or re-query memberships/statuses — that
  logic lives in the DB (`_notify`) and is tested.

## Future hardening (optional)

A shared-secret check is stubbed (commented) in `index.ts`. To require it: set a
`WEBHOOK_SECRET` Edge secret, add the same value as a custom header on the webhook, and
uncomment the check — so only the webhook can invoke the function.
