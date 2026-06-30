import { describe, it, expect } from 'vitest';
import { ChunkData } from '../src/world/ChunkData';
import { VoxelView } from '../src/world/VoxelView';
import { BlockRegistry } from '../src/blocks/BlockRegistry';
import { buildBlockTextures, type BlockDef } from '../src/blocks/blocks';
import { emitShaped } from '../src/mesh/emitShaped';

const planks = { pattern: 'planks' as const, colors: [[165, 130, 80] as [number, number, number]] };
const stone = { pattern: 'stone' as const, colors: [[120, 120, 120] as [number, number, number]] };
const DEFS: BlockDef[] = [
  { id: 0, name: 'air', opaque: false, transparent: true },
  { id: 1, name: 'fence', opaque: true, transparent: false, shape: 'fence', faces: planks },
  { id: 2, name: 'wall', opaque: true, transparent: false, shape: 'wall', faces: stone },
];
const reg = new BlockRegistry(DEFS, buildBlockTextures(DEFS));
const view = (d: ChunkData) => new VoxelView(d, () => undefined);

describe('emitConnected (fence)', () => {
  it('a lone fence emits only the post (one box = 24 verts in open air)', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    const { slabs } = emitShaped(view(d), reg);
    expect(slabs.positions.length / 3).toBe(24); // post box, 6 faces × 4
  });

  it('a fence with one fence neighbour adds 2 rails toward that side only', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    d.set(5, 10, 4, 1); // fence to +X
    const { slabs } = emitShaped(view(d), reg);
    // the (4,10,4) fence: post(24) + 2 rails toward +X(48) ; the (5,10,4) fence: post(24) + 2 rails toward -X(48)
    expect(slabs.positions.length / 3).toBe(24 + 48 + 24 + 48);
  });

  // M2: pin arm coordinates, not just the count
  it('fence arm toward +X reaches exactly x+1 and stays within voxel bounds', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1);
    d.set(5, 10, 4, 1); // fence neighbour at +X only
    const { slabs } = emitShaped(view(d), reg);
    const pos = slabs.positions;

    // Isolate vertices belonging to (4,10,4): the first fence post+arm (post=24, arm×2=48 → 72 verts = 216 floats)
    const fence1Count = 24 + 48; // post + 2 rails toward +X
    const fence1Pos = Array.from(pos.subarray(0, fence1Count * 3));
    const xs = fence1Pos.filter((_, i) => i % 3 === 0);

    // FENCE_PROFILE: armBoxes for dx=1 spans [x + postHi .. x+1] = [4.625 .. 5.0]
    // So the maximum x across all vertices of (4,10,4) must be exactly x+1 = 5
    const maxX = Math.max(...xs);
    expect(maxX).toBe(5); // +X arm tip reaches voxel boundary (4+1)

    // No vertex of (4,10,4) should exceed x+1=5 in the +X direction
    expect(xs.every((x) => x <= 5)).toBe(true);

    // No vertex should exceed z+1=5 or go below z=4 (unconnected z direction)
    const zs = fence1Pos.filter((_, i) => i % 3 === 2);
    // FENCE_PROFILE armHalf=0.1, centre=0.5 → z range [4+0.4 .. 4+0.6] for the arm
    // post z range [4+0.375 .. 4+0.625]; overall max z <= 4+0.625 < 5
    expect(zs.every((z) => z >= 4 && z <= 5)).toBe(true);
  });
});

// M1: WALL_PROFILE path (WALL_PROFILE.rails has 1 entry, vs FENCE_PROFILE's 2)
describe('emitConnected (wall)', () => {
  it('a lone wall emits only its post (one box = 24 verts in open air)', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 2);
    const { slabs } = emitShaped(view(d), reg);
    // WALL_PROFILE post is a wider box but still 1 box → 6 faces × 4 = 24 verts
    expect(slabs.positions.length / 3).toBe(24);
  });

  it('two adjacent walls each emit post + 1 bar toward the other', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 2);
    d.set(5, 10, 4, 2); // wall to +X
    const { slabs } = emitShaped(view(d), reg);
    // WALL_PROFILE.rails has exactly 1 entry → 1 arm = 1 box = 24 verts per direction
    // (4,10,4): post(24) + 1 bar toward +X(24) = 48
    // (5,10,4): post(24) + 1 bar toward -X(24) = 48
    // total = 96
    expect(slabs.positions.length / 3).toBe(96);
  });
});

// M3: fence and wall do NOT cross-connect (different shapes)
describe('emitConnected cross-shape isolation', () => {
  it('a fence with a wall neighbour emits NO arm (only post = 24 verts)', () => {
    const d = new ChunkData(0, 0);
    d.set(4, 10, 4, 1); // fence
    d.set(5, 10, 4, 2); // wall at +X — different shape
    const { slabs } = emitShaped(view(d), reg);
    // connectsTo(fence, wall): occludes(wall)=false (wall is opaque but shape='wall'≠'cube')
    // shape(wall)='wall' ≠ shape(fence)='fence' → connectsTo returns false
    // So (4,10,4) fence emits post only; (5,10,4) wall emits its post only; 24+24=48 total
    // The fence vertex count alone cannot be isolated here without separate chunks,
    // but the total equals two lone posts → 48, confirming no arm was emitted in either direction.
    expect(slabs.positions.length / 3).toBe(48);
  });
});

describe('emitConnected cross-chunk', () => {
  it('connects to a fence in the neighbour chunk at the border', () => {
    const center = new ChunkData(0, 0);
    center.set(15, 10, 4, 1); // fence at the +X edge of chunk (0,0)
    const east = new ChunkData(1, 0);
    east.set(0, 10, 4, 1); // fence at local x=0 of chunk (1,0) == world x=16, the +X neighbour
    const v = new VoxelView(center, (dcx, dcz) => (dcx === 1 && dcz === 0 ? east : undefined));
    const { slabs } = emitShaped(v, reg);
    // center fence: post(24) + 2 rails toward +X(48) = 72 (no other neighbours)
    expect(slabs.positions.length / 3).toBe(72);
  });
});
