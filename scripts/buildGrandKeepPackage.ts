/**
 * Build a shippable `.saves/grand-keep.json` for The Grand Keep showcase world.
 *
 * The world is authored as a generator preset (`grand-keep`). We bake a neighborhood of
 * chunk deltas around spawn, the gate, and the keep so cold-start has content; the rest
 * streams in from the generator at runtime.
 *
 *   npx tsx scripts/buildGrandKeepPackage.ts
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGenerator } from '../src/worldgen/Presets.ts';
import { applyOverlays } from '../src/worldgen/Generator.ts';
import { CHUNK_SIZE_X, CHUNK_SIZE_Z, WORLD_HEIGHT } from '../src/core/constants.ts';
import { voxelIndex } from '../src/core/coords.ts';
import { AIR } from '../src/blocks/blocks.ts';
import { SAVE_VERSION } from '../src/persistence/SaveTypes.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const SEED = 1337;

/** Inclusive world AABB regions to bake (keep + approach + south wall/town). */
const REGIONS: Array<{ x0: number; x1: number; z0: number; z1: number; yMin?: number; yMax?: number }> =
  [
    // Approach road + outer town + south wall
    { x0: -50, x1: 60, z0: -160, z1: -70, yMin: 60, yMax: 100 },
    // Gate + inner bailey south
    { x0: -100, x1: 110, z0: -90, z1: 25, yMin: 60, yMax: 100 },
    // Keep footprint full height (tall solar + stack)
    { x0: -42, x1: 58, z0: 20, z1: 84, yMin: 55, yMax: 420 },
    // East/west bailey villages (surface band)
    { x0: -90, x1: -40, z0: 20, z1: 90, yMin: 60, yMax: 95 },
    { x0: 55, x1: 110, z0: 20, z1: 90, yMin: 60, yMax: 95 },
  ];

function worldToCx(w: number): number {
  return Math.floor(w / CHUNK_SIZE_X);
}

function main(): void {
  const metaPath = resolve(root, 'experimental/grand-keep/save-meta.json');
  const metaFile = JSON.parse(readFileSync(metaPath, 'utf8')) as {
    meta: Record<string, unknown>;
  };

  // Showcase spawn: dramatic approach (not the king-suite debug spawn)
  const meta = {
    ...metaFile.meta,
    seed: SEED,
    version: SAVE_VERSION,
    preset: 'grand-keep',
    title: 'The Grand Keep',
    description:
      'A colossal fully explorable castle-city: thirty storeys of halls and balconies, a multi-storey King\'s Solar with open atrium, a village bailey, and high-rise sky towers linked by multi-level bridges. Climb from the gate to the Crown Tower — or descend into the Deep Dungeon.',
    spawn: { x: 8, y: 74.5, z: -155 },
    look: { yaw: 3.1416, pitch: 0.15 },
  };

  const { generator, overlays } = createGenerator('grand-keep');
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

    // Which y band to bake for this column?
    const wx0 = cx * CHUNK_SIZE_X;
    const wz0 = cz * CHUNK_SIZE_Z;
    let yMin = 0;
    let yMax = WORLD_HEIGHT - 1;
    // Prefer the tightest matching region band
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
  const out = resolve(savesDir, 'grand-keep.json');
  writeFileSync(out, JSON.stringify(snapshot));
  const mb = Buffer.byteLength(JSON.stringify(snapshot)) / (1024 * 1024);
  console.log(
    `Wrote ${out}\n  chunks: ${Object.keys(chunks).length} · entries: ${totalEntries} · ~${mb.toFixed(2)} MB`,
  );
}

main();
