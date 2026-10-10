-- InclusiveMarket — accessibility preferences follow the account (C-22).
--
-- im_ui_prefs (0001, widened in 0007) mirrored most of the accessibility
-- toolbar but nothing ever wrote it, so a setting chosen on one device was
-- lost on the next. The app now syncs it. Two toolbar options had no column.
-- Writes go through the server (service role) only, like every im_ table
-- since 0013; a client can read its own row.
--
-- Rollback: supabase/rollback/0022_down.sql

begin;

alter table public.im_ui_prefs
  add column if not exists large_cursors boolean not null default false,
  add column if not exists visual_alerts boolean not null default false;

commit;
