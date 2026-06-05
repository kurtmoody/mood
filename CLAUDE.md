# CLAUDE.md — Mood

## What this is
Internal tool for Mood Agency (Malta creative/marketing agency) to plan social + content for clients on a calendar, and let clients review/approve/comment. Internal-first; may become a product later. Old codename: "Cadence".

## The core bet
ONE approval calendar for ALL content types (Instagram, Facebook, LinkedIn, Blog, Newsletter) — not a social-only tool. Two tenets:
1. Make the agency team faster.
2. Make client interaction effortless — approve in seconds, no fighting with logins.

Out of scope (do NOT build): publishing/scheduling to social networks, analytics, social inbox, AI content generation, white-label.

## Stack
- Next.js 16 (App Router, TypeScript), React Server Components.
- Supabase (Postgres + Auth + Storage). Auth = magic link (email OTP).
- Tailwind CSS. Deployed on Vercel (auto-deploy on push to main). Repo: github.com/kurtmoody/mood.
- Email via Resend (custom SMTP configured in Supabase).

## Hard-won gotchas (do not regress)
- Next.js **16**: the root middleware file is `proxy.ts` (exports `proxy`), NOT `middleware.ts`. Never recreate middleware.ts.
- Auth callback is **client-side** at `app/auth/callback/page.tsx` — reads tokens from the URL hash (implicit flow) AND `?code` (PKCE), because the default Supabase email link returns the session in the hash. Do not convert it to a server route.
- Supabase **RLS is ON**. Rows are invisible unless a `membership` row exists for the logged-in user. Helper SQL: `client_ids_for_user()`, `is_agency_for_client()`.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In `.env.local` and Vercel.

## File map
- `app/page.tsx` — calendar home (server component; redirects to /login if no user).
- `app/login/page.tsx` — magic-link login.
- `app/auth/callback/page.tsx` — client-side auth callback.
- `components/Calendar.tsx` — week calendar grid.
- `components/LogoutButton.tsx`.
- `lib/supabase/{client,server,middleware}.ts` — Supabase clients + session refresh helper.
- `proxy.ts` — calls updateSession.
- `schema.sql` — full schema + RLS + seed data (source of truth for the DB).

## Data model (exact DDL in schema.sql)
agency, client, membership (user↔scope, role), channel (per client: instagram/facebook/linkedin/blog/newsletter), content_item, content_version, asset, comment, approval_event, agency_integration.
Seeded: agency `…0001`, client "Hotel Valentina" `…0002`, channels a1–a5.

CRM extensions (priority 1, not yet built):
- `client` (extended): status (prospect/active/paused/archived), website, industry, account_owner_id, notes, billing_email, vat_number, billing_address, payment_terms, currency (default EUR), retainer_amount.
- `client_contact`: client_id, name, email, phone, role, is_primary, user_id (nullable — links to a portal user via membership).
- `brand_asset`: client_id, kind (logo/colour/font/guideline/other), label, value/url, notes.

## Approval state machine (content_item.status)
draft → internal_review → client_review → changes_requested → approved → scheduled → posted.
Agency drives draft→internal_review→client_review. Client view can approve (→approved) or request changes (→changes_requested). Every transition writes an approval_event row.

## Built
Auth (magic link), RLS isolation, calendar rendering live data.
- Click a calendar post → read-only detail drawer (title, body, channel, scheduled date, status). Body is versioned (content_version); resolved server-side from current_version_id.

## Next (priority order)
1. Client CRM — agency-only admin at `/clients` to manage clients. Adds to `client`: status (prospect/active/paused/archived), website, industry, account_owner_id, notes, and billing (billing_email, vat_number, billing_address, payment_terms, currency default EUR, retainer_amount). New `client_contact` table (client_id, name, email, phone, role, is_primary, user_id nullable for portal access via membership). New `brand_asset` table (client_id, kind [logo/colour/font/guideline/other], label, value/url, notes). Build in sub-steps: schema → clients list → new/edit form → contacts → brand assets.
2. Create / edit a post (title, body, channel, scheduled date, status).
3. Approval buttons + status transitions (agency side), writing approval_event.
4. Client view: read-only calendar for one client + approve / request-changes + comment.
5. Comment thread on a post.
6. Image upload (Supabase Storage) + Google Drive link on assets.
7. Auto-chase email reminders for items stuck in client_review.

## Conventions / preferences
- British English. Write like a person; avoid AI-tell phrasing. Lean and direct — no padded comments or over-engineering.
- Keep the existing clean/minimal style (white canvas, hairline grid, small status dots).
- Show a plan/diff before large changes; prefer small, reviewable steps.
- Commit after each working feature with a clear message.