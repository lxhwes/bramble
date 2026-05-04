-- Shortlist table: per-session pinned names that couples want to revisit.
--
-- A session_id here refers to the KV session key used throughout the app
-- (not the D1 sessions.id FK). This keeps the shortlist self-contained and
-- independent of the D1 session rows that W2.1–W2.2 will populate.
--
-- UNIQUE(session_id, name, sex) makes INSERT OR IGNORE idempotent.

CREATE TABLE IF NOT EXISTS shortlists (
	id         INTEGER PRIMARY KEY AUTOINCREMENT,
	session_id TEXT    NOT NULL,
	name       TEXT    NOT NULL,
	sex        TEXT    NOT NULL CHECK (sex IN ('M', 'F')),
	created_at INTEGER NOT NULL,  -- Unix milliseconds
	UNIQUE (session_id, name, sex)
);

CREATE INDEX IF NOT EXISTS idx_shortlists_session ON shortlists (session_id);
