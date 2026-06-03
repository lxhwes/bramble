-- KV table: stores key/value pairs for the Node SQLite backend.
--
-- The Cloudflare build uses native KVNamespace; this table is only
-- accessed by the Node adapter (src/lib/server/storage/node.ts).
-- Creating it on D1 is harmless — D1 ignores the unused table.

CREATE TABLE IF NOT EXISTS kv (
	key        TEXT    PRIMARY KEY,
	value      TEXT    NOT NULL,
	updated_at INTEGER NOT NULL  -- Unix milliseconds
);
