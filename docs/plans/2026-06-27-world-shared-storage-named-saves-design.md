# Design: Shared World Storage + Named Saves

Date: 2026-06-27
Status: Approved-pending (brainstorm output; implementation gated on user approval)

## Problem

World edits persist to per-browser-profile IndexedDB (`IndexedDbSaveStore`). Consequences:

- Builds made by an agent (Claude/Codex) in an automation browser profile never appear in
  Edgar's own play profile — there is no path to share a world across profiles.
- There is exactly one world per profile; no way to keep multiple builds/worlds side by side.
- Saved deltas are loaded at boot without validation; malformed rows can break boot/meshing.

## Goals

- **Shared storage:** the dev server owns world state on disk; any profile pointed at the same
  dev server and world name reads/writes the same world. No manual export/import step.
- **Edgar is the main user** (roams via `npm run dev`); **agents push builds** that show up in
  his sessions after a reload.
- **Named saves:** multiple worlds as named slots — list, switch, create ("Save As"), delete.
- **Validation:** harden world loading so malformed data can't break boot.

## Non-goals (v1)

- Live concurrent sync (watching an agent build in real time without reload). Reload picks up
  new builds. Future: polling or SSE with conflict handling.
- Changing production persistence. Production builds keep `IndexedDbSaveStore`.
- Auto-migrating existing IndexedDB worlds into shared storage.

## Decisions

1. **Disk layout** — one JSON file per world: `.saves/<name>.json`:
   ```json
   { "meta": { "seed": 1337, "version": 1, "preset": "default" },
     "chunks": { "0,0": [[123, 5], [456, 13]], "1,0": [[...]] } }
   ```
   The server does read-modify-write per chunk flush. Worlds are small and writes are debounced,
   so whole-file rewrites are acceptable and keep the format human-readable and inspectable.
   Mirrors the existing `.captures/` and `.blueprints/` dev-disk conventions.

2. **Store selection** — `import.meta.env.DEV` → `ServerSaveStore`; production →
   `IndexedDbSaveStore` (unchanged). Shared storage is the dev/roam workflow.

3. **World selection** — `?save=<name>` URL param (default `default`), mirroring the existing
   `?world=<preset>` param. Switching a world = navigate with a new `?save=` (reload reboots
   with the right store/name; avoids live re-init of `ChunkManager`).

4. **Validation** — pure `parseWorldSnapshot` validates: chunk keys parse to integer `"cx,cz"`;
   voxel indices in `[0, CHUNK_VOLUME)` (= 49152); block ids are known to the registry. Invalid
   entries are dropped with a counted warning. Reused to harden boot-load and the `/__world`
   endpoint (also closes the "deltas trusted without validation" backlog item).

5. **Live concurrent sync** — out of scope v1 (see Non-goals).

## Architecture

### New / changed modules

- `src/persistence/WorldSnapshot.ts` (new, pure, tested)
  - `WorldSnapshot` type: `{ meta: WorldMeta; chunks: Record<string, Array<[number, BlockId]>> }`.
  - `serializeWorldSnapshot(meta, deltas: WorldDeltas): WorldSnapshot`.
  - `parseWorldSnapshot(value: unknown, opts: { isValidBlockId(id): boolean }): { snapshot, dropped }`
    — defensive validation, returns a clean snapshot + count of dropped entries.
  - `snapshotToDeltas(snapshot): WorldDeltas`.

- `server/worldDiskStore.ts` (new, pure-ish, tested with a temp dir)
  - Functions taking a `root` dir: `readWorld(root, name)`, `writeChunk(root, name, key, entries)`,
    `writeMeta(root, name, meta)`, `clearWorld(root, name)`, `listWorlds(root)`,
    `copyWorld(root, from, to)`, `deleteWorld(root, name)`.
  - Name sanitization shared with the endpoint.

