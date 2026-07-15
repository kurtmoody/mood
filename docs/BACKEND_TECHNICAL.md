# Mood — Backend Technical Reference

**Audience:** developers (backend / full-stack) working on Mood.
**Scope:** the objective of the platform, the architecture, the database and security model, the full RPC catalogue, migrations, operations, and the gotchas that will bite you if you don't know them.
**Authority:** where this disagrees with `CLAUDE.md` or older notes, this document and the numbered SQL in `migrations/` win. Current as of **migration 0047**. See also [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md) (the broader reference) and [`EMPLOYEE_HANDBOOK.md`](./EMPLOYEE_HANDBOOK.md) (non-technical).

---

## 1. What Mood is, and the objective

Mood is an **internal tool for Mood Agency** (a Malta creative/marketing agency) to plan social and content for clients on a single **approval calendar**, and to let clients review, approve, and comment with minimal friction. Internal-first; it may become a product later. (Old codename: "Cadence".)

**The core bet:** ONE approval calendar for ALL content types (Instagram, Facebook, LinkedIn, Blog, Newsletter) — not a social-only tool. Two tenets drive every decision:

1. Make the agency team faster.
2. Make client interaction effortless — approve in seconds, no fighting with logins.

**Explicitly out of scope (do NOT build):** publishing/scheduling to social networks, analytics, social inbox, AI content generation, white-label.

Two audiences share the same app: the **agency team** (plan, manage clients, drive approvals, upload media, run internal tasks) and **clients** (review their own content on a restricted view, approve / request changes, comment).

---

## 2. Architecture at a glance

```
Browser ──▶ Next.js 16 (App Router, RSC) on Vercel
                │  proxy.ts → updateSession (Supabase SSR cookie refresh)
                │  Server Components fetch with the user's session  ─────▶ Supabase Postgres
                │     · reads gated by RLS                                   (RLS + SECURITY DEFINER RPCs)
                │  Server Actions call SECURITY DEFINER RPCs ──────────────▶ (all writes)
                │
                └─ Supabase Storage (private bucket, signed URLs)
                   Supabase Edge Function (notify-email) ──▶ Resend (email)
```

### The two security tiers (internalise this)
- **RLS (row-level security) is the floor for READS.** Rows are invisible unless the user has an appropriate `membership` row. RLS is always on.
- **SECURITY DEFINER RPCs are the only path for WRITES** to the content/management tables. There are **no permissive write policies**; authorisation is enforced *inside* each RPC. (Why: see §5.)

### Request flow
1. `proxy.ts` (Next 16's root middleware — **not** `middleware.ts`) runs `updateSession` via `lib/supabase/middleware.ts` to refresh the Supabase auth cookie.
2. All authenticated pages live under the **`app/(app)/` route group** with a shared `layout.tsx` that calls `getAccess()` (auth gate) and renders the shell.
3. Server Components query Supabase with the user's session → **RLS applies automatically**.
4. Writes go through server actions → `supabase.rpc(...)` → SECURITY DEFINER function → its own authorisation → multi-table write.

### Auth
Magic link (email OTP) via Supabase Auth. Login at `/login` (outside the route group → no shell). The callback is **client-side** at `app/auth/callback/page.tsx`: it reads tokens from the URL hash (implicit flow) **and** `?code` (PKCE), establishes the session, then calls `accept_pending_invites()` (0035) **and** `claim_client_access()` to grant agency/client memberships by email match. **Do not convert it to a server route** — it needs the hash, which servers don't see.

---

## 3. Tech stack & infrastructure

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, TypeScript, RSC) | React 19, Tailwind v4. `next build` does **not** lint in 16. |
| Middleware | `proxy.ts` exporting `proxy` | Next 16 renamed the root middleware file. Never recreate `middleware.ts`. |
| DB / Auth / Storage | **Supabase** (Postgres) | Project ref `vwicrmwjatrphjviedce`. Auth = magic link. RLS is the security floor. |
| Styling | **Tailwind CSS** | Clean/minimal: white canvas, hairline grid (`#ECECEE`), small status dots. |
| Hosting | **Vercel** | Auto-deploys on push to `main`. Live: `https://mood-amber-zeta.vercel.app`. |
| Email | **Resend** | Verified domain `mail.mood.mt`, sender `noreply@mail.mood.mt`. Sent via an Edge Function. |
| Repo | `github.com/kurtmoody/mood` | Default branch `main`. |

