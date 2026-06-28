import {
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  LEAVES,
  SNOW,
  CACTUS,
  GLASS,
  PLANKS,
  COBBLESTONE,
  BRICK,
  LANTERN,
} from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** The blocks offered in the creative picker. (Extended as more blocks are added.) */
export const CREATIVE_BLOCKS: BlockId[] = [
  GRASS,
  DIRT,
  STONE,
  SAND,
  WOOD,
  LEAVES,
  SNOW,
  CACTUS,
  GLASS,
  PLANKS,
  COBBLESTONE,
  BRICK,
  LANTERN,
];

/** A creative hotbar: a fixed list of slots, one selected, each holding a block id. */
export class CreativeInventory {
  private readonly slots: BlockId[];
  selectedSlot = 0;

  constructor(blocks: BlockId[] = CREATIVE_BLOCKS.slice(0, 9)) {
    this.slots = [...blocks];
  }

  /** A copy of the current hotbar slots. */
  get hotbar(): BlockId[] {
    return [...this.slots];
  }

  /** The block id in the selected slot. */
  get selectedBlock(): BlockId {
    return this.slots[this.selectedSlot];
  }

  /** Selects a slot by index; ignores out-of-range indices. */
  selectSlot(index: number): void {
    if (index < 0 || index >= this.slots.length) return;
    this.selectedSlot = index;
  }

  /** Puts a block id into the currently selected slot. */
  pickBlock(id: BlockId): void {
    this.slots[this.selectedSlot] = id;
  }
}
