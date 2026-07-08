# Authoring & publishing a world

How to take a world from an in-game build to a shareable, curated package. Everything here
runs against the **dev build** (`npm run dev`), which exposes the `window.__vr` console API and
persists worlds to `.saves/` through the dev server. Run `__vr.help()` for the full API.

## 1. Build

Press `B` to enter build mode. Place blocks with the hotbar/creative inventory (`I`), use the
region tools (fill/clear/replace/copy), and paste with rotate/mirror/array. For reusable pieces,
capture a selection as a **blueprint** — blueprints are portable, position-independent prefabs
(same shape as `Prefab`) and show up in the categorized blueprint catalog.

Console helpers for precise work and getting around:

```js
__vr.help()                       // list every command
__vr.teleport(x, y, z)            // move the eye (y is body center)
__vr.pov(ex,ey,ez, tx,ty,tz)      // eye + look-at in one call
__vr.orbit(cx,cy,cz, r, angle, h) // circle a point, looking in
__vr.shapes                       // box/ring/octagon/cone build helpers
```

## 2. Save the world

Worlds are saved to `.saves/<name>.json` via the dev server. Copy the current world under a
publish name (this does not switch you into it):

```js
await __vr.world.saveAs('moonspire-realm')
__vr.world.load('moonspire-realm')   // switch into it to keep editing
__vr.world.list()                    // all saved worlds
```

## 3. Add curation metadata

A shipped world should feel intentional on first load: a good spawn pose, named landmarks, and a
short tour route. Pose the camera where a first-time visitor should arrive, then:

```js
await __vr.world.setSpawn('Arrival')            // spawn+look from the current pose (+ a landmark)
await __vr.world.addLandmark('The Keep')        // landmark at the current position
await __vr.world.setTour([                        // ≥2 waypoints for the guided tour (T in-game)
  { name: 'Gate',  x: 8,  y: 66, z: 40 },
  { name: 'Keep',  x: 8,  y: 72, z: 8 },
])
await __vr.world.setMeta({ title: 'Moonspire Realm', description: 'A ruined citadel above a lake.' })
```

## 4. Audit the metadata

`audit()` reports whether the curation contract is complete (title, description, spawn, look,
landmarks, tour):

```js
await __vr.world.audit()   // { ready, missing, warnings, suggestions }
```

Keep going until `ready` is `true`. (This is the same check `auditWorldMeta` runs; the structural
packaging contract is enforced separately by `world:package` below.)

## 5. Capture a preview

Grab an overview screenshot to disk (written under `.captures/`):

```js
await __vr.capture.overview('moonspire-realm', { x: 8, y: 70, z: 8 }, { radius: 70, height: 100 })
```

## 6. Package

Validate and package the save for sharing (finite, in-bounds spawn/look/landmarks/tour, chunk
payload, etc.). Run from a terminal against the dev server:

```bash
npm run world:package -- --save moonspire-realm --title "Moonspire Realm" --port 5173
```

## 7. Share

Get a clean roam URL (strips any debug spawn/look overrides) to hand to a player:

```js
__vr.world.roamUrl()   // e.g. https://…/?save=moonspire-realm&world=citadel
```

## 8. Ship it (optional)

To put the world on the public front door, add it to the shipped collection and bundle it for
static hosting:

```bash
npm run world:package -- --save moonspire-realm --title "Moonspire Realm" --manifest --tags citadel,fantasy
npm run world:bundle
```

Commit `world-manifest.json` and `public/worlds/<slug>.json`; the world-select menu and the
production loader are both driven by the manifest, and CI (`tests/shippedWorlds.test.ts`) fails if
they drift apart.

---

**Note on `.saves/`:** the directory is gitignored — treat local saves as *source material*, not
automatically shippable content. Large detailed worlds are several MB with thousands of chunks, so
review size, naming, and licensing before publishing a world publicly.
