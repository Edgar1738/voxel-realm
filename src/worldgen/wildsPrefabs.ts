import {
  AIR,
  COBBLESTONE,
  STONE,
  BRICK,
  GLOWSTONE,
  PLANKS,
  WOOD,
  GRAVEL,
  LANTERN,
  OAK_FENCE,
  COBBLE_WALL,
  DEEPSLATE,
  WATER,
  GRASS,
  TALL_GRASS,
} from '../blocks/blocks';
import type { Prefab, PrefabVoxel } from '../core/Prefab';
import type { BlockId } from '../core/types';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function builder(): {
  put: (x: number, y: number, z: number, id: BlockId) => void;
  blocks: PrefabVoxel[];
} {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  return { put, blocks };
}

// ---------------------------------------------------------------------------
// 1. ruinedWatchtower — tall crumbled cobblestone tower, ~7x7 footprint, 14 high
// ---------------------------------------------------------------------------
export function ruinedWatchtower(): Prefab {
  const W = 7;
  const D = 7;
  const { put, blocks } = builder();

  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      const onWall = x === 0 || x === W - 1 || z === 0 || z === D - 1;
      if (!onWall) continue;
      // ragged crown height: 8..13
      const h = 8 + ((x * 7 + z * 5) % 6);
      for (let y = 0; y <= h; y++) {
        // large breach holes + window gaps
        const breach = (x + z * 3 + y * 2) % 9 === 0 && y > 1 && y < h;
        const window_ = (x * 5 + z * 7 + y) % 13 === 0 && y > 2 && y < h - 1;
        if (!breach && !window_) put(x, y, z, COBBLESTONE);
      }
    }
  }
  // Interior rubble at base
  for (const [rx, rz] of [
    [1, 1],
    [2, 3],
    [3, 2],
    [4, 1],
    [5, 4],
    [2, 5],
  ] as const) {
    put(rx, 0, rz, COBBLESTONE);
  }
  // A few fallen blocks outside the tower (within dims)
  put(0, 0, 3, COBBLESTONE); // already covered by wall, rubble piece on y=0 outside: skip — keep within dims
  // Crumbled top blocks scattered at crown
  put(3, 13, 0, COBBLESTONE);
  put(6, 12, 3, COBBLESTONE);
  put(0, 11, 6, COBBLESTONE);

  return { dims: [W, 14, D], blocks };
}

// ---------------------------------------------------------------------------
// 2. standingStones — henge of 5-7 monoliths on a gravel base
// ---------------------------------------------------------------------------
export function standingStones(): Prefab {
  // We place 7 stone monoliths in a rough ring, on a 9x9 gravel pad
  const SIZE = 11;
  const { put, blocks } = builder();

  // Gravel base (3x3 pad at centre, scattered)
  for (let z = 3; z <= 7; z++) {
    for (let x = 3; x <= 7; x++) {
      put(x, 0, z, GRAVEL);
    }
  }

  // Monolith positions (hand-placed in ring pattern within 11x11)
  // Heights vary 3..5 (deterministic via index)
  const monoliths: Array<[number, number]> = [
    [1, 5], // west
    [9, 5], // east
    [5, 1], // north
    [5, 9], // south
    [2, 2], // NW
    [8, 2], // NE
    [2, 8], // SW
  ];

  for (let i = 0; i < monoliths.length; i++) {
    const [mx, mz] = monoliths[i];
    const h = 2 + ((mx * 3 + mz * 7) % 3); // 2..4 (so total height 3..5 blocks)
    for (let y = 0; y <= h; y++) {
      put(mx, y, mz, STONE);
    }
    // Lintel/cap on some (every other)
    if (i % 2 === 0 && mx + 1 < SIZE) {
      put(mx, h + 1, mz, COBBLESTONE);
    }
  }

  return { dims: [SIZE, 6, SIZE], blocks };
}

// ---------------------------------------------------------------------------
// 3. obelisk — slender tapering brick monument ~14 high, crystal capstone
// ---------------------------------------------------------------------------
export function obelisk(): Prefab {
  // Profile: 3x3 base tapers to 1x1 shaft then capstone
  const { put, blocks } = builder();

  // Base platform (3x3, y=0)
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 0, z, BRICK);

  // Wide lower shaft (3x3 hollow, y=1..3)
  for (let y = 1; y <= 3; y++)
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++) if (x === 0 || x === 2 || z === 0 || z === 2) put(x, y, z, BRICK);

  // Transition band (3x3 solid, y=4)
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 4, z, BRICK);

  // Narrow shaft (only centre column, y=5..13)
  for (let y = 5; y <= 13; y++) put(1, y, 1, BRICK);

  // Capstone — glowstone at apex (y=14, within dims y=15)
  put(1, 14, 1, GLOWSTONE);

  return { dims: [3, 15, 3], blocks };
}

