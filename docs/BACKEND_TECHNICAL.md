# Mood — Backend Technical Reference

**Audience:** developers (backend / full-stack) working on Mood.
**Scope:** the objective of the platform, the architecture, the database and security model, the full RPC catalogue, migrations, operations, and the gotchas that will bite you if you don't know them.
**Authority:** where this disagrees with `CLAUDE.md` or older notes, this document and the numbered SQL in `migrations/` win. Current as of **migration 0040**. See also [`PROJECT_GUIDE.md`](./PROJECT_GUIDE.md) (the broader reference) and [`EMPLOYEE_HANDBOOK.md`](./EMPLOYEE_HANDBOOK.md) (non-technical).

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
migrations/                # numbered SQL (0001–0040) + pgTap *_test.sql  ← source of truth for the DB
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
| `client` | A client of the agency | `id`, `agency_id`, `name`, `status` (text + CHECK: prospect/active/paused/archived), `website`, `industry`, `brand_colour` (brand identity), `calendar_colour` (0025 — calendar tag, distinct from brand). |
| `membership` | user ↔ scope, with role | `user_id`, `scope_type` (`agency`/`client`), `scope_id`, `role` (**enum `member_role`**). The basis of all access. **RLS: own rows only.** |
| `team_member` | Agency staff directory (0005; edit/deactivate 0034) | `agency_id`, `full_name`, `role` (free text job title), `email`, `user_id` (nullable → auth.users), `is_active`. Owners/RACI/ownership resolve against this by `full_name`/`user_id`. Edited via `update_team_member`; soft-deactivated via `set_team_member_active`; hard-deleted (reassign-then-delete) via `delete_team_member` (0036). |
| `invite` | Pending invite to grant a membership (0035) | `id`, `email` (lower-cased, no citext dep), `scope_type` (`agency`/`client`), `scope_id`, `role`, `status` (`pending`/`accepted`/`revoked`/`expired`), `invited_by`, `created_at`, `expires_at` (default +7d), `accepted_at`. Partial unique index `(email, scope_type, scope_id) where status='pending'`. **No FK on `scope_id`** (points at agency *or* client). RLS read = the `agency_admin` whose agency owns the scope; writes RPC-only. |

### Content
| Table | Purpose | Key columns |
|---|---|---|
| `channel` | A publishing channel per client | `id`, `client_id`, `type` (instagram/facebook/linkedin/blog/newsletter/…), `label`. |
| `content_item` | A planned post | `id`, `client_id`, `channel_id`, `title`, `content_type`, `scheduled_at`, `status` (**enum `content_status`**), `current_version_id` (→ content_version, FK added 0021), `created_by`, `updated_at`. |
| `content_version` | Versioned body of a post (0021) | `id`, `content_item_id`, `version_no` (unique per item via `uq_version_no`), `body`, `internal_note`, `created_by`, `created_at`. |
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

### Internal management
| Table | Migration | Notes |
|---|---|---|
| `task` | 0028, +`content_item_id` 0031 | `id`, `agency_id`, `client_id` (nullable, on delete set null), `content_item_id` (nullable → content_item on delete set null, links a task to a post), `task_type`, `title`, `owner_id` (→ team_member), `status` (text, default 'Not Started'), `priority` (text, default 'Medium'), `due_date`, `next_action`, `notes`, `created_by`, timestamps. **Internal-only** (agency-scoped read; no client branch). Status/priority/type values are validated app-side via `lib/taskConstants.ts` (they are plain text columns, not enums). |
| `raci_matrix` | 0027, editable 0032 | `id`, `agency_id`, `task_type`, `team_member_id` (→ team_member cascade), `raci_value` (plain text: A/R/C/I/S), unique `(agency_id, task_type, team_member_id)`. Agency-scoped RLS read; edited via the admin-only `set_raci_matrix`. Seeded for Mood Agency (15 task types × 7 people). |
| `internal_note` | 0039 | Polymorphic agency-only notes on a post **or** task. `id`, `parent_type` (`post`/`task`, CHECK), `parent_id` (**no FK**), `author_id` (→ auth.users on delete set null), `body`, `created_at`, `updated_at` (null until edited); index `(parent_type, parent_id, created_at)`. **No client path.** RLS read resolves the parent's agency per-row via `can_see_internal_note(parent_type, parent_id)`; writes RPC-only. |
| `user_view_preference` | 0037 | Per-user UI prefs. PK `(user_id, view_key)`; `config` jsonb (ordered `[{key,hidden}]`), `updated_at`; `user_id → auth.users` cascade. **Own-rows-only RLS** (`user_id = auth.uid()` for read + write) — the one table a user writes for itself, still upserted via `set_view_preference`. Shipped on the task list (`view_key='tasks'`). |

### Notifications
| Table | Migration | Notes |
|---|---|---|
| `notification` | 0019, copy enriched 0023 | `user_id` (recipient), `type` (`ready_for_review`/`approved`/`changes_requested`/`comment`), `content_item_id` (→ content_item cascade), `actor_id`, `body`, `read_at` (null = unread), `created_at`. |

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
| `create_post` | `(client_id, channel_id?, title?, content_type?, scheduled_at?, body?) → uuid` | agency-for-client | Creates the item + v1, sets `current_version_id`. |
| `update_post` | `(item_id, title, channel_id, scheduled_at, body) → jsonb` | agency-for-client | In-place for mutable statuses; **forks v2** for frozen statuses, returns `[{old_path,new_path}]` media pairs for app-side storage copy. |
| `reschedule_content_item` (0038) | `(id, scheduled_at, mark_posted=false) → void` | agency-for-client (no client path) | Date-only move (drag-to-reschedule). **Never forks** (unlike `update_post`). `mark_posted` → `posted` only from `approved`/`scheduled`, else ignored. |
| `transition_post` | `(item_id, action, note?) → text` | agency any; client only `approve`/`request_changes` from `client_review` | The state machine; logs `approval_event`; emits notifications. |
| `add_comment` | `(item_id, body) → uuid` | member of the client | Emits comment notifications. |
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

