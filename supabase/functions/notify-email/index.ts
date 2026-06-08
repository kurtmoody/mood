// supabase/functions/notify-email/index.ts
//
// Sends an email via Resend when a `notification` row is INSERTed, triggered by a
// Supabase Database Webhook (configured on public.notification, INSERT).
//
// DELIVER, DO NOT DECIDE. The notification row already encodes the recipient
// (user_id), the message (body) and the kind (type) — that logic lives in the DB
// (_notify) and is tested. This function only resolves the one recipient's email and
// sends. It must NOT re-derive who/whether to notify, and must NOT query memberships,
// statuses, or the notification table again.
//
// Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (auto-injected), RESEND_API_KEY (secret).

import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://mood-amber-zeta.vercel.app'
const FROM = 'Mood <noreply@mail.mood.mt>'

type NotificationRecord = {
  id: string
  user_id: string
  type: string
  content_item_id: string | null
  actor_id: string | null
  body: string | null
  read_at: string | null
  created_at: string
}

// Short subject per notification type.
const SUBJECTS: Record<string, string> = {
  ready_for_review: 'A post is ready for your review',
  approved: 'A post was approved',
  changes_requested: 'Changes requested',
  comment: 'New comment',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // --- Optional shared-secret check (V1: NOT enforced) ---
  // Set WEBHOOK_SECRET as an Edge secret and the same value as a custom header on the
  // Database Webhook, then uncomment to require it.
  // const expected = Deno.env.get('WEBHOOK_SECRET')
  // if (expected && req.headers.get('x-webhook-secret') !== expected) {
  //   return json({ error: 'unauthorised' }, 401)
  // }

  try {
    const payload = await req.json()
    const record = payload?.record as NotificationRecord | undefined
    if (!record?.user_id) {
      console.log('notify-email: no record/user_id in payload, skipping')
      return json({ skipped: 'no record' })
    }

    // Service-role client — needed to read the auth schema for the recipient's email.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Resolve the single recipient's email. Look up ONLY record.user_id.
    const { data, error } = await supabase.auth.admin.getUserById(record.user_id)
    const email = data?.user?.email
    if (error || !email) {
      // A missing email must NOT cause webhook retries — log and return 200.
      console.log(`notify-email: no recipient email for user ${record.user_id}, skipping`, error?.message ?? '')
      return json({ skipped: 'no recipient email' })
    }

    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) {
      console.error('notify-email: RESEND_API_KEY missing, cannot send')
      return json({ skipped: 'no resend key' })
    }

    const subject = SUBJECTS[record.type] ?? 'Mood update'
    const link = record.content_item_id ? `${APP_URL}/?post=${record.content_item_id}` : APP_URL
    const message = record.body ? escapeHtml(record.body) : subject

    const html = `
      <div style="font-family: Arial, Helvetica, sans-serif; color: #15171C; line-height: 1.5;">
        <p style="font-size: 15px; margin: 0 0 16px;">${message}</p>
        <p style="margin: 0 0 24px;">
          <a href="${link}" style="display: inline-block; background: #15171C; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 10px 16px; border-radius: 8px;">Open in Mood</a>
        </p>
        <p style="font-size: 12px; color: #9398A1; margin: 0;">Mood — content approval calendar</p>
      </div>
    `

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: email, subject, html }),
    })

    if (!res.ok) {
      // V1: return 200 even on send failure to avoid retry storms / duplicate sends.
      const detail = await res.text().catch(() => '')
      console.error(`notify-email: Resend send failed (${res.status}) for ${email}: ${detail}`)
      return json({ sent: false, status: res.status })
    }

    const sent = await res.json().catch(() => ({}))
    console.log(`notify-email: sent "${record.type}" to ${email} (resend id ${sent?.id ?? 'n/a'})`)
    return json({ sent: true, id: sent?.id ?? null })
  } catch (e) {
    // Always return 200 + JSON so a code error doesn't trigger webhook retries.
    console.error('notify-email: unhandled error', e instanceof Error ? e.message : e)
    return json({ error: 'handled', sent: false })
  }
})