// ---------------------------------------------------------------------------
// 4. ruinedCottage — broken partial walls, doorway, rubble, no roof
// ---------------------------------------------------------------------------
export function ruinedCottage(): Prefab {
  const W = 7;
  const D = 6;
  const { put, blocks } = builder();

  // Foundation (cobblestone floor)
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 0, z, COBBLESTONE);

  // Partial walls — each wall segment gets ragged height 1..3, some gaps
  // Front wall (z=0), with doorway at x=2..3
  for (let x = 0; x < W; x++) {
    if (x === 2 || x === 3) continue; // doorway
    const h = 1 + ((x * 5) % 3); // 1..3
    for (let y = 1; y <= h; y++) {
      if ((x + y) % 7 === 0) continue; // breach
      put(x, y, 0, x === 0 || x === W - 1 ? COBBLESTONE : PLANKS);
    }
  }
  // Back wall (z=D-1)
  for (let x = 0; x < W; x++) {
    const h = 1 + ((x * 3 + 2) % 3);
    for (let y = 1; y <= h; y++) {
      if ((x + y) % 9 === 0) continue;
      put(x, y, D - 1, x === 0 || x === W - 1 ? COBBLESTONE : PLANKS);
    }
  }
  // Left wall (x=0)
  for (let z = 1; z < D - 1; z++) {
    const h = 1 + ((z * 7) % 3);
    for (let y = 1; y <= h; y++) {
      put(0, y, z, COBBLESTONE);
    }
  }
  // Right wall (x=W-1) — mostly collapsed
  for (let z = 1; z < D - 1; z++) {
    const h = (z * 3) % 2; // 0 or 1 — mostly missing
    for (let y = 1; y <= h; y++) {
      put(W - 1, y, z, COBBLESTONE);
    }
  }

  // Interior rubble
  for (const [rx, rz] of [
    [2, 2],
    [4, 3],
    [1, 4],
    [5, 2],
  ] as const) {
    put(rx, 1, rz, COBBLESTONE);
  }
  // A broken plank shard lying at entry
  put(2, 1, 1, PLANKS);

  return { dims: [W, 4, D], blocks };
}

// ---------------------------------------------------------------------------
// 5. deadTree — bare wood trunk with branch stubs
// ---------------------------------------------------------------------------
export function deadTree(): Prefab {
  const { put, blocks } = builder();

  // Main trunk (3x3 footprint centre at x=2,z=2, 6 tall)
  const TRUNK_H = 6;
  for (let y = 0; y < TRUNK_H; y++) put(2, y, 2, WOOD);

  // Branch stubs (no leaves) — deterministic positions
  // y=3: branch right (+x)
  put(3, 3, 2, WOOD);
  put(4, 4, 2, WOOD);
  // y=4: branch left (-x)
  put(1, 4, 2, WOOD);
  put(0, 5, 2, WOOD);
  // y=4: branch forward (+z)
  put(2, 4, 3, WOOD);
  put(2, 5, 4, WOOD);
  // y=5: branch back (-z)
  put(2, 5, 1, WOOD);

  return { dims: [5, 7, 5], blocks };
}

// ---------------------------------------------------------------------------
// 6. campShrine — wayside shrine: cobble base, wood posts, lantern, fence detail
// ---------------------------------------------------------------------------
export function campShrine(): Prefab {
  const { put, blocks } = builder();

  // Stone base platform (3x3)
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 0, z, COBBLESTONE);

  // Raised altar block at centre
  put(1, 1, 1, COBBLESTONE);

  // Two wood posts flanking the altar
  put(0, 1, 1, WOOD);
  put(2, 1, 1, WOOD);
  put(0, 2, 1, WOOD);
  put(2, 2, 1, WOOD);

  // Lantern suspended between the posts (hangs at top of posts)
  put(1, 3, 1, LANTERN);

  // Crossbeam connecting the two posts
  put(0, 3, 1, WOOD);
  put(2, 3, 1, WOOD);

  // Oak fence decorations at the front of the base
  put(0, 1, 0, OAK_FENCE);
  put(2, 1, 0, OAK_FENCE);

  return { dims: [3, 4, 3], blocks };
}

