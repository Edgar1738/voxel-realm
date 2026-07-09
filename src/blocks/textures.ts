import { mulberry32 } from '../core/math';

export const TILE = 16; // px per tile

export type RGB = readonly [number, number, number];
export type RGBA = readonly [number, number, number, number];
export type Pixel = (px: number, py: number, rng: () => number) => RGB | RGBA;

export type PatternName =
  | 'speckle'
  | 'brick'
  | 'cobble'
  | 'planks'
  | 'rings'
  | 'bark'
  | 'ridges'
  | 'grassTop'
  | 'grassSide'
  | 'stone'
  | 'dirt'
  | 'sand'
  | 'gravel'
  | 'leaves'
  | 'glass'
  | 'lantern'
  | 'ore'
  | 'glow'
  | 'bookshelf'
  | 'furnace'
  | 'flower'
  | 'tallGrass';

export type TextureSpec = { pattern: PatternName; colors: RGB[]; amp?: number } | { custom: Pixel };

export type FaceTextures =
  | TextureSpec
  | { top: TextureSpec; side: TextureSpec; bottom: TextureSpec }
  | [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec];

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function shade(c: RGB, d: number): RGB {
  return [c[0] + d, c[1] + d, c[2] + d] as RGB;
}
/** Linear blend between two colors (t in 0..1). Used to shift a base tone toward a mineral/moss/rust hue. */
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t] as RGB;
}
/** Perceptual luminance — lets a pattern react to how light/dark its own palette is (used by ores). */
function lum(c: RGB): number {
  return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
}

// ---------------------------------------------------------------------------
// Deterministic spatial helpers.
//
// The paint loop feeds every pattern a single sequential `rng` (great for fine
// per-pixel grain), but structural detail — veins, cracks, individual stones,
// ore clusters — needs a value it can look up at ANY (x,y) without depending on
// draw order. These position-hashed helpers provide that, and every one is
// PERIODIC with period TILE (16). Because each block face samples the same 16px
// layer, a wall of stone is that tile repeated; making the noise seamless at 16
// turns the forced repeat into continuous rock/soil/sand instead of an obvious
// tiling grid. That single property does most of the "less repetitive / more
// natural" work the detail pass is after.
// ---------------------------------------------------------------------------