**Environment variables**
- App (in `.env.local` and Vercel): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Edge Function secrets: `RESEND_API_KEY` (plus auto-injected `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).

**Repo layout (backend-relevant)**
```
app/(app)/                 # authenticated pages (route group) + server actions (*Actions.ts)
  page.tsx                 # the calendar (server query, RLS-scoped)
  dashboard/ tasks/ clients/ admin/ team/   # feature pages, each with colocated server actions
lib/
  supabase/{client,server,middleware}.ts    # SSR clients
  access.ts                # getAccess() → { type, clientIds, agencyId, isAgencyAdmin }
  week.ts                  # Europe/Malta date helpers (Monday-start) + reschedule helpers (0038)
  taskConstants.ts ownershipRoles.ts colour.ts   # shared constants
  viewColumns.ts           # column-preference mechanism (mergeColumns, 0037)
  exportClient.ts          # client data export → ZIP of CSVs (fflate; RLS-respecting reads)
migrations/                # numbered SQL (0001–0057) + pgTap *_test.sql  ← source of truth for the DB
schema.sql                 # fresh-setup reference ONLY (destructive reset block — never run on live)
proxy.ts                   # Next 16 middleware → updateSession
supabase/functions/notify-email/index.ts   # Deno Edge Function: notification → Resend
```

---

## 4. The data model

Core tables live in `schema.sql`; everything else is added by numbered migrations. **`schema.sql` is a fresh-setup reference only** — it has a destructive reset block at the top; **never run it against live**. The migrations are the authoritative history.

### Enums (`schema.sql`)
- `public.member_role` — `agency_admin`, `agency_member`, `client_approver`, `client_viewer`.
- `public.content_status` — `draft`, `internal_review`, `client_review`, `changes_requested`, `approved`, `scheduled`, `posted`.

> ⚠️ **Enum columns are enums, not text.** `membership.role` (`member_role`) and `content_item.status` (`content_status`) are enum-typed. Inserting a string *literal* coerces automatically, but assigning a text *variable/param* in an RPC does **not** — `set role = p_role` fails. Validate, then cast: `set role = p_role::public.member_role` (see `set_member_role`, 0033).

### Tenancy & access
| Table | Purpose | Key columns |
|---|---|---|
| `agency` | The agency tenant | `id`, `name`. Seeded: `…0001` (Mood Agency). |
| `client` | A client of the agency | `id`, `agency_id`, `name`, `status` (text + CHECK: prospect/active/paused/archived), `website`, `industry`, `brand_colour` (brand identity), `calendar_colour` (0025), `timesheet_enabled` (0044 — gates the timesheet UI). |
| `agency_internal` | 0047 | PK `agency_id` (→ agency cascade), `cost_per_hour` (numeric). **Admin-only** read RLS (`agency_admin` of that agency). Holds the cost rate — relocated off the member-readable `agency` table (RLS can't hide a single column). Written via `set_agency_cost_per_hour`. |
| `membership` | user ↔ scope, with role | `user_id`, `scope_type` (`agency`/`client`), `scope_id`, `role` (**enum `member_role`**). The basis of all access. **RLS: own rows only.** |
| `team_member` | Agency staff directory (0005; edit/deactivate 0034) | `agency_id`, `full_name`, `role` (free text job title), `email`, `user_id` (nullable → auth.users), `is_active`. Owners/RACI/ownership resolve against this by `full_name`/`user_id`. Edited via `update_team_member`; soft-deactivated via `set_team_member_active`; hard-deleted (reassign-then-delete) via `delete_team_member` (0036). |
| `invite` | Pending invite to grant a membership (0035) | `id`, `email` (lower-cased, no citext dep), `scope_type` (`agency`/`client`), `scope_id`, `role`, `status` (`pending`/`accepted`/`revoked`/`expired`), `invited_by`, `created_at`, `expires_at` (default +7d), `accepted_at`. Partial unique index `(email, scope_type, scope_id) where status='pending'`. **No FK on `scope_id`** (points at agency *or* client). RLS read = the `agency_admin` whose agency owns the scope; writes RPC-only. |

### Content
| Table | Purpose | Key columns |
|---|---|---|
| `channel` | A publishing channel per client | `id`, `client_id`, `type` (instagram/facebook/linkedin/blog/newsletter/…), `label`. |
| `content_item` | A planned post | `id`, `client_id`, `channel_id`, `title`, `content_type`, `scheduled_at`, `status` (**enum `content_status`**), `current_version_id` (→ content_version, FK added 0021), `post_group_id` (0055 — links posts split off the same original), `created_by`, `updated_at`. **Production metadata (0042):** `designer_id` (→ team_member, set null — directory ref, login not required), `design_status`, `drive_url`, `high_res_url`, `boost` (bool default false), `ad_budget` (numeric), `date_posted` (date), `posted_url`. Written via `set_post_meta` (no fork), never `update_post`. |
| `content_version` | Versioned body of a post (0021) | `id`, `content_item_id`, `version_no` (unique per item via `uq_version_no`), `body`, `visual_content` (0052 — a second versioned, client-visible content field; the Caption is `body`, Visual content is `visual_content`), `internal_note`, `created_by`, `created_at`. |
| `content_item_channel` | 0054 | Join table — a post → many of its client's channels. PK `(content_item_id, channel_id)`, both on delete cascade, index `(channel_id)`. Backfilled from `content_item.channel_id` (kept as the denormalised **primary**, first in the set). **RLS read proxies content_item's floor** (`content_item_id in (select id from content_item)`); writes RPC-only (`set_post_channels`/`create_post`). |
| `comment` | A comment on a post | `id`, `content_item_id`, `author_id`, `body`, `created_at`. |
| `approval_event` | Audit log of every transition | `id`, `content_item_id`, `version_id`, `actor_id`, `action`, `note`, `created_at`. |
| `media` | Agency-uploaded files (0018, +`sort_order` 0024) | `version_id` (→ content_version, **on delete cascade**), `storage_path` (**unique**), `mime_type`, `size_bytes`, `created_by`, `created_at`, `sort_order`. Private `content-media` bucket. |
| `post_asset_link` | Labelled links per post (0026) | `id`, `content_item_id` (→ content_item **cascade**), `label`, `url`, `sort_order`, `created_by`, `created_at`. Status-aware read floor mirroring 0015. |

> The legacy `asset` table (original Drive-flavoured table, never used) was **dropped in 0029** — superseded by `media` + `post_asset_link`. Gone from the DB and `schema.sql`.

### Client CRM (agency-only)
| Table | Migration | Notes |
|---|---|---|
| `client_internal` | 0001 | 1:1 with client. `account_owner_id` (→ team_member), `notes`, `billing_email`, `vat_number`, `billing_address`, `payment_terms`, `currency` (default EUR), `retainer_amount`. **Sensitive data lives here**, never on `client` (which is client-readable via the portal). |
| `client_contact` | 0007 | `client_id`, `first_name`, `surname`, `role`, `email`, `phone`, `is_primary` (single-primary enforced), `portal_access` (invite toggle), `user_id` (nullable → links a portal user). |
| `brand_asset` | 0008 | `client_id`, `kind` (logo/colour/font/guideline/other), `label`, `value/url`, `notes`. |
| `client_ownership` | 0030 | 1:1 with client. `client_id` (PK → client cascade) + 8 nullable role slots → `team_member` (`lead_pm_id`, `comms_backup_id`, `creative_lead_id`, `design_owner_id`, `content_owner_id`, `video_owner_id`, `sales_ops_id`, `intern_support_id`), `updated_at`. Internal staffing — **no client access path**. |
| `client_deliverable` | 0051 | `client_id` (→ client cascade), `label`, `quantity` (nullable), `cadence` (nullable, CHECK: `per_week`/`per_month`/`per_quarter`/`per_year`/`one_off`/`ongoing`), `notes`, `sort_order`, `created_by`, `created_at`, `updated_at` (null until edited). Agreed deliverables per client (retainers) — agency-only, **no client access path**. No `client_visible` flag in v1. |

### Internal management
| Table | Migration | Notes |
|---|---|---|
| `task` | 0028, +link 0031, +capacity 0043, +value 0045 | `id`, `agency_id`, `client_id` (nullable, on delete set null), `content_item_id` (nullable, links a task to a post), `task_type`, `title`, `owner_id` (→ team_member), `status`, `priority`, `due_date`, `start_date` (0043), `estimated_hours` (0043), `value` (0045), `value_client_visible` (0045, gate only), `invoice_status` (0045, CHECK not_invoiced/invoiced/paid), `next_action`, `notes`, `created_by`, timestamps. **Internal-only** (agency-scoped read; no client branch). Status/priority/type validated app-side via `lib/taskConstants.ts`. |
| `time_entry` | 0044 | `id`, `agency_id`, `client_id` (not null, cascade), `task_id` (nullable, set null — task-linked or client-direct), `user_id`, `started_at`, `ended_at` (null = running), `duration_minutes`, `note`, `created_at`. Partial unique index `(user_id) where ended_at is null` = one running timer per user. **Internal-only** (agency-read RLS); RPC-only writes. |
| `raci_matrix` | 0027, editable 0032 | `id`, `agency_id`, `task_type`, `team_member_id` (→ team_member cascade), `raci_value` (plain text: A/R/C/I/S), unique `(agency_id, task_type, team_member_id)`. Agency-scoped RLS read; edited via the admin-only `set_raci_matrix`. Seeded for Mood Agency (15 task types × 7 people). |
| `internal_note` | 0039 | Polymorphic agency-only notes on a post **or** task. `id`, `parent_type` (`post`/`task`, CHECK), `parent_id` (**no FK**), `author_id` (→ auth.users on delete set null), `body`, `created_at`, `updated_at` (null until edited); index `(parent_type, parent_id, created_at)`. **No client path.** RLS read resolves the parent's agency per-row via `can_see_internal_note(parent_type, parent_id)`; writes RPC-only. |
| `mention` | 0053 | Structured @mention rows on a comment or internal note (not parsed from text). `id`, `source_type` (`comment`/`internal_note`, CHECK), `source_id` (**no FK** — a `comment.id` or `internal_note.id`), `mentioned_user_id` (→ auth.users cascade), `created_by` (→ auth.users set null), `created_at`; unique `(source_type, source_id, mentioned_user_id)`. Written inside `add_comment`/`add_internal_note`. **RLS on, no read policy in v1** (write-only audit). |
| `user_view_preference` | 0037 | Per-user UI prefs. PK `(user_id, view_key)`; `config` jsonb (ordered `[{key,hidden}]`), `updated_at`; `user_id → auth.users` cascade. **Own-rows-only RLS** (`user_id = auth.uid()` for read + write) — the one table a user writes for itself, still upserted via `set_view_preference`. Shipped on the task list (`view_key='tasks'`). |

### Notifications
| Table | Migration | Notes |
|---|---|---|
| `notification` | 0019, copy 0023, +`email`/`task_id` 0041 | `user_id` (recipient), `type` (content + `task_assigned`/`task_status`/`mention`), `content_item_id` (→ content_item cascade), `task_id` (→ task cascade, 0041), `actor_id`, `body`, `email` (bool default true; false = in-app only, 0041), `read_at`, `created_at`. |
| `task_subscriber` | 0041 | PK `(task_id, user_id)`, `source` (`owner`/`accountable`/`creator`/`manual`), `created_at`. Who gets notified about a task. Agency-scoped read RLS (members of the task's agency); writes RPC-only; seeded by `create_task`/`update_task`, most-specific source wins. |

**Seeded data:** agency `…0001` (Mood Agency), client "Hotel Valentina" `…0002`, channels a1–a5. The real team (Sandrina, Tiffany, Michelle, Aiden, Design Intern, Marketing Intern, plus Kurt Hili) is seeded in `team_member`; **Michelle and Sandrina hold `agency_admin` memberships**.

---

## 5. Security model in depth

### Why writes go through RPCs (the footgun)
An inline RLS `WITH CHECK` subquery against `membership` evaluates under `membership`'s **own** RLS (own-rows-only), so it silently returns empty and the insert fails. SECURITY DEFINER functions **bypass RLS**, do their own authorisation, and keep multi-table writes atomic. Therefore: **no permissive write policies on content/management tables; all writes via RPC.** Do not add write policies.

### RLS helper functions
All are `SECURITY DEFINER`, `set search_path = ''`, and wrap `(select auth.uid())`:

| Helper | Returns |
|---|---|
| `is_agency_member(a uuid)` | true if the user is an agency member of agency `a`. |
| `is_agency_for_client(client_id)` | true if the user is an agency member of that client's agency. |
| `is_client_user()` | true if the user has any client-scope membership. |
| `client_ids_for_user()` | the set of client ids the user belongs to. |
| `can_admin_agency(...)` | true if the user can administer the agency. |

### Content read floor (migration 0015, pgTap-proven)
The content tables (`content_item`, `content_version`, `approval_event`, `comment`, `channel`, `media`, and — same shape — `post_asset_link` from 0026) carry a **status-aware read floor**:
- **Agency branch:** `is_agency_for_client(client_id)` — sees **all** their clients' rows, any status.
- **Client branch:** `is_client_user()` AND the client belongs to the user AND `status in ('client_review','changes_requested','approved','scheduled','posted')`.

So clients see only their own client's posts, and **only from `client_review` onward**. Anything still internal (`draft`/`internal_review`) is invisible to them.

### Agency-scoped & internal tables
- `raci_matrix` (0027) and `task` (0028): `for select using (is_agency_member(agency_id))` — agency members only, **no client branch**. Both have **no write policies** (writes via RPC; raci is also seeded reference data).
- `time_entry` (0044): `for select using (is_agency_member(agency_id))` — agency members; no client path; writes RPC-only.
- `agency_internal` (0047): read = **`agency_admin` of that agency only** (not any member) — the cost rate. No write policy; written by the admin-only `set_agency_cost_per_hour`. Relocated here from the member-readable `agency` table to close a column-read leak.
- `task_subscriber` (0041): read for agency members of the task's agency (`exists (task t where t.id = task_id and is_agency_member(t.agency_id))`); **no write policy** (seeded/written only by the task RPCs + helpers).
- `client_internal`, `team_member`, `client_contact`, `brand_asset`, `client_ownership`: agency-scoped reads; sensitive client data never sits on the client-readable `client` table.
- `invite` (0035): read = the `agency_admin` whose agency owns the scope (agency scope → `scope_id` is their agency; client scope → the client belongs to their agency). Writes RPC-only.
- `internal_note` (0039): **polymorphic, no FK** — the read policy resolves the parent's agency per-row via `can_see_internal_note` (`post → is_agency_for_client(client_id)`, `task → is_agency_member(agency_id)`; a missing parent → null → fails closed). Writes RPC-only.
- `user_view_preference` (0037): the one **own-rows-only** table — `user_id = auth.uid()` for both read and write (personal UI prefs); still written via `set_view_preference`.

### Storage policies (migration 0018, pgTap-proven incl. the storage layer)
- Media lives in a **private** `content-media` bucket.
- Display **always** via server-side `createSignedUrls` (batched, ~1h TTL). **Never `getPublicUrl`.** Use `<img>` for signed URLs (not `next/image`).
- Upload path **must** be `<client_id>/<content_item_id>/<version_id>/<filename>` — the storage policies parse the segments.
- The storage SELECT policy mirrors the content read floor (status-gated by the parent).

### Notification table RLS (0019)
SELECT/UPDATE own rows only (`user_id = auth.uid()`; UPDATE is for marking read). **No INSERT policy** — rows are created only by the `_notify` SECURITY DEFINER helper.

### `membership` RLS (own-rows-only) — a consequence
`membership_self` allows a user to read only their own membership rows. That's why listing *other* users' roles (e.g. the Team-access admin page) needs a SECURITY DEFINER read RPC (`list_agency_members`, 0033) — a normal client query can't see them.

### Cross-cutting principle
Where a feature could leak data, the answer is a **SECURITY DEFINER RPC that does per-row authorisation in its body**, not widening base RLS. Example: `get_post_versions` (clients see only versions ever sent to them).

---

## 6. RPC catalogue

All RPCs are `SECURITY DEFINER`, `set search_path = ''`, with an `auth.uid()` null-check; authorisation is enforced in the body. Invoked from server actions via `supabase.rpc(name, params)`.

### Content & approval
| RPC | Signature (key params) | Auth | Notes |
|---|---|---|---|
| `create_post` | `(client_id, channel_id?, title?, content_type?, scheduled_at?, body?, visual_content?, channel_ids uuid[]?) → uuid` | agency-for-client | Creates the item + v1, sets `current_version_id`. `channel_ids` (0054) validates each belongs to the client, writes the join set, sets `channel_id` to the first. |
| `set_post_channels` (0054) | `(item_id, channel_ids uuid[]) → void` | agency-for-client (no client path) | Replaces the post's channel set (`content_item_channel`); requires ≥1, each must belong to the client; sets `channel_id` to the first. **No fork, no status change.** |
| `split_post_channel` (0055) | `(item_id, channel_id) → jsonb` | agency-for-client (no client path) | Peels one channel (≥2 on the post; channel must be attached) into a new **draft** sibling: copies current body/visual, clones media to new paths, detaches the channel from the original (which **keeps its status**), links both via `post_group_id`. Returns `{new_item_id, media:[{old_path,new_path}]}` for the server-side storage copy. |
| `update_post` | `(item_id, title, channel_id, scheduled_at, body) → jsonb` | agency-for-client | In-place for mutable statuses; **forks v2** for frozen statuses, returns `[{old_path,new_path}]` media pairs for app-side storage copy. |
| `reschedule_content_item` (0038) | `(id, scheduled_at, mark_posted=false) → void` | agency-for-client (no client path) | Date-only move (drag-to-reschedule). **Never forks** (unlike `update_post`). `mark_posted` → `posted` only from `approved`/`scheduled`, else ignored. |
| `set_post_meta` (0042) | `(id, designer_id?, design_status?, drive_url?, high_res_url?, boost=false, ad_budget?, date_posted?, posted_url?) → void` | agency-for-client (no client path) | Production-metadata setter (content grid + drawer Production details). **No fork, no status change.** Validates `designer_id` in the post's agency. **Full overwrite of all metadata columns** → last-write-wins (§12 gotchas). |
| `transition_post` | `(item_id, action, note?) → text` | agency any; client only `approve`/`request_changes` from `client_review` | The state machine; logs `approval_event`; emits notifications. |
| `add_comment` | `(item_id, body, mentions uuid[] = '{}') → uuid` | member of the client | Emits comment notifications. **Mentions (0053):** each id must be an agency member of the post's agency OR a portal user of the post's client; notifies them (`type 'mention'`). |
| `delete_comment` | `(comment_id) → void` | author or agency | |
| `get_post_versions` | `(item_id) → setof (...)` | agency = all; client = sent versions only | Client filter = `EXISTS(approval_event WHERE version_id=cv.id AND action='approve_internal')`; nulls `internal_note` for clients; media ordered by `sort_order`. |

### Media
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `add_media` | `(version_id, storage_path, mime_type?, size_bytes?) → uuid` | agency-for-client | DB row only; the file is uploaded client-side first. |
| `delete_media` | `(media_id) → void` | agency-for-client | Call before `storage.remove` to avoid orphans. |
| `reorder_media` | `(version_id, ordered_ids uuid[]) → void` | agency-only | Sets `sort_order` to array index; only touches media of `version_id`. |

### Asset links (0026)
`add_asset_link(content_item_id, label, url)`, `update_asset_link(link_id, label, url)`, `delete_asset_link(link_id)` (all agency-for-client); `reorder_asset_link(content_item_id, ordered_ids uuid[])` (agency-only).

### Tasks (0028, +link 0031, +capacity 0043, +value 0045)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `create_task` | `(client_id?, task_type?, title, owner_id?, status?, priority?, due_date?, next_action?, notes?, content_item_id?, estimated_hours?, start_date?, value?, value_client_visible?, invoice_status?) → uuid` | agency (derives agency from membership) | Validates client / owner / content item belong to the agency. **Seeds subscribers + emits an assignment notification (0041).** Validates `estimated_hours>=0`, `start<=due` (0043), `value>=0`, `invoice_status` in set (0045). |
| `update_task` | `(task_id, … same fields …) → void` | agency member of the task's agency | **Full replace** (sets `updated_at`). **Re-seeds subscribers on owner change; emits assignment/status notifications (0041)** vs the pre-update owner/status. Same 0043/0045 validation. |
| `delete_task` | `(task_id) → void` | agency member of the task's agency | |

> **Param-adding migrations rebuild these (duplicate-function trap, §12).** 0031/0041/0043/0045 each `drop function if exists` the *exact prior signature* then recreate the **full current body** + the new params — `create or replace` alone would leave a stale overload. Verify live signatures via `pg_proc` before editing.

### Timesheets (0044)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `start_timer` | `(client_id, task_id?, note?) → uuid` | agency-for-client | Rejects a second running timer (also a partial unique index); validates task ↔ client. |
| `stop_timer` | `(entry_id, ended_at?) → void` | **owner only** | Explicit-end-capable; computes `duration_minutes`; rejects already-stopped / end ≤ start. |
| `log_time` | `(client_id, task_id, started_at, ended_at, note?) → uuid` | agency-for-client | Manual completed entry; `end > start`. |
| `update_time_entry` / `delete_time_entry` | `(entry_id, …) → void` | **owner only** | |
| `set_client_timesheet_enabled` | `(client_id, enabled) → void` | **agency_admin** of the client's agency | Toggles the timesheet UI flag (UI gate only — the timer/log RPCs are permissive). |

**Task subscription internals (0041):** `_task_accountable_user(task_id)` (client Lead PM → agency RACI `A` fallback → user_id), `_seed_task_subscribers(task_id)` (replace derived owner/accountable/creator rows; preserve `manual`; most-specific source wins), `_notify_task(user_ids[], type, task_id, actor_id, body, email)` (one row per subscriber, skips the actor, carries the email flag). Email-eligible task events: assignment + status ∈ Complete / Waiting on Client / On Hold / Ready for Review; all other status changes are in-app only.

### Internal notes (0039)
`add_internal_note(parent_type, parent_id, body, mentions uuid[] = '{}')` (agency member of the parent's agency — resolves agency post→client→agency / task→agency_id; **mentions may only target agency members of that agency, never a client contact**, 0053), `update_internal_note(id, body)` and `delete_internal_note(id)` (**author-only**). Reads are the RLS policy (via `can_see_internal_note`), not an RPC.

### Team directory (0034)
`update_team_member(id, full_name, role, email, is_active)` and `set_team_member_active(id, is_active)` — agency member of the member's agency; `full_name` required.

### Invites (0035)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `create_invite` | `(email, scope_type, scope_id, role) → uuid` | **agency_admin** of the scope's agency | Validates scope/role combo (agency→`agency_member`; client→`client_approver`/`client_viewer`), scope ownership (cross-tenant guard), no duplicate pending. |
| `revoke_invite` | `(id) → void` | **agency_admin** of the scope's agency | Sets `status='revoked'`. |
| `accept_pending_invites` | `() → int` | self (on login) | Reads the caller's email from `auth.users` (**never a param**); grants membership straight from each live pending invite (scope/role) → a client invite can never yield agency access; links the directory row; idempotent. |

### Permanent delete (0036) — two-step, admin-only
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `delete_team_member` | `(id, successor_id) → void` | **agency_admin** of the member's agency | Member must be **inactive** + have **no linked login**. Reassigns tasks / account ownership / 8 ownership slots / RACI (merge) to the successor, then deletes. |
| `delete_client` | `(id) → void` | **agency_admin** of the client's agency | Requires `status='archived'`. Deletes non-cascading children (task — SET NULL; client-scoped membership/invite — no FK), then the client (cascades the rest). DB-only — storage not purged. |

### View preferences (0037)
`set_view_preference(view_key, config jsonb) → void` — self (logged-in only); upserts the caller's own `(user_id, view_key)`; validates `config` is a JSON array.

### Admin (0030, 0032, 0033)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `set_client_ownership` | `(client_id, lead_pm_id?, comms_backup_id?, creative_lead_id?, design_owner_id?, content_owner_id?, video_owner_id?, sales_ops_id?, intern_support_id?) → void` | agency-for-client | Upsert (1:1); validates every assignee belongs to the client's agency. |
| `set_raci_matrix` | `(agency_id, cells jsonb) → void` | **agency_admin of that agency** | Transactional replace-all of the grid; validates team members; skips blank cells. |
| `set_member_role` | `(target_user_id, agency_id, role) → void` | **agency_admin of that agency** | Promote/demote between `agency_admin`/`agency_member`. Validates the role; requires an existing membership; **last-admin lockout** (can't demote the only admin). Casts `role::member_role`. |
| `list_agency_members` | `(agency_id) → table(user_id, role, full_name, email)` | **agency_admin of that agency** | Read helper (membership is own-rows-only under RLS). Resolves name from `team_member`, email from `auth.users`. |
| `set_agency_cost_per_hour` (0046, →`agency_internal` 0047) | `(agency_id, rate) → void` | **agency_admin of that agency** | Sensitive cost data. Upserts `agency_internal.cost_per_hour`; `rate >= 0` (null = unset). |

### Portal & CRM
`claim_client_access()` (self, on login — inserts membership for portal-enabled contacts matching the email); `set_contact_portal_access(contact_id, enabled)` (agency-for-client — on revoke, also deletes the matching client-scope membership, 0020); `create_client`/`update_client` (incl. `p_brand_colour`, `p_calendar_colour`; `update_client` preserves status/timezone/currency when the param is omitted, 0050); `set_client_status(client_id, status)` (0040 — lightweight agency-authorised archive/reactivate; validates the status value; use this, **not** the heavy `update_client`, for status-only changes); `add_team_member`; `add_contact`/`update_contact`/`delete_contact`; `add_brand_asset`/`update_brand_asset`/`delete_brand_asset`; `add_channel`/`delete_channel`; `add_client_deliverable`/`update_client_deliverable`/`delete_client_deliverable`/`reorder_client_deliverable` (0051 — all agency-for-client; agreed deliverables per client, agency-only; `add` appends at the next `sort_order`, `update` validates the cadence + stamps `updated_at`, `reorder` reindexes by array position within the client).

### Notification internals
`_notify(user_ids[], type, content_item_id, actor_id, body)` (content; one row per recipient, skips the actor; rows default `email=true`); `_agency_user_ids_for_client(client_id)`; `_portal_user_ids_for_client(client_id)`; and the task variant `_notify_task(user_ids[], type, task_id, actor_id, body, email)` (0041).

---

## 7. The approval state machine

`content_item.status`, driven by `transition_post`, every move logged to `approval_event`:

```
draft ──submit_internal──▶ internal_review ──approve_internal──▶ client_review
                                  │                                   │
                          request_changes                  approve │ request_changes
                                  ▼                                  ▼        ▼
                          changes_requested                     approved   changes_requested
                                  │                                  │ schedule
                          submit_internal                            ▼
                                  ▼                               scheduled
                            internal_review                          │ mark_posted
                                                                     ▼
                                                                   posted
```

- **Agency** drives `draft → internal_review → client_review` and `approved → scheduled → posted`.
- **Client** may only `approve` (→ approved) or `request_changes` (→ changes_requested), and only from `client_review`. Enforced **inside** `transition_post` (0017, pgTap-proven incl. cross-tenant rejection).
- Every transition writes an `approval_event` capturing the **current `version_id`** at that moment.
- A **note is required for `request_changes`** (enforced in the server action; applies to clients too).

---

## 8. Versioning (snapshot-on-send) & storage

**Migration 0021.** Only **`body` + `internal_note` + media** are versioned; `title`/`channel`/`scheduled_at` live on `content_item`.

- **Mutable statuses** (`draft`, `internal_review`, `changes_requested`): editing updates the current version in place.
- **Frozen statuses** (`client_review`, `approved`, `scheduled`, `posted`): editing **forks** a new version:
  1. Insert a new `content_version` (`version_no = max+1`, copy `internal_note`, carry media `sort_order`).
  2. Copy media rows to new storage paths under the v2 folder.
  3. Apply title/channel/scheduled to `content_item`, repoint `current_version_id`, set status → `internal_review` (bounce for re-review).
  4. Return `[{old_path, new_path}]` pairs so the app can `storage.copy` the objects (Postgres can't call the Storage API). Log-and-continue on copy failure; v1 is untouched, so a partial copy is recoverable.
- **Version history:** agency reads all versions from the page embed; clients use `get_post_versions` (0022), which returns **only versions ever sent to them** (those with an `approve_internal` event), `internal_note` nulled.

**Storage rules:** private `content-media` bucket; batched `createSignedUrls` for display; `<img>` not `next/image`; upload path `<client_id>/<content_item_id>/<version_id>/<filename>`; delete the DB row first then `storage.remove`.

---

## 9. Notifications spine

- `notification` table (recipient-scoped RLS, §5). `_notify(...)` inserts one row per recipient, **skipping the actor**.
- **Recipient resolvers:** `_agency_user_ids_for_client` (agency members of the client's agency), `_portal_user_ids_for_client` (logged-in portal users matched by `client_contact` email).
- **Emit points** (deliberately minimal, attention-based) inside the RPCs:
  - `transition_post` → `client_review`: notify portal users (`ready_for_review`).
  - `transition_post` `approve`: notify agency (`approved`).
  - `transition_post` `request_changes` from `client_review`: notify agency (`changes_requested`).
  - `add_comment`: agency comment on a client-visible post → portal; client comment → agency (`comment`).
- **Copy (0023):** bodies lead with client name + title; `notification.body` is the single source of truth (the bell and the email both use it).
- **Task events (0041):** tasks have subscribers (`task_subscriber`: owner / accountable=client Lead PM→RACI `A` fallback / creator; manual reserved), seeded by `create_task`/`update_task` and re-seeded on owner change. Assignment + status changes notify all subscribers except the actor via `_notify_task`, surfaced in the same bell (routing to `/tasks`). Email-eligible only for assignment + status ∈ Complete / Waiting on Client / On Hold / Ready for Review; all other status changes are **in-app only** (`email=false`).
- **Bell (in-app):** `NotificationBell` in the top bar; unread badge; 15 most recent; mark-read; click-to-open deep-links to the post, or to `/tasks` for task notifications (0041). V1 polls on open (no realtime yet).
- **Email (Edge Function):** `supabase/functions/notify-email/index.ts` (Deno), triggered by the **Database Webhook `notify_email_on_insert`** on `notification` INSERT. Deliver-only: resolves the recipient email (service-role `auth.admin.getUserById`) and sends via Resend; subject + body both from `record.body`; returns 200 on every path (no retry storms). **Skips rows with `email=false`** (in-app-only, 0041) — the DB decides, the function still only delivers; link falls back to `/tasks` for task notifications. Uses the verified Resend domain `mail.mood.mt`. **Live** (confirmed via Resend send logs); **redeploy required** for the `email=false` skip. Deployed separately from Vercel — see `supabase/functions/notify-email/DEPLOY.md`.

---

## 10. Migrations & testing

- Schema changes are **numbered files** `migrations/NNNN_name.sql`, run **manually** in the Supabase SQL editor (not auto-applied). Idempotent: `create … if not exists`, `drop policy if exists` then create, `create or replace`.
- Currently **0001–0057**; next is **0058**. See `PROJECT_GUIDE.md` §15 for the one-line ledger of each. Recent: 0048 close `client_internal` write side-door + RACI CHECK, 0049 `extend_invite`, 0050 `update_client` preserve status/timezone/currency on omit (the named **"preserve-don't-default"** lesson), 0051 `client_deliverable` table + RPCs, 0052 `content_version.visual_content`, 0053 structured `mention` rows on comments/notes, 0054 `content_item_channel` (multi-channel posts) + `set_post_channels`, 0055 `split_post_channel` (+ `post_group_id`), 0056 campaigns (entity + `campaign_id` grouping + client-match rule + hub), 0057 campaign brief/budgets/fee/KPI targets + the approve-before-production intake gate. **Ledger rule:** a param-changing function rebuild drops **both** the old and new signatures before `create` (else `42723` on re-run — 0057 does this); and any temp table read under `set local role authenticated` needs an explicit `grant` (else `42501` — 0056 test 14).
- Security-sensitive migrations ship a pgTap test `NNNN_*_test.sql`, runnable in the hosted SQL editor (no basejump). Proven pattern:
  - `create extension if not exists pgtap;`
  - temp `_t (seq int, line text)` + `select plan(N);` **before** any role switch.
  - Drive the caller via the `request.jwt.claims` GUC (which `auth.uid()` reads). For SECURITY-DEFINER-only tests, stay as the owner and only vary the GUC; for direct-RLS tests use `set local role authenticated` + the GUC, and drop to `set local role postgres` (not `reset`) to read true state.
  - Aggregate TAP lines into `_t`, emit via a final `select … union all … from finish()` ordered by `seq`. Number `_t` rows in call order.
  - `throws_ok(sql, '<sqlstate>')` 2-arg form; `is_empty`/`isnt_empty` for silent RLS reads; wrap in `begin; … rollback;`.
- All security migrations from 0015 onward are proven this way.

---

## 11. Operational runbook

### Apply a migration
1. Open the Supabase SQL editor for project `vwicrmwjatrphjviedce`.
2. Paste and run `migrations/NNNN_*.sql`.
3. **After any migration that adds/changes tables, columns, or relationships, refresh the PostgREST schema cache:** run `notify pgrst, 'reload schema';`. Without it the API returns "Could not find a relationship…" / "column does not exist" until the cache catches up.
4. If it ships a test, run `migrations/NNNN_*_test.sql` → expect `ok 1..N` (wrapped in `begin … rollback`, so it doesn't persist).

### Deploy the app
- Push to `main` → Vercel auto-deploys.
- **Ordering rule (critical):** if the commit's app code depends on a new column/RPC, **apply the migration to live FIRST**, then push — otherwise the live query/RPC call errors.

### Deploy the Edge Function
```
supabase functions deploy notify-email
```
Then ensure a **Database Webhook** exists on `public.notification` (event INSERT) pointing at the function URL. Email needs the verified Resend domain (`mail.mood.mt`). This is independent of the Vercel deploy.

### Environment
App env in `.env.local` + Vercel; Edge Function secret `RESEND_API_KEY` (service role auto-injected); `supabase/.temp/` is gitignored.

---

## 12. Hard-won gotchas (do not regress)

- **Next.js 16 middleware is `proxy.ts`** (exports `proxy`), NOT `middleware.ts`. `next build` does not lint.
- **Route group:** all authed pages under `app/(app)/` with the shared auth-gate `layout.tsx`. `/login`, `/auth` stay outside (no shell). `/admin*` has its own nested layout that hard-redirects non-admins.
- **Auth callback is client-side** — handles hash (implicit) + `?code` (PKCE), calls `claim_client_access()`. Don't convert to a server route.
- **RLS is the read floor; all writes via SECURITY DEFINER RPCs.** No write policies on content/management tables.
- **Enum columns — cast text→enum in RPCs** (`p_role::public.member_role`). Literals coerce; variables don't.
- **PostgREST embed ambiguity (PGRST201):** two FKs between the same pair of tables make an unqualified embed ambiguous → the whole query errors. The calendar embed must name the FK: `versions:content_version!content_version_content_item_id_fkey(...)` (0021 added a second FK). Single-FK embeds need no hint.
- **Fail loudly — don't swallow query errors.** Always read `{ data, error }`, log it, surface a visible notice. A discarded `error` once hid the PGRST201 bug as a silent empty calendar.
- **Reschedule bypasses `update_post` on purpose (0038).** `update_post` forks a new version + bounces frozen posts to `internal_review` — catastrophic for a drag-to-reschedule. Drag-reschedule uses `reschedule_content_item` (status/date only, no fork). Don't reroute it.
- **Polymorphic tables have no FK safety net (0039).** `internal_note.parent_id` points at `content_item` or `task` by `parent_type`. Both the RLS read (`can_see_internal_note`) and every write RPC resolve the parent's agency per-row; a missing parent fails closed. If you add a polymorphic parent, extend both.
- **`update_client` preserves status/timezone/currency on omit (0050); still prefer `set_client_status` for status-only changes (0040).** The status-revert was root-caused: `update_client` defaulted `p_status`/`p_timezone`/`p_currency` to `'active'`/`'Europe/Malta'`/`'EUR'`, so a field the caller didn't resend was reset. 0050 defaults them to null and coalesces to the existing value. The lightweight `set_client_status` still writes only `status` and remains the right tool for archive/reactivate.
- **A post can target several channels (`content_item_channel`, 0054).** One post, one approval; its content is shared across many of its client's channels. `channel_id` stays the denormalised **primary** (first in the set) so single-channel reads keep working. Channels are edited via `set_post_channels` (no fork / no status change), **not** `update_post`; `create_post` takes the whole set via `p_channel_ids`. **Tailoring / split-on-divergence (0055):** `split_post_channel` peels one channel into its own **draft** sibling (copying current body/visual + media) and detaches it from the original; siblings are linked by `post_group_id` and approve independently.
- **`set_post_meta` is a full-overwrite → last-write-wins (0042).** It writes *every* production-metadata column on each call, so callers must always send the row's complete current metadata (the content grid / drawer hold per-row state and do). Consequence: **concurrent edits to the same post's metadata are last-write-wins at the row level** — a known, accepted limitation at current team scale. Move to per-column setters / column-level merge if it bites. Like `reschedule_content_item`, it does **not** fork a version or change status.
- **Notification email flag (0041).** `notification.email` (default true) marks a row in-app-only (`false`) vs in-app + email (`true`). The Edge Function obeys it (skips `false`). Content notifications default true (unchanged); task notifications set it per the meaningful-event rule. The function must be **redeployed** for the skip to take effect.
- **Archived-hiding is an agency-only view filter.** Posts/tasks of `status='archived'` clients are hidden by default on agency surfaces (calendar/tasks/dashboard) with a "Show archived" toggle — a pure read-time filter, no data change. It is scoped to agency users: a client-portal user always sees their own client's posts normally regardless of archived status (the `archived` flag is gated on `isAgency` in `page.tsx`).
- **Storage:** private bucket; `createSignedUrls` only; never `getPublicUrl`; `<img>` not `next/image`; the upload path format is parsed by storage policies.
- **Dates** are Europe/Malta, week starts Monday — use `lib/week.ts`; bucket by real date, never weekday.
- **`tsconfig` excludes `supabase/`** so Next's `tsc` doesn't type-check the Deno Edge Function.
- **Migrations are manual + idempotent**, applied to live before the dependent app push. `schema.sql` is reference only; never run it on live.

---

## 13. Known open backend items

1. **Auto-send invite emails (0035 follow-on)** — the invite record + accept-on-login flow are live, but the email is shared manually. `notify-email` keys on an existing `user_id` (which an invitee lacks), so auto-send needs a separate path (service-role `inviteUserByEmail`/`generateLink`, or an invite-specific email).
2. **WEBHOOK_SECRET hardening** — `notify-email` has an optional shared-secret header check, currently **commented out (V1)**. Set `WEBHOOK_SECRET` as an Edge secret + the matching header on the webhook and enable it.
3. **Column prefs on more views (0037 follow-on)** — the mechanism is view-agnostic and shipped on the task list; adopt it on the clients + team lists (define each view's `COLUMNS`, read its pref, drop in `<ColumnPicker>`).
4. **Bell realtime** — currently polls on open; add Supabase realtime.
5. **@mentions** — mention internal (`team_member`) / external (`client_contact`/portal) people on comments, stored as **structured rows** (not parsed from text), emitted from the existing RPC write paths. Planned tables: extend `notification`; add `notification_preference` (per-user × per-channel toggles).
6. **Task-system slices** — subtasks/checklists, client-facing task sharing (the portal), auto-spawn from templates, a gantt/timeline view. Manual task subscriptions (the `task_subscriber.source='manual'` slot is reserved, 0041) — a subscribe/unsubscribe button + per-user notification preferences are not built yet.
7. **`set_post_meta` concurrency (0042)** — full-overwrite last-write-wins on the same post's metadata; revisit (per-column setters) only if it bites at larger team scale.
9. **Content-grid follow-ons** — Drive/high-res links are single columns that overlap `post_asset_link` (the labelled-link list); reconcile if needed. The grid is month-scoped (reuses the calendar's window).
10. **Finer permissions** — the `agency_admin` vs `agency_member` split is enforced for the Admin area and all high-stakes actions (RACI edit, role changes, invites, permanent deletes, cost rate, profitability). Still open: decide which routine actions (billing edits, etc.) should additionally require `agency_admin`.
11. **Timesheets / profitability follow-ons** — no client-facing surface yet (`time_entry` is agency-only; `task.value_client_visible` is a stored gate with no client read path). Profitability `value` is **not** date-distributed (margins are partial for in-progress jobs over a narrow range — surfaced as a caveat, not yet modelled). Cost rate is a single flat agency rate (no per-person/role rates).

*Done this cycle: invites (0035), team edit/deactivate + permanent delete (0034/0036), per-user column prefs (0037), drag-to-reschedule (0038), internal notes (0039), client archive/reactivate/delete (0040), task subscriptions + notifications (0041), content grid + production metadata (0042), task capacity fields + capacity planner (0043), internal timesheets (0044), job value/invoice (0045), agency cost-per-hour (0046) + its admin-only relocation to `agency_internal` (0047 — closed the member-readable cost-rate leak), the profitability report at `/reports`, closing the last `client_internal` write side-door + RACI CHECK (0048), `extend_invite` (0049), `update_client` preserve-on-omit (0050), agreed client deliverables (0051), the global "+ Log time" modal, and the `/reports` redesign into a tabbed shell open to all members (member-visible Time + Capacity, admin-only Profitability). Email delivery live via Resend.*

*Keep this current: when you ship a migration or change the security model / RPC surface, update the relevant section here and in `PROJECT_GUIDE.md`.*
