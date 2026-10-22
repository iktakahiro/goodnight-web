-- Contact submissions and site settings.
-- Released migration files are never edited; add a new numbered file instead.

CREATE TABLE submissions (
  id           TEXT PRIMARY KEY,            -- ULID (sortable by time)
  created_at   INTEGER NOT NULL,            -- unix ms
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  company      TEXT,
  phone        TEXT,
  category     TEXT,
  body         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'new'
               CHECK (status IN ('new', 'read', 'done', 'held', 'spam')),
  spam_score   INTEGER NOT NULL DEFAULT 0,
  spam_reasons TEXT,                        -- JSON array of rule names
  ip_hash      TEXT,                        -- HMAC-SHA256(ip, IP_HASH_SECRET); never the raw IP
  user_agent   TEXT,
  country      TEXT,                        -- request.cf.country
  page_path    TEXT,                        -- page that sent the form
  consent_at   INTEGER NOT NULL,            -- unix ms of privacy policy consent (0 = not given)
  notified_at  INTEGER,                     -- unix ms of a delivered Slack notification
  read_at      INTEGER
);

-- Retention pruning and the admin list.
CREATE INDEX idx_submissions_created ON submissions (created_at);
-- Unread count and status filter.
CREATE INDEX idx_submissions_status_created ON submissions (status, created_at);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('retention_days', '180'),
  ('last_cleanup_at', '0');
