/**
 * build-names.ts
 *
 * Preprocessing pipeline for the Bramble name dataset.
 *
 * Usage: pnpm run build:names
 *
 * Produces static/names.json from two optional sources:
 *   1. SSA national baby name data (downloaded automatically)
 *   2. Behind the Name data (must be placed manually — see BTN comment below)
 *
 * System requirements: the `unzip` binary (standard on macOS and Linux).
 */

import { execFileSync } from 'node:child_process';
import {
	createWriteStream,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import { pipeline } from 'node:stream/promises';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NameEntry {
	name: string;
	sex: 'M' | 'F';
	peakYear: number;
	totalCount: number;
	origin?: string;
	meaning?: string;
}

// Intermediate accumulator keyed by `name|sex`
interface NameAccumulator {
	name: string;
	sex: 'M' | 'F';
	yearCounts: Map<number, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SSA_URL = 'https://www.ssa.gov/oact/babynames/names.zip';
const DATA_DIR = 'data/ssa';
const ZIP_PATH = `${DATA_DIR}/names.zip`;
const EXTRACT_DIR = `${DATA_DIR}/extracted`;
const OUTPUT_PATH = 'static/names.json';

const YEAR_START = 1995;
const YEAR_END = 2024;
const MIN_COUNT_ANY_YEAR = 100;

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

async function downloadZip(): Promise<void> {
	if (existsSync(ZIP_PATH)) {
		process.stderr.write(
			`[build-names] Zip already cached at ${ZIP_PATH}, skipping download.\n`,
		);
		return;
	}

	mkdirSync(DATA_DIR, { recursive: true });
	process.stderr.write(`[build-names] Downloading ${SSA_URL} ...\n`);

	const response = await fetch(SSA_URL);
	if (!response.ok || response.body === null) {
		throw new Error(`Failed to download SSA data: HTTP ${response.status}`);
	}

	const dest = createWriteStream(ZIP_PATH);
	// Node's fetch body is a web ReadableStream; pipeline accepts it via node:stream/promises
	await pipeline(response.body as unknown as NodeJS.ReadableStream, dest);

	process.stderr.write(`[build-names] Download complete.\n`);
}

// ---------------------------------------------------------------------------
// Extract
// ---------------------------------------------------------------------------

function extractZip(): void {
	if (existsSync(EXTRACT_DIR)) {
		const files = readdirSync(EXTRACT_DIR);
		if (files.some((f) => f.startsWith('yob'))) {
			process.stderr.write(
				`[build-names] Already extracted to ${EXTRACT_DIR}, skipping.\n`,
			);
			return;
		}
	}

	mkdirSync(EXTRACT_DIR, { recursive: true });
	process.stderr.write(`[build-names] Extracting ${ZIP_PATH} ...\n`);

	// Requires the system `unzip` binary (standard on macOS and Linux).
	// We intentionally avoid adding a zip library dependency for this build-time-only step.
	execFileSync('unzip', ['-o', ZIP_PATH, '-d', EXTRACT_DIR], {
		stdio: ['ignore', 'pipe', 'pipe'],
	});

	process.stderr.write(`[build-names] Extraction complete.\n`);
}

// ---------------------------------------------------------------------------
// Parse SSA data
// ---------------------------------------------------------------------------

function parseSsaData(): Map<string, NameAccumulator> {
	const accumulator = new Map<string, NameAccumulator>();

	for (let year = YEAR_START; year <= YEAR_END; year++) {
		const filePath = `${EXTRACT_DIR}/yob${year}.txt`;
		if (!existsSync(filePath)) {
			process.stderr.write(
				`[build-names] Warning: missing file ${filePath}, skipping year ${year}.\n`,
			);
			continue;
		}

		const lines = readFileSync(filePath, 'utf8').split('\n');
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			const parts = trimmed.split(',');
			if (parts.length !== 3) continue;

			const [rawName, rawSex, rawCount] = parts;
			const name = rawName.trim();
			const sex = rawSex.trim() as 'M' | 'F';
			const count = parseInt(rawCount.trim(), 10);

			if (sex !== 'M' && sex !== 'F') continue;
			if (Number.isNaN(count)) continue;

			const key = `${name}|${sex}`;
			let entry = accumulator.get(key);
			if (entry === undefined) {
				entry = { name, sex, yearCounts: new Map() };
				accumulator.set(key, entry);
			}
			entry.yearCounts.set(year, count);
		}
	}

	process.stderr.write(
		`[build-names] Parsed ${accumulator.size} (name, sex) pairs from SSA data.\n`,
	);
	return accumulator;
}

// ---------------------------------------------------------------------------
// Filter and aggregate
// ---------------------------------------------------------------------------

function buildNameEntries(
	accumulator: Map<string, NameAccumulator>,
): NameEntry[] {
	const results: NameEntry[] = [];

	for (const entry of accumulator.values()) {
		// Keep only if any single year in the window had >= MIN_COUNT_ANY_YEAR occurrences
		const maxCount = Math.max(...entry.yearCounts.values());
		if (maxCount < MIN_COUNT_ANY_YEAR) continue;

		let peakYear = YEAR_START;
		let peakCount = 0;
		let totalCount = 0;

		for (const [year, count] of entry.yearCounts) {
			totalCount += count;
			if (count > peakCount) {
				peakCount = count;
				peakYear = year;
			}
		}

		results.push({ name: entry.name, sex: entry.sex, peakYear, totalCount });
	}

	process.stderr.write(
		`[build-names] After filtering (≥${MIN_COUNT_ANY_YEAR} in any year): ${results.length} entries.\n`,
	);

	return results;
}

// ---------------------------------------------------------------------------
// BTN enrichment
//
// Manual fetch: https://www.behindthename.com/ (exact download path depends on
// your account — the maintainer must retrieve it manually).
// Place the downloaded file(s) in data/btn/ (gitignored; never committed).
// Only the processed static/names.json ships.
//
// Expected JSON shape: [{ "name": "Olivia", "origin": "Latin", "meaning": "olive tree" }, ...]
// Expected CSV shape:  header row `name,origin,meaning` then one entry per line.
//
// License: CC BY-SA 4.0 — attribution required; redistribution permitted.
// ---------------------------------------------------------------------------

interface BtnRecord {
	origin: string;
	meaning: string;
}

// Minimal JSON BTN record — only fields we consume are required.
interface BtnJsonRow {
	name: string;
	origin: string;
	meaning: string;
	// BTN exports may include `gender` or `sex`; we don't need either for enrichment.
	[key: string]: string;
}

function parseBtnJson(raw: string, file: string): Map<string, BtnRecord> {
	const rows = JSON.parse(raw) as BtnJsonRow[];
	const out = new Map<string, BtnRecord>();
	for (const row of rows) {
		if (typeof row.name !== 'string' || !row.name) continue;
		const origin = typeof row.origin === 'string' ? row.origin : '';
		const meaning = typeof row.meaning === 'string' ? row.meaning : '';
		out.set(row.name.toLowerCase(), { origin, meaning });
	}
	process.stderr.write(
		`[build-names] BTN JSON ${file}: loaded ${out.size} records.\n`,
	);
	return out;
}

function parseBtnCsv(raw: string, file: string): Map<string, BtnRecord> {
	// Simple split-on-comma parser. Does not handle quoted fields containing commas —
	// if a future BTN export uses quoted CSV, replace this with a quoted-field-aware splitter.
	const lines = raw.split('\n').filter((l) => l.trim() !== '');
	if (lines.length === 0) return new Map();

	const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
	const nameIdx = header.indexOf('name');
	const originIdx = header.indexOf('origin');
	const meaningIdx = header.indexOf('meaning');

	if (nameIdx === -1 || originIdx === -1 || meaningIdx === -1) {
		throw new Error(
			`Missing required columns (name, origin, meaning) in ${file}; found: ${header.join(', ')}`,
		);
	}

	const out = new Map<string, BtnRecord>();
	for (const line of lines.slice(1)) {
		const cols = line.split(',');
		const name = cols[nameIdx]?.trim() ?? '';
		if (!name) continue;
		const origin = cols[originIdx]?.trim() ?? '';
		const meaning = cols[meaningIdx]?.trim() ?? '';
		out.set(name.toLowerCase(), { origin, meaning });
	}
	process.stderr.write(
		`[build-names] BTN CSV ${file}: loaded ${out.size} records.\n`,
	);
	return out;
}

function loadBtnData(): Map<string, BtnRecord> {
	const btnDir = 'data/btn';
	const result = new Map<string, BtnRecord>();

	if (!existsSync(btnDir)) {
		process.stderr.write(
			'[build-names] No data/btn/ directory found; skipping BTN enrichment.\n',
		);
		return result;
	}

	const files = readdirSync(btnDir).filter(
		(f) => f.endsWith('.json') || f.endsWith('.csv') || f.endsWith('.txt'),
	);
	if (files.length === 0) {
		process.stderr.write(
			'[build-names] data/btn/ is empty; skipping BTN enrichment.\n',
		);
		return result;
	}

	for (const file of files) {
		const filePath = `${btnDir}/${file}`;
		try {
			const raw = readFileSync(filePath, 'utf8');
			let parsed: Map<string, BtnRecord>;
			if (file.endsWith('.json')) {
				parsed = parseBtnJson(raw, file);
			} else {
				// .csv or .txt — treat as header-row CSV
				parsed = parseBtnCsv(raw, file);
			}
			// Last-write-wins on duplicate name keys across files
			for (const [key, record] of parsed) {
				result.set(key, record);
			}
		} catch (err) {
			process.stderr.write(
				`[build-names] BTN parse error in ${file}: ${String(err)}\n`,
			);
			// Continue processing remaining files
		}
	}

	process.stderr.write(
		`[build-names] BTN enrichment: ${result.size} records loaded from ${files.length} file(s).\n`,
	);
	return result;
}

function enrichWithBtn(
	entries: NameEntry[],
	btnData: Map<string, BtnRecord>,
): NameEntry[] {
	if (btnData.size === 0) return entries;

	// Merge BTN data into entries by name (case-insensitive key).
	// When BTN data is properly loaded, this will populate origin and meaning.
	return entries.map((entry) => {
		const record = btnData.get(entry.name.toLowerCase());
		if (record === undefined) return entry;
		return { ...entry, origin: record.origin, meaning: record.meaning };
	});
}

// ---------------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------------

function sortEntries(entries: NameEntry[]): NameEntry[] {
	// Deterministic sort: name ascending, then sex ascending (F before M).
	return [...entries].sort((a, b) => {
		const nameCmp = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
		if (nameCmp !== 0) return nameCmp;
		return a.sex.localeCompare(b.sex);
	});
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	process.stderr.write('[build-names] Starting name dataset build...\n');

	await downloadZip();
	extractZip();

	const accumulator = parseSsaData();
	let entries = buildNameEntries(accumulator);

	const btnData = loadBtnData();
	entries = enrichWithBtn(entries, btnData);

	entries = sortEntries(entries);

	writeFileSync(OUTPUT_PATH, JSON.stringify(entries, null, '\t'));

	process.stderr.write(
		`[build-names] Done. Wrote ${entries.length} entries to ${OUTPUT_PATH}.\n`,
	);
}

main().catch((err: unknown) => {
	process.stderr.write(`[build-names] Fatal error: ${String(err)}\n`);
	process.exit(1);
});
