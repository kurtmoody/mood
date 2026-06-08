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
- Next.js **16**: the root middleware file is `proxy.ts` (exports `proxy`), NOT `middleware.ts`. Never recreate middleware.ts. `next build` does NOT run lint in 16.
- All authenticated pages live in the **`app/(app)/` route group** under a shared `layout.tsx` (auth gate → renders the shell). `/login` and `/auth` live OUTSIDE the group so they get no shell. Don't move authed pages out of `(app)`.
- Auth callback is **client-side** at `app/auth/callback/page.tsx` — reads tokens from the URL hash (implicit flow) AND `?code` (PKCE). After a session is established it calls `claim_client_access()` (grants a client portal membership by email match). Do not convert it to a server route.
- Supabase **RLS is ON** and is the security floor. Rows are invisible unless a `membership` row exists. The content tables (content_item/version, approval_event, comment, channel, media) have a status-aware read floor (migration 0015): client-role users see only their own client's posts, and only from `client_review` onward. SECURITY DEFINER helpers: `client_ids_for_user()`, `is_agency_for_client()`, `is_agency_member()`, `is_client_user()`, `can_admin_agency()`.
- **ALL writes go through SECURITY DEFINER RPCs** (`create_post`, `update_post`, `transition_post`, `add_comment`, `add_media`, the CRM RPCs, …) — there are NO permissive write policies on the content tables (0016). An inline RLS WITH CHECK subquery on `membership` evaluates under membership's own RLS and returns empty, so it silently fails; SECURITY DEFINER bypasses that and keeps multi-table writes atomic. Authorisation is enforced INSIDE each RPC (it bypasses RLS). Do not add write policies.
- **Storage**: media lives in a PRIVATE `content-media` bucket. Display ALWAYS via server-side `createSignedUrls` (batched) — never `getPublicUrl`. Upload path MUST be `<client_id>/<content_item_id>/<version_id>/<filename>` (storage policies parse it). Use `<img>` for signed URLs (not next/image).
- Calendar dates are **Europe/Malta**, week starts Monday — use `lib/week.ts`; bucket posts by real date, never by weekday.
- Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. In `.env.local` and Vercel.

## File map
- `app/(app)/` — route group for all authenticated pages, with `layout.tsx` (auth gate + `AppShell`).
  - `page.tsx` — client-aware Week/Month calendar (server). `CalendarBoard.tsx` — interactive shell (switcher, view toggle, nav, drawer). `NewPostForm.tsx`. Server actions: `postActions.ts` (create/update post), `approvalActions.ts` (transition), `commentActions.ts`.
  - `clients/` (list + `new/`), `clients/[id]/` (detail/edit + Channels/Contacts/BrandAssets sections + their `*Actions.ts`), `team/`.
- `app/login/page.tsx`, `app/auth/callback/page.tsx` — outside the group (no shell).
- `components/` — shell: `AppShell`, `Sidebar`, `TopBar`, `UserMenu`. Calendar: `Calendar` (week), `MonthCalendar`, `Drawer` (post detail/edit/approve/comment/media), `MediaSection`, `MediaThumb`, `ClientSwitcher`.
- `lib/` — `supabase/{client,server,middleware}.ts`; `access.ts` (agency/client detection from membership); `week.ts` (Malta-tz dates); `media.ts`.
- `proxy.ts` — calls updateSession. `schema.sql` — fresh-setup reference (see Migrations). `migrations/` — numbered SQL + pgTap tests.

## Migrations
- Schema changes are numbered files `migrations/NNNN_name.sql`, run **manually** in the Supabase SQL editor (not auto-applied). Idempotent (`create … if not exists`, `drop policy if exists` then create, `create or replace`). Currently **0001–0018**.
- `schema.sql` is the fresh-setup reference ONLY — it has a destructive reset block at the top; **never run it against the live DB**. New changes go in a migration, not schema.sql.
- Security-sensitive migrations ship a pgTap test `NNNN_*_test.sql`, runnable in the hosted editor (no basejump): temp `_t` + `grant insert on _t to authenticated` + `plan()` BEFORE any role switch; act via `set local role authenticated` + a `request.jwt.claims` GUC; drop to `set local role postgres` (not reset) to read true state; aggregate via `union all`; `throws_ok(sql,'<sqlstate>')` 2-arg, `is_empty`/`isnt_empty` for silent RLS reads.

