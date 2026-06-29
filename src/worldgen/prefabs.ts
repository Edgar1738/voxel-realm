import { PLANKS, COBBLESTONE, GLASS, WOOD, WATER, LANTERN, DIRT, LEAVES } from '../blocks/blocks';
import type { Prefab, PrefabVoxel } from '../core/Prefab';
import type { BlockId } from '../core/types';

/** A 5x5 plank cottage with corner logs, a door, side windows, and a pitched roof. */
export function cottage(): Prefab {
  const W = 5;
  const D = 5;
  const blocks: Array<[number, number, number, BlockId]> = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  const corner = (x: number, z: number): boolean =>
    (x === 0 || x === W - 1) && (z === 0 || z === D - 1);

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 0, z, COBBLESTONE); // floor

  for (let y = 1; y <= 3; y++) {
    for (let z = 0; z < D; z++) {
      for (let x = 0; x < W; x++) {
        if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue; // walls only
        if (z === 0 && x === 2 && y <= 2) continue; // front doorway
        if (corner(x, z)) {
          put(x, y, z, WOOD);
        } else if (y === 2 && (x === 0 || x === W - 1) && z === 2) {
          put(x, y, z, GLASS); // side windows
        } else if (y === 2 && z === D - 1 && x === 2) {
          put(x, y, z, GLASS); // back window
        } else {
          put(x, y, z, PLANKS);
        }
      }
    }
  }

  // pitched roof: ridge along z at x=2 (heights 4..6), with closed gable ends
  for (let x = 0; x < W; x++) {
    const ry = 4 + (2 - Math.abs(x - 2));
    for (let z = 0; z < D; z++) put(x, ry, z, PLANKS);
    for (let y = 4; y < ry; y++) {
      put(x, y, 0, PLANKS);
      put(x, y, D - 1, PLANKS);
    }
  }

  return { dims: [W, 7, D], blocks };
}

/** A 3x3 cobblestone well with a water basin and a small plank canopy. */
export function well(): Prefab {
  const blocks: Array<[number, number, number, BlockId]> = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };

  for (let z = 0; z < 3; z++)
    for (let x = 0; x < 3; x++) put(x, 0, z, x === 1 && z === 1 ? WATER : COBBLESTONE);
  for (let z = 0; z < 3; z++)
    for (let x = 0; x < 3; x++)
      if (x === 0 || x === 2 || z === 0 || z === 2) put(x, 1, z, COBBLESTONE);
  for (const [cx, cz] of [
    [0, 0],
    [2, 0],
    [0, 2],
    [2, 2],
  ]) {
    put(cx, 2, cz, WOOD);
    put(cx, 3, cz, WOOD);
  }
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, 4, z, PLANKS);
  put(1, 3, 1, LANTERN); // lantern hanging under the canopy

  return { dims: [3, 5, 3], blocks };
}

/** A wood post topped with a lantern — lights village streets at night. */
export function lampPost(): Prefab {
  return {
    dims: [1, 4, 1],
    blocks: [
      [0, 0, 0, WOOD],
      [0, 1, 0, WOOD],
      [0, 2, 0, WOOD],
      [0, 3, 0, LANTERN],
    ],
  };
}

/** A crumbled 5x5 cobblestone tower — ragged wall heights with breaches and a little rubble. */
export function ruinedTower(): Prefab {
  const W = 5;
  const D = 5;
  const blocks: Array<[number, number, number, BlockId]> = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  for (let z = 0; z < D; z++) {
    for (let x = 0; x < W; x++) {
      if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue; // hollow walls
      const h = 3 + ((x * 3 + z * 5) % 5); // ragged crown, 3..7
      for (let y = 0; y <= h; y++) {
        if ((x + z + y) % 7 === 0 && y > 0 && y < h) continue; // breaches/windows
        put(x, y, z, COBBLESTONE);
      }
    }
  }
  for (const [rx, rz] of [
    [1, 1],
    [2, 2],
    [3, 1],
  ])
    put(rx, 0, rz, COBBLESTONE); // fallen rubble inside
  return { dims: [W, 8, D], blocks };
}

