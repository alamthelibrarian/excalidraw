ALTER TABLE share_links ADD COLUMN expires_at TEXT;
ALTER TABLE share_links ADD COLUMN revoked_at TEXT;

CREATE INDEX IF NOT EXISTS idx_share_links_active
  ON share_links(id, revoked_at, expires_at);
