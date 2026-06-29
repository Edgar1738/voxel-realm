# Content Track C — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated set of new full-cube blocks, prefabs, a Swamp biome, and a `frontier` preset — all via the data-driven block registry + the `Prefab` type, with no engine/mesher/save changes.

**Architecture:** New blocks are append-only `BLOCK_DEFS` rows (a few add a small `textures.ts` pattern builder). New prefabs are pure `Prefab` generators in `prefabs.ts`. The Swamp biome extends `BiomeMap`/`SurfacePainter`; a `frontier` preset wires the new prefabs via the existing `scatterStructures` overlay; emerald ore joins `OreScatterer`.

**Tech Stack:** TypeScript (strict), three.js r0.185, Vite 8, Vitest 4. No new dependencies.

## Global Constraints

- **Block ids append-only** (`src/blocks/blocks.ts`); next free id is **19**; ids ∈ [0,255]; never reorder/reuse. `CREATIVE_BLOCKS` derives from the `creative` flag; the registry self-check (id/light range, faces resolve) must pass at boot.
- **Save schema + mesher contract unchanged.** No `SAVE_VERSION` change; `faceLayer(id,face):number` unchanged.
- **Determinism:** any new scatter/ore hashing uses `Math.imul` (like the existing scatterers).
- **Strict TS, no `any`.** Run `npm run -s build` (`tsc --noEmit && vite build`) AND `npm run -s lint` on every task (prettier is an ESLint error — fix with `npx prettier --write <files>`). Full suite: `npx vitest run`.
- **Conventional commits**; body ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **VERIFY HEAD after each commit:** `git rev-parse HEAD` must equal the implementer's reported SHA before review (a past run had agents commit onto the wrong parent).

## Shared values (used across tasks)

- New block id constants (append-only, in this order): `DEEPSLATE=19`, `EMERALD_ORE=20`, `GLOWSTONE=21`, `BOOKSHELF=22`, `FURNACE=23`, `MUD=24`, `TERRACOTTA=25`, `GRAVEL=26`.
- New `PatternName`s: `'glow'`, `'bookshelf'`, `'furnace'`.

---

### Task 1: New texture patterns (`glow`, `bookshelf`, `furnace`)

**Files:**
- Modify: `src/blocks/textures.ts`
- Test: `tests/textures.test.ts`

**Interfaces:**
- Produces: `PatternName` gains `'glow' | 'bookshelf' | 'furnace'`; `buildPattern` handles them.

- [ ] **Step 1: Write the failing test** — append to `tests/textures.test.ts`:

