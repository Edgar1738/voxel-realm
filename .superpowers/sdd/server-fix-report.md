# Server Fix Report: Persist `[index, id, state]` Chunk Deltas

## Problem

E2 added per-voxel orientation **state** stored as a 3-element delta entry `[index, id, state]`.
The client save path (`src/persistence/WorldSnapshot.ts`) already accepted both 2- and 3-element
entries. But the dev server had two separate places that hard-coded the assumption that entries are
always `[index, id]` (length 2):

1. **`server/worldDiskStore.ts` `writeChunk`** — threw `"entry must be [index, id]"` for any
   entry with `length !== 2`, so rotated stairs (state 1–4) were always rejected with HTTP 400.
2. **`vite.config.ts` `/__world` POST handler** — pre-filtered entries with `e.length === 2`,
   silently dropping all 3-element entries before they even reached `writeChunk`. This meant
   stateful voxels were stripped at the boundary; only state-0 blocks survived.

## Files Changed

### `server/worldDiskStore.ts`

- **Exported `ChunkEntry` type** (`[number, number] | [number, number, number]`) so the union is
  defined once and shared with callers.
- **Widened `DiskSnapshot.chunks`** from `Array<[number, number]>` to `Array<ChunkEntry>`.
- **Updated `writeChunk` parameter** from `Array<[number, number]>` to `Array<ChunkEntry>`.
- **Updated validation** in `writeChunk`:
  - Changed `e.length !== 2` guard to `e.length !== 2 && e.length !== 3` (other lengths still
    rejected with an improved error message).
  - Added state validation for 3-element entries: must be an integer in `[0, 255]`, same style as
    the existing id check.

Existing 2-element saves are unaffected — their serialized form is unchanged.

### `vite.config.ts`

- **Widened `payload.entries` type** to `Array<[number, number] | [number, number, number]>`.
- **Updated the pre-filter predicate** to accept entries of length 2 or 3 (with an integer check
  on `e[2]` when present), using a proper type-guard function signature so TypeScript narrows
  correctly before `writeChunk` is called.

### `tests/worldDiskStore.test.ts`

Added four new test cases inside the existing `worldDiskStore` describe block:

| Test | What it checks |
|---|---|
| `writes and reads back [index, id, state] entries intact` | Round-trip: 3-element entries survive write → read with values preserved |
| `rejects a [index, id, state] entry with state out of 0..255` | State 256 is rejected with error matching `/state\|255/i` |
| `rejects an entry with length other than 2 or 3` | Single-element array is rejected with `/entry must be/i` |
| `mixed 2-element and 3-element entries round-trip in the same chunk` | Both shapes coexist in one chunk without corruption |

## Verification

```
npx vitest run tests/worldDiskStore.test.ts   # 18/18 passed (14 existing + 4 new)
npx vitest run                                 # 538/538 passed (74 test files)
npm run -s build                               # clean (same pre-existing chunk-size warning)
npx prettier --check server/worldDiskStore.ts vite.config.ts tests/worldDiskStore.test.ts
                                               # "All matched files use Prettier code style!"
```

## Concerns

None. The fix is strictly additive — 2-element entries are serialized and read back identically to
before. The `DiskSnapshot` JSON format on disk is backward-compatible (JSON round-trips arrays by
element count, so existing saves load without any migration).
