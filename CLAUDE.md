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
- `app/(app)/` — route group for all authenticated pages, with `layout.tsx` (auth gate + `AppShell`), `loading.tsx` (route skeleton), `error.tsx`.
  - `page.tsx` — client-aware Week/Month/Grid calendar (server). `CalendarBoard.tsx` — interactive shell (switcher, view toggle, nav, drawer, drag-reschedule). `NewPostForm.tsx`, `InvitePanel.tsx`. Server actions live next to their pages: `postActions.ts`, `approvalActions.ts`, `commentActions.ts`, `taskActions.ts`, `inviteActions.ts`, `internalNoteActions.ts`, `assetLinkActions.ts`, `viewPrefActions.ts`, `timeLogActions.ts` (global "+ Log time").
  - `clients/` (list + `new/` + `ownership/`), `clients/[id]/` (detail/edit + Channels/Contacts/BrandAssets/Deliverables/**Campaigns**/Ownership/Timesheet sections + their `*Actions.ts`), `campaigns/[id]/` (agency-only campaign hub: header + BriefPanel + tasks/content panels; `campaignActions.ts` at the `(app)` root), `team/`, `tasks/` (list/kanban/calendar board), `dashboard/`, `reports/` (all agency members; `ReportTabs` switches Time/Capacity/Profitability — Profitability admin-only), `admin/` (access, costs, RACI).
- `app/login/page.tsx`, `app/auth/callback/page.tsx` — outside the group (no shell).
- `components/` — shell: `AppShell`, `Sidebar`, `TopBar`, `UserMenu`, `NotificationBell`, `PageContainer`, `LogTimeLauncher`/`LogTimeModal` (top-bar "+ Log time"). Calendar: `Calendar` (week), `MonthCalendar`, `ContentGrid`, `Drawer` (post detail/edit/approve/comment/media/notes/tasks), `MediaSection`, `MediaThumb`. Reporting: `ReportTabs`, `TimeReport`, `CapacityPlanner`, `ProfitabilityReport`, `TimesheetSection`. **`ui.ts` — shared button/field class constants; use these for any new controls.**
- `lib/` — `supabase/{client,server,middleware}.ts`; `access.ts` (agency/client detection from membership); `week.ts` (Malta-tz dates incl. `maltaInputToISO` for datetime-local inputs); `media.ts`; `colour.ts` (client calendar colours); `capacity.ts`, `profitability.ts`, `timeReport.ts`, `reportRange.ts`; `taskConstants.ts`, `deliverableConstants.ts`, `ownershipRoles.ts`, `viewColumns.ts`; `exportClient.ts` (pre-delete backup bundle).
- `proxy.ts` — calls updateSession. `schema.sql` — fresh-setup reference (see Migrations). `migrations/` — numbered SQL + pgTap tests.

