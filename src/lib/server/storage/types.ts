/**
 * Thin storage interfaces that are strict structural subsets of D1Database and
 * KVNamespace. The Cloudflare bindings satisfy these interfaces natively — no
 * wrapping needed on the Cloudflare target.
 *
 * The Node target (node.ts) provides concrete implementations backed by
 * better-sqlite3.
 */

export interface BrambleStatement {
	bind(...values: unknown[]): BrambleStatement;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
	first<T = Record<string, unknown>>(): Promise<T | null>;
	run(): Promise<{ meta: { changes: number } }>;
}

export interface BrambleDB {
	prepare(sql: string): BrambleStatement;
}

export interface BrambleKV {
	get<T>(key: string, type: 'json'): Promise<T | null>;
	put(key: string, value: string): Promise<void>;
	delete(key: string): Promise<void>;
}

export interface Storage {
	db: BrambleDB;
	kv: BrambleKV;
}
