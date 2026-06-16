# Mood — Project Guide

**Status:** Internal build, actively developed. Last updated 2026-06-10 (migration 0047).
**Audience:** Engineers, product managers, and anyone picking this project up at any point.
**Scope of this document:** A complete reference for what Mood is, how it's built, and how to operate it. It is the single source of truth for architecture, the data/security model, every shipped feature, the full RPC and migration ledger, conventions, and the operational runbook.

> Companion docs in the repo: [`CLAUDE.md`](../CLAUDE.md) (working agreement / agent instructions — terser), [`README.md`](../README.md), [`schema.sql`](../schema.sql) (fresh-setup DB reference). Where they disagree with reality, **this guide and the migrations are authoritative.**

---

## Table of contents

1. [What Mood is](#1-what-mood-is)
2. [The core bet & scope](#2-the-core-bet--scope)
3. [Tech stack](#3-tech-stack)
4. [Architecture overview](#4-architecture-overview)
5. [Repository structure](#5-repository-structure)
6. [Data model](#6-data-model)
7. [Security model (RLS + SECURITY DEFINER RPCs)](#7-security-model)
8. [Roles & access](#8-roles--access)
9. [The approval state machine](#9-the-approval-state-machine)
10. [Versioning model (snapshot-on-send)](#10-versioning-model-snapshot-on-send)
11. [Media & storage](#11-media--storage)
12. [Notifications (bell + email)](#12-notifications)
13. [Feature inventory](#13-feature-inventory)
14. [RPC reference](#14-rpc-reference)
15. [Migration ledger (0001–0051)](#15-migration-ledger)
16. [Conventions & hard-won gotchas](#16-conventions--hard-won-gotchas)
17. [Testing (pgTap)](#17-testing-pgtap)
18. [Operational runbook](#18-operational-runbook)
19. [Open items & roadmap](#19-open-items--roadmap)
20. [Glossary](#20-glossary)

---

## 1. What Mood is

Mood is an internal tool for **Mood Agency** (a Malta creative/marketing agency) to plan social and content for clients on an **approval calendar**, and to let clients review, approve, and comment with minimal friction. It is internal-first but may become a product later. (Old codename: "Cadence".)

Two audiences use the same app:

- **Agency team** — plan content, manage clients, drive the approval workflow, upload media, chase what's outstanding.
- **Clients** — review their own content on a restricted calendar, approve or request changes, and comment.

---

## 2. The core bet & scope

**The bet:** ONE approval calendar for ALL content types (Instagram, Facebook, LinkedIn, Blog, Newsletter) — not a social-only tool. Two tenets:

1. Make the agency team faster.
2. Make client interaction effortless — approve in seconds, no fighting with logins.

**In scope:** planning, an approval calendar, per-client channels, versioned content, media attachments, approvals/comments, a client portal, notifications, a cross-client agency dashboard.

**Explicitly OUT of scope (do NOT build):** publishing/scheduling to social networks, analytics, social inbox, AI content generation, white-label.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, TypeScript, React Server Components) | React 19, Tailwind v4. `next build` does **not** run lint in 16. |
| Middleware | `proxy.ts` (exports `proxy`) | Next 16 renamed the root middleware file — **not** `middleware.ts`. |
| Database / Auth / Storage | **Supabase** (Postgres) | Auth = magic link (email OTP). RLS is the security floor. Project ref: `vwicrmwjatrphjviedce`. |
| Styling | **Tailwind CSS** | Clean/minimal: white canvas, hairline grid (`#ECECEE`), small status dots. |
| Hosting | **Vercel** | Auto-deploys on push to `main`. Live: `https://mood-amber-zeta.vercel.app`. |
| Email | **Resend** | Verified domain `mail.mood.mt`; sender `noreply@mail.mood.mt`. Delivered via a Supabase Edge Function. |
| Repo | `github.com/kurtmoody/mood` | Default branch `main`. |

**Environment variables:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (in `.env.local` and Vercel). Edge Function secrets: `RESEND_API_KEY` (plus auto-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

---

## 4. Architecture overview

### Request flow
1. `proxy.ts` runs `updateSession` (Supabase SSR cookie refresh) via `lib/supabase/middleware.ts`.
2. All authenticated pages live under the **`app/(app)/` route group** with a shared `layout.tsx` that gates auth (`getAccess`) and renders the shell (`AppShell` → `Sidebar` + `TopBar`).
3. Server Components fetch data through Supabase with the user's session — **RLS applies automatically**.
4. All writes go through **SECURITY DEFINER RPCs** invoked from server actions (or, for a few read/own-row cases, the client).

### The two security tiers
- **RLS (row-level security)** is the floor for **reads**. Rows are invisible unless the user has an appropriate `membership`.
- **SECURITY DEFINER RPCs** are the only path for **writes** to content tables. There are **no permissive write policies** on the content tables; authorisation is enforced *inside* each RPC.

### Auth
- Magic link (email OTP). Login at `/login` (outside the route group → no shell).
- Callback is **client-side** at `app/auth/callback/page.tsx`: reads tokens from the URL hash (implicit flow) **and** `?code` (PKCE), establishes the session, then calls `claim_client_access()` to grant a client portal membership by email match. **Do not convert it to a server route.**

### Deployment
- Push to `main` → Vercel builds and deploys.
- **Migrations are run manually** in the Supabase SQL editor (not auto-applied). The Edge Function is deployed separately via the Supabase CLI.
- ⚠️ When an app change depends on a schema change (e.g. a new column in a query embed), **apply the migration to live BEFORE pushing** the app, or the live query breaks.

---

## 5. Repository structure

```
app/
  (app)/                         # route group — all authenticated pages, shared shell
    layout.tsx                   # auth gate (getAccess) → AppShell
    page.tsx                     # the calendar (server): client-aware Week/Month, RLS-scoped query
    CalendarBoard.tsx            # interactive calendar shell (client): switcher, view toggle,
                                 #   nav, filters, drawer host, ?post deep-link
    NewPostForm.tsx              # create-post modal
    postActions.ts               # createPostAction / updatePostAction (+ fork media copy)
    approvalActions.ts           # transitionPostAction (note required for request_changes)
    commentActions.ts            # addCommentAction / deleteCommentAction
    assetLinkActions.ts          # add/update/delete/reorderAssetLinkAction
    taskActions.ts               # create/update/deleteTaskAction (object args, direct-call)
    dashboard/page.tsx           # agency "needs attention" + task breakdowns (overdue/status/owner/client)
    tasks/                       # page.tsx + TasksBoard.tsx (switcher/filters/modal) +
                                 #   TaskKanban.tsx, TaskCalendar.tsx, types.ts (shared Task type)
    clients/                     # CRM: list + new/ + [id]/ (+ OwnershipSection, InvitePanel,
                                 #   DeleteClientSection) + ownership/ (matrix)
    admin/                       # agency_admin only: layout.tsx (gate) + page.tsx (landing) +
                                 #   raci/ (RaciEditor) + access/ (AccessEditor: roles + agency invites)
    team/                        # agency staff directory: page.tsx + AddTeamMemberForm + TeamList
                                 #   (edit / deactivate / permanent-delete) + actions.ts
    InvitePanel.tsx              # reusable invite panel (agency + client scopes) + inviteActions.ts
    viewPrefActions.ts           # setViewPreferenceAction (per-user column prefs)
  login/page.tsx                 # outside the group (no shell)
  auth/callback/page.tsx         # client-side OTP/PKCE callback + accept_pending_invites + claim_client_access

components/
  AppShell.tsx Sidebar.tsx TopBar.tsx UserMenu.tsx   # shell (Sidebar nav gated by role)
  Calendar.tsx MonthCalendar.tsx                      # week / month grids — client-colour fill + STATUS dot
  Drawer.tsx                                          # post detail / edit / transitions / comments / media / asset links / linked tasks
  MediaSection.tsx MediaThumb.tsx                     # media display, upload, drag-reorder, thumbnails
  AssetLinksSection.tsx                               # labelled asset links (agency manage / client read-only)
  VersionHistory.tsx ClientVersionHistory.tsx         # version history (agency embed / client RPC)
  NotificationBell.tsx                                # bell + unread badge + dropdown
  FilterMenu.tsx ColourPicker.tsx                     # multi-select dropdown / swatch colour picker
  ColumnPicker.tsx                                    # reusable column hide/show/reorder popover (view-agnostic)
  # (ClientSwitcher.tsx removed — replaced by the Clients multi-select FilterMenu)

lib/
  supabase/{client,server,middleware}.ts             # Supabase SSR clients
  access.ts                                           # getAccess() → type/clientIds + agencyId + isAgencyAdmin
  week.ts                                             # Europe/Malta date helpers (Monday-start) +
                                                      #   zonedDateTimeToUTC / maltaTimeOfDay / rescheduleToDateMalta
  media.ts                                            # mediaKind / mediaName helpers
  colour.ts                                           # CLIENT_PALETTE, clientColour(), textOn(), fallbackColour()
  taskConstants.ts                                    # TASK_TYPES / STATUSES / PRIORITIES + colours (single source)
  ownershipRoles.ts                                   # OWNERSHIP_ROLES (the 8 client_ownership role slots)
  viewColumns.ts                                      # ColumnDef/ColumnConfig + mergeColumns (column-pref mechanism)
  capacity.ts                                         # computeCapacity / rangeWeeks (per-person weekly load, 0043)
  profitability.ts                                    # computeProfitability (value − time-cost per job, 0047)
  reportRange.ts                                      # resolveRange (date-range presets, Malta)

migrations/                       # numbered SQL (0001–0051) + pgTap *_test.sql
proxy.ts                          # Next 16 middleware → updateSession
schema.sql                        # fresh-setup reference (DESTRUCTIVE reset block — never run on live)
supabase/functions/notify-email/index.ts   # Deno Edge Function: notification → Resend email
```

---

## 6. Data model

Core tables are defined in `schema.sql`; later tables/columns are added by migrations. **`content_status` enum:** `draft → internal_review → client_review → changes_requested → approved → scheduled → posted`.

### Core tables (`schema.sql`)

| Table | Purpose | Key columns |
|---|---|---|
| `agency` | The agency tenant | `id`, `name` |
| `client` | A client of the agency | `id`, `agency_id`, `name`, `status` (prospect/active/paused/archived), `website`, `industry`, `calendar_colour`, `timesheet_enabled` (0044 — gates the timesheet UI), `current`… |
| `membership` | user ↔ scope, with role | `user_id`, `scope_type` (`agency`/`client`), `scope_id`, `role` — the Postgres **enum `public.member_role`** (`agency_admin`/`agency_member`/`client_approver`/`client_viewer`), so role values are DB-constrained (hence `set_member_role` casts `p_role::public.member_role`). |
| `channel` | A publishing channel per client | `id`, `client_id`, `type` (instagram/facebook/linkedin/blog/newsletter), `label` |
| `content_item` | A planned post | `id`, `client_id`, `channel_id`, `title`, `content_type`, `scheduled_at`, `status`, `current_version_id` (→ content_version, FK added 0021), `created_by`, `updated_at`. **Production metadata (0042):** `designer_id` (→ team_member **on delete set null** — directory ref, login not required), `design_status`, `drive_url`, `high_res_url`, `boost` (bool, default false), `ad_budget` (numeric), `date_posted` (date), `posted_url`. Written via `set_post_meta`, **never** `update_post` (see §16). |
| `content_version` | Versioned body of a post | `id`, `content_item_id`, `version_no` (unique per item, `uq_version_no` 0021), `body`, `visual_content` (0052 — a second versioned, client-visible content field; the Caption is `body`, Visual content is `visual_content`), `internal_note`, `created_by`, `created_at` |
| `comment` | A comment on a post | `id`, `content_item_id`, `author_id`, `body`, `created_at` |
| `approval_event` | Audit log of every transition | `id`, `content_item_id`, `version_id`, `actor_id`, `action`, `note`, `created_at` |

### Tables/columns added by migrations

| Object | Migration | Notes |
|---|---|---|
| `client.status/website/industry` | 0001 | Non-sensitive client fields only. |
| `client_internal` (1:1 with client, **agency-only**) | 0001 | `account_owner_id` (→ team_member), `notes`, `billing_email`, `vat_number`, `billing_address`, `payment_terms`, `currency` (default EUR), `retainer_amount`. Sensitive data lives here, **never** on `client` (which is client-readable via the portal). |
| `team_member` (agency staff directory) | 0005 | `agency_id`, `full_name`, `role`, `email`, `user_id` (nullable → auth.users), `is_active`. Foundation for account owners, assignment, @mentions. |
| `client_contact` (**agency-only**) | 0007 | `client_id`, `first_name`, `surname`, `role`, `email`, `phone`, `is_primary` (single-primary enforced), `portal_access` (invite toggle), `user_id` (nullable — links to a portal user via membership). |
| `brand_asset` (**agency-only**) | 0008 | `client_id`, `kind` (logo/colour/font/guideline/other), `label`, `value/url`, `notes`. |
| `client_deliverable` (**agency-only**) | 0051 | `client_id` (→ client cascade), `label`, `quantity` (nullable), `cadence` (nullable, CHECK: per_week/per_month/per_quarter/per_year/one_off/ongoing), `notes`, `sort_order`, `created_by`, `created_at`, `updated_at` (null until edited). Agreed deliverables per client (retainers) — RLS = agency-for-client, **no client path**. No `client_visible` flag in v1. |
| `media` (agency-upload) | 0018, +`sort_order` 0024 | `version_id` (→ content_version, **on delete cascade**), `storage_path` (**unique**), `mime_type`, `size_bytes`, `created_by`, `created_at`, `sort_order` (int, default 0). Private `content-media` bucket. |
| `notification` (recipient-scoped) | 0019, +`email`/`task_id` 0041 | `user_id` (recipient), `type` (`ready_for_review`/`approved`/`changes_requested`/`comment`/`task_assigned`/`task_status`), `content_item_id` (→ content_item on delete cascade), `task_id` (→ task on delete cascade, 0041), `actor_id`, `body`, `email` (bool, default true — false = in-app only, 0041), `read_at` (null = unread), `created_at`. |
| `task_subscriber` (agency-only) | 0041 | PK `(task_id, user_id)`; `source` (`owner`/`accountable`/`creator`/`manual`, CHECK), `created_at`. Who gets notified about a task. Agency-scoped read RLS (members of the task's agency); writes RPC-only. Seeded by `create_task`/`update_task`; one row per user, most-specific source wins. |
| `client.calendar_colour` | 0025 | Per-client **calendar tag** colour (hex). **Deliberately distinct from `brand_colour`** (the client's brand-identity colour, schema.sql, untouched): a client's calendar fill may differ from its brand. `create_client`/`update_client` now take both `p_brand_colour` and `p_calendar_colour`. Null falls back to a stable palette colour at render (`lib/colour.ts`). |
| `post_asset_link` (agency-write) | 0026 | `id`, `content_item_id` (→ content_item **on delete cascade**), `label`, `url`, `sort_order`, `created_by`, `created_at`. Labelled links per post (Drive folders, raw footage, final exports, …). **Status-aware read floor mirroring 0015** (agency any status; client `client_review+`). RPC-only writes. |
| `raci_matrix` (agency reference) | 0027, editable 0032 | `id`, `agency_id`, `task_type`, `team_member_id` (→ team_member **on delete cascade**), `raci_value` (A/R/C/I/S), `created_at`; unique `(agency_id, task_type, team_member_id)`. Agency-scoped RLS read; **edited via the admin-only `set_raci_matrix` RPC (0032)** — no write policies. Seeded for Mood Agency (15 task types × 7 people). |
| `task` (internal management) | 0028, +`content_item_id` 0031, +capacity 0043 | `id`, `agency_id`, `client_id` (nullable, `on delete set null`), `content_item_id` (nullable → content_item **on delete set null**, 0031 — links a task to a post), `task_type`, `title`, `owner_id` (→ team_member), `status` (default 'Not Started'), `priority` (default 'Medium'), `due_date`, `start_date` (0043), `estimated_hours` (numeric, 0043), `value` (numeric, 0045), `value_client_visible` (bool, 0045 — gate only, no client read path yet), `invoice_status` (0045 — CHECK not_invoiced/invoiced/paid), `next_action`, `notes`, `created_by`, timestamps. **Internal-only** (agency-scoped read via `is_agency_member`; no client access path). RPC-only writes. Values validated app-side via `lib/taskConstants.ts`. `create_task`/`update_task` validate `estimated_hours >= 0`, `start_date <= due_date`, `value >= 0`, and `invoice_status` ∈ the allowed set. |
| `client_ownership` (1:1 with client, **agency-only**) | 0030 | `client_id` (PK → client **on delete cascade**) + eight nullable role slots → `team_member` (`lead_pm_id`, `comms_backup_id`, `creative_lead_id`, `design_owner_id`, `content_owner_id`, `video_owner_id`, `sales_ops_id`, `intern_support_id`), `updated_at`. Internal staffing — **no client branch**. Written via `set_client_ownership`. |
| `invite` (agency + client scopes) | 0035 | `id`, `email` (stored **lower-cased**, no citext dep), `scope_type` (`agency`/`client`), `scope_id`, `role`, `status` (`pending`/`accepted`/`revoked`/`expired`, default pending), `invited_by`, `created_at`, `expires_at` (default now()+7d), `accepted_at`. Partial unique index `(email, scope_type, scope_id) where status='pending'` blocks duplicate live invites. RLS read = the `agency_admin` whose agency owns the scope; **no write policies** (RPC-only). |
| `user_view_preference` (per-user UI prefs) | 0037 | PK `(user_id, view_key)`; `config` jsonb (ordered `[{key,hidden}]`), `updated_at`. `user_id → auth.users **on delete cascade**`. **Own-rows-only RLS** (`user_id = auth.uid()` for read + write) — the rare table a user writes for itself, still upserted via the `set_view_preference` RPC for consistency. Display-only personalisation, keyed by a `view_key` (e.g. `'tasks'`). |
| `internal_note` (polymorphic, **agency-only**) | 0039 | `id`, `parent_type` (`post`/`task`, CHECK), `parent_id` (**no FK** — points at `content_item` or `task` by type), `author_id` (→ auth.users **on delete set null**), `body`, `created_at`, `updated_at` (null until edited); index `(parent_type, parent_id, created_at)`. One table backs notes on two parent kinds. **No client path.** RLS read resolves the parent's agency per-row via the `can_see_internal_note(parent_type, parent_id)` SECURITY DEFINER helper (`post → is_agency_for_client(client_id)`; `task → is_agency_member(agency_id)`); **no write policies** (RPC-only). |
| `time_entry` (internal time logging, **agency-only**) | 0044 | `id`, `agency_id`, `client_id` (not null → cascade), `task_id` (nullable → set null — task-linked or client-direct), `user_id` (→ auth.users), `started_at`, `ended_at` (null = running), `duration_minutes`, `note`, `created_at`. Partial unique index `(user_id) where ended_at is null` = one running timer per user. RLS read = `is_agency_member(agency_id)`; **no write policies** (timer/log RPCs). |
| `agency_internal` (**admin-only**) | 0047 | PK `agency_id` (→ agency cascade), `cost_per_hour` (numeric), `created_at`. RLS read = **agency_admin of that agency only** (sensitive cost data — moved off the member-readable `agency` table). Written via the admin-only `set_agency_cost_per_hour`. |

> The legacy `asset` table (original Drive-flavoured table, never used, superseded by `media` + `post_asset_link`) was **dropped in 0029** — it had a status-less read policy (a latent gap) and is gone from both the DB and `schema.sql`.

> `agency_integration` is referenced in CLAUDE.md as a foundation table for future external integrations; it is minimal/unused today.

### Seeded data (`schema.sql`)
Agency `…0001`, client "Hotel Valentina" `…0002`, channels a1–a5.

---

## 7. Security model

**Two-tier:** RLS gates reads; SECURITY DEFINER RPCs are the only writes. RLS cannot be relied on for writes because an inline `WITH CHECK` subquery on `membership` evaluates under `membership`'s **own** RLS and silently returns empty → the insert fails. SECURITY DEFINER bypasses that and keeps multi-table writes atomic.

### RLS helper functions (all SECURITY DEFINER, `set search_path=''`, wrap `(select auth.uid())`)
| Helper | Returns |
|---|---|
| `is_agency_member()` | true if the user has any agency-scope membership |
| `is_agency_for_client(client_id)` | true if the user is an agency member of that client's agency (admin/member) |
| `is_client_user()` | true if the user has client-scope membership |
| `client_ids_for_user()` | the set of client ids the user belongs to |
| `can_admin_agency(...)` | true if the user can administer the agency |

### Content read floor (migration 0015, pgTap-proven)
The content tables (`content_item`, `content_version`, `approval_event`, `comment`, `channel`, `media`, and — same shape — `post_asset_link` from 0026) have a **status-aware read floor**:
- **Agency** branch: `is_agency_for_client(client_id)` — sees **all** their clients' rows, any status.
- **Client** branch: `is_client_user()` AND client belongs to the user AND `status in ('client_review','changes_requested','approved','scheduled','posted')`.

So clients see only their own client's posts, and only from **`client_review` onward**.

### Agency-scoped & internal tables
Some tables aren't client-facing at all — they gate on **agency membership**, not the content read floor:
- **`raci_matrix` (0027)** and **`task` (0028)**: `for select using (is_agency_member(agency_id))` — agency members of that agency only. `task` deliberately has **no client branch** (tasks are internal). Both are **read-only via RLS with no write policies**; `task` writes go through `create/update/delete_task` (raci is reference data, seeded, no write path yet).
- The CRM-internal tables (`client_internal`, `team_member`, `client_contact`, `brand_asset`) are likewise agency-scoped.
- **`invite` (0035)**: read-only via RLS to the **`agency_admin`** whose agency owns the scope (agency scope → `scope_id` is their agency; client scope → the client belongs to their agency); writes are RPC-only (`create_invite`/`revoke_invite`).
- **`user_view_preference` (0037)** is the one **own-rows-only** table (`user_id = auth.uid()` for both read and write) — personal UI prefs, never visible to anyone else; still written via the `set_view_preference` RPC.
- **`time_entry` (0044)**: read = `is_agency_member(agency_id)` (agency members; no client path). Writes via the timer/log RPCs.
- **`agency_internal` (0047)**: read = **`agency_admin` of that agency only**. Holds `cost_per_hour` — relocated off the member-readable `agency` table because RLS can't hide a single column; so the sensitive rate is now unreadable by non-admins at the RLS layer (not just the UI). Written via the admin-only `set_agency_cost_per_hour`.

### RPC-only writes (migration 0016, pgTap-proven)
There are **NO permissive write policies** on the content tables. Every write — `create_post`, `update_post`, `transition_post`, `add_comment`, `add_media`, `delete_media`, `reorder_media`, the CRM RPCs, etc. — goes through a SECURITY DEFINER RPC that does its own authorisation. **Do not add write policies.**

### Storage policies (migration 0018, pgTap-proven incl. the storage layer)
- Media lives in a **private** `content-media` bucket.
- Display **always** via server-side `createSignedUrls` (batched) — **never** `getPublicUrl`. Use `<img>` for signed URLs (not `next/image`).
- Upload path **must** be `<client_id>/<content_item_id>/<version_id>/<filename>` — the storage policies parse the path segments.
- The storage SELECT policy mirrors the content read floor (status-gated by segment-2 / parent status).

### Notification table RLS (migration 0019)
- SELECT: own rows only (`user_id = auth.uid()`).
- UPDATE: own rows only (used for marking read — the one allowed direct client write).
- No INSERT policy — rows are created **only** by the `_notify` SECURITY DEFINER helper.

### Cross-cutting principle
Where a feature could leak data (e.g. client version history), the answer is a **SECURITY DEFINER RPC that does per-row authorisation in its body**, rather than widening the base RLS policies. See `get_post_versions` ([§10](#10-versioning-model-snapshot-on-send), [§14](#14-rpc-reference)).

---

## 8. Roles & access

`getAccess(supabase)` (in `lib/access.ts`) reads the user's `membership` rows and returns:

```ts
{ userId, email, type: 'agency' | 'client' | 'none', clientIds: string[], agencyId: string | null, isAgencyAdmin: boolean }
```

- **agency** — has an agency-scope membership. Sees **all clients combined** on the calendar (default), the dashboard, Tasks/Clients/Team nav, full calendar controls (New post, Edit, all transitions, media upload/reorder, version history, asset links).
- **client** — only client-scope membership(s). Restricted calendar (own clients, `client_review+` only), Approve / Request changes on `client_review` posts, comments, read-only media + asset links, their own version history.
- **none** — authenticated but no membership. Empty app.

Gating happens in server components: `app/(app)/layout.tsx` (nav/shell) and `app/(app)/page.tsx` (query scope + which controls render). Agency-only pages (`/tasks`, `/clients`, `/team`, `/dashboard`) hard-redirect non-agency users to `/`.

**Admin role (0032+).** `getAccess` exposes **`isAgencyAdmin`** (a `role = 'agency_admin'` membership) and **`agencyId`** (the user's agency). The **Admin area** is gated on the role, not just `type === 'agency'`: the `Admin` nav item is `adminOnly` (shown only to admins), `app/(app)/admin/layout.tsx` hard-redirects non-admins from `/admin*`, and admin RPCs re-check `agency_admin` server-side. The `agency_admin` vs `agency_member` split now governs a growing set of high-stakes actions, all re-checked inside their RPCs: editing the RACI matrix (`set_raci_matrix`), promoting/demoting members (`set_member_role`), creating/revoking invites (`create_invite`/`revoke_invite`), and the **permanent deletes** (`delete_team_member`/`delete_client`, 0036). The corresponding UI affordances (Team access toggles, invite panels, "Delete permanently" buttons) are hidden for non-admins. Routine agency pages still gate on *any* agency membership; broadening the admin gate further is an open item (§19).

**The real team is seeded.** `team_member` for Mood Agency holds the actual staff — **Sandrina, Tiffany, Michelle, Aiden, Design Intern, Marketing Intern** (plus Kurt Hili) — which `raci_matrix`, task owners, and `client_ownership` resolve against by `full_name`. **Michelle and Sandrina hold `agency_admin` memberships** (so they see the Admin area).

---

## 9. The approval state machine

`content_item.status` transitions, all driven by `transition_post` and logged to `approval_event`:

```
draft ──submit_internal──▶ internal_review ──approve_internal──▶ client_review
                                  │                                   │
                          request_changes                     approve │ request_changes
                                  ▼                                    ▼        ▼
                          changes_requested ◀──────────────────── (changes_requested)
                                  │                              approved
                          submit_internal                          │ schedule
                                  ▼                                 ▼
                            internal_review                     scheduled
                                                                    │ mark_posted
                                                                    ▼
                                                                  posted
```

- **Agency** drives `draft → internal_review → client_review`, and `approved → scheduled → posted`.
- **Client** may only `approve` (→ approved) or `request_changes` (→ changes_requested), and only from `client_review`. This is enforced inside `transition_post` (migration 0017, pgTap-proven incl. cross-tenant rejection).
- Every transition writes an `approval_event` row capturing the **current `version_id`** at that moment.
- A **note is required** for `request_changes` (enforced in `transitionPostAction`, the server action — applies to clients too).

---

## 10. Versioning model (snapshot-on-send)

**Migration 0021.** Content is versioned via `content_version`. Only **`body` + `internal_note` + media** are versioned; `title`/`channel`/`scheduled_at` live on `content_item` and are not snapshotted.

- **Mutable statuses** (`draft`, `internal_review`, `changes_requested`): editing updates the **current version in place** (no new version).
- **Frozen statuses** (`client_review`, `approved`, `scheduled`, `posted`): editing **forks** a new version (v2):
  1. Insert a new `content_version` with `version_no = max+1`, `body = p_body`, `internal_note` copied, `sort_order` carried forward on media (0024).
  2. Copy media rows to **new storage paths** under the v2 folder (`<client>/<item>/<v2_id>/<file>`).
  3. Apply title/channel/scheduled to `content_item`, repoint `current_version_id` to v2, and set status → `internal_review` (bounce for re-review).
  4. Return `[{old_path, new_path}]` pairs so the app can `storage.copy` the objects.
- **Integrity guards (0021):** `uq_version_no` unique `(content_item_id, version_no)`; FK `content_item.current_version_id → content_version(id)`.
- **Storage copy split (Option A):** Postgres can't call the Storage API, so the RPC does all DB work and returns the path pairs; the app's `updatePostAction` performs `supabase.storage.from('content-media').copy(old, new)` for each (log-and-continue on failure; v1 untouched, so a partial copy is recoverable).

### UI (frozen edits)
The Drawer shows **"Edit (new version)"** on frozen posts behind a `window.confirm` warning — the only path to the edit form for a frozen post — plus an inline banner. Mutable posts use the plain "Edit". Agency-only.

### Version history
- **Agency** (`VersionHistory.tsx`): reads all versions from the page's embedded query (agency RLS already returns all versions). Collapsible "Version history (N)" section, hidden for single-version posts; shows per-version body, media thumbnails, author/date, and per-version approval events.
- **Client** (`ClientVersionHistory.tsx`): the embedded query is gated by the post's **current** status, so a revised post (back in `internal_review`) would hide a previously-approved v1. Instead the client fetches history via **`get_post_versions`** (migration 0022) — a SECURITY DEFINER RPC that returns, for clients, **only versions ever sent to them** (those with an `approve_internal` event), with `internal_note` nulled. The exact client filter is `EXISTS(approval_event WHERE version_id = cv.id AND action = 'approve_internal')` — nothing looser, so internal drafts never leak.

---

## 11. Media & storage

- **Bucket:** private `content-media`. **Display:** server-side batched `createSignedUrls` (1-hour TTL); `<img>` tags. Never `getPublicUrl`.
- **Upload:** client-side `storage.upload` to `<client_id>/<content_item_id>/<version_id>/<rand>-<sanitised-filename>`, then `add_media` RPC. On RPC failure the just-uploaded object is removed (no orphan).
- **Delete:** `delete_media` RPC first (authoritative), then `storage.remove` (avoids orphans).
- **Ordering (0024):** `media.sort_order` (int). New uploads default to `0` (tie-broken by `created_at`). `reorder_media(version_id, ordered_ids[])` (agency-only, version-scoped) persists drag order. Reads order by `sort_order, created_at` everywhere (page embed + `get_post_versions`). Fork carries `sort_order` forward.
- **Drag-reorder UI:** agency drags rows in `MediaSection` (native HTML5 DnD, no deps), optimistic, persisted via `reorder_media`, `router.refresh()` reverts on error. Clients are read-only.
- **Accepted types:** `image/*`, `video/mp4`, `application/pdf`. Thumbnails on week cards (`MediaThumb`) and a small image glyph on month chips.

---

## 12. Notifications

### Data layer & emit (migration 0019, enriched copy in 0023)
- `notification` table (recipient-scoped RLS, §7).
- `_notify(user_ids[], type, content_item_id, actor_id, body)` — inserts one row per recipient, **skipping the actor** (`u is distinct from p_actor_id`).
- Recipient resolvers: `_agency_user_ids_for_client` (agency members of the client's agency), `_portal_user_ids_for_client` (logged-in portal users matched by `client_contact` email).
- **Emit points** (attention-based, deliberately minimal):
  - `transition_post` → `client_review`: notify **portal users** (`ready_for_review`).
  - `transition_post` `approve`: notify **agency** (`approved`).
  - `transition_post` `request_changes` from `client_review`: notify **agency** (`changes_requested`).
  - `add_comment`: agency comment on a client-visible post → **portal**; client comment → **agency** (`comment`).
- **Copy (0023):** bodies lead with client name + title, e.g. `Acme Co — "Launch teaser": ready for your review`. Single source of truth = `notification.body`.

### Task subscriptions & events (migration 0041)
Tasks have **subscribers** (`task_subscriber`) and fire their own notifications, reusing the same `notification` table + bell.
- **Subscribers** are seeded from RACI/ownership when a task is created/updated: **owner** (the task's `owner_id` → user), **accountable** (the client's Lead PM via `client_ownership`, falling back to the agency RACI `A` person for the task's `task_type`), and **creator**. One row per user, most-specific source wins (owner > accountable > creator); a **manual** source is reserved for future explicit subscribes. `create_task` seeds them; `update_task` **re-seeds the derived rows on owner change** (manual rows preserved).
- **Helper** `_notify_task(user_ids[], type, task_id, actor_id, body, email)` — one row per subscriber, **skipping the actor**, carrying the `task_id` and the `email` flag.
- **Emit points:** **assignment** (`task_assigned`, on create-with-owner and on owner change) and **every status change** (`task_status`). 
- **Email vs in-app-only:** assignment is email-eligible; a status change is email-eligible **only** for `Complete` / `Waiting on Client` / `On Hold` / `Ready for Review` — every other status change is **in-app only** (`email=false`), so the team isn't spammed on trivial nudges. The bell shows all of them; only `email=true` rows are mailed (see Email below).

### Bell (in-app)
`NotificationBell.tsx` in the top bar (agency + client). Unread-count badge, dropdown of the 15 most recent, per-row + "Mark all as read" (scoped `update read_at` only), and **click-to-open**: post notifications resolve the post via the user's RLS-scoped client and deep-link to `/?client&week&view=week&post=<id>`; **task notifications (0041) route to `/tasks`** (the row carries `task_id`; icons for `task_assigned`/`task_status`). Task notifications flow through the same bell automatically (they're `notification` rows under the recipient's own-rows RLS). V1 polls on open (no realtime yet).

### Email (Edge Function)
`supabase/functions/notify-email/index.ts` (Deno). Triggered by a **Database Webhook** on `public.notification` INSERT. It is **deliver-only**: resolves the recipient's email (service-role `auth.admin.getUserById`) and sends via Resend. **It skips rows with `email = false`** (the in-app-only flag, 0041 — e.g. trivial task status nudges); the DB decides, the function still only delivers. **Subject + body both come from `record.body`** (so email matches the bell exactly); the link falls back to `/tasks` for task notifications. Returns 200 on every path (incl. send failure) to avoid webhook retry storms. Optional shared-secret header check is present but commented (V1). Requires the verified Resend domain. **Redeploy required** for the `email=false` skip to take effect (`supabase functions deploy notify-email`).

---

## 13. Feature inventory

Everything below is **built and shipped** unless marked otherwise.

### App shell & navigation
Persistent sidebar (pinnable on desktop, off-canvas on mobile) + top bar. Nav gated by role: clients see only Calendar; agency sees Calendar, Dashboard, Clients, Team. Dashboard nav has a "needs your action" count badge. User menu with sign-out.

### Client CRM
- `/clients` list + create (`create_client`), with **per-row actions (0040)**: **Archive / Reactivate** (any agency member; Archive behind a confirm, Reactivate restorative) via `set_client_status`, and **Delete permanently** (admin-only, **archived clients only** — mirrors the detail-page Danger-zone gate) opening the export-then-delete dialog: Step 1 "Export client data (ZIP)" (`exportClientBundle`), Step 2 **type-the-client-name-to-confirm** → `delete_client`. The list refreshes after each action.
- `/clients/[id]` detail/edit (`update_client`) with account owner from the team directory.
- `/team` agency staff directory — add (`add_team_member`), **edit + soft-deactivate/reactivate (0034)** (`update_team_member`/`set_team_member_active`; an Active/All filter keeps deactivated members reachable), and **admin-only permanent delete (0036)**. Deactivated members drop out of assignment dropdowns.
- **Contacts** CRUD per client (single-primary enforced) with a **portal-access invite toggle** (`set_contact_portal_access`).
- **Brand assets** CRUD per client (`add/update/delete_brand_asset`).
- **Deliverables (0051)** — a **Deliverables** section on `/clients/[id]` recording what's been agreed for the client (especially retainers): `label`, optional `quantity`, optional `cadence` (per week/month/quarter/year, one-off, ongoing — rendered human-readably, e.g. "12 / month"), notes. Agency-only (no portal path), inline add/edit/delete via `add/update/delete_client_deliverable`; `reorder_client_deliverable` exists for a future drag (v1 renders in `sort_order`). Cadence list is the single source of truth in `lib/deliverableConstants.ts`.
- **Channels** per client (`add_channel`/`delete_channel`).
- **Per-client ownership (0030)** — an **Ownership** section on `/clients/[id]` (eight role dropdowns from the team — Lead PM, comms backup, creative/design/content/video owners, sales/ops, intern support — saved via `set_client_ownership`), plus a read-only **`/clients/ownership` matrix** (all clients × roles), linked from the Clients header.
- **Invites + permanent delete** on `/clients/[id]` — an invite panel (client portal access by email) and, for archived clients, an admin-only Danger-zone delete (see below).
All via SECURITY DEFINER RPCs.

### Invites (0035)
Supabase-native magic-link onboarding for both **agency** and **client** scopes. An invite is a server-side record of intent — no custom token: the invitee signs in with the normal magic link for their invited email, and **`accept_pending_invites()` (run on every login, alongside `claim_client_access`)** grants exactly what a live pending invite backs.
- **Agency invites** on `/admin/access` (scope `agency`, role `agency_member`); **client invites** on `/clients/[id]` (scope `client`, role approver/viewer). Both list pending invites with a **Revoke** action, admin-only via `create_invite`/`revoke_invite`.
- `accept_pending_invites` grants membership straight from the invite row (scope/role) so a **client invite can never yield agency access**, links the matching `team_member`/`client_contact` directory row by email, and is idempotent (`on conflict do nothing`). Expired/revoked/absent invites grant nothing.
- **Email auto-send is not wired yet** (the `notify-email` function keys on an existing `user_id`, which an invitee doesn't have) — the admin shares the login for now; see §19.

### Permanent delete (0036)
Two-step, admin-only hard deletes, each in one transaction:
- **`delete_team_member(id, successor_id)`** — *reassign-then-delete*. Requires the member already **deactivated** and refuses if a login is linked. Reassigns the leaver's `task.owner_id`, `client_internal.account_owner_id`, all 8 `client_ownership` slots, and RACI cells (with a **merge** to respect `uq_raci_cell`) to a chosen successor, then deletes. Surfaced as "Delete permanently" on inactive members (successor picker).
- **`delete_client(id)`** — *guarded cascade*. Requires `status = 'archived'`. Explicitly removes the three non-cascading children (`task` — SET NULL; client-scoped `membership`/`invite` — no FK), then deletes the client, cascading content/versions/comments/approvals/media/channels/contacts/brand assets/ownership. **DB-only — storage objects are not purged.** Surfaced as a Danger zone on archived clients.

### Per-user column preferences (0037)
A **view-agnostic** mechanism for hide/show/reorder of table columns, shipped on the **task list**. A view declares its columns (`lib/viewColumns.ts` + per-view `COLUMNS`); the `ColumnPicker` popover (checkboxes + drag-to-reorder, with non-lockable columns like the task title always shown) saves to `set_view_preference('tasks', config)`. On load, the saved config is **merged** with the current column set so a column added later defaults to visible rather than vanishing for existing users. Clients/team lists can adopt it with minimal work (open item, §19).

### Content engine
- **Calendar** (`app/(app)/page.tsx` + `CalendarBoard`): real-dated **Week/Month** views (Europe/Malta, Monday-start), Prev/Today/Next, state in the URL (`?clients/?client/?week/?month/?view`). Click a post → detail drawer. `?post=` deep-link opens a specific post's drawer (used by the bell and dashboard).
- **Combined all-clients view (default for agency).** The home calendar shows **every client's posts together** rather than one client (`clientList[0]`). The single-client dropdown is replaced by a **Clients multi-select** (reuse of `FilterMenu`), **URL-persisted via `?clients=`** (comma list); the query is `.in('client_id', selectedClientIds)`. A single-client deep-link (`?client=`) still focuses one. Clients only ever see their own.
- **Per-client colour.** Each post card/chip is **filled with its client's `calendar_colour`** (text colour auto-chosen by luminance, `lib/colour.ts`), with the workflow **status as a dot**. A **colour→client legend** shows in combined view. Null-colour clients get a stable palette fallback at render.
- **Create/edit posts** (`create_post`/`update_post`) — body versioned; status-aware editing (in-place vs fork).
- **Content grid (0042)** — a third content-page view (`?view=grid`, **agency-only**, alongside Week/Month) — a dense, Monday-style **production tracker**: posts **grouped by client** with the production fields as columns (Designer, Design status, Boost, Ad budget, Drive / High-res / Posted links, Date posted; Status + Posted Yes/No + PM read-only). **One source of truth** — it renders the *same* `filtered` posts as the calendar (month-scoped via the existing windowed query; no parallel fetch) and inherits the agency archived filter. **Metadata cells are inline-editable** (save-on-blur/change, optimistic, revert-on-error) via `set_post_meta`; **status/title/date are read-only** (changed through the drawer/approval flow); the row title opens the existing `Drawer`. The same fields are also editable in the drawer's **Production details** section. Production metadata edits use `set_post_meta`, which **does not fork a version or change status**.
- **Drag-to-reschedule (0038)** — **agency-only**: drag a post card onto another day (week or month view) to move it. The shift is **date-only, Malta-correct** — the post keeps its Malta-local time-of-day (`rescheduleToDateMalta`), never a UTC shift. Optimistic with revert-on-error (kanban pattern). Dropping on a **past day** opens a confirm that always confirms the move and offers **"Mark as posted"** only for eligible posts (`approved`/`scheduled`); the RPC re-checks so a draft/review post can never jump to posted. Clients get **no drag** (the home calendar is shared; the affordance is gated on `isAgency`). Uses `reschedule_content_item`, a dedicated path that does **not** fork a version.
- **Approval workflow** (`transition_post`) — the state machine, every move logged, history timeline in the drawer.
- **Comments** (`add_comment`/`delete_comment`).
- **Internal notes (0039)** — **agency-only** notes on a post *and* on a task, from one polymorphic `internal_note` table and one reusable `InternalNotes` component mounted in two places: a distinct "Internal notes — not visible to the client" block in the post drawer (agency-only, visually separate from client Comments) and inside the task modal. Lists author + timestamp (with "edited"), an add box, and **edit/delete on the author's own notes only** (`add/update/delete_internal_note`). Errors surfaced. Clients never see them (pgTap leak-guard, below).
- **Media** — upload, signed-URL display, drag-reorder, version-fork copy.
- **Asset links (0026)** — labelled links per post in the drawer (`AssetLinksSection`), agency add/edit/delete/drag-reorder via server actions → RPCs; preset labels (Drive folder / Raw footage / Final exports / Other→free-text); clients read-only; a small link glyph on cards that have links.
- **Calendar filters** (client-side, both views): status filter (role-gated options — clients never see `draft`), channel filter (from loaded posts), and a role-aware **"Needs my review"** toggle (agency → `internal_review`+`changes_requested`; client → `client_review`). "Showing N of M" + Clear. (The Clients filter, by contrast, is URL-driven because it scopes the server query.)

### Internal management layer
- **Tasks (0028)** — agency-only `/tasks` with **three lenses** via a URL-persisted switcher (`?view=list|kanban|calendar`, default List); one filtered set feeds all three (owner/status filters apply everywhere; sort in List):
  - **List** — scannable table (title, client dot, type, owner, status/priority pills, due with overdue flag, next action); one-click mark-complete, edit/delete.
  - **Kanban** (`TaskKanban`) — 6 status columns; **native HTML5 drag-and-drop** a card → `update_task` (optimistic, reverts via `router.refresh()` on error).
  - **Calendar** (`TaskCalendar`) — Europe/Malta month grid by `due_date` + a **"No date" tray**; chips open the edit modal; overdue in the warning colour.
  - Shared add/edit **modal** uses `lib/taskConstants.ts`; clients have a "No client / internal" option. Writes via `create/update/delete_task`. Errors surfaced.
- **Content ↔ task bridge (0031)** — a post's drawer lists its linked tasks + **"Add task for this post"** (opens the task modal prefilled with the post's client + `content_item_id`); the task list/modal show which post a task **serves** (links back to it). New tasks **default their owner to the client's Lead PM** (`client_ownership.lead_pm_id`) when a client is picked — editable, not a lock. Manual only (no auto-spawn yet).
- **RACI matrix (0027, editable 0032)** — the responsibility grid, now **editable in the Admin area** (`/admin/raci`) via `set_raci_matrix`. Seeded for Mood Agency.
- **Task subscriptions & notifications (0041)** — every task has subscribers (owner / accountable=client Lead PM→RACI `A` fallback / creator; manual reserved), seeded on create and re-seeded on owner change. **Assignment** and **status changes** notify all subscribers except the actor, surfaced in the existing bell (routing to `/tasks`). Email is sent only for meaningful events (assignment, Complete, Waiting on Client, On Hold, Ready for Review); all other status changes are **in-app only**. See §12.

### Admin area (0032, 0033, 0035)
`/admin` — **agency_admin only** (nav `adminOnly`, `admin/layout.tsx` hard-redirect, and the RPCs re-check admin server-side). A settings landing structured to grow (a `SECTIONS` array):
- **RACI matrix editor** (`/admin/raci`, 0032) — a 15 × N grid of dropdowns (`—`/A/R/S/C/I/A/R), prefilled, one **Save** → replace-all via `set_raci_matrix`.
- **Team access** (`/admin/access`, 0033) — lists agency users (via `list_agency_members`) with an Admin/Member toggle per person (`set_member_role`); the **last admin's toggle is disabled** ("At least one admin is required"), mirroring the RPC's lockout guard. Also hosts the **agency invite panel** (0035) — invite teammates by email + a pending-invite list with Revoke.

### Approval & versioning
- Client Approve / Request-changes surfaced in the drawer for `client_review` posts (role-aware action set; note required for request_changes).
- Snapshot-on-send versioning (§10), agency + client version-history viewers.

### Client portal
- Access model + invite toggle (0013), **claim-on-login** (callback → `accept_pending_invites` then `claim_client_access`), restricted client calendar + nav gating, client-authorised transitions (0017). Portal access can now also be granted by an explicit **invite** (0035), not only the contact portal-access toggle.
- **Real revocation (0020):** `set_contact_portal_access(..., false)` now also **deletes** the user's client-scope membership for that client (tightly scoped — agency/other-client memberships untouched), so an already-logged-in contact loses access immediately.

### Notifications
Data layer + emit (0019), enriched copy (0023), in-app bell, email Edge Function, **task subscriptions + task events with an in-app-only vs email flag (0041)** (§12).

### Agency dashboard
`/dashboard` (agency-only): a cross-client "needs attention" view aggregating `content_item` across **all** the agency's clients via RLS (no client filter). Sections — "Needs your action" (`internal_review`/`changes_requested`), "Awaiting client" (`client_review`, flagging items aged > 3 days), and a richer **task summary**: a prominent **overdue count** plus open-task breakdowns **By status** (→ `/tasks?status=`), **By owner** (→ `/tasks?owner=`), and **By client**. Each content row deep-links to the post. Read-only.

### Capacity report (0043; relocated to `/reports`)
The **Capacity** tab on `/reports` (`lib/capacity.ts` + `CapacityPlanner`; **moved here from `/dashboard`**). It leads with a **team + per-person utilisation %** — planned hours vs *available*, where available = 40h/week × weeks in the period and headcount comes from the **active roster** (every active member gets a row; idle members show at **0% = free**, sorted most-loaded first) — above a **per-week grid** (loaded members only, no empty rows) of **per-person allocated hours vs a 40h/week baseline**. Each qualifying task's `estimated_hours` is **spread evenly across the Monday-based (Europe/Malta) weeks from `start_date` to `due_date`** (`estimated_hours / N` per week); rows are owners, columns are weeks. **Range control** via `?cap=` (5/8/13/26/52): **≤ 8 weeks → week columns**, beyond that **→ month aggregation** (each week assigned to its Monday's month; month capacity = 40 × in-range weeks). **Honesty buckets** per person keep the numbers truthful: `unscheduled` (estimated but undated — total hours), `unestimated` (open, no estimate — count), `on hold` (count). Deliberate decisions: **archived-client tasks DO count** (committed load is load — this section intentionally ignores the dashboard's `showArchived` filter); **On Hold** is excluded from hours but **counted** in its bucket (Complete is excluded entirely); **due-only** → all hours in the due week, **start-only** → the start week, **undated** → the unscheduled bucket. Pure computation — no migration, no writes.

### Timesheets (0044)
Internal time logging per client (agency-only; **no client visibility**). On a client with `timesheet_enabled` (admin toggle on the client page, via `set_client_timesheet_enabled`), a **Timesheet** section (`TimesheetSection`): a **DB-backed running timer** (state lives in the open `time_entry`, so it survives refresh/navigation; live elapsed tick; **Stop offers an adjustable end time**; **one running timer per user**, DB-enforced — starting a second is blocked), a **manual log** form, and an **entries list** (person, task/note, start, end, total) with **owner edit/delete**. Time logs against a client and optionally a client task. RPCs: `start_timer`/`stop_timer`/`log_time`/`update_time_entry`/`delete_time_entry` (owner-scoped, agency-for-client). The `timesheet_enabled` flag gates the UI only — the RPCs are permissive.

**Global "+ Log time" (agency-only).** A top-bar entry point (`LogTimeLauncher`/`LogTimeModal`, in the `TopBar`, shown only to agency users) opens a modal to log a *completed* entry against any **timesheet-enabled** client from anywhere. The **Job** field is one combobox: pick an open task of the selected client (→ `task_id`), type free text (→ `note`, unattributed time), or **create a task on the fly** (`createTaskAndLogTimeAction` → `create_task` with owner = the caller's own `team_member`, then `log_time`). Start/end are Malta wall-clock, converted to UTC via **`maltaInputToISO`** (`lib/week.ts`) — never a naive `new Date()`. The modal **portals to `document.body`** so its fixed overlay escapes the top bar's `backdrop-filter` containing block. Server actions in `app/(app)/timeLogActions.ts` (`logTimeAction`, `createTaskAndLogTimeAction`).

### Job value & profitability (0045–0047)
Revenue + cost inputs and a margin report:
- **Job value on tasks (0045)** — `value`, `value_client_visible` (gate only, no client read path yet), `invoice_status` (not invoiced / invoiced / paid) on the task form + grid (`€500 · not invoiced`). Captured via `create_task`/`update_task`.
- **Agency cost-per-hour (0046, hardened 0047)** — a flat blended internal rate, **admin-only** (`Admin → Cost per hour`, `set_agency_cost_per_hour`). Stored in **`agency_internal`** (admin-only RLS), not the member-readable `agency` table.
- **Profitability report (0047)** — the **Profitability** tab on `/reports`, **agency-admin only**: per-job rows grouped by client — **Value** (full price, not date-split), **Cost** (in-range time × rate), **Margin**, **Margin %**, **Invoice** — with a per-client **"Unattributed time"** line (client-direct time, `task_id` null) so client totals reconcile, per-client subtotals + grand total, and per-client **outstanding to invoice** (sum of not-invoiced value). Date-range presets (day/week/month/quarter/year/custom, Malta) + a **client multiselect**. A **null-rate notice** when no cost rate is set (no fake 100% margins) and an **honesty caveat** (value isn't date-distributed). `lib/profitability.ts` + `lib/reportRange.ts` (pure); `ProfitabilityReport` component. **Margins live ONLY here** — the tab and its financial fetch render **only for admins** (a non-admin's `?report` is coerced to Time, so the cost/value queries never run); the member-visible **Time** and **Capacity** tabs show hours, never euros.

### Reports shell + Time report (member-visible, tabbed)
`/reports` is open to **all agency members** and shows **one report at a time** via `ReportTabs` (`?report=time|capacity|profitability`, default `time`; the Profitability tab renders only for admins). Only the active tab's data is fetched. **SECURITY:** a non-admin's `?report` can never resolve to `profitability` (coerced to `time`), so the financial branch — fetch and render — is unreachable for them. The member-visible **Time** report (`lib/timeReport.ts` pure + `TimeReport`) aggregates completed `time_entry` over a date range into **team total hours**, **by client** and **by person** distributions (framed as workload distribution, not a ranking — `time_entry` RLS `is_agency_member` makes team-wide hours member-visible by design), plus an **unattributed (no task)** line. Filters: shared `?range`/`?from`/`?to` + a **client** and a **people** multiselect; the query selects no financial columns. Capacity keeps its own forward-looking `?cap` presets.

### Security (all pgTap-proven)
Content read floor (0015), content tables RPC-only (0016), client transitions (0017), media table + storage policies (0018), notification RLS (0019), revoke (0020), versioning guards (0021), client version filter (0022), media reorder authorisation (0024), asset-link read floor + RPC auth (0026), task RLS + RPC auth (0028), client_ownership RLS + RPC auth (0030), RACI admin-write auth (0032), member-role admin-write + last-admin lockout (0033), team-member edit/deactivate auth (0034), invite create/accept auth incl. the client→agency leak guard (0035), permanent-delete auth + reassign/cascade + RACI merge (0036), view-preference own-rows RLS (0037), reschedule auth + mark-posted state-machine guard (0038), internal-note RPC auth + per-row agency resolution incl. the **client-leak guard** (0039), client status-setter auth + value validation (0040), task-subscriber RLS + seeding/event-actor-exclusion + cross-tenant (0041), set_post_meta auth + no-fork + cross-tenant (0042), task value/invoice validation + 0041/0043 regression guards (0045), agency cost-per-hour admin-only setter (0046), agency_internal admin-only read RLS + relocated cost rate (0047).

---

## 14. RPC reference

All RPCs are `SECURITY DEFINER` with `set search_path=''` and an `auth.uid()` null-check; authorisation is enforced in the body. Listed by area.

### Content & approval
| RPC | Signature (key params) | Auth | Notes |
|---|---|---|---|
| `create_post` | `(client_id, channel_id?, title?, content_type?, scheduled_at?, body?) → uuid` | agency-for-client | Creates the item + v1, sets `current_version_id`. |
| `update_post` | `(item_id, title, channel_id, scheduled_at, body) → jsonb` | agency-for-client | In-place for mutable statuses; **forks v2** for frozen statuses, returns `[{old_path,new_path}]` media pairs. |
| `reschedule_content_item` | `(id, scheduled_at, mark_posted=false) → void` | agency-for-client (no client path) | Date-only move (drag-to-reschedule). **Never forks** — unlike `update_post`. `mark_posted` → `posted` **only** from `approved`/`scheduled`, else ignored. |
| `set_post_meta` (0042) | `(id, designer_id?, design_status?, drive_url?, high_res_url?, boost=false, ad_budget?, date_posted?, posted_url?) → void` | agency-for-client (no client path) | Production-metadata setter for the content grid / drawer Production details. **No version fork, no status change.** Validates `designer_id` is a team member of the post's agency. **Full overwrite** of all metadata columns (see §16). |
| `transition_post` | `(item_id, action, note?) → text` | agency any; client only `approve`/`request_changes` from `client_review` | State machine, logs `approval_event`, emits notifications. |
| `add_comment` | `(item_id, body) → uuid` | member of the client | Emits comment notifications. |
| `delete_comment` | `(comment_id) → void` | author or agency | |
| `get_post_versions` | `(item_id) → setof (version_id, version_no, body, internal_note, created_by, created_at, is_current, events jsonb, media jsonb)` | agency = all; client = sent versions only | Per-version client filter on `approve_internal`; nulls `internal_note` for clients; media ordered by `sort_order`. |

### Internal notes (0039)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `add_internal_note` | `(parent_type, parent_id, body) → uuid` | agency member of the parent's agency | Validates `parent_type`/body; resolves agency (post→client→agency; task→agency_id); inserts `author_id = auth.uid()`. |
| `update_internal_note` | `(id, body) → void` | **author only** | Non-empty body; sets `updated_at`; raises if not found / not the author. |
| `delete_internal_note` | `(id) → void` | **author only** | Raises if not found / not the author. |

> Read access is the RLS policy via the `can_see_internal_note(parent_type, parent_id)` SECURITY DEFINER helper, not an RPC.

### Media
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `add_media` | `(version_id, storage_path, mime_type?, size_bytes?) → uuid` | agency-for-client | |
| `delete_media` | `(media_id) → void` | agency-for-client | |
| `reorder_media` | `(version_id, ordered_ids uuid[]) → void` | **agency-only** | Sets `sort_order` to array index; **only touches media of `version_id`**. |

### Asset links (0026)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `add_asset_link` | `(content_item_id, label, url) → uuid` | agency-for-client | Appends at `max(sort_order)+1`. |
| `update_asset_link` | `(link_id, label, url) → void` | agency-for-client | |
| `delete_asset_link` | `(link_id) → void` | agency-for-client | |
| `reorder_asset_link` | `(content_item_id, ordered_ids uuid[]) → void` | **agency-only** | Scoped to that post's links. |

### Tasks (0028)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `create_task` | `(… 0043 params …, value?, value_client_visible?, invoice_status?)` → uuid | agency (derives agency from membership) | Validates client / owner / content item belong to the agency. `content_item_id` (0031) links the task to a post. **Seeds subscribers + emits an assignment notification (0041).** Validates `estimated_hours >= 0`, `start_date <= due_date` (0043), `value >= 0` + `invoice_status` in set (0045). Each param-adding migration (0031/0041/0043/0045) **drops the exact prior signature then recreates the full body** (duplicate-function trap, §16). |
| `update_task` | `(task_id, … same fields incl. content_item_id, estimated_hours, start_date …) → void` | agency member of the task's agency | **Full replace** (sets `updated_at`); mark-complete re-sends all fields with `status = 'Complete'`; kanban drag re-sends with the new `status`. **Re-seeds subscribers on owner change; emits assignment/status notifications (0041)** comparing the pre-update owner/status. Same capacity validation (0043). |

> **0043 (capacity fields):** adding `estimated_hours`/`start_date` changed the signatures, so the migration **drops the exact 0041 signatures then recreates the full 0041 bodies** verbatim (subscription seeding + events) plus the two params — avoiding a stale function overload (the "duplicate-function trap", §16).
| `delete_task` | `(task_id) → void` | agency member of the task's agency | |

> **Task subscription internals (0041, SECURITY DEFINER helpers):** `_task_accountable_user(task_id)` (Lead PM → RACI `A` fallback → user), `_seed_task_subscribers(task_id)` (replace derived owner/accountable/creator rows, preserve manual, most-specific source wins), `_notify_task(user_ids[], type, task_id, actor_id, body, email)` (one row per subscriber, skips the actor).

### Admin (0030, 0032, 0033)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `set_client_ownership` | `(client_id, lead_pm_id?, comms_backup_id?, creative_lead_id?, design_owner_id?, content_owner_id?, video_owner_id?, sales_ops_id?, intern_support_id?) → void` | agency-for-client | Upsert (1:1); validates every assignee belongs to the client's agency. |
| `set_raci_matrix` | `(agency_id, cells jsonb) → void` | **agency_admin of that agency** | Transactional replace-all of the grid; validates team members; skips blank cells. |
| `set_member_role` | `(target_user_id, agency_id, role) → void` | **agency_admin of that agency** | Promote/demote between `agency_admin`/`agency_member`; validates the role + existing membership; **last-admin lockout**; casts `role::member_role`. |
| `list_agency_members` | `(agency_id) → table(user_id, role, full_name, email)` | **agency_admin of that agency** | Read helper — `membership` is own-rows-only under RLS; resolves name from `team_member`, email from `auth.users`. |
| `set_agency_cost_per_hour` (0046, →`agency_internal` 0047) | `(agency_id, rate) → void` | **agency_admin of that agency** | Sensitive cost data. Upserts `agency_internal.cost_per_hour`; `rate >= 0` (null = unset). |

### Timesheets (0044)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `start_timer` | `(client_id, task_id?, note?) → uuid` | agency-for-client | Rejects a second running timer; validates task belongs to the client. |
| `stop_timer` | `(entry_id, ended_at?) → void` | **owner only** | Accepts an explicit end (fix a forgotten timer); computes `duration_minutes`; rejects already-stopped / end ≤ start. |
| `log_time` | `(client_id, task_id, started_at, ended_at, note?) → uuid` | agency-for-client | Manual completed entry; `end > start`. |
| `update_time_entry` / `delete_time_entry` | `(entry_id, …) → void` | **owner only** | Correct/remove an entry. |
| `set_client_timesheet_enabled` | `(client_id, enabled) → void` | **agency_admin of the client's agency** | Toggles the timesheet UI for a client. |

### Team directory (0034)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `update_team_member` | `(id, full_name, role, email, is_active) → void` | agency member of the member's agency | Edit a member; rejects empty `full_name`. |
| `set_team_member_active` | `(id, is_active) → void` | agency member of the member's agency | Quick soft-deactivate/reactivate toggle. |

### Invites (0035)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `create_invite` | `(email, scope_type, scope_id, role) → uuid` | **agency_admin** of the scope's agency | Validates the scope/role combo (agency→`agency_member`; client→`client_approver`/`client_viewer`), ownership of the scope (the **cross-tenant guard**), and no duplicate pending invite. |
| `revoke_invite` | `(id) → void` | **agency_admin** of the scope's agency | Sets `status='revoked'`. |
| `accept_pending_invites` | `() → int` | self (on login) | Reads the caller's email from `auth.users` (**never a param**); grants membership straight from each live pending invite (scope/role), links the directory row by email, marks accepted. Idempotent; grants nothing not backed by a pending invite. |

### Permanent delete (0036)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `delete_team_member` | `(id, successor_id) → void` | **agency_admin** of the member's agency | Two-step: member must be **inactive** and have **no linked login**. Reassigns tasks / account ownership / 8 ownership slots / RACI (with merge) to the successor, then deletes. |
| `delete_client` | `(id) → void` | **agency_admin** of the client's agency | Two-step: `status='archived'`. Deletes non-cascading children (task, client-scoped membership/invite) then the client (cascades the rest). DB-only — storage not purged. |

### View preferences (0037)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `set_view_preference` | `(view_key, config jsonb) → void` | self (logged-in) | Upserts the caller's own `(user_id, view_key)` row. No admin gate. Validates `config` is a JSON array. |

### Portal & CRM
| RPC | Signature | Auth |
|---|---|---|
| `claim_client_access` | `() → int` | self (on login) — inserts membership for portal-enabled contacts matching the user's email |
| `set_contact_portal_access` | `(contact_id, enabled) → void` | agency-for-client — on revoke, also deletes the matching client-scope membership |
| `create_client` / `update_client` | CRM (incl. `p_brand_colour`, `p_calendar_colour`) | agency / can-admin |
| `set_client_status` (0040) | `(client_id, status) → void` — lightweight archive/reactivate; validates status ∈ prospect/active/paused/archived | agency member of the client's agency |
| `add_team_member` | team directory | agency |
| `add_contact` / `update_contact` / `delete_contact` | contacts | agency-for-client |
| `add_brand_asset` / `update_brand_asset` / `delete_brand_asset` | brand assets | agency-for-client |
| `add_client_deliverable` / `update_client_deliverable` / `delete_client_deliverable` / `reorder_client_deliverable` (0051) | agreed deliverables — validates the cadence; `add` appends at next `sort_order`, `reorder` reindexes by array position | agency-for-client |
| `add_channel` / `delete_channel` | channels | agency-for-client |

### Notification internals (SECURITY DEFINER helpers)
`_notify(user_ids[], type, content_item_id, actor_id, body)` (content; rows default `email=true`), `_agency_user_ids_for_client(client_id)`, `_portal_user_ids_for_client(client_id)`, and the task variant `_notify_task(user_ids[], type, task_id, actor_id, body, email)` (0041).

### RLS helpers
`is_agency_member()`, `is_agency_for_client(client_id)`, `is_client_user()`, `client_ids_for_user()`, `can_admin_agency(...)`.

---

## 15. Migration ledger

Numbered SQL files in `migrations/`, run **manually** in the Supabase SQL editor, idempotent (`create … if not exists`, `drop policy if exists` then create, `create or replace`). Security-sensitive migrations ship a `NNNN_*_test.sql` pgTap test.

| # | File | What it does |
|---|---|---|
| 0001 | client_crm | `client` extra fields; `client_internal` (agency-only sensitive data). |
| 0002 | client_write_policy | First (buggy) attempt at a client write policy — superseded. |
| 0003 | client_write_secdef | `can_admin_agency` SECURITY DEFINER helper. |
| 0004 | create_client_rpc | `create_client` RPC — established the "writes via RPC" convention. |
| 0005 | team_directory | `team_member` table + `add_team_member`. |
| 0006 | edit_client | `update_client`. |
| 0007 | client_contacts | `client_contact` table + contacts CRUD + single-primary. |
| 0008 | brand_assets | `brand_asset` table + CRUD. |
| 0009 | channels | channel RPCs (`add_channel`/`delete_channel`). |
| 0010 | create_post | `create_post` (item + v1 + current pointer). |
| 0011 | approval | `transition_post` (state machine) + `approval_event`. |
| 0012 | comments | `add_comment` / `delete_comment`. |
| 0013 | portal_access | portal access model, `set_contact_portal_access`, `claim_client_access`. |
| 0014 | edit_post | `update_post` (in-place body edit; locked once client-facing). |
| 0015 | content_rls (+test) | **Content read floor** — status-aware RLS on content tables. |
| 0016 | close_write_sidedoor (+test) | Remove permissive write policies — content tables become RPC-only. |
| 0017 | client_transitions (+test) | Client `approve`/`request_changes` authorisation inside `transition_post`. |
| 0018 | media (+test) | `media` table, private bucket, status-gated storage policies. |
| 0019 | notifications (+test) | `notification` table + RLS + `_notify` + resolvers + emit in transition_post/add_comment. |
| 0020 | revoke_access (+test) | Revoke now deletes the client-scope membership (real revocation). |
| 0021 | versioning (+test) | Snapshot-on-send: `uq_version_no`, `current_version_id` FK, status-aware `update_post` fork. |
| 0022 | post_versions (+test) | `get_post_versions` role-filtered RPC (client sees only sent versions). |
| 0023 | notification_copy (+test) | Enrich notification bodies with client name + title (transition_post/add_comment). |
| 0024 | media_sort (+test) | `media.sort_order` + backfill + index, `reorder_media`, fork carries order, reads order by sort_order. |
| 0025 | calendar_colour | `client.calendar_colour` column; `create_client`/`update_client` gain `p_calendar_colour` (drop+recreate for the new arg). `brand_colour` untouched. |
| 0026 | post_asset_links (+test) | `post_asset_link` table + status-aware read floor + `add/update/delete/reorder_asset_link`. |
| 0027 | raci_matrix | `raci_matrix` reference table (agency-scoped read, no writes) + seed for Mood Agency (with a fail-loud name guard). |
| 0028 | tasks (+test) | `task` table (agency-scoped, internal-only) + `create/update/delete_task`. |
| 0029 | drop_legacy_asset | Drops the unused legacy `asset` table (+ its status-less `asset_read` policy via cascade); removed from `schema.sql` too. |
| 0030 | client_ownership (+test) | `client_ownership` 1:1 table (agency-only, internal staffing) + `set_client_ownership` upsert RPC. |
| 0031 | task_content_link | `task.content_item_id` (nullable, on delete set null); `create_task`/`update_task` gain `p_content_item_id` (drop+recreate). |
| 0032 | raci_edit (+test) | `set_raci_matrix` RPC — agency_admin-only transactional replace-all of the grid. No table change. |
| 0033 | set_member_role (+test) | `set_member_role` (admin-only promote/demote with last-admin lockout) + `list_agency_members` read helper. No table change. |
| 0034 | team_member_edit (+test) | `update_team_member` + `set_team_member_active` (edit + soft-deactivate/reactivate; agency-scoped auth). No table change. |
| 0035 | invites (+test) | `invite` table (agency + client scopes, admin-read RLS, RPC-only) + `create_invite`/`revoke_invite`/`accept_pending_invites`. Magic-link-native; accept-on-login. |
| 0036 | permanent_delete (+2 tests) | `delete_team_member` (reassign-then-delete) + `delete_client` (guarded cascade) — both admin-only + two-step. No table change. |
| 0037 | view_preferences (+test) | `user_view_preference` table (own-rows-only RLS) + `set_view_preference` upsert RPC. Per-user column prefs. |
| 0038 | reschedule_post (+test) | `reschedule_content_item` — agency-only date-only move (no version fork) + state-machine-guarded `mark_posted`. No table change. |
| 0039 | internal_notes (+test) | `internal_note` polymorphic table (post/task, agency-only, no client path) + `can_see_internal_note` RLS helper + `add/update/delete_internal_note`. Client-leak guard pgTap-proven. |
| 0040 | set_client_status (+test) | `set_client_status` — lightweight agency-authorised archive/reactivate (validates the status value). No table change. |
| 0041 | task_subscriptions (+test) | `task_subscriber` table + `notification.email`/`task_id` columns; RACI-seeded subscriptions (owner/accountable/creator) + task event notifications via `create_task`/`update_task` + `_notify_task`/`_seed_task_subscribers`/`_task_accountable_user`. Email only for meaningful events; rest in-app only. |
| 0042 | post_production_meta (+test) | Production-metadata columns on `content_item` (designer_id, design_status, drive/high-res/posted urls, boost, ad_budget, date_posted) + `set_post_meta` — no-fork, full-overwrite, agency-only setter. Backs the content grid + drawer Production details. |
| 0043 | task_capacity_fields (+test) | `task.estimated_hours` + `start_date` (capacity planning). Extends `create_task`/`update_task` (drops the 0041 signatures, recreates the full 0041 bodies + the two params + `estimated_hours>=0` / `start<=due` validation). Field layer for the capacity planner (now the Capacity tab on `/reports`). |
| 0044 | timesheets (+test) | `client.timesheet_enabled`; `time_entry` table (agency-read RLS, one-running-timer partial unique index) + `start_timer`/`stop_timer`/`log_time`/`update_time_entry`/`delete_time_entry` + `set_client_timesheet_enabled`. |
| 0045 | task_job_value (+test) | `task.value` + `value_client_visible` + `invoice_status` (CHECK). Extends `create_task`/`update_task` (drops the 0043 signatures, recreates the full bodies + three params + value/invoice validation). Revenue input. |
| 0046 | agency_cost_per_hour (+test) | `agency.cost_per_hour` (later relocated, 0047) + admin-only `set_agency_cost_per_hour`. Cost input. |
| 0047 | agency_internal (+test) | Moves `cost_per_hour` to a new **admin-only `agency_internal`** table (RLS = agency_admin only); migrates the value, drops the agency column, repoints the setter. Closes the member-readable cost-rate leak. |
| 0048 | close_client_internal_sidedoor (+test) | Drops the legacy permissive `client_internal_write` policy (the last write side-door, predates the 0016 RPC-only convention) + adds a CHECK constraining `raci_matrix.raci_value` to the legal set. |
| 0049 | extend_invite (+test) | `extend_invite` — admin-only reset of an invite's 7-day expiry. |
| 0050 | update_client_preserve_status (+test) | `update_client` defaults `p_status`/`p_timezone`/`p_currency` to null and coalesces each to the existing value, so a field the caller omits is preserved — root-causes the status-revert. Repo record of a live hand-edit. |
| 0051 | client_deliverables (+test) | `client_deliverable` table (agency-only CRM: `label`/`quantity`/`cadence`/`notes`/`sort_order`; RLS = agency-for-client, no client path) + `add`/`update`/`delete`/`reorder_client_deliverable` RPCs. Records agreed deliverables per client (retainers). No `client_visible` flag in v1. |
| 0052 | post_caption_visual | Adds `content_version.visual_content` (a second versioned, client-visible content field) + extends `create_post` / `update_post` / `get_post_versions` to read/write it. UI splits the post body into Visual content + Caption. |

> `schema.sql` is the fresh-setup reference **only** — it has a destructive reset block at the top; **never run it against the live DB.** New changes go in a migration.

---

## 16. Conventions & hard-won gotchas

**Do not regress these:**

- **Next.js 16 middleware** is `proxy.ts` (exports `proxy`), NOT `middleware.ts`. Never recreate `middleware.ts`. `next build` does not lint.
- **Route group:** all authenticated pages live under `app/(app)/` with the shared `layout.tsx` auth gate. `/login` and `/auth` stay OUTSIDE the group (no shell). Don't move authed pages out.
- **Auth callback is client-side** (`app/auth/callback/page.tsx`) — handles hash (implicit) + `?code` (PKCE) and calls `claim_client_access()`. Do not convert to a server route.
- **RLS is ON and is the read floor.** Rows are invisible without a `membership`.
- **ALL content writes go through SECURITY DEFINER RPCs.** No permissive write policies on content tables (an inline RLS `WITH CHECK` subquery on `membership` silently fails). Authorisation is inside each RPC.
- **Storage:** private bucket; display via batched `createSignedUrls`; never `getPublicUrl`; `<img>` not `next/image`; upload path `<client_id>/<content_item_id>/<version_id>/<filename>`.
- **Dates** are Europe/Malta, week starts Monday — use `lib/week.ts`; bucket posts by real date, never weekday. For a **date-only move** preserving time-of-day, use `rescheduleToDateMalta` (shifts by Malta wall-clock, not UTC) — never add/subtract on the UTC instant.
- **`update_client` now preserves status/timezone/currency on omit (0050); still prefer `set_client_status` for status-only changes (0040).** The status-revert — saving an unrelated field via the edit form reverted an "Archived" client to "Active" — was root-caused: `update_client` defaulted `p_status`/`p_timezone`/`p_currency` to `'active'`/`'Europe/Malta'`/`'EUR'` and its writes (`status = coalesce(p_status,'active')` etc.) reset any field the caller didn't resend. **0050** defaults those three params to null and coalesces each to the existing value, so an omitted field is preserved. `set_client_status(client_id, status)` stays the lightweight, single-field path for archive/reactivate — the clients-list actions still use it — and remains the right tool for a status-only change, since `update_client` still resends every other field.
- **Polymorphic tables have no FK safety net — resolve the parent's agency per-row (0039).** `internal_note.parent_id` points at either `content_item` or `task` by `parent_type`, so there's no foreign key to lean on. Both layers must resolve the parent's agency themselves and gate on membership: the **RLS read** via `can_see_internal_note(parent_type, parent_id)` (`post → is_agency_for_client(client_id)`; `task → is_agency_member(agency_id)`), and **every write RPC** by resolving `agency_id` from the parent before inserting. A missing parent resolves to null → the helpers return false → fails closed. The **client-leak guard** (a client cannot read internal notes on their own post) is pgTap-proven. If you add another polymorphic parent table, extend both the helper and the RPCs — don't assume an FK will catch a bad `parent_id`.
- **Reschedule bypasses `update_post` on purpose (0038).** `update_post` **forks a new version and bounces frozen posts to `internal_review`** — correct for a body/title edit, catastrophic for a drag-to-reschedule (it would silently un-approve a post and spawn a spurious v2). Drag-to-reschedule therefore uses the dedicated `reschedule_content_item`, which only writes `scheduled_at` (+ optional `mark_posted`). Don't reroute it through `update_post`.
- **Adding params to an RPC → drop the exact old signature first (the duplicate-function trap).** `create or replace function` only replaces when the argument signature matches. Adding a parameter changes the signature, so `create or replace` silently creates a **second overload** and leaves the old one — then PostgREST may resolve to the wrong one. When a migration adds params (e.g. 0031 task content link, **0043 capacity fields**), it must `drop function if exists public.fn(<exact old arg types>)` first, then `create`. And it must **reproduce the full current body** (0043 re-pasted the whole 0041 `create_task`/`update_task` bodies — subscription seeding + events — so that behaviour wasn't lost). Verify live signatures via `pg_proc` before editing.
- **`set_post_meta` is a full-overwrite of all metadata columns → last-write-wins (0042).** It writes every production-metadata column on each call (the content-grid cells can't send a partial patch and have the rest preserved), so the caller must always send the row's *complete* current metadata — the grid/drawer hold per-row state and do exactly this. The consequence: **concurrent edits to the same post's metadata are last-write-wins at the row level** — if two people edit different cells of the same post at the same time, the later save overwrites the earlier with its (stale) values for the other cells. This is a **known, accepted limitation at current team scale**; if it becomes a problem, move to per-column setters or column-level merge. (Like `reschedule_content_item`, `set_post_meta` does **not** fork a version or change status.)
- **Migrations are manual + idempotent.** Apply schema changes to live **before** pushing app code that depends on them.
- **Enum columns — cast text to the enum in RPCs.** `membership.role` is `public.member_role` and `content_item.status` is `content_status` (both enums). An INSERT of a string *literal* coerces automatically, but assigning a text *variable/param* does not — `set role = p_role` fails with a type mismatch. Validate the value, then cast: `set role = p_role::public.member_role` (see `set_member_role`).
- **PostgREST embed ambiguity (PGRST201).** When **two FKs** connect the same pair of tables, an unqualified embed (`versions:content_version(...)`) becomes ambiguous and the whole query errors. This bit us when 0021 added `content_item.current_version_id → content_version` alongside the existing `content_version.content_item_id → content_item`: the calendar query now **must** name the FK — `versions:content_version!content_version_content_item_id_fkey(...)`. Single-FK embeds (e.g. `post_asset_link`, `task.client_id`, `task.owner_id`) need no hint. If you add an FK between two already-related tables, disambiguate their embeds.
- **Fail loudly — don't swallow query errors.** Always destructure `{ data, error }` and surface/log it. The ambiguity bug above hid for a while because the calendar discarded `error` and rendered a silent empty grid. The calendar (and `/tasks`, `/dashboard`) now log the error and show a visible "Couldn't load… Please refresh." notice instead of an empty view.
- **`tsconfig` excludes `supabase/`** so Next's `tsc` doesn't type-check the Deno Edge Function.
- **Style:** British English, write like a person (avoid AI-tell phrasing), lean and direct, clean/minimal UI (white canvas, hairline grid, status dots). Show a plan/diff before large changes; small reviewable steps; commit after each working feature.

---

## 17. Testing (pgTap)

Security-sensitive migrations ship a pgTap test runnable in the **hosted** Supabase SQL editor (no `basejump`). Proven pattern:

- `create extension if not exists pgtap;`
- Create a temp `_t (seq int, line text)` + `select plan(N);` **before** any role switch.
- **Drive the caller** by setting the `request.jwt.claims` GUC (which `auth.uid()` reads). For SECURITY DEFINER function tests you can stay as the owner and only vary the GUC; for direct-RLS tests use `set local role authenticated` + the GUC, and drop to `set local role postgres` (not `reset`) to read true state.
- Aggregate TAP lines into `_t`, then emit via a final `select … union all select … from finish()` ordered by `seq` (the hosted editor shows only the last statement's result). **Number `_t` rows in pgTap call order** so the emitted TAP is sequential.
- `throws_ok(sql, '<sqlstate>')` 2-arg form (3-arg mis-binds); `is_empty`/`isnt_empty` for silent RLS reads; `auth.users` test rows need only `id` + `email`; wrap in `begin; … rollback;`.

All security migrations from 0015 onward are proven this way.

---

## 18. Operational runbook

### Apply a migration
1. Open the Supabase SQL editor for project `vwicrmwjatrphjviedce`.
2. Paste and run `migrations/NNNN_*.sql`.
3. **After any migration that adds tables/columns/relationships, refresh the PostgREST schema cache:** run `notify pgrst, 'reload schema';`. Without it the API can return "Could not find a relationship…" / "column does not exist" errors until the cache catches up.
4. If it ships a test, run `migrations/NNNN_*_test.sql` → expect `ok 1..N` (it's wrapped in `begin … rollback`, so it does not persist).

### Deploy the app
- Push to `main` → Vercel auto-deploys.
- **Ordering rule:** if the commit's app code depends on a new column/RPC, apply the migration to live **first**, then push.

### Deploy the Edge Function
```
supabase functions deploy notify-email
```
Then ensure a **Database Webhook** exists on `public.notification` (event INSERT) pointing at the function URL. Email needs the verified Resend domain (`mail.mood.mt`). The Edge change only takes effect after redeploy.

### Outstanding operational tasks (as of 2026-06-10)
- Migrations through **0040** are applied. **0041–0047 ship in recent commits and still need running** in the SQL editor, **in order** (run `notify pgrst, 'reload schema';` after each — they add columns/tables and 0043/0045 change the `create_task`/`update_task` signatures): 0041 task subscriptions, 0042 production metadata, 0043 capacity fields, 0044 timesheets, 0045 task job value, 0046 cost-per-hour, **0047 (relocate cost rate) which must run after 0046** (it migrates from + drops the column 0046 added). **0041 also needs the Edge Function redeployed** (`supabase functions deploy notify-email`) so the `email=false` (in-app-only) skip takes effect. Apply each new `migrations/NNNN_*.sql` as it ships.
- Email delivery is **live**: `notify-email` deployed + Database Webhook `notify_email_on_insert` on `notification` INSERT, sending via Resend (`mail.mood.mt`). Runbook: `supabase/functions/notify-email/DEPLOY.md`. (Notification emails only — **invite emails are not auto-sent yet**, see §19.)

### Environment
- App: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local` + Vercel).
- Edge Function secret: `RESEND_API_KEY` (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` auto-injected).
- `supabase/.temp/` is gitignored (local CLI state).

---

## 19. Open items & roadmap

### Open (not built)
1. **Auto-send invite emails** *(0035 follow-on)* — the invite record + accept-on-login flow are live, but the email is shared manually. The `notify-email` function keys on an existing `user_id` (which an invitee lacks), so auto-send needs a separate path (service-role `inviteUserByEmail`/`generateLink`, or an invite-specific email).
2. **WEBHOOK_SECRET hardening** *(notifications)* — the `notify-email` Edge Function has an optional shared-secret header check, currently **commented out (V1)**. Set `WEBHOOK_SECRET` as an Edge secret + the matching header on the Database Webhook and enable the check.
3. **Column prefs on more views** *(0037 follow-on)* — the mechanism is view-agnostic and shipped on the task list; adopt it on the **clients** and **team** lists (define each view's `COLUMNS`, read its pref, drop in `<ColumnPicker>`).
4. **Finer permissions** *(security/access)* — admin/member is enforced and manageable, and the high-stakes actions (RACI edit, role changes, invites, permanent deletes) are admin-gated. What's still open: most *routine* agency pages gate on any agency membership; decide which further actions (billing edits, etc.) should require `agency_admin`.
5. **Task-system future slices** — **subtasks/checklists**; **client-facing task sharing** (selected tasks visible in the portal — `task` is internal-only by design today); **auto-spawn from templates** (create the standard task set for a new post/client); a **gantt/timeline** view. (Kanban, the task calendar, and the content↔task bridge are done.)
6. **@mentions** — mention internal (`team_member`) and external (`client_contact`/portal) people on comments (and later other objects), stored as **structured rows** (not parsed from text), emitted from the existing RPC write paths.
7. **Bell realtime** — currently polls on open; add Supabase realtime for live unread updates.
8. **Pervasive notification preferences** — Monday.com-style per-user × per-channel toggles (`notification_preference` table planned).

### Architecture intent for the notification spine (so current choices don't block it)
- Emit from the existing SECURITY DEFINER RPC write paths (single choke point) — already the case.
- Store mentions as structured rows keyed to `auth.user_id` where possible; external contacts notified by email until they have a login.
- Planned tables: `notification` (built) and `notification_preference` (future).

### Recently completed (this development cycle)
Client Approve/Request-changes UI · snapshot-on-send versioning · agency + client version history · agency dashboard · calendar filters · month-view media indicator · enriched notification copy · persisted media ordering + drag-reorder · real portal revocation · **combined all-clients calendar** · **per-client `calendar_colour` + legend** · **labelled asset links (0026)** · **RACI reference data (0027)** · **internal task list + dashboard summary (0028)** · sidebar logo · **legacy `asset` table dropped (0029)** · **per-client ownership + matrix (0030)** · **content↔task bridge + Lead-PM owner suggestion (0031)** · **admin area + editable RACI matrix (0032)** · **task List/Kanban/Calendar views + deeper dashboard breakdowns** · **permission management: Admin → Team access, promote/demote with last-admin lockout (0033)** · **team member edit + soft-deactivate/reactivate (0034)** · **agency + client invites, magic-link-native, accept-on-login (0035)** · **permanent delete: reassign-then-delete team members, guarded-cascade clients (0036)** · **per-user column preferences on the task list (0037)** · **drag-to-reschedule posts on the calendar, agency-only, with a past-date confirm (0038)** · **internal notes on posts + tasks, agency-only, author-owns, one polymorphic table (0039)** · **archive / reactivate / delete actions in the clients list, with a lightweight `set_client_status` setter + type-the-name delete confirm (0040)** · **RACI-seeded task subscriptions + task event notifications with an in-app-only vs email flag (0041)** · **post production metadata + the agency content-grid view + drawer Production details, via the no-fork `set_post_meta` (0042)** · **task `estimated_hours` + `start_date` and a per-person capacity planner on the dashboard (week/month, vs 40h, with honesty buckets) (0043)** · **internal timesheets per client — DB-backed timer + manual logging (0044)** · **job value / client-visibility / invoice status on tasks (0045)** · **admin-only agency cost-per-hour (0046), hardened into an admin-only `agency_internal` table (0047)** · **admin-only profitability report at `/reports` (value − time-cost margins by client, date-ranged) (0047)** · **`update_client` preserves status/timezone/currency on omit (0050)** · **agreed client deliverables — agency-only CRM section + RPCs (0051)** · **global "+ Log time" top-bar modal (pick task / free-text / create-task-on-the-fly, Malta-correct, portaled)** · **/reports reopened to all agency members as a tabbed shell — member-visible Time + Capacity (relocated from the dashboard) tabs, admin-only Profitability tab**.

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Membership** | A row linking a user to a scope (`agency` or `client`) with a role. The basis of all access. |
| **Read floor** | The status-aware RLS rule (0015) below which clients see nothing. |
| **Fork** | Editing a frozen post creates a new `content_version` (v2) and bounces the post to `internal_review`. |
| **Frozen / mutable** | A post is *frozen* (forks on edit) from `client_review` onward; *mutable* (edits in place) before. |
| **Portal user** | A client contact with `portal_access=true` who has logged in and claimed a client-scope membership. |
| **Claim-on-login** | `claim_client_access()` granting a client membership by matching the login email to a portal-enabled contact. |
| **Emit point** | A place in an RPC where a notification is created via `_notify`. |
| **Sent version** | A version with an `approve_internal` event — the basis of the client version-history filter. |
| **Combined view** | The default agency calendar showing all clients at once (`?clients=`), each post coloured by `calendar_colour`. |
| **`calendar_colour` vs `brand_colour`** | `calendar_colour` (0025) is the per-client calendar tag; `brand_colour` is the client's brand-identity colour — deliberately separate. |
| **Internal layer** | Agency-only management surface (tasks, RACI, ownership) with no client access path, gated on `is_agency_member`. |
| **Admin area** | `/admin*`, gated on the `agency_admin` role (`isAgencyAdmin`) — agency configuration (RACI editor today). |
| **Ownership** | Per-client internal staffing (`client_ownership`, 0030): eight role slots → team members. The Lead PM seeds a new task's default owner. |
| **Serves post** | A task linked to a `content_item` (`task.content_item_id`, 0031) — surfaced both on the post drawer and the task. |
| **Invite** | A pending record of intent (`invite`, 0035) to grant an agency or client membership; redeemed by `accept_pending_invites()` when the invited email logs in. |
| **Accept-on-login** | `accept_pending_invites()` (run with `claim_client_access` in the auth callback) granting exactly the memberships backed by the user's live pending invites. |
| **Reassign-then-delete** | `delete_team_member` (0036) moving a leaver's tasks/ownership/RACI to a successor before removing the directory row. |
| **Two-step delete** | Permanent deletes (0036) require a reversible soft state first — a team member must be deactivated, a client archived. |
| **View preference** | A per-user `(view_key, config)` row (`user_view_preference`, 0037) storing column order + hidden flags; merged with the live column set on load. |

---

*This document reflects the codebase at migration 0051. Keep it current: when you ship a feature or migration, update the relevant section, the migration ledger, and the open-items list.*
