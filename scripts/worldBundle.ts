// scripts/worldBundle.ts
//
// CLI: bundle the curated collection for static hosting. For every world in
// world-manifest.json, validate `.saves/<slug>.json` against its manifest entry and write a
// compact copy to `public/worlds/<slug>.json` (served by Vite/Pages next to the app). Prunes
// bundles whose slug left the manifest, so public/worlds/ always mirrors the manifest exactly.
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
import type { WorldMeta } from '../src/persistence/SaveTypes.ts';

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
  const snapshot = JSON.parse(readFileSync(saveFile, 'utf8')) as { meta?: WorldMeta };
  const problems = entryMetaProblems(entry, snapshot.meta);
  if (problems.length > 0) {
    console.error(`world:bundle: "${entry.slug}": snapshot doesn't match the manifest:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    failed = true;
    continue;
  }
  const outFile = join(outDir, `${entry.slug}.json`);
  const compact = JSON.stringify(snapshot);
  writeFileSync(outFile, compact);
  bundled.add(`${entry.slug}.json`);
  console.log(`  ${entry.slug}.json  ${(compact.length / 1024 / 1024).toFixed(2)} MB`);
}

// A bundle whose slug left the manifest must not keep shipping.
for (const file of readdirSync(outDir)) {
  if (file.endsWith('.json') && !bundled.has(file)) {
    unlinkSync(join(outDir, file));
    console.log(`  pruned stale ${file}`);
  }
}

if (failed) process.exit(1);
console.log(`world:bundle: ${bundled.size}/${manifest.worlds.length} world(s) -> public/worlds/`);