/** 2D integer hash → uint32 with good avalanche. The salt lets one pattern draw many independent fields. */
function hashi(x: number, y: number, salt: number): number {
  let h =
    (Math.imul(x | 0, 0x27d4eb2d) ^
      Math.imul(y | 0, 0x165667b1) ^
      Math.imul(salt | 0, 0x9e3779b1)) |
    0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
/** Hash → float in [0,1). */
function hashf(x: number, y: number, salt: number): number {
  return hashi(x, y, salt) / 4294967296;
}

/**
 * Value noise on an integer lattice with smoothstep interpolation, wrapped at
 * `period` so it tiles seamlessly. `period` must divide TILE for a clean 16px
 * seam. Returns [0,1); callers usually center it to [-0.5,0.5] for a shade delta.
 */
function pnoise(x: number, y: number, period: number, salt: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (n: number): number => ((n % period) + period) % period;
  const x0 = w(xi);
  const x1 = w(xi + 1);
  const y0 = w(yi);
  const y1 = w(yi + 1);
  const a = hashf(x0, y0, salt);
  const b = hashf(x1, y0, salt);
  const c = hashf(x0, y1, salt);
  const d = hashf(x1, y1, salt);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

/**
 * Fractal (multi-octave) value noise. The octave periods 16/8/4 all divide TILE,
 * so the sum still tiles at 16. Big smooth drifts + finer detail: the natural
 * base for "geological mottling", "moist patches", and "weather stains".
 */
function fbm(x: number, y: number, salt: number): number {
  return (
    pnoise(x, y, 16, salt) * 0.6 +
    pnoise(x * 2, y * 2, 8, salt ^ 0x9e37) * 0.3 +
    pnoise(x * 4, y * 4, 4, salt ^ 0x85eb) * 0.1
  );
}

/** A thin ridge line: peaks where the field is ~0.5, so thresholding it yields meandering veins/cracks rather than blobs. */
function ridge(n: number): number {
  return 1 - Math.abs(2 * n - 1);
}

interface Cell {
  f1: number; // distance to nearest feature point (rounded-stone shading)
  f2: number; // distance to 2nd nearest (f2-f1 ≈ 0 marks cell borders → mortar/crevices)
  id: number; // stable hash of the owning cell (per-stone tone / cracked-stone selection)
}

/**
 * Periodic Worley/cellular noise. Scatters one feature point per `scale`-sized
 * cell and reports the nearest two. This is the workhorse for anything made of
 * discrete lumps — cobbles, gravel, leaf clumps, ore nuggets — because f1 gives
 * rounded per-stone shading, f2-f1 finds the gaps between stones, and id gives
 * each stone its own stable tone. Cell coords wrap at TILE/scale so it tiles.
 * `scale` must divide TILE (use 4 or 8).
 */
function worley(x: number, y: number, scale: number, salt: number): Cell {
  const cells = TILE / scale;
  const gx = Math.floor(x / scale);
  const gy = Math.floor(y / scale);
  let f1 = 1e9;
  let f2 = 1e9;
  let id = 0;
  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const cx = gx + ox;
      const cy = gy + oy;
      // Hash on wrapped cell coords so opposite tile edges agree (seamless),
      // but place the point using unwrapped coords so distances stay continuous.
      const wx = ((cx % cells) + cells) % cells;
      const wy = ((cy % cells) + cells) % cells;
      const fx = (cx + 0.5 + (hashf(wx, wy, salt) - 0.5) * 0.9) * scale;
      const fy = (cy + 0.5 + (hashf(wx, wy, salt ^ 0x68bc) - 0.5) * 0.9) * scale;
      const d = Math.hypot(x - fx, y - fy);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        id = hashi(wx, wy, salt);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2, id };
}

// ---------------------------------------------------------------------------
// Shared surface builders. Several blocks want the SAME material under the hood
// (ore & furnace both sit in stone; grass sides, grass bottom and plain dirt are
// all soil) so the look stays cohesive and dedups cleanly.
// ---------------------------------------------------------------------------

/**
 * Fractured rock. Reads as geology rather than TV static by layering, from
 * coarse to fine: (1) large plates from Worley cells, each with its own tone, so
 * the rock has several shades; (2) dark fractures along the plate boundaries;
 * (3) a faint quartz-toned mineral vein network from ridged noise; (4) broad
 * low-frequency mottling for natural light/dark drift; (5) sparse bright chips
 * and dark pits; (6) a whisper of per-pixel grain. All the structure is tileable,
 * so a stone wall looks like one continuous rock face.
 */
function rockShade(base: RGB, px: number, py: number, rng: () => number): RGB {
  const plate = worley(px, py, 8, 101); // 2×2 rock plates
  const plateTone = ((plate.id % 7) - 3) * 3; // stable -9..+9 per plate → multiple rock shades
  const fracture = plate.f2 - plate.f1;
  const crack = fracture < 1.2 ? -24 * (1 - fracture / 1.2) : 0; // soft, dark plate-edge fractures

  const mottle = (fbm(px, py, 202) - 0.5) * 20; // broad geological shade drift

  // Mineral veins: a thin meandering seam that runs a touch lighter and cooler,
  // like quartz threaded through the rock. Kept rare via a high ridge threshold.
  // Integer coords at period 16 (the lowest frequency that still divides TILE) so
  // the vein tiles seamlessly across adjacent stone faces.
  const veinLine = ridge(pnoise(px + 2, py, 16, 303));
  const isVein = veinLine > 0.9;

  // Tiny surface detail: occasional bright chip and darker pit, hashed so their
  // positions are fixed (and don't stack in the same spot on every tile).
  const chip = hashf(px, py, 404);
  const fleck = chip > 0.975 ? 22 : chip < 0.02 ? -26 : 0;

  const grain = (rng() - 0.5) * 8;
  const col = shade(base, plateTone + crack + mottle + fleck + grain);
  return isVein ? mix(col, [base[0] + 24, base[1] + 28, base[2] + 40], 0.5) : col;
}

/**
 * Packed earth. A soft moist/dry patchwork from low-frequency noise (damp
 * hollows read darker and cooler), a scatter of tiny rounded pebbles from a fine
 * cellular field, the occasional dark root strand threaded through, and fine clod
 * grain — so it reads as compacted soil instead of flat brown static.
 */
function soil(base: RGB, px: number, py: number, rng: () => number): RGB {
  // Damp patches: where the broad field dips, darken and cool the soil slightly.
  const damp = fbm(px, py, 511);
  const moist = damp < 0.42 ? -(0.42 - damp) * 60 : (damp - 0.42) * 14;
  let col = shade(base, moist + (rng() - 0.5) * 12);
  if (damp < 0.34) col = mix(col, [base[0] - 18, base[1] - 20, base[2] - 14], 0.4);

  // Tiny pebbles: only some cells host one (id gate) and only near its center
  // (small f1), giving a sparse, believable scatter of little grey-brown stones.
  const peb = worley(px, py, 4, 622);
  if (peb.id % 4 === 0 && peb.f1 < 1.3) {
    const round = 1 - peb.f1 / 1.3;
    col = mix(col, [152, 143, 128], 0.6 * round + 0.2);
  }

  // Roots: a rare thin darker strand meandering through the earth (integer coords → seamless).
  const root = ridge(pnoise(px, py + 2, 16, 733));
  if (root > 0.92) col = mix(col, [78, 54, 34], 0.5);

  return col;
}

// ---------------------------------------------------------------------------
// Pattern builders. Each returns a Pixel (px,py) → color for one 16×16 tile.
// ---------------------------------------------------------------------------

/**
 * Generic grain. Original behavior was pure per-pixel jitter; now a gentle
 * tileable mottle carries most of the variation so large surfaces (snow, water,
 * mud, terracotta) get soft light/dark drift instead of flat static, with the
 * remaining jitter kept as fine grain. `amp` still controls overall strength.
 */
const speckle =
  (base: RGB, amp: number): Pixel =>
  (px, py, rng) => {
    const mottle = (fbm(px, py, 811) - 0.5) * amp * 1.6;
    return shade(base, mottle + (rng() - 0.5) * amp);
  };

/**
 * Brick / stone-brick courses laid in a running bond. Beyond the flat base it
 * now weathers like an old wall: mortar erodes and darkens unevenly, courses sit
 * a pixel high or low, some bricks carry a diagonal crack, corners chip away to
 * mortar, and broad stains wash down the face. Course height (4) and brick width
 * (8) both divide 16 so the bond tiles seamlessly.
 */
const brick =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    const courseH = 4;
    const brickW = 8;
    const course = Math.floor(py / courseH);
    const ck = course % 4; // wrapped course key so per-course jitter tiles at 16
    const ox = (course % 2) * (brickW / 2); // half-brick offset on alternate courses
    // Slightly uneven courses: nudge each course's mortar line up/down by a pixel.
    const jitter = hashi(ck, 0, 900) % 3 === 0 ? 1 : 0;
    const rowInCourse = py - course * courseH;
    const onH = rowInCourse === jitter;
    const onV = (px + ox) % brickW === 0;
    if (onH || onV) {
      // Worn mortar: darker in the recess, eroded to near-black in patches.
      const erode = fbm(px, py, 901) < 0.4 ? -10 : 0;
      return shade(mortar, -6 + erode + (rng() - 0.5) * 8);
    }
    const brickCol = Math.floor((px + ox) / brickW);
    const tone = (((((course * 7 + brickCol * 13) % 5) + 5) % 5) - 2) * 5; // stable -10..10 per brick
    // Corner chips: near a brick corner, a hashed few flake off to mortar color.
    const lx = (px + ox) % brickW;
    const ly = rowInCourse;
    const nearCorner = (lx <= 1 || lx >= brickW - 1) && (ly <= 0 || ly >= courseH - 1);
    if (nearCorner && hashf(px, py, 902) > 0.7) return shade(mortar, (rng() - 0.5) * 8);
    // Cracked bricks: a handful get a dark diagonal hairline across the face.
    const cracked = hashi(course, brickCol, 903) % 6 === 0;
    if (cracked && Math.abs(lx - ly * 2 - (hashi(course, brickCol, 904) % 5)) < 0.6) {
      return shade(base, tone - 26);
    }
    // Weather stains: broad darker washes over the wall (integer coords → seamless).
    const stain = (fbm(px, py, 905) - 0.5) * 16;
    const shadowLine = ly === courseH - 1 ? -6 : 0; // faint shadow at each brick's base
    return shade(base, tone + stain + shadowLine + (rng() - 0.5) * 8);
  };

