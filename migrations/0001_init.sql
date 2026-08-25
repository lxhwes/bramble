-- Bramble initial D1 schema
--
-- Tables:
--   users       — registered accounts (nullable; anonymous sessions have no user)
--   sessions    — a swipe session shared by one or more partners
--   partners    — a named participant slot within a session
--   votes       — one row per name per partner swipe decision
--   name_meta   — optional cached name attributes (origin, peak year, total count)
--
-- SQLite dialect (D1 = SQLite under the hood).
-- All primary keys are TEXT UUIDs generated at the application layer.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
	id         TEXT PRIMARY KEY,
	email      TEXT NOT NULL UNIQUE,
	created_at INTEGER NOT NULL  -- Unix milliseconds
);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
	id         TEXT PRIMARY KEY,
	-- NULL for anonymous sessions (no account required).
	user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
	created_at INTEGER NOT NULL  -- Unix milliseconds
);

-- ---------------------------------------------------------------------------
-- partners
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS partners (
	id         TEXT PRIMARY KEY,
	session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
	-- Human-readable slug chosen at join time (e.g. "alex").
	slug       TEXT NOT NULL,
	created_at INTEGER NOT NULL,  -- Unix milliseconds
	UNIQUE (session_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_partners_session_id ON partners (session_id);

-- ---------------------------------------------------------------------------
-- votes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS votes (
	id         TEXT PRIMARY KEY,
	partner_id TEXT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
	name       TEXT NOT NULL,
	-- 'M' or 'F' — mirrors the sex field in the names dataset.
	sex        TEXT NOT NULL CHECK (sex IN ('M', 'F')),
	-- 'yes', 'no', or 'super'.
	vote       TEXT NOT NULL CHECK (vote IN ('yes', 'no', 'super')),
	ts         INTEGER NOT NULL,  -- Unix milliseconds; the time the vote was cast
	UNIQUE (partner_id, name, sex)
);

CREATE INDEX IF NOT EXISTS idx_votes_partner_id ON votes (partner_id);

-- ---------------------------------------------------------------------------
-- name_meta
-- ---------------------------------------------------------------------------
-- Caches name attributes that are otherwise served from static/names.json.
-- Populated by the build:names script if/when the maintainer decides to move
-- this data into D1 (deferred decision per docs/history/PHASE-1.5.md).
CREATE TABLE IF NOT EXISTS name_meta (
	name      TEXT NOT NULL,
	sex       TEXT NOT NULL CHECK (sex IN ('M', 'F')),
	-- Calendar year in which this name peaked in popularity.
	peak_year INTEGER,
	-- Total SSA-reported births across all recorded years.
	total     INTEGER,
	origin    TEXT,
	meaning   TEXT,
	PRIMARY KEY (name, sex)
);
