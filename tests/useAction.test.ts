import { describe, it, expect } from 'vitest';
import { gateToggleEdit } from '../src/app/useAction';
import { packState, FACING, isOpen, setOpen } from '../src/world/VoxelState';

describe('gateToggleEdit', () => {
  it('returns a SetVoxel flipping the open bit, same id, at the target', () => {
    const closed = packState(FACING.N, 0);
    const edit = gateToggleEdit({ x: 3, y: 4, z: 5 }, 7, closed);
    expect(edit).toEqual({ x: 3, y: 4, z: 5, id: 7, state: setOpen(closed, true) });
    expect(isOpen(edit.state!)).toBe(true);
  });
});