/**
 * Cobblestone: a bed of individual, weathered stones. A cellular field gives each
 * stone a rounded raised centre (bright toward the middle, falling to a shadowed
 * rim), its own tone from the cell id (some warmer, cooler or darker), a hashed
 * subset that are cracked, and chipped corners — all separated by a recessed,
 * shadowed mortar bed found where two stones are equidistant.
 */
const cobble =
  (base: RGB, mortar: RGB): Pixel =>
  (px, py, rng) => {
    // Stone "setts" (scale 4 → ~a dozen packed stones) with thin mortar-colored seams.
    // The mortar color + strong per-stone tone is what distinguishes cobble from gravel,
    // which has no mortar and instead varies pebble SIZE with darkened crevices.
    const c = worley(px, py, 4, 1001);
    const gap = c.f2 - c.f1;
    // Mortar bed between stones: a thin recessed, shadowed seam.
    if (gap < 0.55) {
      const depth = -10 - (0.55 - gap) * 16;
      return shade(mortar, depth + (rng() - 0.5) * 6);
    }
    // Per-stone identity: a wide tone spread so every stone reads as its own rock,
    // with a few tinted warm/cool for extra variety.
    const tone = ((c.id % 9) - 4) * 4;
    let col = shade(base, tone);
    const hueRoll = c.id % 6;
    if (hueRoll === 0)
      col = mix(col, [base[0] + 14, base[1] + 6, base[2] - 4], 0.3); // warmer stone
    else if (hueRoll === 1) col = mix(col, [base[0] - 6, base[1] + 2, base[2] + 14], 0.3); // cooler stone
    // Gentle rounded relief, floored at 0 so stone bodies stay solid (no hard mortar grid).
    const relief = Math.max(0, 1 - c.f1 / 2.4) * 11;
    col = shade(col, relief);
    // Occasional chipped corner near a seam gives a weathered, hand-laid edge.
    if (gap < 1.0 && hashf(px, py, 1003) > 0.9) col = shade(col, -12);
    return shade(col, (rng() - 0.5) * 9);
  };

/**
 * Wooden planks: horizontal boards (pitch 4 → four boards on a 16 tile, and it
 * tiles vertically) separated by a dark seam. Each board gets a long horizontal
 * wood-grain streak, its own faint tone, occasional knots with a ring around
 * them, and light saw-tick marks — so the surface never reads as a flat repeat.
 * Grain runs with the board (horizontal), matching real laid planks; no vertical
 * edge shading, since boards are continuous across a floor.
 */