// ---------------------------------------------------------------------------
// 7. brokenBridge — ruined stone bridge: piers + partial deck with gaps
// ---------------------------------------------------------------------------
export function brokenBridge(): Prefab {
  const L = 11; // length along x
  const { put, blocks } = builder();

  // Two stone piers at each end (z=0..2, heights 0..3)
  for (let y = 0; y <= 3; y++) {
    // left pier (x=0)
    put(0, y, 0, COBBLESTONE);
    put(0, y, 1, COBBLESTONE);
    put(0, y, 2, COBBLESTONE);
    // right pier (x=L-1)
    put(L - 1, y, 0, COBBLESTONE);
    put(L - 1, y, 1, COBBLESTONE);
    put(L - 1, y, 2, COBBLESTONE);
  }

  // Mid support pier (partial, x=5)
  for (let y = 0; y <= 2; y++) {
    put(5, y, 0, COBBLESTONE);
    put(5, y, 2, COBBLESTONE);
  }

  // Deck at y=4 — 3 wide (z=0..2), with gaps for "broken" feel
  for (let x = 0; x < L; x++) {
    // deterministic gap pattern: skip some deck blocks
    const gap = (x * 7 + 3) % 5 === 0 && x > 0 && x < L - 1;
    if (gap) continue;
    for (let z = 0; z < 3; z++) {
      // skip one z lane occasionally for further damage
      const sideGap = z === 1 && (x * 3) % 7 === 0 && x > 2 && x < L - 2;
      if (!sideGap) put(x, 4, z, COBBLESTONE);
    }
  }

  // Cobble wall railings on remaining deck sections (ragged, only where deck exists)
  for (let x = 1; x < L - 1; x++) {
    const hasRailing = (x * 5 + 1) % 4 !== 0;
    if (hasRailing) {
      put(x, 5, 0, COBBLE_WALL);
      put(x, 5, 2, COBBLE_WALL);
    }
  }

  return { dims: [L, 6, 3], blocks };
}

// ---------------------------------------------------------------------------
// 8. statue — crude humanoid guardian on a pedestal, 8 tall
// ---------------------------------------------------------------------------
export function statue(): Prefab {
  const { put, blocks } = builder();

  // Pedestal (3x3, y=0..1)
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 0, z, STONE);
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 1, z, STONE);

  // Legs — two columns side by side (x=0..1, z=1, y=2..3)
  put(0, 2, 1, COBBLESTONE);
  put(1, 2, 1, COBBLESTONE);
  put(0, 3, 1, COBBLESTONE);
  put(1, 3, 1, COBBLESTONE);

  // Torso — 2x2 body (x=0..1, z=0..2 centre, y=4..5)
  for (let y = 4; y <= 5; y++) {
    put(0, y, 0, COBBLESTONE);
    put(1, y, 0, COBBLESTONE);
    put(0, y, 1, COBBLESTONE);
    put(1, y, 1, COBBLESTONE);
    put(0, y, 2, COBBLESTONE);
    put(1, y, 2, COBBLESTONE);
  }

  // Arms — one block each side at shoulder height (y=5)
  put(2, 5, 1, STONE); // right arm
  // left arm would go at x=-1 which is out of bounds — skip or shift
  // Instead use a raised arm pose: arm stub at y=6 right side
  put(2, 6, 1, STONE);

  // Neck (y=6)
  put(0, 6, 1, COBBLESTONE);
  put(1, 6, 1, COBBLESTONE);

  // Head — 2x2 (y=7)
  put(0, 7, 0, STONE);
  put(1, 7, 0, STONE);
  put(0, 7, 1, STONE);
  put(1, 7, 1, STONE);
  put(0, 7, 2, STONE);
  put(1, 7, 2, STONE);

  return { dims: [3, 8, 3], blocks };
}

// ---------------------------------------------------------------------------
// 9. boulderCluster — a small huddle of rounded stone/gravel boulders
// ---------------------------------------------------------------------------
export function boulderCluster(): Prefab {
  const { put, blocks } = builder();

  // Three roughly-round boulders of varying size, each built from a stone core
  // with a gravel "scree" skirt at the base — scattered across a 7x7 footprint.
  const boulders: Array<{ cx: number; cz: number; r: number }> = [
    { cx: 2, cz: 2, r: 1 },
    { cx: 5, cz: 3, r: 2 },
    { cx: 2, cz: 5, r: 1 },
  ];

  for (const { cx, cz, r } of boulders) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x > 6 || z > 6) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist > r) continue; // rounded diamond footprint
        // height falls off toward the edge for a domed look
        const h = r - dist + 1;
        for (let y = 0; y < h; y++) put(x, y, z, STONE);
      }
    }
    // gravel scree ring around the base
    for (let dz = -r - 1; dz <= r + 1; dz++) {
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const x = cx + dx;
        const z = cz + dz;
        if (x < 0 || z < 0 || x > 6 || z > 6) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist !== r + 1) continue;
        put(x, 0, z, GRAVEL);
      }
    }
  }

  return { dims: [7, 4, 7], blocks };
}