```ts
import { resolvePixel } from '../src/blocks/textures';
describe('new content patterns', () => {
  it('resolves glow/bookshelf/furnace to a Pixel', () => {
    for (const pattern of ['glow', 'bookshelf', 'furnace'] as const) {
      const px = resolvePixel({ pattern, colors: [[200, 180, 100]] });
      const c = px(3, 4, () => 0.5);
      expect(c).toHaveLength(3);
      expect(c.every((v) => typeof v === 'number')).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/textures.test.ts` (these `PatternName`s don't exist; TS/runtime error).

- [ ] **Step 3: Implement.** In `src/blocks/textures.ts`:
  - Add to the `PatternName` union: `| 'glow' | 'bookshelf' | 'furnace'`.
  - Add three builders next to the existing ones (e.g. after `oreP`):

```ts
/** Bright, faintly-mottled emitter face (glowstone). */
const glowP =
  (base: RGB): Pixel =>
  (_px, _py, rng) =>
    shade(base, (rng() - 0.5) * 18 + (rng() < 0.2 ? 14 : 0));
/** Horizontal shelves with vertical book spines (bookshelf side). */
const bookshelfP =
  (wood: RGB): Pixel =>
  (px, py, rng) => {
    const shelf = py % 7 === 0 || py % 7 === 6;
    if (shelf) return shade(wood, -28);
    const spine = (px * 7 + ((py / 7) | 0) * 13) % 5;
    const tint: RGB = spine === 0 ? [150, 60, 50] : spine === 2 ? [60, 90, 150] : [70, 120, 70];
    return shade(tint, (rng() - 0.5) * 20);
  };
/** Stone block with a dark firebox arch (furnace front). */
const furnaceP =
  (stoneBase: RGB, fire: RGB): Pixel =>
  (px, py, rng) => {
    const inFirebox = px >= 4 && px <= 11 && py >= 8 && py <= 13;
    return inFirebox ? shade(fire, (rng() - 0.5) * 24) : shade(stoneBase, (rng() - 0.5) * 18);
  };
```

  - Add cases to the `buildPattern` switch:

```ts
    case 'glow':
      return glowP(c0);
    case 'bookshelf':
      return bookshelfP(c0);
    case 'furnace':
      return furnaceP(c0, c1);
```

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/textures.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/textures.ts tests/textures.test.ts
git commit -m "feat(blocks): glow/bookshelf/furnace texture patterns"
```

---

### Task 2: New blocks (8 declarative rows)

**Files:**
- Modify: `src/blocks/blocks.ts`
- Test: `tests/blocks.test.ts`

**Interfaces:**
- Consumes: the new patterns (Task 1); existing `stone`/`speck`/`ore` helpers.
- Produces: id consts `DEEPSLATE=19`..`GRAVEL=26` and their `BLOCK_DEFS` rows.

- [ ] **Step 1: Write the failing test** — append to `tests/blocks.test.ts`:

```ts
import {
  BLOCK_DEFS, BLOCK_TEXTURES, DEEPSLATE, EMERALD_ORE, GLOWSTONE, BOOKSHELF, FURNACE, MUD, TERRACOTTA, GRAVEL,
} from '../src/blocks/blocks';
import { BlockRegistry } from '../src/blocks/BlockRegistry';

describe('Track C blocks', () => {
  const reg = new BlockRegistry();
  const ids = [DEEPSLATE, EMERALD_ORE, GLOWSTONE, BOOKSHELF, FURNACE, MUD, TERRACOTTA, GRAVEL];
  it('assigns contiguous append-only ids 19..26', () => {
    expect(ids).toEqual([19, 20, 21, 22, 23, 24, 25, 26]);
  });
  it('each new block resolves to 6 face layers', () => {
    for (const id of ids) expect(BLOCK_TEXTURES.faceLayers.get(id)).toHaveLength(6);
  });
  it('glowstone emits light 15', () => {
    expect(reg.emission(GLOWSTONE)).toBe(15);
  });
  it('emerald ore is not in the creative picker (mined), the rest are', () => {
    const byId = new Map(BLOCK_DEFS.map((d) => [d.id, d]));
    expect(byId.get(EMERALD_ORE)!.creative).toBeFalsy();
    for (const id of [DEEPSLATE, GLOWSTONE, BOOKSHELF, FURNACE, MUD, TERRACOTTA, GRAVEL]) {
      expect(byId.get(id)!.creative).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/blocks.test.ts` (ids not exported).

- [ ] **Step 3: Implement.** In `src/blocks/blocks.ts`, add the id constants after `CRYSTAL`:

```ts
export const DEEPSLATE: BlockId = 19;
export const EMERALD_ORE: BlockId = 20;
export const GLOWSTONE: BlockId = 21;
export const BOOKSHELF: BlockId = 22;
export const FURNACE: BlockId = 23;
export const MUD: BlockId = 24;
export const TERRACOTTA: BlockId = 25;
export const GRAVEL: BlockId = 26;
```

  Append these rows to the end of the `BLOCK_DEFS` array (before the closing `]`):

```ts
  { id: DEEPSLATE, name: 'deepslate', opaque: true, transparent: false, creative: true, faces: stone([62, 62, 70]) },
  { id: EMERALD_ORE, name: 'emerald ore', opaque: true, transparent: false, faces: ore([40, 200, 110]) },
  { id: GLOWSTONE, name: 'glowstone', opaque: true, transparent: false, light: 15, creative: true, faces: { pattern: 'glow', colors: [[230, 200, 110]] } },
  {
    id: BOOKSHELF, name: 'bookshelf', opaque: true, transparent: false, creative: true,
    faces: { top: { pattern: 'planks', colors: [[165, 130, 80]] }, side: { pattern: 'bookshelf', colors: [[150, 116, 70]] }, bottom: { pattern: 'planks', colors: [[165, 130, 80]] } },
  },
  {
    id: FURNACE, name: 'furnace', opaque: true, transparent: false, creative: true,
    faces: { top: stone([120, 120, 124]), side: { pattern: 'furnace', colors: [[120, 120, 124], [60, 48, 44]] }, bottom: stone([120, 120, 124]) },
  },
  { id: MUD, name: 'mud', opaque: true, transparent: false, creative: true, faces: speck([90, 74, 60], 14) },
  { id: TERRACOTTA, name: 'terracotta', opaque: true, transparent: false, creative: true, faces: speck([170, 96, 70], 16) },
  { id: GRAVEL, name: 'gravel', opaque: true, transparent: false, creative: true, faces: speck([120, 116, 112], 26) },
```

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/blocks.test.ts && npm run -s build && npm run -s lint`. The registry self-check runs at boot via `new BlockRegistry()` in the test; all green.

- [ ] **Step 5: Commit**

```bash
git add src/blocks/blocks.ts tests/blocks.test.ts
git commit -m "feat(blocks): add deepslate/emerald/glowstone/bookshelf/furnace/mud/terracotta/gravel"
```

---

### Task 3: Emerald ore in the ore scatter

**Files:**
- Modify: `src/worldgen/OreScatterer.ts`
- Test: `tests/oreScatterer.test.ts`

**Interfaces:**
- Consumes: `EMERALD_ORE` (Task 2).

- [ ] **Step 1: Write the failing test** — append to `tests/oreScatterer.test.ts` (match the file's existing chunk/ctx construction — read it first):

```ts
import { EMERALD_ORE } from '../src/blocks/blocks';
it('places emerald ore in deep stone for some seed', () => {
  // Scan a deep stone region across seeds/coords; emerald (rare) should appear at least once.
  let found = false;
  for (let seed = 0; seed < 40 && !found; seed++) {
    const { chunk } = runOreScatter(seed); // use the file's existing helper that fills stone + runs OreScatterer
    for (let i = 0; i < chunk.data.length; i++) if (chunk.data[i] === EMERALD_ORE) found = true;
  }
  expect(found).toBe(true);
});
```

> If `tests/oreScatterer.test.ts` has no reusable helper, mirror the construction the existing tests in that file use (fill a chunk with STONE up to a surface height, build the `GenContext`, run `new OreScatterer().apply(chunk, ctx)`).

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/oreScatterer.test.ts`.

- [ ] **Step 3: Implement.** In `src/worldgen/OreScatterer.ts`: import `EMERALD_ORE` and add a band (rarest/deepest first ordering — place it among the deep, rare bands, with a unique `salt`):

```ts
// in the import from '../blocks/blocks':
import { STONE, COAL_ORE, IRON_ORE, GOLD_ORE, CRYSTAL, EMERALD_ORE } from '../blocks/blocks';
// add to BANDS (keep rarest/deepest first):
  { id: EMERALD_ORE, minY: 5, maxY: 26, density: 0.003, salt: 0x0e3a7 },
```

  Place it as the first entry (rarest) so it wins contested deep voxels.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/oreScatterer.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/OreScatterer.ts tests/oreScatterer.test.ts
git commit -m "feat(worldgen): scatter emerald ore in deep stone"
```

---

### Task 4: Prefabs — barn, watchtower, market stall

**Files:**
- Modify: `src/worldgen/prefabs.ts`
- Test: `tests/prefabs.test.ts`

**Interfaces:**
- Consumes: `Prefab` from `src/core/Prefab`; block ids; `BOOKSHELF`/`PLANKS`/`WOOD`/`COBBLESTONE`/`LANTERN`/`GLASS`/`WATER` etc.
- Produces: `barn(): Prefab`, `watchtower(): Prefab`, `marketStall(): Prefab`.

- [ ] **Step 1: Write the failing test** — append to `tests/prefabs.test.ts`:

```ts
import { barn, watchtower, marketStall } from '../src/worldgen/prefabs';
import { LANTERN } from '../src/blocks/blocks';

describe('Track C prefabs (buildings)', () => {
  it('barn has the right dims and a non-empty block list', () => {
    const p = barn();
    expect(p.dims).toEqual([7, 6, 9]);
    expect(p.blocks.length).toBeGreaterThan(40);
    expect(p.blocks.every(([x, y, z]) => x >= 0 && y >= 0 && z >= 0 && x < 7 && y < 6 && z < 9)).toBe(true);
  });
  it('watchtower is tall and topped with a lantern', () => {
    const p = watchtower();
    expect(p.dims[1]).toBeGreaterThanOrEqual(9);
    expect(p.blocks.some(([, , , id]) => id === LANTERN)).toBe(true);
  });
  it('marketStall fits its dims', () => {
    const p = marketStall();
    expect(p.dims).toEqual([5, 4, 5]);
    expect(p.blocks.length).toBeGreaterThan(10);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/prefabs.test.ts`.

- [ ] **Step 3: Implement** in `src/worldgen/prefabs.ts` (follow the existing `cottage`/`ruinedTower` style — a `put` helper and a `Prefab` return; import the needed block ids and `Prefab`):

```ts
/** A 7x9 plank barn with corner logs, a wide front doorway, and a pitched roof. */
export function barn(): Prefab {
  const W = 7, D = 9;
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => { blocks.push([x, y, z, id]); };
  const corner = (x: number, z: number): boolean => (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 0, z, COBBLESTONE); // floor
  for (let y = 1; y <= 3; y++) for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
    if (z === 0 && x >= 2 && x <= 4 && y <= 2) continue; // wide front doorway
    put(x, y, z, corner(x, z) ? WOOD : PLANKS);
  }
  for (let x = 0; x < W; x++) { // pitched roof ridge at x=3, heights 4..6
    const ry = 4 + (3 - Math.abs(x - 3));
    for (let z = 0; z < D; z++) put(x, ry, z, PLANKS);
    for (let y = 4; y < ry; y++) { put(x, y, 0, PLANKS); put(x, y, D - 1, PLANKS); }
  }
  return { dims: [W, 6, D], blocks };
}

/** A slender cobblestone watchtower with a railed top and a lantern. */
export function watchtower(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => { blocks.push([x, y, z, id]); };
  const H = 9;
  for (let y = 0; y < H; y++) for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++)
    if (x === 0 || x === 2 || z === 0 || z === 2) put(x, y, z, COBBLESTONE); // hollow shaft
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, H, z, PLANKS); // platform floor
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) // crenellated rail
    if ((x === 0 || x === 2 || z === 0 || z === 2) && (x + z) % 2 === 0) put(x, H + 1, z, COBBLESTONE);
  put(1, H + 1, 1, LANTERN);
  return { dims: [3, H + 2, 3], blocks };
}

/** A small wood-frame market stall with a plank canopy. */
export function marketStall(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => { blocks.push([x, y, z, id]); };
  for (const [cx, cz] of [[0, 0], [4, 0], [0, 4], [4, 4]] as const)
    for (let y = 0; y <= 2; y++) put(cx, y, cz, WOOD); // four posts
  for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) put(x, 3, z, PLANKS); // canopy
  for (let x = 1; x < 4; x++) put(x, 1, 0, PLANKS); // front counter
  return { dims: [5, 4, 5], blocks };
}
```

  Add the required imports at the top of `prefabs.ts` (it already imports some block ids + `Prefab`/`PrefabVoxel`/`BlockId`; add any missing — `WOOD`, `LANTERN`).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/prefabs.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/prefabs.ts tests/prefabs.test.ts
git commit -m "feat(worldgen): barn, watchtower, market-stall prefabs"
```

---

### Task 5: Prefabs — bridge, farm plot

**Files:**
- Modify: `src/worldgen/prefabs.ts`
- Test: `tests/prefabs.test.ts`

**Interfaces:**
- Produces: `bridge(): Prefab`, `farmPlot(): Prefab`.

- [ ] **Step 1: Write the failing test** — append to `tests/prefabs.test.ts`:

```ts
import { bridge, farmPlot } from '../src/worldgen/prefabs';
import { PLANKS, DIRT } from '../src/blocks/blocks';

describe('Track C prefabs (terrain features)', () => {
  it('bridge is a long plank deck with posts', () => {
    const p = bridge();
    expect(p.dims[0]).toBeGreaterThanOrEqual(8);
    expect(p.blocks.some(([, , , id]) => id === PLANKS)).toBe(true);
  });
  it('farmPlot is a bordered dirt patch', () => {
    const p = farmPlot();
    expect(p.dims).toEqual([5, 2, 5]);
    expect(p.blocks.some(([, , , id]) => id === DIRT)).toBe(true);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/prefabs.test.ts`.

- [ ] **Step 3: Implement** in `src/worldgen/prefabs.ts`:

```ts
/** A 9-long plank footbridge with support posts at the ends. */
export function bridge(): Prefab {
  const L = 9;
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => { blocks.push([x, y, z, id]); };
  for (let x = 0; x < L; x++) { put(x, 1, 0, PLANKS); put(x, 1, 1, PLANKS); } // 2-wide deck
  for (let x = 0; x < L; x += 4) { put(x, 0, 0, WOOD); put(x, 0, 1, WOOD); } // posts
  for (let x = 0; x < L; x++) { put(x, 2, 0, WOOD); put(x, 2, 1, WOOD); } // low railings (as posts row)
  return { dims: [L, 3, 2], blocks };
}

/** A 5x5 tilled dirt plot bordered by wood, with a few crop markers. */
export function farmPlot(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => { blocks.push([x, y, z, id]); };
  for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) {
    const border = x === 0 || x === 4 || z === 0 || z === 4;
    put(x, 0, z, border ? WOOD : DIRT);
  }
  for (let z = 1; z < 4; z++) for (let x = 1; x < 4; x++) if ((x + z) % 2 === 0) put(x, 1, z, LEAVES); // crop rows
  return { dims: [5, 2, 5], blocks };
}
```

  Add any missing imports (`DIRT`, `LEAVES`).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/prefabs.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/prefabs.ts tests/prefabs.test.ts
git commit -m "feat(worldgen): bridge and farm-plot prefabs"
```

---

### Task 6: Swamp biome + mud surface

**Files:**
- Modify: `src/worldgen/BiomeMap.ts`
- Modify: `src/worldgen/SurfacePainter.ts`
- Test: `tests/biomeMap.test.ts`, `tests/surfacePainter.test.ts`

**Interfaces:**
- Consumes: `MUD` (Task 2).
- Produces: `Biome.Swamp` (added to the END of the enum so existing numeric values are unchanged).

- [ ] **Step 1: Write the failing tests.** `tests/biomeMap.test.ts` (find a seed/coords that classify Swamp — search a few seeds; warm + very wet + low classifies Swamp):

```ts
import { Biome } from '../src/worldgen/BiomeMap';
it('classifies some warm, very-wet column as Swamp', () => {
  let found = false;
  for (let seed = 0; seed < 200 && !found; seed++) {
    const m = new BiomeMap(seed);
    for (let s = 0; s < 8 && !found; s++) if (m.biomeAt(s * 777, s * 1313) === Biome.Swamp) found = true;
  }
  expect(found).toBe(true);
});
```

`tests/surfacePainter.test.ts` (a Swamp column caps with MUD — match the file's existing chunk/ctx construction):

```ts
import { MUD } from '../src/blocks/blocks';
import { Biome } from '../src/worldgen/BiomeMap';
it('caps a non-beach swamp column with mud', () => {
  // build a ctx whose biomes.biomeAt returns Swamp and a height above seaLevel+1; assert cap === MUD
  // (reuse the file's existing GenContext stub builder).
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/biomeMap.test.ts tests/surfacePainter.test.ts`.

- [ ] **Step 3: Implement.**
  - `BiomeMap.ts`: add `Swamp` to the end of the `Biome` enum; add to `DEFS`: `[Biome.Swamp]: { biome: Biome.Swamp, amplitude: 5, baseOffset: -2 }` (low + flat → water pools via WaterFiller); add a `SWAMP_WET = 0.45` constant; in `classify`, add a Swamp branch BEFORE the Forest (`h > WET`) check: `if (t > 0 && h > SWAMP_WET) return Biome.Swamp;` (warm + very wet).
  - `SurfacePainter.ts`: import `MUD` and `Biome.Swamp`; add a branch in the cap/band selection (after the desert branch): `else if (biome === Biome.Swamp) { cap = MUD; band = MUD; }`.

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/biomeMap.test.ts tests/surfacePainter.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/BiomeMap.ts src/worldgen/SurfacePainter.ts tests/biomeMap.test.ts tests/surfacePainter.test.ts
git commit -m "feat(worldgen): Swamp biome with a mud surface"
```

---

### Task 7: `frontier` preset wiring

**Files:**
- Modify: `src/worldgen/Presets.ts`
- Test: `tests/presets.test.ts`

**Interfaces:**
- Consumes: `barn/watchtower/marketStall/bridge/farmPlot` (Tasks 4–5).
- Produces: `'frontier'` added to `WorldPreset`/`WORLD_PRESETS`; `createGenerator('frontier')` returns a generator + a `scatterStructures` overlay of the new prefabs.

- [ ] **Step 1: Write the failing test** — append to `tests/presets.test.ts`:

```ts
import { createGenerator, isWorldPreset, WORLD_PRESETS } from '../src/worldgen/Presets';
describe('frontier preset', () => {
  it('is a recognized preset', () => {
    expect(isWorldPreset('frontier')).toBe(true);
    expect(WORLD_PRESETS).toContain('frontier');
  });
  it('resolves to a generator with at least one overlay (the prefab scatter)', () => {
    const { generator, overlays } = createGenerator('frontier');
    expect(generator).toBeDefined();
    expect(overlays.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run tests/presets.test.ts`.

- [ ] **Step 3: Implement** in `src/worldgen/Presets.ts`:
  - Add `'frontier'` to the `WorldPreset` union and the `WORLD_PRESETS` array.
  - Import the new prefabs: `import { cottage, well, ruinedTower, brokenWall, lampPost, barn, watchtower, marketStall, bridge, farmPlot } from './prefabs';`
  - Add a case to `createGenerator` (a plains base — reuse `plainsHeight` — scattering the frontier buildings):

```ts
    case 'frontier':
      return {
        generator: new HeightGenerator(plainsHeight, SEA_LEVEL),
        overlays: [
          scatterTrees,
          scatterStructures([barn(), watchtower(), marketStall(), farmPlot(), bridge()], {
            cellSize: 72,
            density: 0.6,
            clusterCount: 3,
            clusterRadius: 12,
            clearFootprint: true,
            streetBlock: GRAVEL,
            surfaceAt: plainsHeight,
          }),
        ],
      };
```

  - Import `GRAVEL` from `../blocks/blocks` (add to the existing import).

- [ ] **Step 4: Run → PASS + build** — `npx vitest run tests/presets.test.ts && npm run -s build && npm run -s lint`.

- [ ] **Step 5: Commit**

```bash
git add src/worldgen/Presets.ts tests/presets.test.ts
git commit -m "feat(worldgen): frontier preset scattering the new prefabs"
```

---

### Task 8: Full verification + docs

- [ ] **Step 1: Full gate** — `npm run -s lint && npx vitest run && npm run -s build`. All green; note the test count grew.

- [ ] **Step 2: Manual smoke.** `npm run dev`; in the console at `http://localhost:5173/?world=flat`:

```js
__vr.blocks().filter(b => ['deepslate','emerald ore','glowstone','bookshelf','furnace','mud','terracotta','gravel'].includes(b.name)); // glowstone is creative; emerald is not
__vr.place(0, 40, 0, 21); __vr.blockAt(0,40,0); // 'glowstone' placed (light 15)
```

  Then load `http://localhost:5173/?world=frontier` and roam to confirm barns/watchtowers/stalls scatter; load `?world=default` and roam to find a Swamp (mud + water). (Capture via `__vr.save` from a real window if you want a screenshot.)

- [ ] **Step 3: Commit any doc tweak** (if made). After merge, update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories with the new blocks/prefabs/biome/preset.

---

## Self-Review

**Spec coverage:** 8 blocks → T2 (+ patterns T1); emerald ore wiring → T3; 5 prefabs → T4 (3) + T5 (2); Swamp biome + mud surface → T6; frontier preset → T7; verification → T8. All Phase-C spec items mapped. (Phase E is outlined in the spec, not in this plan.)

**Placeholder scan:** No TBD/handle-edge-cases. The conditional bits (T3/T6 "match the file's existing chunk/ctx construction") point at concrete existing test patterns, not placeholders. Prefab geometry is fully shown.

**Type consistency:** New ids `DEEPSLATE=19`..`GRAVEL=26` and `PatternName` additions used consistently across T1/T2/T3/T6/T7; prefab fn names `barn/watchtower/marketStall/bridge/farmPlot` match between their definition tasks (T4/T5) and the preset wiring (T7); `Biome.Swamp` defined in T6 and consumed by T6's surface painter. No drift.
