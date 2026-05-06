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
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NameEntry {
	name: string;
	sex: 'M' | 'F';
	peakYear: number;
	totalCount: number;
	related?: string[];
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
// Manual fetch: https://www.behindthename.com/ (the bulk synonyms export the
// maintainer downloads). Place file(s) in data/btn/ (gitignored).
// Only the processed static/names.json ships.
//
// Expected file: TSV with `#`-prefixed comment header. After the comment block,
// each line is `<name>\t<gender>\t<comma-separated related names>`.
// Sample:        Aaden\tm\tAden,Aidan,Aiden,Aydan,Ayden
//
// License: the bulk export is declared CC BY-SA 4.0 in its file header — a
// distinct license grant from BTN's website terms. Attribution required;
// redistribution permitted.
// ---------------------------------------------------------------------------

interface BtnRecord {
	related: string[];
}

export function parseBtnTsv(raw: string): Map<string, BtnRecord> {
	const out = new Map<string, BtnRecord>();
	for (const line of raw.split('\n')) {
		// Skip blank lines and comment lines (the file header and the column-name comment).
		if (line === '' || line.startsWith('#')) continue;

		const parts = line.split('\t');
		// A valid row has name, gender, related — three tab-separated fields.
		if (parts.length < 3) continue;

		const name = parts[0].trim();
		if (!name) continue;

		const rawRelated = parts[2].trim();
		const related =
			rawRelated === ''
				? []
				: rawRelated
						.split(',')
						.map((s) => s.trim())
						.filter((s) => s !== '');

		out.set(name.toLowerCase(), { related });
	}
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

	const files = readdirSync(btnDir).filter((f) => f.endsWith('.txt'));
	if (files.length === 0) {
		process.stderr.write(
			'[build-names] data/btn/ has no .txt files; skipping BTN enrichment.\n',
		);
		return result;
	}

	for (const file of files) {
		const filePath = `${btnDir}/${file}`;
		try {
			const raw = readFileSync(filePath, 'utf8');
			const parsed = parseBtnTsv(raw);
			// Last-write-wins on duplicate name keys across files.
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

	return entries.map((entry) => {
		const record = btnData.get(entry.name.toLowerCase());
		if (record === undefined || record.related.length === 0) return entry;
		return { ...entry, related: record.related };
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

// Only run the build pipeline when invoked as a script (e.g. `pnpm build:names`).
// Importing this module from tests should not trigger SSA download or names.json writes.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err: unknown) => {
		process.stderr.write(`[build-names] Fatal error: ${String(err)}\n`);
		process.exit(1);
	});
}
