import { describe, it, expect } from 'vitest';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';

const stoneFaces = {
  pattern: 'stone' as const,
  colors: [[128, 128, 132] as [number, number, number]],
};
const planks = { pattern: 'planks' as const, colors: [[165, 130, 80] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'stone', opaque: true, transparent: false, faces: stoneFaces }, // full cube
  { id: 2, name: 'fence', opaque: true, transparent: false, shape: 'fence', faces: planks },
  { id: 3, name: 'fence2', opaque: true, transparent: false, shape: 'fence', faces: planks },
  { id: 4, name: 'wall', opaque: true, transparent: false, shape: 'wall', faces: stoneFaces },
  { id: 5, name: 'slab', opaque: true, transparent: false, shape: 'slab', faces: stoneFaces },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));

describe('fence/wall registry', () => {
  it('collide as full and do not occlude', () => {
    expect(reg.collisionBox(2)).toBe('full');
    expect(reg.collisionBox(4)).toBe('full');
    expect(reg.occludes(2)).toBe(false);
    expect(reg.occludes(4)).toBe(false);
  });
  it('connectsTo: same-shape and full cubes connect; fence/wall and air/slab do not', () => {
    expect(reg.connectsTo(2, 3)).toBe(true); // fence ↔ fence
    expect(reg.connectsTo(2, 1)).toBe(true); // fence ↔ full cube
    expect(reg.connectsTo(4, 4)).toBe(true); // wall ↔ wall
    expect(reg.connectsTo(2, 4)).toBe(false); // fence ↔ wall (different shape)
    expect(reg.connectsTo(2, 0)).toBe(false); // fence ↔ air
    expect(reg.connectsTo(2, 5)).toBe(false); // fence ↔ slab
  });
});
