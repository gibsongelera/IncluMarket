-- ROLLBACK for 0022_ui_prefs_complete.sql. DEV only.
--
-- Nothing to undo: large_cursors and visual_alerts belong to 0007, and
-- dropping them here would delete saved preferences that 0007 owns.
-- (An earlier draft dropped them; it was never applied anywhere.)
select 1;