### Tasks (0028, +content link 0031)
| RPC | Signature | Auth | Notes |
|---|---|---|---|
| `create_task` | `(client_id?, task_type?, title, owner_id?, status?, priority?, due_date?, next_action?, notes?, content_item_id?) → uuid` | agency (derives agency from membership) | Validates client / owner / content item belong to the agency. |
| `update_task` | `(task_id, … same fields incl. content_item_id …) → void` | agency member of the task's agency | **Full replace** (sets `updated_at`). Mark-complete re-sends all fields with `status='Complete'`; kanban drag re-sends with the new `status`. |
| `delete_task` | `(task_id) → void` | agency member of the task's agency | |

### Internal notes (0039)
`add_internal_note(parent_type, parent_id, body)` (agency member of the parent's agency — resolves agency post→client→agency / task→agency_id), `update_internal_note(id, body)` and `delete_internal_note(id)` (**author-only**). Reads are the RLS policy (via `can_see_internal_note`), not an RPC.

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

### Portal & CRM
`claim_client_access()` (self, on login — inserts membership for portal-enabled contacts matching the email); `set_contact_portal_access(contact_id, enabled)` (agency-for-client — on revoke, also deletes the matching client-scope membership, 0020); `create_client`/`update_client` (incl. `p_brand_colour`, `p_calendar_colour`); `set_client_status(client_id, status)` (0040 — lightweight agency-authorised archive/reactivate; validates the status value; use this, **not** the heavy `update_client`, for status-only changes); `add_team_member`; `add_contact`/`update_contact`/`delete_contact`; `add_brand_asset`/`update_brand_asset`/`delete_brand_asset`; `add_channel`/`delete_channel`.

### Notification internals
`_notify(user_ids[], type, content_item_id, actor_id, body)` (inserts one row per recipient, skipping the actor); `_agency_user_ids_for_client(client_id)`; `_portal_user_ids_for_client(client_id)`.

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
- **Bell (in-app):** `NotificationBell` in the top bar; unread badge; 15 most recent; mark-read; click-to-open deep-links to the post. V1 polls on open (no realtime yet).
- **Email (Edge Function):** `supabase/functions/notify-email/index.ts` (Deno), triggered by the **Database Webhook `notify_email_on_insert`** on `notification` INSERT. Deliver-only: resolves the recipient email (service-role `auth.admin.getUserById`) and sends via Resend; subject + body both from `record.body`; returns 200 on every path (no retry storms). Uses the verified Resend domain `mail.mood.mt`. **Live** (confirmed via Resend send logs). Deployed separately from Vercel — see `supabase/functions/notify-email/DEPLOY.md` for the deploy + webhook runbook.

---

## 10. Migrations & testing

- Schema changes are **numbered files** `migrations/NNNN_name.sql`, run **manually** in the Supabase SQL editor (not auto-applied). Idempotent: `create … if not exists`, `drop policy if exists` then create, `create or replace`.
- Currently **0001–0040**. See `PROJECT_GUIDE.md` §15 for the one-line ledger of each. Recent: 0034 team edit/deactivate, 0035 invites, 0036 permanent delete, 0037 view preferences, 0038 reschedule, 0039 internal notes, 0040 `set_client_status`.
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
- **Set client status via `set_client_status`, not `update_client` (0040).** The lightweight setter writes only `status`. The heavy `update_client` resends every field and its status write **exhibited a status-revert this session** (saving "Archived" from the edit form came back "Active") — root cause unconfirmed and the edit-form path is unchanged, so prefer `set_client_status` for status-only changes.
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
4. **`update_client` status-revert** — diagnosed this session, not root-caused; the edit form's status change reverts to "Active". Sidestepped by `set_client_status`; still open for the edit-form path.
5. **Bell realtime** — currently polls on open; add Supabase realtime.
6. **@mentions** — mention internal (`team_member`) / external (`client_contact`/portal) people on comments, stored as **structured rows** (not parsed from text), emitted from the existing RPC write paths. Planned tables: extend `notification`; add `notification_preference` (per-user × per-channel toggles).
7. **Task-system slices** — subtasks/checklists, client-facing task sharing (the portal), auto-spawn from templates, a gantt/timeline view.
8. **Finer permissions** — the `agency_admin` vs `agency_member` split is enforced for the Admin area and all high-stakes actions (RACI edit, role changes, invites, permanent deletes). Still open: decide which routine actions (billing edits, etc.) should additionally require `agency_admin`.

*Done this cycle: invites (0035), team edit/deactivate + permanent delete (0034/0036), per-user column prefs (0037), drag-to-reschedule (0038), internal notes (0039), client status actions + archive/reactivate/delete in the list (0040), client data export, agency-only archived-hiding. Email delivery (deploy `notify-email` + the `notify_email_on_insert` webhook) — live via Resend.*

*Keep this current: when you ship a migration or change the security model / RPC surface, update the relevant section here and in `PROJECT_GUIDE.md`.*
