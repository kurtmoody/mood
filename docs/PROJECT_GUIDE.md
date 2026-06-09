# Mood — Project Guide

**Status:** Internal build, actively developed. Last updated 2026-06-09 (migration 0032).
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
15. [Migration ledger (0001–0032)](#15-migration-ledger)
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
    clients/                     # CRM: list + new/ + [id]/ (+ OwnershipSection) + ownership/ (matrix)
    admin/                       # agency_admin only: layout.tsx (gate) + page.tsx (landing) +
                                 #   raci/ (page.tsx, RaciEditor.tsx, raciActions.ts)
    team/                        # agency staff directory
  login/page.tsx                 # outside the group (no shell)
  auth/callback/page.tsx         # client-side OTP/PKCE callback + claim_client_access

components/
  AppShell.tsx Sidebar.tsx TopBar.tsx UserMenu.tsx   # shell (Sidebar nav gated by role)
  Calendar.tsx MonthCalendar.tsx                      # week / month grids — client-colour fill + STATUS dot
  Drawer.tsx                                          # post detail / edit / transitions / comments / media / asset links / linked tasks
  MediaSection.tsx MediaThumb.tsx                     # media display, upload, drag-reorder, thumbnails
  AssetLinksSection.tsx                               # labelled asset links (agency manage / client read-only)
  VersionHistory.tsx ClientVersionHistory.tsx         # version history (agency embed / client RPC)
  NotificationBell.tsx                                # bell + unread badge + dropdown
  FilterMenu.tsx ColourPicker.tsx                     # multi-select dropdown / swatch colour picker
  # (ClientSwitcher.tsx removed — replaced by the Clients multi-select FilterMenu)

lib/
  supabase/{client,server,middleware}.ts             # Supabase SSR clients
  access.ts                                           # getAccess() → type/clientIds + agencyId + isAgencyAdmin
  week.ts                                             # Europe/Malta date helpers (Monday-start)
  media.ts                                            # mediaKind / mediaName helpers
  colour.ts                                           # CLIENT_PALETTE, clientColour(), textOn(), fallbackColour()
  taskConstants.ts                                    # TASK_TYPES / STATUSES / PRIORITIES + colours (single source)
  ownershipRoles.ts                                   # OWNERSHIP_ROLES (the 8 client_ownership role slots)

migrations/                       # numbered SQL (0001–0032) + pgTap *_test.sql
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
| `client` | A client of the agency | `id`, `agency_id`, `name`, `status` (prospect/active/paused/archived), `website`, `industry`, `current`… |
| `membership` | user ↔ scope, with role | `user_id`, `scope_type` (`agency`/`client`), `scope_id`, `role` (`agency_admin`/`agency_member`/`client_approver`/…) |
| `channel` | A publishing channel per client | `id`, `client_id`, `type` (instagram/facebook/linkedin/blog/newsletter), `label` |
| `content_item` | A planned post | `id`, `client_id`, `channel_id`, `title`, `content_type`, `scheduled_at`, `status`, `current_version_id` (→ content_version, FK added 0021), `created_by`, `updated_at` |
| `content_version` | Versioned body of a post | `id`, `content_item_id`, `version_no` (unique per item, `uq_version_no` 0021), `body`, `internal_note`, `created_by`, `created_at` |
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
| `media` (agency-upload) | 0018, +`sort_order` 0024 | `version_id` (→ content_version, **on delete cascade**), `storage_path` (**unique**), `mime_type`, `size_bytes`, `created_by`, `created_at`, `sort_order` (int, default 0). Private `content-media` bucket. |
| `notification` (recipient-scoped) | 0019 | `user_id` (recipient), `type` (`ready_for_review`/`approved`/`changes_requested`/`comment`), `content_item_id` (→ content_item on delete cascade), `actor_id`, `body`, `read_at` (null = unread), `created_at`. |
| `client.calendar_colour` | 0025 | Per-client **calendar tag** colour (hex). **Deliberately distinct from `brand_colour`** (the client's brand-identity colour, schema.sql, untouched): a client's calendar fill may differ from its brand. `create_client`/`update_client` now take both `p_brand_colour` and `p_calendar_colour`. Null falls back to a stable palette colour at render (`lib/colour.ts`). |
| `post_asset_link` (agency-write) | 0026 | `id`, `content_item_id` (→ content_item **on delete cascade**), `label`, `url`, `sort_order`, `created_by`, `created_at`. Labelled links per post (Drive folders, raw footage, final exports, …). **Status-aware read floor mirroring 0015** (agency any status; client `client_review+`). RPC-only writes. |
| `raci_matrix` (agency reference) | 0027, editable 0032 | `id`, `agency_id`, `task_type`, `team_member_id` (→ team_member **on delete cascade**), `raci_value` (A/R/C/I/S), `created_at`; unique `(agency_id, task_type, team_member_id)`. Agency-scoped RLS read; **edited via the admin-only `set_raci_matrix` RPC (0032)** — no write policies. Seeded for Mood Agency (15 task types × 7 people). |
| `task` (internal management) | 0028, +`content_item_id` 0031 | `id`, `agency_id`, `client_id` (nullable, `on delete set null`), `content_item_id` (nullable → content_item **on delete set null**, 0031 — links a task to a post), `task_type`, `title`, `owner_id` (→ team_member), `status` (default 'Not Started'), `priority` (default 'Medium'), `due_date`, `next_action`, `notes`, `created_by`, timestamps. **Internal-only** (agency-scoped read via `is_agency_member`; no client access path). RPC-only writes. Values validated app-side via `lib/taskConstants.ts`. |
| `client_ownership` (1:1 with client, **agency-only**) | 0030 | `client_id` (PK → client **on delete cascade**) + eight nullable role slots → `team_member` (`lead_pm_id`, `comms_backup_id`, `creative_lead_id`, `design_owner_id`, `content_owner_id`, `video_owner_id`, `sales_ops_id`, `intern_support_id`), `updated_at`. Internal staffing — **no client branch**. Written via `set_client_ownership`. |

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

**Admin role (0032).** `getAccess` exposes **`isAgencyAdmin`** (a `role = 'agency_admin'` membership) and **`agencyId`** (the user's agency). The **Admin area** is gated on the role, not just `type === 'agency'`: the `Admin` nav item is `adminOnly` (shown only to admins), `app/(app)/admin/layout.tsx` hard-redirects non-admins from `/admin*`, and admin RPCs (e.g. `set_raci_matrix`) re-check `agency_admin` server-side. This is the first real use of the `agency_admin` vs `agency_member` split — other agency pages still gate on *any* agency membership (extending finer per-action permissions is an open item, §19).

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

### Bell (in-app)
`NotificationBell.tsx` in the top bar (agency + client). Unread-count badge, dropdown of the 15 most recent, per-row + "Mark all as read" (scoped `update read_at` only), and **click-to-open** which resolves the post via the user's RLS-scoped client and deep-links to `/?client&week&view=week&post=<id>`. V1 polls on open (no realtime yet).

### Email (Edge Function)
`supabase/functions/notify-email/index.ts` (Deno). Triggered by a **Database Webhook** on `public.notification` INSERT. It is **deliver-only**: resolves the recipient's email (service-role `auth.admin.getUserById`) and sends via Resend. **Subject + body both come from `record.body`** (so email matches the bell exactly). Returns 200 on every path (incl. send failure) to avoid webhook retry storms. Optional shared-secret header check is present but commented (V1). Requires the verified Resend domain.

---

## 13. Feature inventory

Everything below is **built and shipped** unless marked otherwise.

### App shell & navigation
Persistent sidebar (pinnable on desktop, off-canvas on mobile) + top bar. Nav gated by role: clients see only Calendar; agency sees Calendar, Dashboard, Clients, Team. Dashboard nav has a "needs your action" count badge. User menu with sign-out.

### Client CRM
- `/clients` list + create (`create_client`).
- `/clients/[id]` detail/edit (`update_client`) with account owner from the team directory.
- `/team` agency staff directory (`add_team_member`).
- **Contacts** CRUD per client (single-primary enforced) with a **portal-access invite toggle** (`set_contact_portal_access`).
- **Brand assets** CRUD per client (`add/update/delete_brand_asset`).
- **Channels** per client (`add_channel`/`delete_channel`).
- **Per-client ownership (0030)** — an **Ownership** section on `/clients/[id]` (eight role dropdowns from the team — Lead PM, comms backup, creative/design/content/video owners, sales/ops, intern support — saved via `set_client_ownership`), plus a read-only **`/clients/ownership` matrix** (all clients × roles), linked from the Clients header.
All via SECURITY DEFINER RPCs.

### Content engine
- **Calendar** (`app/(app)/page.tsx` + `CalendarBoard`): real-dated **Week/Month** views (Europe/Malta, Monday-start), Prev/Today/Next, state in the URL (`?clients/?client/?week/?month/?view`). Click a post → detail drawer. `?post=` deep-link opens a specific post's drawer (used by the bell and dashboard).
- **Combined all-clients view (default for agency).** The home calendar shows **every client's posts together** rather than one client (`clientList[0]`). The single-client dropdown is replaced by a **Clients multi-select** (reuse of `FilterMenu`), **URL-persisted via `?clients=`** (comma list); the query is `.in('client_id', selectedClientIds)`. A single-client deep-link (`?client=`) still focuses one. Clients only ever see their own.
- **Per-client colour.** Each post card/chip is **filled with its client's `calendar_colour`** (text colour auto-chosen by luminance, `lib/colour.ts`), with the workflow **status as a dot**. A **colour→client legend** shows in combined view. Null-colour clients get a stable palette fallback at render.
- **Create/edit posts** (`create_post`/`update_post`) — body versioned; status-aware editing (in-place vs fork).
- **Approval workflow** (`transition_post`) — the state machine, every move logged, history timeline in the drawer.
- **Comments** (`add_comment`/`delete_comment`).
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

### Admin area (0032)
`/admin` — **agency_admin only** (nav `adminOnly`, `admin/layout.tsx` hard-redirect, and the RPC re-checks admin server-side). A settings landing structured to grow (just a `SECTIONS` array today); first module is the **RACI matrix editor** (`/admin/raci`): a 15 × N grid of dropdowns (`—`/A/R/S/C/I/A/R), prefilled, one **Save** → replace-all.

### Approval & versioning
- Client Approve / Request-changes surfaced in the drawer for `client_review` posts (role-aware action set; note required for request_changes).
- Snapshot-on-send versioning (§10), agency + client version-history viewers.

### Client portal
- Access model + invite toggle (0013), **claim-on-login** (callback → `claim_client_access`), restricted client calendar + nav gating, client-authorised transitions (0017).
- **Real revocation (0020):** `set_contact_portal_access(..., false)` now also **deletes** the user's client-scope membership for that client (tightly scoped — agency/other-client memberships untouched), so an already-logged-in contact loses access immediately.

### Notifications
Data layer + emit (0019), enriched copy (0023), in-app bell, email Edge Function (§12).

### Agency dashboard
`/dashboard` (agency-only): a cross-client "needs attention" view aggregating `content_item` across **all** the agency's clients via RLS (no client filter). Sections — "Needs your action" (`internal_review`/`changes_requested`), "Awaiting client" (`client_review`, flagging items aged > 3 days), and a richer **task summary**: a prominent **overdue count** plus open-task breakdowns **By status** (→ `/tasks?status=`), **By owner** (→ `/tasks?owner=`), and **By client**. Each content row deep-links to the post. Read-only.

### Security (all pgTap-proven)
Content read floor (0015), content tables RPC-only (0016), client transitions (0017), media table + storage policies (0018), notification RLS (0019), revoke (0020), versioning guards (0021), client version filter (0022), media reorder authorisation (0024), asset-link read floor + RPC auth (0026), task RLS + RPC auth (0028), client_ownership RLS + RPC auth (0030), RACI admin-write auth (0032).

---

## 14. RPC reference

All RPCs are `SECURITY DEFINER` with `set search_path=''` and an `auth.uid()` null-check; authorisation is enforced in the body. Listed by area.

### Content & approval
| RPC | Signature (key params) | Auth | Notes |
|---|---|---|---|
| `create_post` | `(client_id, channel_id?, title?, content_type?, scheduled_at?, body?) → uuid` | agency-for-client | Creates the item + v1, sets `current_version_id`. |
| `update_post` | `(item_id, title, channel_id, scheduled_at, body) → jsonb` | agency-for-client | In-place for mutable statuses; **forks v2** for frozen statuses, returns `[{old_path,new_path}]` media pairs. |
| `transition_post` | `(item_id, action, note?) → text` | agency any; client only `approve`/`request_changes` from `client_review` | State machine, logs `approval_event`, emits notifications. |
| `add_comment` | `(item_id, body) → uuid` | member of the client | Emits comment notifications. |
| `delete_comment` | `(comment_id) → void` | author or agency | |
| `get_post_versions` | `(item_id) → setof (version_id, version_no, body, internal_note, created_by, created_at, is_current, events jsonb, media jsonb)` | agency = all; client = sent versions only | Per-version client filter on `approve_internal`; nulls `internal_note` for clients; media ordered by `sort_order`. |

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
| `create_task` | `(client_id?, task_type?, title, owner_id?, status?, priority?, due_date?, next_action?, notes?, content_item_id?)` → uuid | agency (derives agency from membership) | Validates client / owner / content item belong to the agency. `content_item_id` (0031) links the task to a post. |
| `update_task` | `(task_id, … same fields incl. content_item_id …) → void` | agency member of the task's agency | **Full replace** (sets `updated_at`); mark-complete re-sends all fields with `status = 'Complete'`; kanban drag re-sends with the new `status`. |
| `delete_task` | `(task_id) → void` | agency member of the task's agency | |

### Admin (0030, 0032)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `set_client_ownership` | `(client_id, lead_pm_id?, comms_backup_id?, creative_lead_id?, design_owner_id?, content_owner_id?, video_owner_id?, sales_ops_id?, intern_support_id?) → void` | agency-for-client | Upsert (1:1); validates every assignee belongs to the client's agency. |
| `set_raci_matrix` | `(agency_id, cells jsonb) → void` | **agency_admin of that agency** | Transactional replace-all of the grid; validates team members; skips blank cells. |

### Portal & CRM
| RPC | Signature | Auth |
|---|---|---|
| `claim_client_access` | `() → int` | self (on login) — inserts membership for portal-enabled contacts matching the user's email |
| `set_contact_portal_access` | `(contact_id, enabled) → void` | agency-for-client — on revoke, also deletes the matching client-scope membership |
| `create_client` / `update_client` | CRM (incl. `p_brand_colour`, `p_calendar_colour`) | agency / can-admin |
| `add_team_member` | team directory | agency |
| `add_contact` / `update_contact` / `delete_contact` | contacts | agency-for-client |
| `add_brand_asset` / `update_brand_asset` / `delete_brand_asset` | brand assets | agency-for-client |
| `add_channel` / `delete_channel` | channels | agency-for-client |

### Notification internals (SECURITY DEFINER helpers)
`_notify(user_ids[], type, content_item_id, actor_id, body)`, `_agency_user_ids_for_client(client_id)`, `_portal_user_ids_for_client(client_id)`.

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
- **Dates** are Europe/Malta, week starts Monday — use `lib/week.ts`; bucket posts by real date, never weekday.
- **Migrations are manual + idempotent.** Apply schema changes to live **before** pushing app code that depends on them.
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

### Outstanding operational tasks (as of 2026-06-09)
- Migrations through **0032** are applied (ownership, task↔content link, admin RACI editing are live).
- Deploy `notify-email` + wire the Database Webhook for email to actually send (still pending — the bell works; email does not until this is done).

### Environment
- App: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (`.env.local` + Vercel).
- Edge Function secret: `RESEND_API_KEY` (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` auto-injected).
- `supabase/.temp/` is gitignored (local CLI state).

---

## 19. Open items & roadmap

### Open (not built)
1. **Permission-management UI / finer permissions** *(security/access)* — the `agency_admin` vs `agency_member` split is now enforced for the Admin area (0032), but other agency pages still gate on *any* agency membership. Extend the `isAgencyAdmin` gate to other destructive actions (delete client, billing, manage team) and add a UI to manage who's an admin.
2. **Task-system future slices** — **subtasks/checklists**; **client-facing task sharing** (selected tasks visible in the portal — `task` is internal-only by design today); **auto-spawn from templates** (create the standard task set for a new post/client); a **gantt/timeline** view. (Kanban, the task calendar, and the content↔task bridge are done.)
3. **@mentions** — mention internal (`team_member`) and external (`client_contact`/portal) people on comments (and later other objects), stored as **structured rows** (not parsed from text), emitted from the existing RPC write paths.
4. **Bell realtime** — currently polls on open; add Supabase realtime for live unread updates.
5. **Pervasive notification preferences** — Monday.com-style per-user × per-channel toggles (`notification_preference` table planned).

### Architecture intent for the notification spine (so current choices don't block it)
- Emit from the existing SECURITY DEFINER RPC write paths (single choke point) — already the case.
- Store mentions as structured rows keyed to `auth.user_id` where possible; external contacts notified by email until they have a login.
- Planned tables: `notification` (built) and `notification_preference` (future).

### Recently completed (this development cycle)
Client Approve/Request-changes UI · snapshot-on-send versioning · agency + client version history · agency dashboard · calendar filters · month-view media indicator · enriched notification copy · persisted media ordering + drag-reorder · real portal revocation · **combined all-clients calendar** · **per-client `calendar_colour` + legend** · **labelled asset links (0026)** · **RACI reference data (0027)** · **internal task list + dashboard summary (0028)** · sidebar logo · **legacy `asset` table dropped (0029)** · **per-client ownership + matrix (0030)** · **content↔task bridge + Lead-PM owner suggestion (0031)** · **admin area + editable RACI matrix (0032)** · **task List/Kanban/Calendar views + deeper dashboard breakdowns**.

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

---

*This document reflects the codebase at migration 0032. Keep it current: when you ship a feature or migration, update the relevant section, the migration ledger, and the open-items list.*
