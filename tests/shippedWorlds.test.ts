// CI guard for the static world pipeline: the committed manifest and the bundled snapshots in
// public/worlds/ must agree, and both must be loadable by the CURRENT engine. This is what makes
// "the demo actually serves the curated collection" an enforced invariant instead of a hope.
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  validateManifest,
  entryMetaProblems,
  type WorldManifest,
} from '../src/persistence/worldManifest';
import { decodeWorldBinary } from '../src/persistence/WorldBinary';
import { SAVE_VERSION } from '../src/persistence/SaveTypes';
import { isWorldPreset } from '../src/worldgen/Presets';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

const root = resolve(__dirname, '..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'world-manifest.json'), 'utf8'),
) as WorldManifest;
const registry = new BlockRegistry();

describe('shipped world collection', () => {
  it('has a valid manifest', () => {
    expect(validateManifest(manifest)).toEqual([]);
    expect(manifest.worlds.length).toBeGreaterThan(0);
  });

  it('every entry targets the current engine (save version + known preset)', () => {
    for (const entry of manifest.worlds) {
      expect(entry.version, `"${entry.slug}" version`).toBe(SAVE_VERSION);
      expect(isWorldPreset(entry.preset), `"${entry.slug}" preset "${entry.preset}"`).toBe(true);
    }
  });

  for (const entry of manifest.worlds) {
    it(`"${entry.slug}" is bundled in public/worlds/ and matches its manifest entry`, () => {
      const file = resolve(root, 'public', 'worlds', `${entry.slug}.vrw`);
      expect(existsSync(file), `${file} missing — run: npm run world:bundle`).toBe(true);

      const buffer = readFileSync(file);
      const { meta, deltas, dropped } = decodeWorldBinary(
        buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        { isValidBlockId: (id) => registry.has(id) },
      );
      expect(dropped, `"${entry.slug}" has entries the current registry rejects`).toBe(0);
      expect(entryMetaProblems(entry, meta)).toEqual([]);
      expect(deltas.size).toBeGreaterThan(0);
    });
  }
});
