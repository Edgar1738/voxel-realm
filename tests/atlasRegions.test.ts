// Validates the World Atlas registry itself (structure only — the data-aware checks that region
// footprints don't overlap live in atlasWorld.test.ts, which loads the real snapshots).
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  WORLD_ATLAS_REGIONS,
  atlasRegionProblems,
  regionChunkOffset,
} from '../src/worldgen/atlas/atlasRegions';
import { validateManifest, type WorldManifest } from '../src/persistence/worldManifest';
import { readFileSync } from 'node:fs';

const root = resolve(__dirname, '..');
const manifest = JSON.parse(
  readFileSync(resolve(root, 'world-manifest.json'), 'utf8'),
) as WorldManifest;

describe('World Atlas registry', () => {
  it('is structurally valid (unique ids/saves, chunk-aligned placement)', () => {
    expect(atlasRegionProblems()).toEqual([]);
  });

  it('places at least three regions (milestone V1)', () => {
    expect(WORLD_ATLAS_REGIONS.length).toBeGreaterThanOrEqual(3);
  });

  it('has unique region ids', () => {
    const ids = WORLD_ATLAS_REGIONS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only source saves that are bundled AND in the manifest', () => {
    for (const region of WORLD_ATLAS_REGIONS) {
      const bundle = resolve(root, 'public', 'worlds', `${region.sourceSave}.json`);
      expect(existsSync(bundle), `${region.sourceSave}: missing bundle ${bundle}`).toBe(true);
      const inManifest = manifest.worlds.some((w) => w.slug === region.sourceSave);
      expect(inManifest, `${region.sourceSave} not in world-manifest.json`).toBe(true);
    }
    // Sanity: the manifest itself is well-formed, so the above cross-checks something real.
    expect(validateManifest(manifest)).toEqual([]);
  });

  it('spaces region anchors far enough apart in chunk units to keep footprints disjoint', () => {
    const offsets = WORLD_ATLAS_REGIONS.map(regionChunkOffset);
    for (let i = 0; i < offsets.length; i++) {
      for (let j = i + 1; j < offsets.length; j++) {
        const chebyshev = Math.max(
          Math.abs(offsets[i].dcx - offsets[j].dcx),
          Math.abs(offsets[i].dcz - offsets[j].dcz),
        );
        expect(chebyshev, `regions ${i} and ${j} too close`).toBeGreaterThanOrEqual(32);
      }
    }
  });

  it('rejects a duplicate id', () => {
    const dup = [...WORLD_ATLAS_REGIONS, WORLD_ATLAS_REGIONS[0]];
    expect(atlasRegionProblems(dup)).toContain(
      `duplicate region id "${WORLD_ATLAS_REGIONS[0].id}"`,
    );
  });

  it('rejects non-chunk-aligned placement', () => {
    const bad = [
      { ...WORLD_ATLAS_REGIONS[0], id: 'bad', sourceSave: 'x', position: { x: 7, y: 0, z: 0 } },
    ];
    expect(atlasRegionProblems(bad).some((p) => p.includes('chunk-aligned'))).toBe(true);
  });
});