const planks =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const pitch = 4;
    const board = Math.floor(py / pitch);
    const rowInBoard = py - board * pitch;
    if (rowInBoard === 0) return shade(base, -34 + (rng() - 0.5) * 6); // dark seam between boards
    const bk = board % 4; // wrapped board key (tiles at 16)
    const boardTone = (((bk * 7) % 5) - 2) * 4; // per-board tone (-8..+8)
    // Long grain streaks: vary along the board length (x), constant per board, so
    // streaks run horizontally. A finer octave adds hairline grain.
    const grain =
      (pnoise(px, bk * 3, 16, 1101) - 0.5) * 16 + (pnoise(px * 2, bk * 3, 8, 1102) - 0.5) * 8;
    // Knots: each board may host one dark oval with a tighter ring around it.
    const knotX = (hashf(bk, 0, 1103) * TILE) | 0;
    const kd = Math.hypot(px - knotX, (rowInBoard - pitch / 2) * 1.6);
    let knot = 0;
    if (hashf(bk, 7, 1104) > 0.45) {
      if (kd < 1.2) knot = -30;
      else if (kd < 2.1) knot = -14; // ring of tighter grain around the knot
    }
    // Saw marks: sparse faint vertical ticks left by the mill blade.
    const saw = hashf(px, board, 1105) > 0.94 ? -8 : 0;
    return shade(base, boardTone + grain + knot + saw + (rng() - 0.5) * 6);
  };

/**
 * Log end-grain: concentric growth rings around the pith. The radius is warped by
 * a little noise so rings wobble like real wood, the very centre darkens to the
 * pith, one radial season-crack splits outward, and a darker bark ring frames the
 * cut at the edge — the classic chopped-log top.
 */
const rings =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const dx = px - 7.5;
    const dy = py - 7.5;
    const r = Math.hypot(dx, dy);
    const warp = (pnoise(px, py, 16, 1201) - 0.5) * 2.2; // makes rings organic, not perfect circles
    const ring = Math.sin((r + warp) * 2.1) * 9; // light/dark growth bands
    const pith = r < 1.6 ? -16 : 0; // dark heart of the trunk
    // A single radial crack from a season of drying, along one hashed angle.
    const ang = Math.atan2(dy, dx);
    const crackAng = (hashf(0, 0, 1202) - 0.5) * Math.PI * 2;
    const crack =
      r > 1.5 &&
      Math.abs(((ang - crackAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > Math.PI - 0.12
        ? -18
        : 0;
    if (r > 6.6) return shade(mix(base, [95, 68, 40], 0.6), (rng() - 0.5) * 10); // bark rim
    return shade(base, ring + pith + crack + (rng() - 0.5) * 7);
  };

/**
 * Bark: rough vertical furrows running the height of the trunk. Deep grooves fall
 * on hashed columns (so ridge spacing is irregular, not a comb), value noise adds
 * a rough weathered surface, and short dark cracks split the bark here and there.
 * Everything is periodic vertically so stacked log sides read as one trunk.
 */
const bark =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    // Vertical furrows: a smooth field (integer coords at period 16 so stacked logs
    // tile) whose x-variation forms the ridges and whose gentle y-drift keeps them
    // from running ruler-straight.
    const furrow = pnoise(px, py, 16, 1301);
    const relief = (furrow - 0.5) * 26;
    // A few columns are deep grooves (shadowed clefts between bark ridges). Fixed
    // per-column selection (px in 0..15) so the groove columns line up across tiles.
    const deep = hashf(px, 0, 1302) > 0.78 ? -14 : 0;
    // Bark cracks: short darker breaks scattered over the surface (integer coords → seamless).
    const crack = ridge(pnoise(px, py, 16, 1303)) > 0.92 ? -16 : 0;
    const rough = (fbm(px, py, 1304) - 0.5) * 12;
    return shade(base, relief + deep + crack + rough + (rng() - 0.5) * 8);
  };

/**
 * Cactus / vertical-ribbed flesh. Rounded ribs run top to bottom (bright crest,
 * shadowed cleft), with small areoles (spine bumps) dotted along the ridges and a
 * gentle vertical shading — a plumper, more sculpted look than flat stripes.
 */
const ridges =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const ribW = 4; // four ribs across the block
    const within = ((px % ribW) + ribW) % ribW;
    const t = within / (ribW - 1); // 0..1 across a rib
    const round = Math.sin(t * Math.PI) * 12 - 6; // crest bright, cleft (t→0/1) dark
    const cleft = within === 0 ? -6 : 0; // extra shadow in the seam between ribs
    // Areoles: little spine bumps sitting on the rib crests at intervals.
    const onCrest = within === 2;
    const areole = onCrest && py % 4 === 1 ? 10 : 0;
    return shade(base, round + cleft + areole + (rng() - 0.5) * 8);
  };

/**
 * Grass, top face. Blades grow in clumps: a low-frequency field raises brighter
 * tufts and sinks darker pockets, individual blade tips catch light as scattered
 * lighter (slightly yellow-green) pixels, and shaded gaps go cooler and darker —
 * clustered growth instead of per-pixel confetti. (Biome tint multiplies on top.)
 */
