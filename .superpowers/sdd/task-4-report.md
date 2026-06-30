# Task 4 Report — Remove the dead CollisionBox enum path (E6)

## Status: COMPLETE

**Commit:** `4468c47` — `refactor(collision): remove the dead CollisionBox enum path (solidBox/collisionBox/collisionBoxFor)`

---

## Step 1: Initial grep (callers present — tests not yet migrated)

```
src/blocks/BlockRegistry.ts:13:  type CollisionBox,
src/blocks/BlockRegistry.ts:95:  collisionBox(id: BlockId): CollisionBox {
src/blocks/BlockRegistry.ts:111:  collisionBoxFor(id: BlockId, state: number): CollisionBox {
src/blocks/BlockRegistry.ts:113:    return this.collisionBox(id);
src/blocks/blocks.ts:53:export type CollisionBox = 'none' | 'full' | 'lowerHalf';
src/world/ChunkManager.ts:25:import type { CollisionBox } from '../blocks/blocks';
src/world/ChunkManager.ts:174:  solidBox(wx: number, wy: number, wz: number): CollisionBox {
src/world/ChunkManager.ts:182:    return this.registry.collisionBoxFor(id, state);
tests/chunkManagerShapes.test.ts:79:    expect(mgr.solidBox(0, 40, 0)).toBe('lowerHalf');
tests/chunkManagerShapes.test.ts:80:    expect(mgr.solidBox(0, 41, 0)).toBe('none');
tests/emitStair.test.ts:68:    expect(reg.collisionBox(1)).toBe('lowerHalf');
tests/fenceContent.test.ts:16:      expect(reg.collisionBox(id)).toBe('full');
tests/fenceRegistry.test.ts:22:    expect(reg.collisionBox(2)).toBe('full');
tests/fenceRegistry.test.ts:23:    expect(reg.collisionBox(4)).toBe('full');
tests/gateContent.test.ts:12:    expect(reg.collisionBox(OAK_FENCE_GATE)).toBe('full');
tests/gateSolidBox.test.ts:38:    expect(mgr(packState(FACING.N, 0)).solidBox(2, 5, 2)).toBe('full');
tests/gateSolidBox.test.ts:39:    expect(mgr(setOpen(packState(FACING.N, 0), true)).solidBox(2, 5, 2)).toBe('none');
tests/gateState.test.ts:37:    expect(reg.collisionBoxFor(2, packState(FACING.N, 0))).toBe('full');
tests/gateState.test.ts:38:    expect(reg.collisionBoxFor(2, setOpen(packState(FACING.N, 0), true))).toBe('none');
tests/gateState.test.ts:39:    expect(reg.collisionBoxFor(1, 0)).toBe('full');
tests/gateState.test.ts:40:    expect(reg.collisionBox(2)).toBe('full');
tests/shapeContent.test.ts:13:    expect(reg.collisionBox(PLANK_SLAB)).toBe('lowerHalf');
tests/shapeContent.test.ts:16:    expect(reg.collisionBox(TALL_GRASS)).toBe('none');
tests/shapes.test.ts:40:describe('BlockRegistry shape/occludes/collisionBox', () => {
tests/shapes.test.ts:55:    expect(reg.collisionBox(1)).toBe('full');
tests/shapes.test.ts:56:    expect(reg.collisionBox(2)).toBe('lowerHalf');
tests/shapes.test.ts:57:    expect(reg.collisionBox(3)).toBe('none');
tests/stairContent.test.ts:14:      expect(reg.collisionBox(id)).toBe('lowerHalf');
```

Task 3 left 10 test files still calling the old API. Per the brief ("if a test still references the enum, migrate it to `collisionAABBs`/`collisionBoxesAt` first"), all 10 were migrated before removal.

## Step 1b: Post-migration grep (definitions only, before src removal)

```
(no output — zero references in tests or non-definition src locations)
```

Only the dead method/type definitions in src/ remained.

## Test migration summary

