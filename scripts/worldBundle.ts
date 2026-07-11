// scripts/worldBundle.ts
//
// CLI: bundle the curated collection for static hosting. For every world in
// world-manifest.json, validate `.saves/<slug>.json` against its manifest entry and write the
// packed VRW1 binary to `public/worlds/<slug>.vrw` (served by Vite/Pages next to the app),
// verifying the binary round-trips back to the exact save first. Prunes bundles whose slug left
// the manifest (and superseded .json bundles), so public/worlds/ always mirrors the manifest.
//
//   npm run world:bundle

import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import {
  entryMetaProblems,
  validateManifest,
  type WorldManifest,
} from '../src/persistence/worldManifest.ts';
import { parseWorldSnapshot, snapshotToDeltas } from '../src/persistence/WorldSnapshot.ts';
import { encodeWorldBinary, decodeWorldBinary } from '../src/persistence/WorldBinary.ts';
import type { WorldDeltas } from '../src/persistence/SaveTypes.ts';

const cwd = process.cwd();
const manifestPath = resolve(cwd, 'world-manifest.json');
const savesDir = resolve(cwd, '.saves');
const outDir = resolve(cwd, 'public', 'worlds');

if (!existsSync(manifestPath)) {
  console.error('world:bundle: no world-manifest.json — nothing to bundle.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as WorldManifest;
const manifestProblems = validateManifest(manifest);
if (manifestProblems.length > 0) {
  console.error('world:bundle: manifest is invalid:');
  for (const problem of manifestProblems) console.error(`  - ${problem}`);
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

let failed = false;
const bundled = new Set<string>();
for (const entry of manifest.worlds) {
  const saveFile = join(savesDir, `${entry.slug}.json`);
  if (!existsSync(saveFile)) {
    console.error(`world:bundle: "${entry.slug}": save not found: ${saveFile}`);
    failed = true;
    continue;
  }
  const raw: unknown = JSON.parse(readFileSync(saveFile, 'utf8'));
  const { snapshot, dropped } = parseWorldSnapshot(raw, { isValidBlockId: () => true });
  if (dropped > 0) {
    console.error(`world:bundle: "${entry.slug}": save has ${dropped} malformed entries.`);
    failed = true;
    continue;
  }
  const problems = entryMetaProblems(entry, snapshot.meta);
  if (problems.length > 0) {
    console.error(`world:bundle: "${entry.slug}": snapshot doesn't match the manifest:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    failed = true;
    continue;
  }
  // Round-trip guard: the emitted binary must decode back to exactly the save's deltas + meta.
  const deltas = snapshotToDeltas(snapshot);
  const binary = encodeWorldBinary(snapshot.meta, deltas);
  const decoded = decodeWorldBinary(binary, { isValidBlockId: () => true });
  if (decoded.dropped > 0 || !deltasEqual(decoded.deltas, deltas)) {
    console.error(`world:bundle: "${entry.slug}": binary round-trip mismatch — not shipping it.`);
    failed = true;
    continue;
  }
  const outFile = join(outDir, `${entry.slug}.vrw`);
  writeFileSync(outFile, Buffer.from(binary));
  bundled.add(`${entry.slug}.vrw`);
  console.log(`  ${entry.slug}.vrw  ${(binary.byteLength / 1024 / 1024).toFixed(2)} MB`);
}

// A bundle whose slug left the manifest must not keep shipping; superseded .json bundles too.
// Only prune after a fully successful run — a partial failure must not delete valid bundles.
if (!failed) {
  for (const file of readdirSync(outDir)) {
    if ((file.endsWith('.json') || file.endsWith('.vrw')) && !bundled.has(file)) {
      unlinkSync(join(outDir, file));
      console.log(`  pruned stale ${file}`);
    }
  }
}

function deltasEqual(a: WorldDeltas, b: WorldDeltas): boolean {
  if (a.size !== b.size) return false;
  for (const [key, chunk] of a) {
    const other = b.get(key);
    if (!other || other.size !== chunk.size) return false;
    for (const [index, packed] of chunk) if (other.get(index) !== packed) return false;
  }
  return true;
}

if (failed) process.exit(1);
console.log(`world:bundle: ${bundled.size}/${manifest.worlds.length} world(s) -> public/worlds/`);