const grassTopP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const clump = fbm(px, py, 1401); // soft patches of denser / sparser growth
    const tuft = clump > 0.58 ? 16 : clump < 0.4 ? -16 : 0;
    let col = shade(base, tuft + (rng() - 0.5) * 12);
    if (clump < 0.36) col = mix(col, [base[0] - 10, base[1] - 6, base[2] + 6], 0.35); // cool shaded pocket
    const blade = hashf(px, py, 1402);
    if (blade > 0.9)
      col = mix(col, [base[0] + 40, base[1] + 34, base[2] - 6], 0.6); // sunlit blade tip
    else if (blade < 0.08) col = shade(col, -14); // deep gap between blades
    return col;
  };

/**
 * Grass, side face. The green cap spills over the top with an irregular, per-column
 * overhang (not a ruler-straight line), a few blades dangle a row or two lower for
 * a soft transition, and everything below is the shared soil surface so the block's
 * dirt matches real dirt exactly. colors: [dirt, green].
 */
const grassSideP =
  (dirt: RGB, green: RGB): Pixel =>
  (px, py, rng) => {
    // Irregular overhang: each column's grass reaches a slightly different depth.
    const depth = 2 + (hashi(px, 0, 1501) % 3); // 2..4 px of cap
    if (py < depth) return shade(green, (rng() - 0.5) * 16);
    // Dangling blades: a few columns trail a blade one or two rows below the cap.
    if (py <= depth + 2 && hashf(px, py, 1502) > 0.62) return shade(green, (rng() - 0.5) * 12 - 6);
    // Below the grass line: identical to plain dirt for a seamless block.
    return soil(dirt, px, py, rng);
  };

/**
 * Bare stone face. Thin wrapper over the shared fractured-rock builder so plain
 * stone, slabs and stairs all read as the same believable rock.
 */
const stoneFace =
  (base: RGB): Pixel =>
  (px, py, rng) =>
    rockShade(base, px, py, rng);

/** Dirt face. Thin wrapper over the shared packed-earth builder (also used by grass sides/bottom). */
const dirtP =
  (base: RGB): Pixel =>
  (px, py, rng) =>
    soil(base, px, py, rng);

/**
 * Sand: fine wind-blown grains. Gentle diagonal wind ripples (a low-amplitude
 * tileable wave), soft dune shading from broad noise, faint grain clusters, and a
 * sprinkle of darker heavier grains — calm and powdery rather than noisy.
 */
const sand =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    // Wind ripples: ~2 crests across the tile, gently warped so they aren't robotic.
    const warp = (pnoise(px, py, 16, 1601) - 0.5) * 2.4;
    // py coefficient 0.5 makes the wave complete a whole number of periods over the
    // 16px tile in BOTH axes, so the ripples tile seamlessly across a beach.
    const ripple = Math.sin(((px + py * 0.5 + warp) * Math.PI * 2 * 2) / TILE) * 5;
    const dune = (fbm(px, py, 1602) - 0.5) * 10; // broad soft shading
    const cluster = (pnoise(px * 2, py * 2, 8, 1603) - 0.5) * 6; // faint grain clumps
    const heavy = hashf(px, py, 1604) > 0.93 ? -14 : 0; // scattered darker grains
    return shade(base, ripple + dune + cluster + heavy + (rng() - 0.5) * 5);
  };

/**
 * Gravel: a dense bed of small rounded stones. Each cellular stone is bright at
 * its centre and falls to a dark crevice at its edge, carries its own tone (grey
 * to brownish) and a per-stone size, with deep shadow where stones meet — loose
 * shingle rather than uniform grit.
 */
const gravel =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const c = worley(px, py, 4, 1701);
    // Deep crevices between pebbles.
    if (c.f2 - c.f1 < 0.5) return shade(base, -30 + (rng() - 0.5) * 6);
    const radius = 1.4 + (c.id % 3) * 0.35; // varied pebble sizes
    const round = Math.max(0, 1 - c.f1 / radius);
    const tone = ((c.id % 8) - 4) * 4;
    let col = shade(base, tone + round * 16 - 8);
    if (c.id % 4 === 0) col = mix(col, [base[0] + 12, base[1] + 4, base[2] - 8], 0.25); // brownish stone
    return shade(col, (rng() - 0.5) * 10);
  };

/**
 * Leaves: overlapping foliage clumps. A cellular field builds rounded leaf masses
 * (bright, sunlit toward each clump's centre; dark shadow where masses meet), a
 * broad noise layer stacks larger light/shadow masses over that for depth, sunlit
 * leaf edges pick up a brighter yellow-green, and interior gaps sink to a dark
 * shadow. Opaque (leaves are solid cubes); biome tint multiplies on top.
 */
const leavesP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const clump = worley(px, py, 4, 1801);
    const lit = 1 - Math.min(1, clump.f1 / 2.0); // bright centre of each leaf mass
    const mass = (fbm(px, py, 1802) - 0.5) * 26; // larger overlapping light/shadow masses
    let col = shade(base, lit * 20 - 6 + mass);
    // Shadowed pockets where clumps meet.
    if (clump.f2 - clump.f1 < 0.5) col = shade(col, -22);
    const leaf = hashf(px, py, 1803);
    if (leaf > 0.9)
      col = mix(col, [base[0] + 30, base[1] + 34, base[2] - 4], 0.55); // sunlit outer leaf
    else if (leaf < 0.1) col = shade(col, -16); // dark gap deep in the canopy
    return shade(col, (rng() - 0.5) * 12);
  };

