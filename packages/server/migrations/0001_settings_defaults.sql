-- Custom migration (drizzle-kit generate --custom): default settings.
-- Released migration files are never edited; add a new one instead.
INSERT INTO `settings` (`key`, `value`) VALUES
  ('retention_days', '180'),
  ('last_cleanup_at', '0');
