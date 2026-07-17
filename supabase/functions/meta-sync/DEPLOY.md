# meta-sync — deploy & schedule runbook

Pulls Meta campaign insights into `public.campaign_metric` as daily `source='sync'` rows. Runs
**nightly** (pg_cron + pg_net) and **on-demand** from the hub "Sync now" button. See `index.ts`
for the contract; the DB (`upsert_synced_metric`, `set_campaign_sync_status`, migration 0061)
owns the sync rules — this function only fetches from Meta and calls those RPCs as the service role.

> **Do not deploy or schedule until asked.** This document is the artefact; run it manually.

Project ref: `vwicrmwjatrphjviedce`. Function URL:
`https://vwicrmwjatrphjviedce.supabase.co/functions/v1/meta-sync`

---

## 1. Secret

```bash
supabase secrets set META_SYSTEM_USER_TOKEN=EAAB... --project-ref vwicrmwjatrphjviedce
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected — do not set them.
```

The token is a **Meta System User token** with `ads_read` on the **partnered** ad accounts that
own the linked campaigns. If the partner share is missing, Meta returns "permission" errors that
land verbatim in each campaign's `meta_sync_error`.

## 2. Deploy

```bash
supabase functions deploy meta-sync --project-ref vwicrmwjatrphjviedce
```

Leave JWT verification on (default). "Sync now" invokes it with the agency user's session JWT
(the server action first checks the user may read the campaign); pg_cron invokes it with the
service-role bearer (below). Re-run after any edit to `index.ts`.

## 3. Nightly schedule — pg_cron + pg_net

The recommended, version-controlled mechanism. Requires the `pg_cron` and `pg_net` extensions
(Supabase → Database → Extensions) and the service-role key stored in **Vault** (never in the SQL
or the repo). Run this **once**, manually, in the SQL editor:

```sql
-- extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service-role key in Vault so the cron body never contains it.
-- (Dashboard → Project Settings → Vault, or:)
select vault.create_secret(
  '<SERVICE_ROLE_KEY>',           -- paste the project's service_role key
  'service_role_key',
  'Service role key for scheduled Edge Function calls'
);

-- 04:00 UTC ≈ 06:00 Europe/Malta (summer) / 05:00 (winter). pg_cron has no timezone; the ±1h
-- DST drift is fine for a nightly job. The function is idempotent, so extra runs never harm.
select cron.schedule(
  'meta-sync-nightly',
  '0 4 * * *',
  $$
  select net.http_post(
    url     := 'https://vwicrmwjatrphjviedce.supabase.co/functions/v1/meta-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- inspect / remove:
--   select * from cron.job;
--   select cron.unschedule('meta-sync-nightly');
```

## Behaviour notes (don't "fix" these)

- **Idempotent** — daily `upsert_synced_metric` means re-runs and overlapping windows (Meta
  restates recent days; the function re-pulls a trailing 28 days) update rather than duplicate.
- **Manual rows win** — a synced day inside a `source='manual'` meta period is skipped; the
  campaign's `meta_sync_error` says so. Nothing double-counts; nothing silently vanishes.
- **Fail loudly, per campaign** — a Meta API error writes the human cause to that campaign's
  `meta_sync_error` and continues with the rest; success stamps `meta_last_synced_at` + clears the
  error. If every campaign fails identically, the token/app is the likely cause (logged prominently).
- **Graph API version is pinned** in `index.ts` (`v21.0`) with a **review-by date** — confirm it's
  still supported before deploy.

## Selection & mapping (reference)

- Synced: campaigns with non-empty `meta_campaign_ids` and phase `production`/`live`, plus
  `wrapped` campaigns whose `end_date` is within the last 14 days (late attribution).
- Results = the action whose `action_type` matches `meta_results_action` if set, else by objective:
  `leads→lead`, `conversions`/`sales`→`purchase` (accepts `omni_purchase`), `traffic→link_click`,
  `awareness→` none (results stay null — reach is its own column; we never fake results).