/**
 * Glass: a clean polished pane. A brighter framed border reads as the pane edge,
 * a soft diagonal sheen band gives the specular streak of light across glass, a
 * couple of faint parallel streaks add polish, and the interior stays nearly flat
 * and clear. (The transparent pass supplies see-through alpha; RGB here is the tint.)
 */
const glassP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const border = px === 0 || py === 0 || px === TILE - 1 || py === TILE - 1;
    if (border) return shade(base, 26); // bright pane frame
    // Main diagonal sheen: a bright soft-edged band of reflected light.
    const diag = px + py;
    const sheen = diag > 8 && diag < 12 ? 30 - Math.abs(diag - 10) * 8 : 0;
    // Faint secondary streaks for a polished, slightly imperfect surface.
    const streak = (diag - 3) % 7 === 0 ? 8 : 0;
    // A single crisp highlight glint near a corner.
    const glint = Math.hypot(px - 4, py - 4) < 1.3 ? 22 : 0;
    return shade(base, sheen + streak + glint + (rng() - 0.5) * 3);
  };

/**
 * Lantern: a warm lit box in a metal frame. Each pane glows from a hot near-white
 * core out to warm amber at the edges; the frame is a defined dark border with
 * central mullions, corner brackets that read as stronger joinery, and hashed
 * scratches/pitting so the metal looks worn rather than printed.
 */
const lanternP =
  (frame: RGB, glow: RGB): Pixel =>
  (px, py, rng) => {
    const onEdge = px <= 1 || py <= 1 || px >= TILE - 2 || py >= TILE - 2;
    const onMullion = px === 7 || px === 8 || py === 7 || py === 8;
    const onCorner =
      (px <= 3 || px >= TILE - 4) &&
      (py <= 3 || py >= TILE - 4) &&
      (px <= 1 || px >= TILE - 2 || py <= 1 || py >= TILE - 2);
    if (onEdge || onMullion) {
      const wear = hashf(px, py, 1901) > 0.85 ? 14 : 0; // scuffed highlight on the metal
      const bracket = onCorner ? -10 : 0; // darker, heavier corner joinery
      return shade(frame, bracket + wear + (rng() - 0.5) * 8);
    }
    // Glow: hot white-ish core fading to warm amber, per lantern pane.
    const cx = px < 8 ? 4 : 11;
    const cy = py < 8 ? 4 : 11;
    const d = Math.hypot(px - cx, py - cy);
    const core = Math.max(0, 1 - d / 4.5);
    let col = mix(glow, [255, 246, 214], core * 0.7); // whiten toward the core
    col = shade(col, core * 26 + (rng() - 0.5) * 12);
    return col;
  };

/**
 * Ore in a stone matrix. The non-mineral rock reuses the shared fractured-rock
 * builder so ores sit naturally in stone. The mineral itself is a cluster of
 * rounded nuggets (a cellular field, seeded from the ore's own COLOR so every ore
 * type gets a distinct, stable cluster layout) linked by thin embedded veins.
 * The material FEEL is derived from the spot color's luminance/hue, giving each
 * ore a strong identity with no extra parameters:
 *   • very dark  → matte (coal): flat, no highlight
 *   • warm + mid → rusty metallic (iron): mottled rust in the nuggets + specular
 *   • warm + bright → precious metal (gold): strong specular glints
 *   • cool/green → gem/crystal (emerald, crystal): bright faceted cores, luminous rim
 */
const oreP =
  (spot: RGB): Pixel =>
  (px, py, rng) => {
    const stoneBase: RGB = [128, 128, 132];
    const L = lum(spot);
    const warm = spot[0] > spot[2] + 20; // reddish/golden vs. cool/green
    const seed = (hashi(Math.round(spot[0]), Math.round(spot[1]), Math.round(spot[2])) % 4096) + 1;

    // Where is mineral? Nuggets around cluster centres, plus thin connecting veins.
    const cl = worley(px, py, 4, seed);
    const nugget = cl.f1 < 1.7 && cl.id % 2 === 0; // ~half the cells host a nugget
    const vein = ridge(pnoise(px, py, 16, seed ^ 0x33)) > 0.88; // integer coords → seamless
    if (!nugget && !vein) return rockShade(stoneBase, px, py, rng);

    const round = nugget ? Math.max(0, 1 - cl.f1 / 1.7) : 0.4; // rounded nugget relief
    let col: RGB; // set by every material branch below
    const jitter = (rng() - 0.5) * 20;

    if (L < 70) {
      // Coal: matte black — flat, sooty, barely any highlight.
      col = shade(spot, -6 + round * 6 + jitter * 0.5);
    } else if (warm && L < 175) {
      // Iron: rusty metal — mottled orange-brown patches with a soft sheen.
      const rust = fbm(px, py, seed ^ 0x9a) < 0.45;
      col = rust ? mix(spot, [150, 82, 46], 0.5) : spot;
      col = shade(col, round * 18 - 4 + jitter);
      if (round > 0.7 && hashf(px, py, seed ^ 0x77) > 0.6) col = shade(col, 26); // specular fleck
    } else if (warm) {
      // Gold: precious metal — bright, warm, with strong specular glints.
      col = shade(spot, round * 22 - 2 + jitter);
      if (round > 0.6 && hashf(px, py, seed ^ 0x55) > 0.5) col = mix(col, [255, 246, 190], 0.6);
    } else {
      // Emerald / crystal: faceted gem — bright core, luminous cool rim.
      col = shade(spot, round * 20 + jitter);
      const facet = hashf(px, py, seed ^ 0x22);
      if (round > 0.55 && facet > 0.55) col = mix(col, [255, 255, 255], 0.5); // sharp facet highlight
      if (cl.f1 > 1.2 && cl.f1 < 1.7)
        col = mix(col, [spot[0] + 30, spot[1] + 30, spot[2] + 30], 0.4); // glow rim
    }
    return col;
  };

