-- Keep setup closed once the first passkey is registered, even if every
-- passkey is deleted later. Released migration files are never edited.

-- Sites that already have a passkey are closed now.
INSERT OR IGNORE INTO settings (key, value)
  SELECT 'setup_closed_at', CAST(strftime('%s', 'now') AS INTEGER) * 1000
  WHERE EXISTS (SELECT 1 FROM passkey);

-- Every later passkey insert records it in the same transaction.
CREATE TRIGGER passkey_closes_setup AFTER INSERT ON passkey
BEGIN
  INSERT OR IGNORE INTO settings (key, value)
    VALUES ('setup_closed_at', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
END;