// ---------------------------------------------------------------------------
// 10. rockOutcrop — a tall jagged granite spire, angular and asymmetric
// ---------------------------------------------------------------------------
export function rockOutcrop(): Prefab {
  const { put, blocks } = builder();

  // Wide deepslate base tapering up through a stone spire, with an overhang
  // formed by offsetting upper layers away from the trunk centreline.
  const layers: Array<{ y: number; cells: Array<[number, number]>; id: BlockId }> = [
    { y: 0, cells: [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[1,2],[2,2]], id: DEEPSLATE },
    { y: 1, cells: [[0,0],[1,0],[2,0],[1,1],[2,1],[0,2],[1,2]], id: DEEPSLATE },
    { y: 2, cells: [[1,0],[2,0],[1,1],[0,2],[1,2]], id: STONE },
    { y: 3, cells: [[2,0],[1,1],[0,2]], id: STONE },
    { y: 4, cells: [[2,0],[1,1]], id: STONE }, // overhang: shifted from trunk below
    { y: 5, cells: [[2,1]], id: STONE },
    { y: 6, cells: [[1,1]], id: STONE },
    { y: 7, cells: [[1,0]], id: STONE }, // jagged asymmetric tip
  ];
  for (const { y, cells, id } of layers) {
    for (const [x, z] of cells) put(x, y, z, id);
  }

  return { dims: [3, 8, 3], blocks };
}

// ---------------------------------------------------------------------------
// 11. stoneShelf — a tilted, layered rock ledge jutting out from the ground
// ---------------------------------------------------------------------------
export function stoneShelf(): Prefab {
  const W = 6; // along the ledge's rise
  const D = 5; // width of the shelf
  const { put, blocks } = builder();

  // Anchored bedrock block at the back (x=0), stepping down in height toward
  // the front (x=W-1) so the shelf reads as tilted/jutting rather than flat.
  for (let x = 0; x < W; x++) {
    const h = Math.max(1, 3 - Math.floor(x / 2)); // 3,3,2,2,1,1
    for (let z = 0; z < D; z++) {
      for (let y = 0; y < h; y++) {
        put(x, y, z, y === h - 1 ? STONE : DEEPSLATE);
      }
    }
  }
  // A thin overhanging cap layer on the front lip for a jutting-ledge look
  put(W - 1, 1, 1, STONE);
  put(W - 1, 1, 2, STONE);
  put(W - 1, 1, 3, STONE);

  return { dims: [W, 4, D], blocks };
}

// ---------------------------------------------------------------------------
// 12. pondSmall — modest round pool recessed into the ground, grass fringe
// ---------------------------------------------------------------------------
export function pondSmall(): Prefab {
  const SIZE = 7;
  const { put, blocks } = builder();
  const center = 3;
  const radius = 2;

  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      const dist = Math.max(Math.abs(x - center), Math.abs(z - center)); // oval-ish via chebyshev
      if (dist <= radius - 1) {
        put(x, 0, z, WATER); // recessed pool basin
        put(x, 1, z, AIR); // clear whatever ground sat above so the water is visible
      } else if (dist === radius) {
        put(x, 0, z, GRASS); // fringe ring
        if ((x + z) % 3 === 0) put(x, 1, z, TALL_GRASS); // reed-like accents
      }
    }
  }

  return { dims: [SIZE, 2, SIZE], blocks };
}

// ---------------------------------------------------------------------------
// 13. pondLarge — bigger irregular pool with a rockier shoreline
// ---------------------------------------------------------------------------
export function pondLarge(): Prefab {
  const SIZE = 11;
  const { put, blocks } = builder();
  const cx = 5;
  const cz = 5;

  for (let z = 0; z < SIZE; z++) {
    for (let x = 0; x < SIZE; x++) {
      // irregular shoreline: elliptical distance perturbed by a deterministic wobble
      const dx = x - cx;
      const dz = z - cz;
      const wobble = ((x * 3 + z * 5) % 3) - 1; // -1..1
      const dist = Math.sqrt(dx * dx * 0.7 + dz * dz) + wobble * 0.5;
      if (dist <= 3.5) {
        put(x, 0, z, WATER);
        put(x, 1, z, AIR); // clear whatever ground sat above so the water is visible
      } else if (dist <= 4.3) {
        // rocky shoreline: mix of gravel/stone rather than plain grass
        const rocky = (x + z * 2) % 2 === 0;
        put(x, 0, z, rocky ? GRAVEL : STONE);
        if (!rocky && (x * 7 + z) % 5 === 0) put(x, 1, z, TALL_GRASS);
      }
    }
  }

  return { dims: [SIZE, 2, SIZE], blocks };
}
