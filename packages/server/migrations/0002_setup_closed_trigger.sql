-- Custom migration (drizzle-kit generate --custom): keep setup closed once
-- the first passkey is registered, even if every passkey is deleted later.
-- drizzle-kit does not track triggers. If a later migration recreates the
-- `passkey` table, it must create this trigger again (docs/decisions/0005).
-- Released migration files are never edited; add a new one instead.
CREATE TRIGGER `passkey_closes_setup` AFTER INSERT ON `passkey`
BEGIN
  INSERT OR IGNORE INTO `settings` (`key`, `value`)
    VALUES ('setup_closed_at', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;