/**
 * Glowstone: a bright emitter clustered into luminous lumps. A cellular field
 * gives glowing pods (near-white hot cores fading out) set in a warm honey base,
 * so it reads as packed light crystals rather than uniform brightness.
 */
const glowP =
  (base: RGB): Pixel =>
  (px, py, rng) => {
    const c = worley(px, py, 4, 2001);
    const core = Math.max(0, 1 - c.f1 / 1.8);
    let col = shade(base, (fbm(px, py, 2002) - 0.5) * 12);
    col = mix(col, [255, 244, 200], core * 0.85); // hot luminous pods
    return shade(col, core * 18 + (rng() - 0.5) * 12);
  };

/**
 * Bookshelf side: sturdy shelves holding rows of books. Wood-toned shelf boards
 * (with a top-lit / bottom-shadowed edge) frame each row; between them stand book
 * spines of varied width, height and color, a few leaning or missing to break the
 * regularity, with a shadow gap where the shelf recesses behind them.
 */
const bookshelfP =
  (wood: RGB): Pixel =>
  (px, py, rng) => {
    const shelfH = 7;
    const rowInShelf = ((py % shelfH) + shelfH) % shelfH;
    if (rowInShelf === 0) return shade(wood, -30 + (rng() - 0.5) * 6); // dark shelf underside
    if (rowInShelf === 1) return shade(wood, 8 + (rng() - 0.5) * 6); // lit shelf edge
    const row = Math.floor(py / shelfH);
    // Book spines: width and color keyed by a per-book hash so rows differ.
    const bookSeed = hashi(px, row, 2101);
    const gap = rowInShelf >= shelfH - 1; // shadow line above the shelf
    if (gap) return shade(wood, -16);
    const palette: RGB[] = [
      [150, 60, 50],
      [60, 90, 150],
      [70, 120, 70],
      [170, 140, 60],
      [110, 70, 130],
    ];
    const tint = palette[bookSeed % palette.length];
    const missing = bookSeed % 11 === 0; // an occasional empty slot
    if (missing) return shade(wood, -22 + (rng() - 0.5) * 6);
    const lean = rowInShelf <= 2 && bookSeed % 7 === 0 ? -10 : 0; // top of a leaning book
    return shade(tint, lean + (rng() - 0.5) * 22);
  };

/**
 * Furnace front: a stone block with a dark firebox. The stone reuses the shared
 * fractured-rock builder, an iron band with rivets frames the firebox mouth, and
 * inside, embers glow hotter toward the base — a working furnace rather than a
 * grey square with a hole. colors: [stone, fire].
 */
const furnaceP =
  (stoneBase: RGB, fire: RGB): Pixel =>
  (px, py, rng) => {
    const inBox = px >= 4 && px <= 11 && py >= 8 && py <= 13;
    const onBand =
      (px >= 3 && px <= 12 && (py === 7 || py === 14)) ||
      ((px === 3 || px === 12) && py >= 7 && py <= 14);
    if (onBand) {
      const rivet = (px === 3 || px === 12) && (py === 7 || py === 14) ? 12 : 0; // corner rivets
      return shade([70, 70, 76], -6 + rivet + (rng() - 0.5) * 8); // dark iron band
    }
    if (inBox) {
      // Embers: a dark firebox that glows hotter (brighter, more orange) toward its base,
      // with a few bright coals flickering near the bottom.
      const heat = (py - 7) / 6; // 0 at top → 1 at base
      const coal = hashf(px, py, 2201);
      const ember = Math.max(0, heat - 0.15) * (0.55 + coal * 0.9);
      let col = mix([28, 20, 18], fire, Math.min(1, ember * 1.6));
      if (heat > 0.6 && coal > 0.7) col = mix(col, [255, 210, 120], 0.6); // hot coal glint
      return shade(col, (rng() - 0.5) * 16);
    }
    return rockShade(stoneBase, px, py, rng);
  };

const TRANSPARENT: RGBA = [0, 0, 0, 0];

/**
 * Tall grass: a spray of vertical blades on a transparent background. Each blade
 * grows from a fixed column, rising to a jagged tip; blades taper (a touch wider
 * at the base), lighten toward the tip and hold a shaded core, so the clump reads
 * as real grass rather than flat green sticks. (Biome tint multiplies on top.)
 */
