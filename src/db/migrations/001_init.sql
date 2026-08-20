-- Greenfield: core tables for URL storage and click analytics.
CREATE TABLE IF NOT EXISTS urls (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code    TEXT NOT NULL UNIQUE,
  long_url      TEXT NOT NULL,
  custom_alias  INTEGER NOT NULL DEFAULT 0,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL,
  expires_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);

CREATE TABLE IF NOT EXISTS clicks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  short_code    TEXT NOT NULL,
  clicked_at    TEXT NOT NULL,
  referrer      TEXT,
  user_agent    TEXT,
  FOREIGN KEY (short_code) REFERENCES urls(short_code)
);

CREATE INDEX IF NOT EXISTS idx_clicks_short_code ON clicks(short_code);