| File | Old API | New API |
|------|---------|---------|
| `tests/shapes.test.ts` | `collisionBox(id)` → `'full'/'lowerHalf'/'none'` | `collisionAABBs(id, 0).length > 0 / === 0` |
| `tests/gateState.test.ts` | `collisionBoxFor(id, state)` + `collisionBox(id)` | `collisionAABBs(id, state).length` checks |
| `tests/chunkManagerShapes.test.ts` | `solidBox(wx, wy, wz)` | `collisionBoxesAt(wx, wy, wz).length` checks |
| `tests/gateSolidBox.test.ts` | `solidBox(wx, wy, wz)` | `collisionBoxesAt(wx, wy, wz).length` checks |
| `tests/emitStair.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length > 0` |
| `tests/fenceContent.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length > 0` |
| `tests/fenceRegistry.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length > 0` |
| `tests/gateContent.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length > 0` |
| `tests/shapeContent.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length` checks |
| `tests/stairContent.test.ts` | `collisionBox(id)` | `collisionAABBs(id, 0).length > 0` |

## Step 2: What was removed

- `BlockRegistry.collisionBox(id: BlockId): CollisionBox` — deleted
- `BlockRegistry.collisionBoxFor(id: BlockId, state: number): CollisionBox` — deleted
- `import type { CollisionBox }` from `src/blocks/BlockRegistry.ts` — deleted
- `ChunkManager.solidBox(wx, wy, wz): CollisionBox` — deleted
- `import type { CollisionBox }` from `src/world/ChunkManager.ts` — deleted
- `export type CollisionBox = 'none' | 'full' | 'lowerHalf'` from `src/blocks/blocks.ts` — **DELETED** (confirmed: zero consumers after migration)

`ChunkManager.isSolid` was intentionally preserved (used by lighting/meshing/water).

## Step 3: Verification

- `npm run -s build` — PASS (71 modules, no TS errors)
- `npx vitest run` — **596/596 tests passed** (91 test files)
- `npx prettier --check "src/**/*.ts" "tests/**/*.ts"` — PASS (clean)
- `npx eslint src tests` — PASS (no output)

## Concerns

None. The removal is clean: grep confirms zero remaining references, build is error-free, and the full suite stays green.

---

# Task 4 Review Fix — Tighten weakened AABB assertions

## Status: COMPLETE

**Review finding:** The Task 4 migration replaced `collisionBox(id) === 'lowerHalf'` / `=== 'full'` with generic `length > 0` checks in 6 test files, losing the cube/slab/fence/stair discriminator. A slab accidentally returning `[CUBE_BOX]` would pass all those assertions.

## Assertions tightened

| File | Line | Old (weakened) | New (exact) |
|------|------|----------------|-------------|
| `tests/shapes.test.ts` | 55 | `collisionAABBs(1, 0).length > 0` | `toEqual([CUBE_BOX])` |
| `tests/shapes.test.ts` | 56 | `collisionAABBs(2, 0).length > 0` | `toEqual([SLAB_BOX])` |
| `tests/shapes.test.ts` | 57 | `collisionAABBs(3, 0).length === 0` | `toEqual([])` |
| `tests/shapeContent.test.ts` | 13 | `collisionAABBs(PLANK_SLAB, 0).length > 0` | `toEqual([SLAB_BOX])` |
| `tests/chunkManagerShapes.test.ts` | 79 | `collisionBoxesAt(0,40,0).length > 0` | `toEqual([[0, 40, 0, 1, 40.5, 1]])` |
| `tests/emitStair.test.ts` | 68 | `collisionAABBs(1, 0).length > 0` | `.length === 2` |
| `tests/stairContent.test.ts` | 14 | `collisionAABBs(id, 0).length > 0` | `.length === 2` |
| `tests/fenceContent.test.ts` | 16 | `collisionAABBs(id, 0).length > 0` | `toEqual([TALL_BOX])` |
| `tests/gateContent.test.ts` | 12 | `collisionAABBs(OAK_FENCE_GATE, 0).length > 0` | `toEqual([TALL_BOX])` |

Imports added: `CUBE_BOX, SLAB_BOX` from `shapeBoxes` in `shapes.test.ts`; `SLAB_BOX` in `shapeContent.test.ts`; `TALL_BOX` in `fenceContent.test.ts` and `gateContent.test.ts`.

## Verification

- `npx vitest run tests/shapes.test.ts tests/shapeContent.test.ts tests/chunkManagerShapes.test.ts tests/emitStair.test.ts tests/stairContent.test.ts tests/fenceContent.test.ts tests/gateContent.test.ts` — **7 files, 18 tests PASSED**
- `npx vitest run` (full suite) — **91 files, 596 tests PASSED**
- `npm run -s build` — **PASS** (71 modules, no TS errors)
- `npx prettier --check` (touched files) — **PASS**
- `npx eslint` (touched files) — **PASS**
