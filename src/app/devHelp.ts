/**
 * Signatures + one-line docs for the dev `__vr` API, so a fresh console session can discover the
 * surface without reading source. Pure static data — kept out of DevControls to slim that file and
 * make the help text easy to scan/edit in one place. Surfaced by `__vr.help(name?)`.
 */
export const DEV_HELP: Record<string, string> = {
  // roam / camera
  pos: 'pos() -> {x,y,z}',
  look: 'look() -> {yaw,pitch}',
  teleport: 'teleport(x,y,z) — move the player/eye (y is the body CENTER; feet land at y-0.9)',
  aim: 'aim(yaw, pitch?) — set look angles',
  turn: 'turn(dyaw, dpitch?) — rotate look',
  lookAt: 'lookAt(tx,ty,tz) — face a point',
  orbit: 'orbit(cx,cy,cz, radius, angle?, height?) — camera on a circle looking in',
  frame: 'frame(x1,y1,z1, x2,y2,z2, dir?) -> {eye,target} — fit a box to view',
  pov: 'pov(ex,ey,ez, tx,ty,tz) — set eye + look in one call (first-person shots)',
  forward: 'forward(dist) — fly along the look direction',
  fly: 'fly(on=true) — toggle noclip flight',
  // headless movement (loop is paused in preview tabs)
  simulate:
    'simulate(input={forward,back,left,right,up,down}, {frames?,dt?,yaw?,fly?}) -> {pos,grounded,moved} — step real physics',
  walkTo: 'walkTo(x,y,z, {maxFrames?,arriveDist?}) -> WalkResult — walk there on foot',
  reachable:
    'reachable(from,to, {restore?}) -> {arrived,stuck,remaining,...} — CAN a player walk A→B (catches blocked stairs)',
  // time / capture
  time: 'time(t) — 0 midnight, .25 sunrise, .5 noon, .75 sunset',
  dayLength: 'dayLength(seconds) — full cycle length (freeze with a huge value)',
  headlamp: 'headlamp(on=true) — camera-centered glow for dark caves (not persisted)',
  weather: "weather(kind) — pin 'clear'|'rain'|'storm'|'snow', or 'auto' to resume the cycle",
  sound: 'sound(on=true, volume?) — toggle audio / set volume 0..1 (persisted like the HUD)',
  view: 'view(maxWidth?, quality?) -> dataURL',
  save: 'save(name, {hud?,maxWidth?,quality?}) -> path — writes .captures/<name>.jpg',
  // build
  apply:
    'apply(voxels[{x,y,z,id,state?}], {label?,maxBatchSize?}) -> EditResult — batch place (one undo)',
  place: 'place(x,y,z,id, state?) — one voxel (state packs facing|half<<2|open<<3)',
  toggle: 'toggle(x,y,z) — flip a gate open/closed',
  fill: 'fill(x1,y1,z1, x2,y2,z2, id) — solid box',
  clearBox: 'clearBox(x1,y1,z1, x2,y2,z2) — box to air',
  sphere: 'sphere(cx,cy,cz, radius, id)',
  cylinder: 'cylinder(cx,cy,cz, radius, height, id) — solid upright',
  hollowCylinder: 'hollowCylinder(cx,cy,cz, radius, height, id) — 1-thick round tube',
  pyramid: 'pyramid(cx,cy,cz, baseRadius, id) — square, tapers to a point',
  cone: "cone(cx,cy,cz, baseRadius, id, {shape?:'octagon'|'square', solid?}) — spire/hat",
  octagon: 'octagon(cx,cy,cz, radius, height, id, {hollow?}) — octagonal prism',
  ring: "ring(cx,cy,cz, radius, id, {shape?:'octagon'|'circle'|'square'}) — 1-layer boundary",
  stairs: "stairs(x,y,z, id, facing:'n'|'e'|'s'|'w', {top?}) — one oriented stair",
  stairsRun: 'stairsRun(x1,y1,z1, x2,y2,z2, id, facing, {top?}) — a line of oriented stairs',
  stairFacingToward: 'stairFacingToward(dx,dz) -> outward facing for a roof edge/ramp',
  hollowBox: 'hollowBox(x1,y1,z1, x2,y2,z2, id) — box shell',
  line: 'line(x1,y1,z1, x2,y2,z2, id)',
  replace: 'replace(box, fromId, toId)',
  undo: 'undo()  /  redo: redo()',
  preloadArea: 'preloadArea(x,z, radius=2) -> {generated,meshed} — load chunks before build/scan',
  // perceive
  blockAt: 'blockAt(x,y,z) -> name',
  blockInfo: 'blockInfo(x,y,z) -> {id,name,state} — includes orientation/open state',
  stateAt: 'stateAt(x,y,z) -> packed state byte',
  surface: 'surface(x,z) -> {y,block,unloaded} — highest non-air',
  scan: 'scan(x1,y1,z1, x2,y2,z2) -> {dims,nonAir,counts,unloaded}',
  slice: 'slice(y, x1,z1, x2,z2) -> {rows,legend,...} — ASCII floor plan',
  world:
    'world.list()/current()/saveAs(n)/load(n)/delete(n) · meta()/audit()/setMeta/setSpawn(name?)/addLandmark/setTour/roamUrl',
  bench: 'bench({axis,distance,speed}) — profile a straight fly-roam',
  benchRoute: 'benchRoute([{x,z}...], {speed?}) — profile a multi-waypoint route',
  benchTour: "benchTour({speed?}) — profile the world's saved meta.tour",
  fog: 'fog(near, far) — dev-only: override distance-fog band on chunk materials (clean wide captures)',
  ao: 'ao(strength=1) — dev-only: scale vertex-AO corner shading (0 = off, 1 = normal, >1 exaggerated)',
  ambient:
    'ambient(strength=0.35) — dev-only: scale hemispheric sky-tint ambient (0 = off/legacy look)',
  help: 'help(name?) -> signatures (all, or one method)',
};