/** A 7x9 plank barn with corner logs, a wide front doorway, and a pitched roof. */
export function barn(): Prefab {
  const W = 7,
    D = 9;
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  const corner = (x: number, z: number): boolean =>
    (x === 0 || x === W - 1) && (z === 0 || z === D - 1);
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) put(x, 0, z, COBBLESTONE); // floor
  for (let y = 1; y <= 3; y++)
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        if (!(x === 0 || x === W - 1 || z === 0 || z === D - 1)) continue;
        if (z === 0 && x >= 2 && x <= 4 && y <= 2) continue; // wide front doorway
        put(x, y, z, corner(x, z) ? WOOD : PLANKS);
      }
  for (let x = 0; x < W; x++) {
    // pitched roof: ridge at x=3 peaks at y=5, slopes down toward edges
    const ry = Math.min(5, 4 + (3 - Math.abs(x - 3)));
    for (let z = 0; z < D; z++) put(x, ry, z, PLANKS);
    for (let y = 4; y < ry; y++) {
      put(x, y, 0, PLANKS);
      put(x, y, D - 1, PLANKS);
    }
  }
  return { dims: [W, 6, D], blocks };
}

/** A slender cobblestone watchtower with a railed top and a lantern. */
export function watchtower(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  const H = 9;
  for (let y = 0; y < H; y++)
    for (let z = 0; z < 3; z++)
      for (let x = 0; x < 3; x++)
        if (x === 0 || x === 2 || z === 0 || z === 2) put(x, y, z, COBBLESTONE); // hollow shaft
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) put(x, H, z, PLANKS); // platform floor
  for (let z = 0; z < 3; z++)
    // crenellated rail
    for (let x = 0; x < 3; x++)
      if ((x === 0 || x === 2 || z === 0 || z === 2) && (x + z) % 2 === 0)
        put(x, H + 1, z, COBBLESTONE);
  put(1, H + 1, 1, LANTERN);
  return { dims: [3, H + 2, 3], blocks };
}

/** A small wood-frame market stall with a plank canopy. */
export function marketStall(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  for (const [cx, cz] of [
    [0, 0],
    [4, 0],
    [0, 4],
    [4, 4],
  ] as const)
    for (let y = 0; y <= 2; y++) put(cx, y, cz, WOOD); // four posts
  for (let z = 0; z < 5; z++) for (let x = 0; x < 5; x++) put(x, 3, z, PLANKS); // canopy
  for (let x = 1; x < 4; x++) put(x, 1, 0, PLANKS); // front counter
  return { dims: [5, 4, 5], blocks };
}

/** A toppled cobblestone wall segment with ragged height and a few fallen blocks. */
export function brokenWall(): Prefab {
  const L = 6;
  const blocks: Array<[number, number, number, BlockId]> = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  for (let x = 0; x < L; x++) {
    const h = 1 + ((x * 7) % 4); // ragged 1..4
    for (let y = 0; y <= h; y++) if ((x + y) % 5 !== 0) put(x, y, 0, COBBLESTONE);
  }
  put(2, 0, 1, COBBLESTONE);
  put(4, 0, 1, COBBLESTONE); // toppled blocks
  return { dims: [L, 5, 2], blocks };
}

/** A 9-long plank footbridge with support posts at the ends. */
export function bridge(): Prefab {
  const L = 9;
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  for (let x = 0; x < L; x++) {
    put(x, 1, 0, PLANKS);
    put(x, 1, 1, PLANKS);
  } // 2-wide deck
  for (let x = 0; x < L; x += 4) {
    put(x, 0, 0, WOOD);
    put(x, 0, 1, WOOD);
  } // posts
  for (let x = 0; x < L; x++) {
    put(x, 2, 0, WOOD);
    put(x, 2, 1, WOOD);
  } // low railings
  return { dims: [L, 3, 2], blocks };
}

/** A 5x5 tilled dirt plot bordered by wood, with a few crop markers. */
export function farmPlot(): Prefab {
  const blocks: PrefabVoxel[] = [];
  const put = (x: number, y: number, z: number, id: BlockId): void => {
    blocks.push([x, y, z, id]);
  };
  for (let z = 0; z < 5; z++)
    for (let x = 0; x < 5; x++) {
      const border = x === 0 || x === 4 || z === 0 || z === 4;
      put(x, 0, z, border ? WOOD : DIRT);
    }
  for (let z = 1; z < 4; z++)
    for (let x = 1; x < 4; x++) if ((x + z) % 2 === 0) put(x, 1, z, LEAVES); // crop rows
  return { dims: [5, 2, 5], blocks };
}
