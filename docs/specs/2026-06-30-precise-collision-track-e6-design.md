# Precise Fence + Stair Collision (Track E6) — Design

- **Date:** 2026-06-30
- **Status:** Approved (design); implementation plan pending.
- **Branch:** `claude/collision-track-e6` (off `main` @ `0d0f2ae`, which includes E1–E5).
- **Origin:** The last scoped track. Fences/walls currently collide as a **full cube** (you can jump a 1-tall fence) and stairs as a **half-slab** (`lowerHalf` — you can't actually walk up a stair; its upper step is a non-collidable ghost). Make collision **precise**: fences/walls 1.5 blocks tall (unjumpable, matching Minecraft), stairs a real **two-box** step you climb and stand on at two heights.

## Context

`src/player/Collision.ts` is a pure AABB resolver (`resolveCollision`) over a `SoliditySampler`. Today a voxel's collision is a **3-value enum** `'none' | 'full' | 'lowerHalf'`, where every box fills the **full horizontal footprint** of the voxel and differs only in height (`full` = `[y,y+1]`, `lowerHalf` = `[y,y+0.5]`). That model cannot express:
- A box **taller than its voxel** (fence = 1.5) — it spills into the voxel above.
- A box with a **partial horizontal footprint** (a stair's upper step is the back half).

So precise fence/stair collision requires generalizing the collision model from the enum to **sub-voxel AABB lists** (state-aware for stairs), and rewriting the resolver's overlap/support/sweep against real AABBs.

**Key reuse:** a stair's collision boxes are exactly its **render** boxes (`stairBoxes` in `emitShaped`). Extract that geometry to a shared module so render and collision share one source of truth (DRY). Fences/walls collide as a single **full-footprint 1.5-tall box** (NOT the thin visual posts/arms — like Minecraft, you can't squeeze between posts).

## Goals

1. Fences, walls, and **closed** gates collide as a full-footprint box **1.5 blocks tall** — you cannot jump or step over them.
2. Stairs collide as their **two actual boxes** (lower full half + upper back-half), so you walk up a stair and stand on it at y+0.5 (front) or y+1 (back).
3. **Cubes and slabs behave exactly as today** (parity) — existing movement, step-up, and landing are unchanged.
4. Open gates and plants remain non-colliding.

## Non-goals

- Per-arm fence collision (the thin visual posts) — full-footprint box is the deliberate, Minecraft-matching choice.
- Slopes / smooth ramps (stairs remain stepped boxes).
- Any change to rendering, the save format, block ids, or the texture/tint systems.
- New player abilities (auto-jump tuning, crouch, etc.).

## Invariants preserved

- **Cube + slab collision is behavior-identical** (parity tests pin: rest on a cube top at y+1, on a slab/`lowerHalf` top at y+0.5, slide along walls, 1-block step-up). No save/render/id change.
- Below-world and unloaded chunks still collide as **full** (the player can't fall through an ungenerated seam).
- Non-opaque voxels (air/water/plants) remain non-colliding.
- The substep resolver structure (X, Z, then Y; step-up on blocked horizontal with no vertical delta) is preserved — only the per-voxel box test changes from enum to AABB.

## Components

### 1. Shared shape geometry (`src/blocks/shapeBoxes.ts`, new) + AABB type
- `export type AABB = readonly [number, number, number, number, number, number]` — local `[minX,minY,minZ, maxX,maxY,maxZ]` (0..1, Y up to 1.5).
- Constants: `CUBE_BOX = [0,0,0, 1,1,1]`, `SLAB_BOX = [0,0,0, 1,0.5,1]`, `TALL_BOX = [0,0,0, 1,1.5,1]` (fences/walls/closed gates).
- `stairBoxes(facing, half): AABB[]` — the lower full-half + upper back-half boxes (the same geometry `emitShaped` uses, moved here as local 0-origin AABBs). `emitShaped.emitStair` is refactored to consume these (offsetting by the voxel origin), keeping render + collision identical.

### 2. `BlockRegistry.collisionAABBs(id, state): AABB[]`
Replaces `collisionBox`/`collisionBoxFor` (the enum). By shape:
- `cube` → `[CUBE_BOX]`; `slab` → `[SLAB_BOX]`; `stair` → `stairBoxes(facing, half)` (from `unpackState(state)`); `fence`/`wall` → `[TALL_BOX]`; `gate` → `isOpen(state) ? [] : [TALL_BOX]`; `cross` → `[]`.
The `CollisionBox` enum type + `collisionBox`/`collisionBoxFor` are removed once no consumer remains (the only consumers are `ChunkManager.solidBox` + tests). `registry.isOpaque` is unchanged.

### 3. `ChunkManager.collisionBoxesAt(wx, wy, wz): AABB[]` (world coords)
Replaces `solidBox`. Returns world-space AABBs for the voxel:
- `wy < 0` → `[[wx,wy,wz, wx+1,wy+1,wz+1]]` (below-world solid); `wy >= WORLD_HEIGHT` → `[]`.
- unloaded chunk (`!entry`) → `[[wx,wy,wz, wx+1,wy+1,wz+1]]` (solid, as `solidBox` did).
- `id` non-opaque → `[]`.
- else → `registry.collisionAABBs(id, state)` mapped to world coords by adding `(wx,wy,wz)` to each box's min/max.
`isSolid` is kept (other callers); only the physics path moves to AABBs.

### 4. `Collision.ts` — AABB overlap + support (the core rewrite, part 1)
- `SoliditySampler` becomes `{ collisionBoxes(x, y, z): AABB[] }` (world AABBs). (`isSolid`/`solidBox` removed from the *sampler* interface.)
- A helper `forEachBoxNear(sampler, pMin, pMax, fn)` iterates candidate voxels `x∈[⌊pMinX⌋,⌊pMaxX⌋]`, `z∈[⌊pMinZ⌋,⌊pMaxZ⌋]`, and `y∈[⌊pMinY⌋-1, ⌊pMaxY⌋]` — **one voxel below** so a 1.5-tall box from the voxel under the player is considered (max overhang 0.5 < 1). For each voxel it calls `sampler.collisionBoxes` and yields each world AABB.
- `overlapsSolid(sampler, center, half)`: builds the player AABB and returns true if any near box overlaps on **all 3 axes** (`pMin < boxMax - EPS` and `pMax > boxMin + EPS` per axis... using strict overlap with EPS to avoid resting-contact false positives — exact comparisons pinned in the plan).
- `highestSupport(sampler, center, half, feet0, feetTarget)`: among near boxes whose **horizontal** extent overlaps the player footprint and whose **top (`box.maxY`) ≤ feet0+EPS**, returns the greatest top (rest height). Stair upper box → y+1; slab → y+0.5; cube → y+1.

### 5. `Collision.ts` — AABB sweep + step-up (the core rewrite, part 2)
- `sweepAxis(sampler, center, half, axis, d)`: move the player AABB by `d` on `axis`; gather near boxes that overlap the moved player AABB on all 3 axes; if none → no hit; else **snap to the nearest blocking AABB face** — `d>0`: `value = min(box.min[axis]) - half[axis] - EPS`; `d<0`: `value = max(box.max[axis]) + half[axis] + EPS`. (Snaps to the real AABB face, not the voxel boundary.) The STEP substep (0.4 < the 0.5 smallest feature) keeps this tunnel-free.
- `tryStepUp` / `resolveCollision` are otherwise **unchanged** — same X→Z→Y order, same step-up trigger (blocked horizontal + no vertical delta), same net-1-voxel cap. The new `overlapsSolid`/`sweepAxis`/`highestSupport` give the precise behavior automatically: a fence (1.5 box) blocks a step-up (the raised position still overlaps), so it's unjumpable; a stair's lower box triggers a step-up and the upper box supports the player at y+1, so it's climbable.

### 6. Wiring (`src/app/Game.ts`)
The physics sampler becomes `{ collisionBoxes: (x,y,z) => manager.collisionBoxesAt(x,y,z) }`. Remove the dead `solidBox`/`isSolid`-in-sampler wiring. (`manager.isSolid` stays available for any non-physics caller.)

## Data flow
```
voxel id+state ─► registry.collisionAABBs (local AABB[]) ─► ChunkManager.collisionBoxesAt (world AABB[])
player move ─► resolveCollision ─► overlapsSolid / sweepAxis / highestSupport  (test player AABB vs world AABBs)
  fence TALL_BOX (1.5h)  → step-up still overlaps → unjumpable
  stair two boxes        → lower triggers step-up, upper supports at y+1 → climbable
  cube/slab              → identical boxes → behavior unchanged (parity)
```

## Error handling
- Out-of-world / unloaded → a full world cube box (solid) so the player never falls through a seam.
- Empty AABB list (air/plants/open gate) → no overlap, no support — non-colliding.
- The `forEachBoxNear` y-scan extends one voxel below to catch tall-box overhang; the max box height (1.5) guarantees one voxel is enough.
- EPS handling at resting contact is pinned in the plan with parity tests so the player neither sinks nor jitters on cube/slab tops.

## Testing
This track **cannot be live-played** (the headless preview freezes physics), so unit tests are the sole verification and must be thorough:
- `shapeBoxes`: `stairBoxes` returns two boxes; facing rotates the upper box; top-half flips it; `emitStair` still emits the same render geometry (regression).
- `registry.collisionAABBs`: cube/slab/stair(by state)/fence/wall/gate(open→[], closed→TALL)/cross.
- `ChunkManager.collisionBoxesAt`: world offset correct; below-world/unloaded → cube box; non-opaque → []; an open gate → [].
- `Collision` parity (the safety net): rest on cube top y+1; rest on slab top y+0.5; slide along a wall; 1-block step-up onto a cube — all identical to the pre-E6 tests.
- `Collision` precision (the new behavior): a 1-tall fence row is **not** jumpable/step-up-able (player blocked at the fence face, cannot reach the far side by stepping up); walking into a stair **climbs** it (ends at y+1 on the back, y+0.5 on the front); an **open** gate is walk-through; a **closed** gate blocks.

## Rollout
One branch/PR off `main`. This completes the scoped E-track set (E1 shapes, E2 stairs+state, E3 fences/walls, E4 gate, E5 tint, E6 collision). Update the `voxel-realm-codebase-improvements` + `voxel-realm-agent-playground` memories after merge (the AABB collision model, taller fences, climbable stairs). Possible future tracks: trapdoors/2-tall doors, manual per-voxel tint, smooth-ramp collision.
