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
- Supabase **RLS is ON**. Rows are invisible unless a `membership` row exists for the logged-in user. Helper SQL (all SECURITY DEFINER): `client_ids_for_user()`, `is_agency_for_client()`, `can_admin_agency()`, `is_agency_member()`.
- **Writes go through SECURITY DEFINER RPCs** (e.g. `create_client`, `add_team_member`), NOT direct table inserts. An inline RLS `WITH CHECK` subquery on `membership` is itself evaluated under membership's RLS during the check, so it returns empty and the insert silently fails. SECURITY DEFINER helpers/RPCs bypass that and also keep multi-table creates atomic.
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

CRM tables (migrations 0001–0008):
- `client` (+ non-sensitive only): status (prospect/active/paused/archived, CHECK), website, industry. Sensitive data is NOT on `client` (it's client-readable once the portal exists).
- `client_internal` (agency-only, 1:1 with client): account_owner_id (→ team_member), notes, billing_email, vat_number, billing_address, payment_terms, currency (default EUR), retainer_amount.
- `client_contact` (agency-only): client_id, first_name, surname, role, email, phone, is_primary (single-primary enforced), user_id (nullable — links to a portal user via membership).
- `brand_asset` (agency-only): client_id, kind (logo/colour/font/guideline/other), label, value/url, notes.
- `team_member` (agency staff directory): agency_id, full_name, role, email, user_id (nullable → auth.users when they have a login), is_active. Foundation for account owners, assignment, @mentions, comments.

## Approval state machine (content_item.status)
draft → internal_review → client_review → changes_requested → approved → scheduled → posted.
Agency drives draft→internal_review→client_review. Client view can approve (→approved) or request changes (→changes_requested). Every transition writes an approval_event row.

## Built
Auth (magic link), RLS isolation, calendar rendering live data.
- Click a calendar post → read-only detail drawer (title, body, channel, scheduled date, status). Body is versioned (content_version); resolved server-side from current_version_id.
- Client CRM (complete) — migrations 0001–0008, all writes via SECURITY DEFINER RPCs:
  - `/clients` list + create (`create_client`); `/clients/[id]` detail/edit (`update_client`) with account owner sourced from the team directory.
  - `/team` directory — list & add staff (`add_team_member`).
  - Contacts CRUD on the detail page (`add_contact`/`update_contact`/`delete_contact`, single-primary enforced).
  - Brand assets CRUD on the detail page (`add_brand_asset`/`delete_brand_asset`; colour swatch + link rendering).

## Next (priority order) — content engine
1. Client-aware calendar — client switcher; the calendar shows the selected client's items + channels, selection persisted in the URL (`?client=`).
2. Channel management per client (add / edit / remove channels).
3. Create / edit posts (title, body, channel, scheduled date, status; body versioned via content_version).
4. Approval actions + status transitions (agency side), writing approval_event.
5. Comments thread on a post.
6. Client portal — invite a contact → client login → client-scoped calendar view → approve / request changes.

Later: image upload (Supabase Storage) for brand assets / posts; auto-chase email reminders for items stuck in client_review.

## Conventions / preferences
- British English. Write like a person; avoid AI-tell phrasing. Lean and direct — no padded comments or over-engineering.
- Keep the existing clean/minimal style (white canvas, hairline grid, small status dots).
- Show a plan/diff before large changes; prefer small, reviewable steps.
- Commit after each working feature with a clear message.

## Future: @mentions & notifications
Recorded requirement — NOT built yet. Build the notification spine alongside/after the client portal.

- **@mentions**: mention both internal people (`team_member`) and external people (`client_contact` / client portal users) on comments (and later other objects), so they get notified and can act.
- **Pervasive notifications**: status/approval transitions, new comments, @mentions, "awaiting your approval", changes requested, etc.
- **Per-user preferences (Monday.com-style)**: each notification type × channel toggled on/off by the user (default on).
- **Channels**: in-app inbox (bell) + email via Resend.
  - Dependency: external email delivery needs a **verified Mood domain in Resend**; `onboarding@resend.dev` only delivers to the project owner today.
- **Architecture intent** (so current choices don't block it):
  - Emit notifications from the existing SECURITY DEFINER RPC write paths (`transition_post`, `add_comment`, future RPCs) — a single choke point, not scattered triggers.
  - Store mentions as **structured rows** (mentioned person ids), not by parsing comment text later.
  - Planned tables: `notification` (recipient, type, subject ref, read_at, created_at) and `notification_preference` (user, type, channel, enabled).
  - Recipients keyed to auth `user_id` where possible; external contacts notified by email until they have a portal login.
- **Sequencing**: internal mentions can follow comments; external mentions/notifications become meaningful once the client portal exists.