const tallGrassP =
  (green: RGB): Pixel =>
  (px, py, rng): RGBA => {
    const bladeCols = [2, 4, 6, 8, 10, 12, 13];
    if (!bladeCols.includes(px)) return TRANSPARENT;
    const base = 4 + ((px * 5) % 4); // each blade starts at a slightly different height
    const onBlade = py >= base && py <= TILE - 1;
    // Blades widen by one pixel near their root for a tapered silhouette.
    const foot = py >= TILE - 3 && bladeCols.includes(px + 1) && (px * 7) % 3 === 0;
    if (!onBlade && !foot) return TRANSPARENT;
    const tip = py < base + 3 ? 16 : 0; // brighter sunlit tip
    const c = shade(green, tip + (rng() - 0.5) * 24);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };

/**
 * Flower: a green stem with a small bloom, on a transparent background. The bloom
 * is a ring of petals around a contrasting bright center, and the stem carries a
 * tiny leaf, so it reads as a little plant. colors: [stem, petal].
 */
const flowerP =
  (stem: RGB, petal: RGB): Pixel =>
  (px, py, rng): RGBA => {
    const onStem = (px === 7 || px === 8) && py >= 7;
    const leaf = (px === 6 || px === 9) && py === 10; // a small leaf on the stem
    const dx = px - 7.5;
    const dy = py - 5;
    const rr = dx * dx + dy * dy;
    const onPetal = rr <= 7.5 && rr > 1.2; // ring of petals
    const onCenter = rr <= 1.2; // bright flower eye
    if (!onStem && !onPetal && !onCenter && !leaf) return TRANSPARENT;
    let base: RGB;
    if (onCenter)
      base = [255, 220, 90]; // warm central eye
    else if (onPetal) base = petal;
    else base = stem;
    const c = shade(base, (rng() - 0.5) * 22);
    return [clamp(c[0]), clamp(c[1]), clamp(c[2]), 255];
  };

/** Map a pattern name + its color list to a Pixel. colors[0] is the base; others as documented. */
function buildPattern(name: PatternName, colors: RGB[], amp?: number): Pixel {
  const c0 = colors[0] ?? [128, 128, 128];
  const c1 = colors[1] ?? c0;
  switch (name) {
    case 'speckle':
      return speckle(c0, amp ?? 16);
    case 'brick':
      return brick(c0, c1);
    case 'cobble':
      return cobble(c0, c1);
    case 'planks':
      return planks(c0);
    case 'rings':
      return rings(c0);
    case 'bark':
      return bark(c0);
    case 'ridges':
      return ridges(c0);
    case 'grassTop':
      return grassTopP(c0);
    case 'grassSide':
      return grassSideP(c0, c1);
    case 'stone':
      return stoneFace(c0);
    case 'dirt':
      return dirtP(c0);
    case 'sand':
      return sand(c0);
    case 'gravel':
      return gravel(c0);
    case 'leaves':
      return leavesP(c0);
    case 'glass':
      return glassP(c0);
    case 'lantern':
      return lanternP(c0, c1);
    case 'ore':
      return oreP(c0);
    case 'glow':
      return glowP(c0);
    case 'bookshelf':
      return bookshelfP(c0);
    case 'furnace':
      return furnaceP(c0, c1);
    case 'flower':
      return flowerP(c0, c1);
    case 'tallGrass':
      return tallGrassP(c0);
  }
}

let customCounter = 0;
const customKeys = new WeakMap<Pixel, string>();

export function resolvePixel(spec: TextureSpec): Pixel {
  return 'custom' in spec ? spec.custom : buildPattern(spec.pattern, spec.colors, spec.amp);
}

/** Stable key for deduping specs into texture layers. Customs are always unique. */
export function specKey(spec: TextureSpec): string {
  if ('custom' in spec) {
    let k = customKeys.get(spec.custom);
    if (!k) {
      k = `custom#${customCounter++}`;
      customKeys.set(spec.custom, k);
    }
    return k;
  }
  return `${spec.pattern}|${spec.colors.map((c) => c.join(',')).join(';')}|${spec.amp ?? ''}`;
}

/** A stable, key-derived seed so a spec's pixels do not depend on its layer index. */
function specSeed(spec: TextureSpec): number {
  const key = specKey(spec);
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Expand any FaceTextures shorthand into 6 specs in Face order (PosX,NegX,PosY,NegY,PosZ,NegZ). */
export function expandFaces(
  faces: FaceTextures,
): [TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec, TextureSpec] {
  if (Array.isArray(faces)) return faces;
  if ('top' in faces) {
    const { top, side, bottom } = faces;
    return [side, side, top, bottom, side, side];
  }
  return [faces, faces, faces, faces, faces, faces];
}

/** Paint one TILE*TILE RGBA layer from a spec (seeded by the spec's stable key). */
export function paintLayer(out: Uint8Array, layer: number, spec: TextureSpec): void {
  const fn = resolvePixel(spec);
  const rng = mulberry32(specSeed(spec));
  const offset = layer * TILE * TILE * 4;
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const c = fn(px, py, rng);
      const p = offset + (py * TILE + px) * 4;
      out[p] = clamp(c[0]);
      out[p + 1] = clamp(c[1]);
      out[p + 2] = clamp(c[2]);
      out[p + 3] = c.length > 3 ? clamp((c as RGBA)[3]) : 255;
    }
  }
}
