/**
 * Build a shippable `.saves/cloudspire-citadel.json` for Cloudspire Citadel.
 *
 * Generator preset bakes a neighborhood of chunk deltas so cold-start has the
 * arrival overlook, gate, cathedral, palace, and spire; the rest streams from
 * the generator at runtime.
 *
 *   npx tsx scripts/buildCloudspirePackage.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from '../src/worldgen/Presets.ts';
import { applyOverlays } from '../src/worldgen/Generator.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants.ts';
import { voxelIndex } from '../src/core/coords.ts';
import { AIR } from '../src/blocks/blocks.ts';
import { SAVE_VERSION } from '../src/persistence/SaveTypes.ts';
import { curatedPresetMeta } from '../src/app/curatedPreset.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SEED = 1337;

const REGIONS: Array<{ x0: number; x1: number; z0: number; z1: number; yMin?: number; yMax?: number }> =
  [
    // Arrival overlook + approach
    { x0: -40, x1: 40, z0: -220, z1: -130, yMin: 90, yMax: 140 },
    // Outer south gate + lower district
    { x0: -130, x1: 130, z0: -140, z1: -70, yMin: 90, yMax: 160 },
    // Gardens + cathedral + palace court
    { x0: -110, x1: 110, z0: -70, z1: 60, yMin: 95, yMax: 200 },
    // Palace + spire full height
    { x0: -55, x1: 90, z0: -20, z1: 70, yMin: 100, yMax: 440 },
    // Waterfalls / reservoir band
    { x0: -90, x1: 90, z0: -50, z1: 30, yMin: 90, yMax: 150 },
  ];

function worldToCx(w: number): number {
  return Math.floor(w / CHUNK_SIZE_X);
}

function main(): void {
  const curated = curatedPresetMeta('cloudspire-citadel', SEED, SAVE_VERSION);
  if (!curated) throw new Error('missing curated meta');

  const meta = {
    ...curated,
    seed: SEED,
    version: SAVE_VERSION,
    preset: 'cloudspire-citadel',
  };

  const { generator, overlays } = createGenerator('cloudspire-citadel');
  const chunks: Record<string, Array<[number, number] | [number, number, number]>> = {};
  const chunkSet = new Set<string>();

  for (const r of REGIONS) {
    const cx0 = worldToCx(r.x0);
    const cx1 = worldToCx(r.x1);
    const cz0 = worldToCx(r.z0);
    const cz1 = worldToCx(r.z1);
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        chunkSet.add(`${cx},${cz}`);
      }
    }
  }

  console.log(`Baking ${chunkSet.size} chunk columns…`);
  let totalEntries = 0;
  let n = 0;
  for (const key of chunkSet) {
    const [cxs, czs] = key.split(',');
    const cx = Number(cxs);
    const cz = Number(czs);
    const chunk = generator.generateBaseChunk(SEED, cx, cz);
    applyOverlays(chunk, cx, cz, SEED, overlays);

    const wx0 = cx * CHUNK_SIZE_X;
    const wz0 = cz * CHUNK_SIZE_Z;
    let yMin = 0;
    let yMax = WORLD_HEIGHT - 1;
    let matched = false;
    for (const r of REGIONS) {
      const overlaps =
        wx0 + CHUNK_SIZE_X - 1 >= r.x0 &&
        wx0 <= r.x1 &&
        wz0 + CHUNK_SIZE_Z - 1 >= r.z0 &&
        wz0 <= r.z1;
      if (!overlaps) continue;
      if (!matched) {
        yMin = r.yMin ?? 0;
        yMax = r.yMax ?? WORLD_HEIGHT - 1;
        matched = true;
      } else {
        yMin = Math.min(yMin, r.yMin ?? 0);
        yMax = Math.max(yMax, r.yMax ?? WORLD_HEIGHT - 1);
      }
    }
    if (!matched) continue;

    const entries: Array<[number, number] | [number, number, number]> = [];
    for (let y = yMin; y <= yMax; y++) {
      for (let lz = 0; lz < CHUNK_SIZE_Z; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE_X; lx++) {
          const id = chunk.get(lx, y, lz);
          if (id === AIR) continue;
          const state = chunk.getState(lx, y, lz);
          const idx = voxelIndex(lx, y, lz);
          if (state) entries.push([idx, id, state]);
          else entries.push([idx, id]);
        }
      }
    }
    if (entries.length > 0) {
      chunks[key] = entries;
      totalEntries += entries.length;
    }
    n++;
    if (n % 20 === 0) console.log(`  … ${n}/${chunkSet.size} (${totalEntries} entries)`);
  }

  const snapshot = { meta, chunks };
  const savesDir = resolve(root, '.saves');
  mkdirSync(savesDir, { recursive: true });
  const out = resolve(savesDir, 'cloudspire-citadel.json');
  writeFileSync(out, JSON.stringify(snapshot));
  const mb = Buffer.byteLength(JSON.stringify(snapshot)) / (1024 * 1024);
  console.log(
    `Wrote ${out}\n  chunks: ${Object.keys(chunks).length} · entries: ${totalEntries} · ~${mb.toFixed(2)} MB`,
  );

  // experimental meta (no chunks) for restore/dev seeding
  const expDir = resolve(root, 'experimental/cloudspire-citadel');
  mkdirSync(expDir, { recursive: true });
  writeFileSync(resolve(expDir, 'save-meta.json'), JSON.stringify({ meta, chunks: {} }, null, 2));
  console.log(`Wrote experimental/cloudspire-citadel/save-meta.json`);
}

main();
