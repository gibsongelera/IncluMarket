-- ROLLBACK for 0022_ui_prefs_complete.sql. DEV only.
begin;
alter table public.im_ui_prefs
  drop column if exists large_cursors,
  drop column if exists visual_alerts;
commit;
