import { describe, it, expect, beforeEach } from 'vitest';
import { CreativeInventory, CREATIVE_BLOCKS } from '../src/app/CreativeInventory';
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
} from '../src/blocks/blocks';

describe('CreativeInventory', () => {
  let inv: CreativeInventory;

  beforeEach(() => {
    inv = new CreativeInventory();
  });

  // 1. Default state
  describe('default construction', () => {
    it('hotbar equals CREATIVE_BLOCKS.slice(0, 9)', () => {
      expect(inv.hotbar).toEqual(CREATIVE_BLOCKS.slice(0, 9));
    });

    it('selectedSlot is 0', () => {
      expect(inv.selectedSlot).toBe(0);
    });

    it('selectedBlock is the first block (GRASS)', () => {
      expect(inv.selectedBlock).toBe(GRASS);
    });

    it('CREATIVE_BLOCKS contains the expected solids in order', () => {
      expect(CREATIVE_BLOCKS).toEqual([
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
      ]);
    });
  });

  // 2. selectSlot
  describe('selectSlot', () => {
    it('selectSlot(2) sets selectedSlot to 2 and selectedBlock to 3rd slot', () => {
      inv.selectSlot(2);
      expect(inv.selectedSlot).toBe(2);
      expect(inv.selectedBlock).toBe(inv.hotbar[2]);
    });

    it('selectSlot(2) then selectedBlock is STONE', () => {
      inv.selectSlot(2);
      expect(inv.selectedBlock).toBe(STONE);
    });

    it('selectSlot(-1) is ignored (selectedSlot stays 0)', () => {
      inv.selectSlot(-1);
      expect(inv.selectedSlot).toBe(0);
    });

    it('selectSlot(999) is ignored (selectedSlot stays 0)', () => {
      inv.selectSlot(999);
      expect(inv.selectedSlot).toBe(0);
    });

    it('selectSlot with out-of-range does not change selectedBlock', () => {
      const before = inv.selectedBlock;
      inv.selectSlot(-1);
      inv.selectSlot(999);
      expect(inv.selectedBlock).toBe(before);
    });
  });

  // 3. pickBlock
  describe('pickBlock', () => {
    it('replaces only the selected slot, others unchanged', () => {
      inv.selectSlot(1);
      const hotbarBefore = inv.hotbar;
      inv.pickBlock(CACTUS);
      const hotbarAfter = inv.hotbar;

      // slot 1 changed to CACTUS
      expect(hotbarAfter[1]).toBe(CACTUS);

      // all other slots unchanged
      for (let i = 0; i < hotbarBefore.length; i++) {
        if (i !== 1) {
          expect(hotbarAfter[i]).toBe(hotbarBefore[i]);
        }
      }
    });

    it('selectedBlock becomes the picked block id', () => {
      inv.selectSlot(3);
      inv.pickBlock(WOOD);
      expect(inv.selectedBlock).toBe(WOOD);
    });

    it('pickBlock on slot 0 only changes slot 0', () => {
      // selectedSlot starts at 0
      const originalSlot1 = inv.hotbar[1];
      inv.pickBlock(SNOW);
      expect(inv.selectedBlock).toBe(SNOW);
      expect(inv.hotbar[1]).toBe(originalSlot1);
    });
  });

  // 4. hotbar returns a copy
  describe('hotbar immutability', () => {
    it('mutating the returned hotbar array does not affect inventory', () => {
      const h = inv.hotbar;
      h[0] = 9999;
      expect(inv.hotbar[0]).toBe(GRASS);
    });

    it('each call to hotbar returns a fresh copy', () => {
      const h1 = inv.hotbar;
      const h2 = inv.hotbar;
      expect(h1).not.toBe(h2);
      expect(h1).toEqual(h2);
    });
  });
});
