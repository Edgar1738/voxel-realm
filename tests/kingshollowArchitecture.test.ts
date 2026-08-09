import { describe, expect, it } from 'vitest';
import {
  AIR,
  CLAY_ROOF_SLAB,
  LEAVES,
  MOSSY_COBBLE,
  OAK_DOOR,
  STAIRS_CLAY_ROOF,
  STAIRS_PLANK,
} from '../src/blocks/blocks';
import { ChunkData } from '../src/world/ChunkData';
import { FACING } from '../src/world/VoxelState';
import { CitadelStamp } from '../src/worldgen/CitadelStamp';
import {
  buildTimberHouse,
  KINGSHOLLOW_HOUSE_PALETTES,
} from '../src/worldgen/kingshollowArchitecture';

function cottage(): ChunkData {
  const chunk = new ChunkData(0, 0);
  chunk.set(1, 70, 1, LEAVES); // tree intruding into the padded lot
  buildTimberHouse(new CitadelStamp(chunk, 0, 0), {
    x: 2,
    z: 2,
    width: 10,
    depth: 8,
    floorY: 66,
    facing: 's',
    palette: KINGSHOLLOW_HOUSE_PALETTES.clay,
    porch: true,
  });
  return chunk;
}

describe('Kingshollow architecture kit', () => {
  it('clears a padded lot and carries the foundation below grade', () => {
    const c = cottage();
    expect(c.get(1, 70, 1)).toBe(AIR);
    expect(c.get(2, 62, 2)).toBe(MOSSY_COBBLE);
  });

  it('builds oriented stair eaves and closes the ridge with slabs', () => {
    const c = cottage();
    expect(c.get(6, 72, 1)).toBe(STAIRS_CLAY_ROOF);
    expect(c.getState(6, 72, 1) & 0b11).toBe(FACING.N);
    expect(c.get(6, 77, 5)).toBe(CLAY_ROOF_SLAB);
  });

  it('orients the door and porch stair toward the entrance', () => {
    const c = cottage();
    expect(c.get(6, 67, 9)).toBe(OAK_DOOR);
    expect(c.getState(6, 67, 9) & 0b11).toBe(FACING.S);
    expect(c.get(6, 66, 11)).toBe(STAIRS_PLANK);
    expect(c.getState(6, 66, 11) & 0b11).toBe(FACING.S);
  });
});
