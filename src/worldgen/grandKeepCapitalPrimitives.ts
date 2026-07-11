import {
  BRICK,
  COBBLESTONE,
  FLOWER,
  GLASS,
  LANTERN,
  LEAVES,
  OAK_FENCE,
  PLANKS,
  STONE,
  WOOD,
} from '../blocks/blocks';
import type { BlockId } from '../core/types';
import { CitadelStamp } from './CitadelStamp';

export type RidgeAxis = 'x' | 'z';
export type FacadeFace = 'north' | 'south' | 'east' | 'west';

export function pavedRoad(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
): void {
  s.slab(x0, z0, x1, z1, y, COBBLESTONE);
  if (x1 - x0 >= z1 - z0)
    s.fill(x0, y, Math.floor((z0 + z1) / 2), x1, y, Math.floor((z0 + z1) / 2), STONE);
  else s.fill(Math.floor((x0 + x1) / 2), y, z0, Math.floor((x0 + x1) / 2), y, z1, STONE);
}

export function pavedPlaza(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
): void {
  s.slab(x0, z0, x1, z1, y, STONE);
  s.outline(x0, z0, x1, z1, y, COBBLESTONE);
}

export function lampPost(s: CitadelStamp, x: number, y: number, z: number): void {
  s.fill(x, y, z, x, y + 2, z, OAK_FENCE);
  s.set(x, y + 3, z, LANTERN);
}

export function garden(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number,
): void {
  s.outline(x0, z0, x1, z1, y + 1, OAK_FENCE);
  for (let x = x0 + 2; x < x1; x += 3) {
    for (let z = z0 + 2; z < z1; z += 3) s.set(x, y + 1, z, FLOWER);
  }
  const cx = Math.floor((x0 + x1) / 2);
  const cz = Math.floor((z0 + z1) / 2);
  s.fill(cx, y + 1, cz, cx, y + 3, cz, WOOD);
  s.fill(cx - 2, y + 3, cz - 2, cx + 2, y + 5, cz + 2, LEAVES);
}

/** Stepped gable roof with one-block eaves; safe to call for every intersecting chunk. */
export function pitchedRoof(
  s: CitadelStamp,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  eaveY: number,
  ridgeAxis: RidgeAxis,
  block: BlockId = BRICK,
): void {
  const span = ridgeAxis === 'x' ? z1 - z0 : x1 - x0;
  const rise = Math.floor(span / 2);
  for (let level = 0; level <= rise; level++) {
    if (ridgeAxis === 'x')
      s.slab(x0 - 1, z0 - 1 + level, x1 + 1, z1 + 1 - level, eaveY + level, block);
    else s.slab(x0 - 1 + level, z0 - 1, x1 + 1 - level, z1 + 1, eaveY + level, block);
  }
}

/** Adds exposed oak framing, infill and a regular glazed-window rhythm to one wall. */
export function timberFacade(
  s: CitadelStamp,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  face: FacadeFace,
): void {
  const alongX = face === 'north' || face === 'south';
  const length = Math.max(1, x1 - x0);
  for (let a = 0; a <= length; a++) {
    const x = alongX ? x0 + a : x0;
    const z = alongX ? z0 : z0 + a;
    s.fill(x, y0, z, x, y1, z, a % 4 === 0 ? WOOD : PLANKS);
  }
  for (let y = y0; y <= y1; y += 3) {
    if (alongX) s.fill(x0, y, z0, x1, y, z0, WOOD);
    else s.fill(x0, y, z0, x0, y, z0 + length, WOOD);
  }
  for (let a = 2; a < length; a += 4) {
    const x = alongX ? x0 + a : x0;
    const z = alongX ? z0 : z0 + a;
    s.set(x, y0 + 2, z, GLASS);
  }
}