## Data model (core in schema.sql; later tables/columns in migrations)
agency, client, membership (user↔scope, role), channel (per client: instagram/facebook/linkedin/blog/newsletter), content_item, content_version, asset, comment, approval_event, agency_integration.
Seeded: agency `…0001`, client "Hotel Valentina" `…0002`, channels a1–a5.

Added by migrations (0001–0018):
- `client` (+ non-sensitive only): status (prospect/active/paused/archived, CHECK), website, industry. Sensitive data is NOT on `client` (it's client-readable via the portal).
- `client_internal` (agency-only, 1:1 with client): account_owner_id (→ team_member), notes, billing_email, vat_number, billing_address, payment_terms, currency (default EUR), retainer_amount.
- `client_contact` (agency-only): client_id, first_name, surname, role, email, phone, is_primary (single-primary enforced), portal_access (agency toggle to invite to the portal), user_id (nullable — links to a portal user via membership).
- `brand_asset` (agency-only): client_id, kind (logo/colour/font/guideline/other), label, value/url, notes.
- `team_member` (agency staff directory): agency_id, full_name, role, email, user_id (nullable → auth.users), is_active. Foundation for account owners, assignment, @mentions.
- `media` (agency-upload, 0018): version_id (→ content_version), storage_path (unique), mime_type, size_bytes, created_by. Private `content-media` bucket; SELECT mirrors the content read floor.

## Approval state machine (content_item.status)
draft → internal_review → client_review → changes_requested → approved → scheduled → posted.
Agency drives draft→internal_review→client_review. Client view can approve (→approved) or request changes (→changes_requested). Every transition writes an approval_event row.

## Built
- **App shell** — persistent sidebar + top bar (`app/(app)/layout.tsx`), pinnable on desktop, off-canvas drawer on mobile; nav gated by role (clients see only the calendar; agency pages hard-redirect non-agency).
- **Client CRM** — `/clients` list + create (`create_client`); `/clients/[id]` detail/edit (`update_client`) with account owner from the team directory; `/team` directory (`add_team_member`); contacts CRUD (single-primary); brand assets CRUD. All via SECURITY DEFINER RPCs.
- **Content engine** —
  - Client-aware **calendar**: real dated Week/Month views (Europe/Malta), Prev/Today/Next, state in the URL (`?client/?week/?month/?view`); click a post → detail drawer.
  - **Channels** per client (add/remove).
  - **Create/edit posts** (`create_post`/`update_post`) — body versioned via content_version; edit locked once client-facing.
  - **Approval workflow** (`transition_post`) — status machine, every move logged to approval_event; history timeline in the drawer.
  - **Comments** (`add_comment`/`delete_comment`).
  - **Media** — agency upload (image/video/pdf) to the private bucket; server-side signed-URL display (thumbnail on the card, gallery in the drawer); client view-only.
- **Security (RLS/storage, all pgTap-proven)** — content read floor (0015), content tables RPC-only (0016), media table + storage policies status-gated (0018).
- **Client portal** — access model + invite toggle (0013), claim-on-login (callback → `claim_client_access`), restricted client calendar + nav gating, client-authorised approve/request-changes inside `transition_post` (0017).

## Next (open)
1. **Client approve/request-changes UI** — surface Approve / Request changes in the client's drawer (the `transition_post` authorisation is built + proven; this is app-code only).
2. **`asset` RLS** — the legacy `asset` table (schema 0001, distinct from `media`) still has a status-less read policy; gate it like 0015.
3. Month-view media indicator (week card has thumbnails; month chips don't) — optional.

Later: auto-chase email reminders for items stuck in client_review (needs a verified Resend domain). See "Future: @mentions & notifications" below.

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