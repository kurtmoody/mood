-- Migration 0029 — drop the legacy `asset` table.
--
-- `public.asset` was the original Drive-flavoured asset table from the initial schema
-- (source = upload|gdrive, drive_file_id, drive_web_url, thumbnail_url, …). It was never
-- used: the application references it zero times. Uploads are handled by `media` (0018)
-- and labelled links by `post_asset_link` (0026), both of which superseded it.
--
-- Crucially it still carried a STATUS-LESS read policy (`asset_read`) — the one content
-- table that never received the 0015 read floor — so it was a latent security gap: had
-- it held rows, a client could have read assets on pre-`client_review` posts. Confirmed
-- empty before dropping.
--
-- Nothing else depends on it (no inbound FKs, RPCs, views, or triggers); its only FK
-- points OUT to content_version. CASCADE drops the asset_read policy along with the
-- table. Idempotent: `if exists` makes a re-run a no-op.

drop table if exists public.asset cascade;