## Migrations
- Schema changes are numbered files `migrations/NNNN_name.sql`, run **manually** in the Supabase SQL editor (not auto-applied). Idempotent (`create … if not exists`, `drop policy if exists` then create, `create or replace`). Currently **0001–0057**; **next is 0058**.
- **Idempotency for rebuilt functions: drop BOTH the old AND the new signature before `create`.** A single-shot `drop <old>; create <new>;` throws `42723` on re-run (the drop only targets the old sig; the new one is already there). Every param-changing rebuild ships both drops (0057's `create_campaign`/`update_campaign` do this — the 0056 lesson).
- `schema.sql` is the fresh-setup reference ONLY — it has a destructive reset block at the top; **never run it against the live DB**. New changes go in a migration, not schema.sql.
- Security-sensitive migrations ship a pgTap test `NNNN_*_test.sql`, runnable in the hosted editor (no basejump): temp `_t` + `grant insert on _t to authenticated` + `plan()` BEFORE any role switch; act via `set local role authenticated` + a `request.jwt.claims` GUC; drop to `set local role postgres` (not reset) to read true state; aggregate via `union all`; `throws_ok(sql,'<sqlstate>')` 2-arg, `is_empty`/`isnt_empty` for silent RLS reads.
- **Any temp table READ while `set local role authenticated` is active needs its own grant** (`grant select on _ctx, _tsk to authenticated;`) — else `42501` permission denied (0056 test 14 read `_ctx` under the role switch; same family as the 0039 `_t` insert grant). Grant every temp table the role-switched block touches.

## Data model (core in schema.sql; later tables/columns in migrations)
agency, client, membership (user↔scope, role), channel (per client: instagram/facebook/linkedin/blog/newsletter), content_item, content_version, asset, comment, approval_event, agency_integration.
Seeded: agency `…0001`, client "Hotel Valentina" `…0002`, channels a1–a5.

Added by migrations 0001–0018:
- `client` (+ non-sensitive only): status (prospect/active/paused/archived, CHECK), website, industry. Sensitive data is NOT on `client` (it's client-readable via the portal).
- `client_internal` (agency-only, 1:1 with client): account_owner_id (→ team_member), notes, billing_email, vat_number, billing_address, payment_terms, currency (default EUR), retainer_amount. Writes RPC-only since 0048.
- `client_contact` (agency-only): client_id, first_name, surname, role, email, phone, is_primary (single-primary enforced), portal_access (agency toggle to invite to the portal), user_id (nullable — links to a portal user via membership).
- `brand_asset` (agency-only): client_id, kind (logo/colour/font/guideline/other), label, value/url, notes.
- `team_member` (agency staff directory): agency_id, full_name, role, email, user_id (nullable → auth.users), is_active. Foundation for account owners, assignment, @mentions.
- `media` (agency-upload, 0018): version_id (→ content_version), storage_path (unique), mime_type, size_bytes, created_by. Private `content-media` bucket; SELECT mirrors the content read floor.

Added by 0019–0057 (headlines; read the migration for detail):
- `notification` (0019, copy refined 0023) — in-app inbox rows emitted from the RPC write paths. No preferences table, no email sending yet.
- Versioning hardening (0021/0022) — post body versions forked on client-facing edits; `media.sort_order` (0024); `post_asset_link` (0026) for external asset URLs.
- `task` (0028, content link 0031, subscriptions 0041, capacity fields 0043, value/invoice_status 0045) — the tasks board's spine. `raci_matrix` (0027, edit RPC 0032, CHECK on raci_value 0048).
- `client_ownership` (0030) — per-client role assignments (lead PM, creative lead, …). `user_view_preference` (0037). `internal_note` (0039, agency-only, on posts).
- Team/admin: `set_member_role` (0033), team member edit (0034), `invite` (0035 — pending-invite flow, 7-day expiry), permanent delete RPCs with reassignment (0036), revoke access (0020), set_client_status (0040).
- Production meta on posts (0042): designer, design_status, drive/high-res URLs, boost/ad budget, posted date/URL — powers the Grid view.
- Money/reporting: `time_entry` (0044 — timesheets; readable by all agency members, **by design** — decided June 2026), task `value` (0045), `agency_internal.cost_per_hour` (0046 → relocated admin-only in 0047 because RLS can't hide a column). `retainer_amount` deliberately stays member-readable (decided June 2026) — do not relocate it.
- 0048 — dropped the legacy permissive `client_internal_write` policy (last write side-door; predated the 0016 convention). 0049 — `extend_invite` (admin-only reset of the 7-day expiry).
- 0050 — `update_client` defaults `p_status`/`p_timezone`/`p_currency` to null and coalesces each to the existing value (repo record of a live hand-edit; root-caused the status-revert). This is the named **"preserve-don't-default"** lesson: a field that should survive an omitted write defaults to null and coalesces to its current value — now cited by `update_campaign`'s phase-preserve (0056/0057). 0051 — `client_deliverable` (agency-only CRM: label/quantity/cadence/notes/sort_order; RLS = agency-for-client, no client path) + `add`/`update`/`delete`/`reorder_client_deliverable`.
- 0052 — `content_version.visual_content` (a second versioned, client-visible content field; UI splits post into Visual content + Caption); extends `create_post`/`update_post`/`get_post_versions`. 0053 — `mention` table (polymorphic structured rows, write-only audit) + `add_comment`/`add_internal_note` gain `p_mentions uuid[]` (comment mentions allow agency team OR the post's client contacts; internal-note mentions agency-only — client-leak guard). 0054 — `content_item_channel` join (a post → many of its client's channels) + `set_post_channels`; `channel_id` kept as denormalised primary. 0055 — `content_item.post_group_id` + `split_post_channel` peels one channel into a new DRAFT sibling.
- **Campaigns (0056–0057, agency-only, NO client surface):** `campaign` (client-scoped; `objective` awareness/traffic/leads/conversions/sales; `phase` planning→production→live→wrapped→closed; date-order CHECK; 0057 adds `brief`, `media_budget`, `fee` [fixed **internal** price — member-visible tier, NOT the admin-only 0047 cost rate], `kpi_target_results`, `kpi_target_cost_per_result` [≥0 CHECK], `brief_approved_at`/`by`). `campaign_id` on `task`/`content_item` (on delete set null) with the **client-match rule** in the RPCs (a row's campaign must share its client). `create_campaign`/`update_campaign` (full-overwrite; **phase alone preserves**) / `delete_campaign` (admin + closed-only). **Intake gate:** advancing INTO production/live/wrapped needs an approved brief (genuine-transition-only; planning→closed exempt; enforced in `update_campaign`'s phase path + create side). `set_brief_approved(id, approved)` is the ONLY approval path (agency-member, reversible). Hub at `/campaigns/[id]`. Full model in `docs/PROJECT_GUIDE.md` §20.
- Legacy `asset` table dropped (0029).

## Approval state machine (content_item.status)
draft → internal_review → client_review → changes_requested → approved → scheduled → posted.
Agency drives draft→internal_review→client_review. Client view can approve (→approved) or request changes (→changes_requested). Every transition writes an approval_event row.

## Built
- **App shell** — persistent sidebar + top bar (`app/(app)/layout.tsx`), pinnable on desktop, off-canvas drawer on mobile; nav gated by role (clients see only the calendar; agency pages hard-redirect non-agency).
- **Client CRM** — `/clients` list + create (`create_client`); `/clients/[id]` detail/edit (`update_client`) with account owner from the team directory; `/team` directory (`add_team_member`); contacts CRUD (single-primary); brand assets CRUD; agreed **deliverables** CRUD (`client_deliverable`, 0051 — label/quantity/cadence/notes). All via SECURITY DEFINER RPCs.
- **Content engine** —
  - Client-aware **calendar**: real dated Week/Month views (Europe/Malta), Prev/Today/Next, state in the URL (`?client/?week/?month/?view`); click a post → detail drawer.
  - **Channels** per client (add/remove).
  - **Create/edit posts** (`create_post`/`update_post`) — body versioned via content_version; edit locked once client-facing.
  - **Approval workflow** (`transition_post`) — status machine, every move logged to approval_event; history timeline in the drawer.
  - **Comments** (`add_comment`/`delete_comment`).
  - **Media** — agency upload (image/video/pdf) to the private bucket; server-side signed-URL display (thumbnail on the card, gallery in the drawer); client view-only.
- **Security (RLS/storage, all pgTap-proven)** — content read floor (0015), content tables RPC-only (0016), media table + storage policies status-gated (0018), write side-doors closed (0016, 0048). ~33 of 51 migrations carry pgTap tests.
- **Client portal** — access model + invite toggle (0013), claim-on-login (callback → `claim_client_access`), restricted client calendar + nav gating, client approve/request-changes in the drawer (`transition_post`, 0017), invite panel (0035).
- **Tasks** — list/kanban/calendar board with filters, column preferences, owner/client/status deep-links; tasks can serve a post; capacity fields + job value.
- **Notifications (in-app)** — bell + inbox, emitted from the RPC write paths. No email channel or preferences yet.
- **Dashboard (agency)** — "needs your action" view: posts needing review / awaiting client, overdue + open-task breakdowns by status/owner/client.
- **Reporting** — `/reports`, open to all agency members; `ReportTabs` shows ONE report at a time. **Time** (hours by person/client over a date range, distribution-framed) and **Capacity** (per-person + team utilisation % vs 40h/week, forward-looking `?cap` — moved here from the dashboard) are member-visible; **Profitability** (value − time-cost margins by client, date-ranged) is **admin-only** — the tab and its financial fetch render only for admins (a non-admin's `?report` is coerced off it). Money lives only on the Profitability tab.
- **Global "+ Log time"** — top-bar modal (agency-only) to log a completed entry against any timesheet-enabled client; Job combobox picks an open task, free-texts a note (unattributed), or creates a task on the fly (owner = self); Malta-correct datetimes via `maltaInputToISO`, portaled to body.
- **Table view** (calendar's third toggle, formerly "Grid"; `?view=table`, legacy `grid` links still parse) — all post fields incl. thumbnail, caption (read-only — caption edits stay in the drawer because they're versioned), production meta, derived PM; group-by selector (`?group=` client/pm/designer/status/platform/none), per-user column picker (view_key `content_table`), CSV export of the visible period.
- **Multi-channel posts (0054/0055)** — a post targets several of its client's channels (`content_item_channel`), staying one post with one approval; `channel_id` kept as the denormalised primary. Tailor/split (`split_post_channel`) peels a channel into its own DRAFT sibling, linked via `post_group_id`.
- **@mentions (0053)** — structured `mention` rows (not text-parsed) on comments and internal notes, written inside `add_comment`/`add_internal_note`; comment mentions allow agency team OR the post's client contacts, internal-note mentions agency-only (client-leak guard); notified via the bell (`type 'mention'`).
- **Campaigns (0056/0057, agency-only)** — the `campaign` entity grouping tasks + content (`campaign_id`, client-match rule); the hub at `/campaigns/[id]` (phase-advance, Brief panel with money/KPI targets + reversible approval, tasks/content panels); Campaign pickers in the task modal + post drawer. The intake gate blocks production without an approved brief. NO client surface (a later slice). See `docs/PROJECT_GUIDE.md` §20.
- **UI foundation** — design tokens + shared control constants (`components/ui.ts`, `globals.css @theme`), Geist, route-level loading skeleton + error boundary, dialog a11y + entrance motion.

## Next (open)
1. **Notification spine, phase 2** — `notification_preference` table + email via Resend (**blocked on the verified Mood domain**); auto-chase for posts stuck in client_review.
2. Optional UI polish: toast for action feedback (errors are inline text today), focus-trap in dialogs (Escape works, Tab can wander), empty states with a call-to-action for first-run lists.

## Conventions / preferences
- British English. Write like a person; avoid AI-tell phrasing. Lean and direct — no padded comments or over-engineering.
- Keep the existing clean/minimal style (white canvas, hairline grid, small status dots). Light theme only — no dark mode.
- New controls use the shared constants in `components/ui.ts` (btnPrimary/btnGhost/…, labelCls/fieldCls) and the semantic colour tokens from `globals.css` (`text-ink`, `text-muted`, `text-faint`, `border-line`, `border-line-strong`, `bg-surface`, `bg-hover`, `text-accent`) — not raw hex.
- Pages fetch independent queries in one `Promise.all` round, not sequential awaits.
- Show a plan/diff before large changes; prefer small, reviewable steps.
- Commit after each working feature with a clear message.

## Future: @mentions & notifications
Built: the `notification` table + in-app bell (0019/0023), emitted from the RPC write paths; **structured @mentions on comments + internal notes (0053)**. Still open: `notification_preference` (per-user × per-channel toggles), and pervasive notification coverage beyond the current attention-based emit points.

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