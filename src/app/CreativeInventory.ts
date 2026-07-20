import { BLOCK_DEFS } from '../blocks/blocks';
import type { BlockId } from '../core/types';

/** The blocks offered in the creative picker — derived from the `creative` flag in BLOCK_DEFS. */
export const CREATIVE_BLOCKS: BlockId[] = BLOCK_DEFS.filter((d) => d.creative).map((d) => d.id);

export type CreativeGroup = 'Terrain' | 'Masonry' | 'Architecture' | 'Nature' | 'Utility';

/** Semantic inventory groups keep the expanded palette browsable without changing hotbar saves. */
export function creativeGroupFor(id: BlockId): CreativeGroup {
  const def = BLOCK_DEFS.find((d) => d.id === id);
  const name = def?.name ?? '';
  if (/masonry|brick|cobble|wall/.test(name)) return 'Masonry';
  if (/stone|granite|basalt|sand|dirt|loam|earth|scree|snow|ice|gravel|mud|terracotta/.test(name)) {
    return 'Terrain';
  }
  if (/slab|stairs|roof|plank|fence|door|ladder|glass|limestone/.test(name)) return 'Architecture';
  if (/grass|leaves|wood|cactus|flower/.test(name)) return 'Nature';
  return 'Utility';
}

/** A creative hotbar: a fixed list of slots, one selected, each holding a block id. */
export class CreativeInventory {
  private readonly slots: BlockId[];
  selectedSlot = 0;
  /**
   * Fired after any successful slot selection or block assignment. Set by Game to persist the
   * hotbar; kept here so every mutation path (number keys, wheel, picker, middle-click pick) goes
   * through one place and persistence can't drift.
   */
  onChange?: () => void;

  constructor(blocks: BlockId[] = CREATIVE_BLOCKS.slice(0, 9), selectedSlot = 0) {
    this.slots = [...blocks];
    if (selectedSlot >= 0 && selectedSlot < this.slots.length) this.selectedSlot = selectedSlot;
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
    this.onChange?.();
  }

  /** Moves the selection by `delta` slots, wrapping around both ends. */
  cycleSlot(delta: number): void {
    const n = this.slots.length;
    if (n === 0) return;
    this.selectedSlot = (((this.selectedSlot + delta) % n) + n) % n;
    this.onChange?.();
  }

  /** Puts a block id into the currently selected slot. */
  pickBlock(id: BlockId): void {
    this.slots[this.selectedSlot] = id;
    this.onChange?.();
  }
}