- `vite.config.ts` (changed) — add `/__world` middleware in the existing `devDisk()` plugin:
  - `GET /__world?list` → `{ worlds: string[] }`.
  - `GET /__world?name=X` → full snapshot (or `{ meta?, chunks: {} }` when absent).
  - `POST /__world?name=X&chunk=cx,cz` body `{ entries }` → write one chunk (empty ⇒ delete).
  - `POST /__world?name=X&meta` body `{ meta }` → write meta.
  - `POST /__world?name=X&copyTo=Y` → copy; `DELETE /__world?name=X` → delete; `&clear` → clear.
  - Hardening: `safeName`, body-size cap, JSON shape checks, JSON content-type.

- `src/persistence/ServerSaveStore.ts` (new, implements `SaveStore`, tested with mock fetch)
  - Constructed with a world `name`. Methods map 1:1 to `/__world` calls. Drop-in for
    `IndexedDbSaveStore` so `Game.boot`'s debounced flush wiring is unchanged.

- `src/persistence/ServerWorldCatalog.ts` (new) — `list()`, `saveAs(from, to)`, `delete(name)`,
  used by the HUD world menu and `__vr.world`.

- `src/app/Game.ts` (changed) — choose store by `import.meta.env.DEV`; read `?save=` (default
  `default`); thread world name into the store. Boot-load goes through `parseWorldSnapshot`
  validation. Persistence/debounce wiring otherwise unchanged.

- `src/app/DevControls.ts` (changed) — add `__vr.world`:
  `list()`, `current()`, `saveAs(name)`, `load(name)` (navigate `?save=`), `delete(name)`.

- `src/app/CreativeUi.ts` (changed) — minimal world menu by the dock: current-world label, a
  switcher (lists worlds), "Save As…", "New". Wired through `ServerWorldCatalog`. Dev-only.

## Data flow

Agent builds in profile A, Edgar sees them in profile B:

1. Both use `?save=settlement` against the same dev server.
2. Agent edit → `ChunkManager.onChunkDeltaChanged` → debounced `store.saveChunkDelta(key, …)` →
   `POST /__world?name=settlement&chunk=cx,cz` → server writes `.saves/settlement.json`.
3. Edgar boots/reloads `?save=settlement` → `GET /__world?name=settlement` →
   `parseWorldSnapshot` → `snapshotToDeltas` → `ChunkManager` applies them as chunks stream in.

"Save As" copies the current world file to a new name (server-side), then optionally navigates to
`?save=<new>`. World switch is a navigation; boot does the rest.

## Error handling

- Endpoint: invalid name/shape/oversize ⇒ 400 with a message; disk/parse errors ⇒ 500; never
  writes partial/garbage files (validate before write).
- `ServerSaveStore`: fetch failures are logged and degrade gracefully — boot still renders
  terrain if a load fails (treat as empty world), and a failed save is logged, not fatal.
- `parseWorldSnapshot`: skips invalid entries, returns a dropped-count, warns once.

## Testing

- Unit: `WorldSnapshot` round-trip + validation (valid, out-of-range index, unknown block id,
  malformed key, non-array entries).
- Unit: `worldDiskStore` against a temp dir — meta/chunk write+read, chunk delete on empty,
  clear, list, copy, delete, name sanitization.
- Unit: `ServerSaveStore` with a mock `fetch` — each method hits the right URL/method/body and
  parses responses; load failure degrades to empty.
- Keep all existing tests green (176). `resolveSaveAction` unchanged.
- Gates: `npm run lint`, `npx tsc --noEmit`, `npm test`.
- Live (preview): build in world A → reload → edits persist via server; create world B via
  "Save As"/"New" and switch; `__vr.world.saveAs` from an agent context; confirm `.saves/*.json`
  on disk; confirm a second profile pointed at the same world sees the build after reload.

## Compatibility / migration

- Production unaffected (still IndexedDB).
- First dev run with no `.saves/default.json` ⇒ fresh terrain-only world (expected).
- Existing IndexedDB dev edits are not auto-migrated (out of scope). A one-shot
  `__vr.world.importFromIndexedDb()` could be added later if needed.

## Future

- Live sync (poll/SSE + per-chunk last-writer-wins or merge) to watch agent builds in real time.
- `/__capture` input hardening (size/MIME/origin) — adjacent backlog item, can ride along.
