/**
 * Ember Spire — hero landmark Milestone 2 pass.
 * Monumental foundation, multi-tier exterior, full vertical interior climb to summit.
 * Position fixed at ASHEN.spireIsland (approved composition).
 */
import {
  AIR,
  STONE,
  COBBLESTONE,
  DEEPSLATE,
  BRICK,
  PLANKS,
  GLASS,
  LANTERN,
  GLOWSTONE,
  CRYSTAL,
  BOOKSHELF,
  FURNACE,
  GOLD_ORE,
  EMERALD_ORE,
  STAIRS_STONE,
  STAIRS_COBBLE,
  STONEBRICK_WALL,
  COBBLE_WALL,
  OAK_FENCE,
} from '../blocks/blocks';
import { packState, FACING } from '../world/VoxelState';
import { CitadelStamp, spiralStair } from './CitadelStamp';
import { ASHEN, ashenSurfaceAt } from './EmberSpireGenerator';
import { SEA_LEVEL } from '../core/constants';
import type { WorldSeed } from '../core/types';

/**
 * Full Ember Spire rebuild: tiers, entrance hall, archive, ceremonial hall, guardian chamber,
 * upper shrine, summit platform. Walkable spiral + landings with distinct room identities.
 */
export function buildEmberSpireM2(s: CitadelStamp, seed: WorldSeed): void {
  const cx = ASHEN.spireIsland.cx;
  const cz = ASHEN.spireIsland.cz;
  const topY = ashenSurfaceAt(seed, cx, cz);
  const baseY = Math.max(topY, ASHEN.spireIsland.topY - 1);

  // ── Monumental foundation tiers ────────────────────────────────────────────
  for (let tier = 0; tier < 3; tier++) {
    const r = 14 - tier * 3;
    const y0 = baseY - 2 + tier;
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        s.fill(cx + dx, SEA_LEVEL - 6, cz + dz, cx + dx, y0, cz + dz, DEEPSLATE);
        if (dx * dx + dz * dz > (r - 2) * (r - 2)) s.set(cx + dx, y0, cz + dz, STONE);
        else s.set(cx + dx, y0, cz + dz, COBBLESTONE);
      }
    }
  }
  const floor0 = baseY + 1;

  // Clear interior volume for whole climb.
  const wallTop = floor0 + 48;
  for (let dz = -6; dz <= 6; dz++) {
    for (let dx = -6; dx <= 6; dx++) {
      if (dx * dx + dz * dz > 36) continue;
      s.fill(cx + dx, floor0, cz + dz, cx + dx, wallTop + 12, cz + dz, AIR);
    }
  }

  // ── Exterior drum tiers (not a plain rectangle) ────────────────────────────
  const tiers = [
    { r: 6, y0: floor0, y1: floor0 + 12, wall: DEEPSLATE },
    { r: 5, y0: floor0 + 12, y1: floor0 + 24, wall: DEEPSLATE },
    { r: 4, y0: floor0 + 24, y1: floor0 + 36, wall: BRICK },
    { r: 3, y0: floor0 + 36, y1: floor0 + 46, wall: DEEPSLATE },
  ];
  for (const t of tiers) {
    for (let dz = -t.r; dz <= t.r; dz++) {
      for (let dx = -t.r; dx <= t.r; dx++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > t.r * t.r || d2 < (t.r - 1) * (t.r - 1)) continue;
        s.fill(cx + dx, t.y0, cz + dz, cx + dx, t.y1, cz + dz, t.wall);
      }
    }
    // Buttress ribs on cardinals.
    for (const [dx, dz] of [
      [t.r + 1, 0],
      [-t.r - 1, 0],
      [0, t.r + 1],
      [0, -t.r - 1],
    ] as const) {
      s.fill(cx + dx, t.y0, cz + dz, cx + dx, t.y1 - 2, cz + dz, STONE);
    }
    // Ring cornice.
    for (let a = 0; a < 24; a++) {
      const ang = (a / 24) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(ang) * (t.r + 0.5));
      const pz = Math.round(cz + Math.sin(ang) * (t.r + 0.5));
      s.set(px, t.y1, pz, STONE);
    }
  }

  // Windows — narrow vertical slits on mid tiers.
  for (const y of [floor0 + 6, floor0 + 16, floor0 + 28, floor0 + 40]) {
    for (const [dx, dz] of [
      [5, 0],
      [-5, 0],
      [0, 5],
      [0, -5],
      [4, 0],
      [-4, 0],
    ] as const) {
      s.set(cx + dx, y, cz + dz, GLASS);
      s.set(cx + dx, y + 1, cz + dz, GLASS);
    }
  }

  // Exterior balconies (walkable rings at tier breaks).
  for (const by of [floor0 + 12, floor0 + 24, floor0 + 36]) {
    const br = by <= floor0 + 12 ? 7 : by <= floor0 + 24 ? 6 : 5;
    for (let a = 0; a < 28; a++) {
      const ang = (a / 28) * Math.PI * 2;
      const px = Math.round(cx + Math.cos(ang) * br);
      const pz = Math.round(cz + Math.sin(ang) * br);
      s.set(px, by, pz, STONE);
      s.set(px, by + 1, pz, STONEBRICK_WALL);
      if (a % 4 === 0) s.set(px, by + 2, pz, LANTERN);
    }
    // Door onto balcony from interior.
    s.fill(cx + 3, by + 1, cz, cx + 4, by + 3, cz, AIR);
  }

  // ── Floors + vertical journey ──────────────────────────────────────────────
  const floors = [
    { y: floor0, name: 'entrance' },
    { y: floor0 + 10, name: 'archive' },
    { y: floor0 + 20, name: 'ceremonial' },
    { y: floor0 + 30, name: 'guardian' },
    { y: floor0 + 40, name: 'shrine' },
  ];
  for (const f of floors) {
    const fr = f.y >= floor0 + 36 ? 2 : f.y >= floor0 + 24 ? 3 : 4;
    for (let dz = -fr; dz <= fr; dz++) {
      for (let dx = -fr; dx <= fr; dx++) {
        if (dx * dx + dz * dz > fr * fr) continue;
        // Stair shaft hole.
        if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
        s.set(cx + dx, f.y, cz + dz, f.name === 'ceremonial' ? BRICK : PLANKS);
      }
    }
  }

  // Spiral from entrance to shrine.
  spiralStair(s, cx, cz, floor0 + 1, floor0 + 41, STAIRS_STONE, DEEPSLATE);

  // North monumental entrance (from causeway).
  s.fill(cx - 2, floor0, cz - 8, cx + 2, floor0 + 5, cz - 5, AIR);
  s.fill(cx - 2, floor0 - 1, cz - 8, cx + 2, floor0 - 1, cz - 5, STONE);
  // Arch frame.
  s.fill(cx - 3, floor0, cz - 7, cx - 3, floor0 + 5, cz - 6, DEEPSLATE);
  s.fill(cx + 3, floor0, cz - 7, cx + 3, floor0 + 5, cz - 6, DEEPSLATE);
  s.fill(cx - 3, floor0 + 5, cz - 7, cx + 3, floor0 + 6, cz - 6, BRICK);
  s.set(cx - 3, floor0 + 7, cz - 6, GLOWSTONE);
  s.set(cx + 3, floor0 + 7, cz - 6, GLOWSTONE);
  s.set(cx, floor0 + 4, cz - 4, LANTERN);

  // ── Room dressing by level ─────────────────────────────────────────────────
  // Entrance hall: columns + glow braziers.
  for (const [dx, dz] of [
    [-3, -2],
    [3, -2],
    [-3, 2],
    [3, 2],
  ] as const) {
    s.fill(cx + dx, floor0 + 1, cz + dz, cx + dx, floor0 + 8, cz + dz, STONE);
    s.set(cx + dx, floor0 + 9, cz + dz, GLOWSTONE);
  }
  s.set(cx - 2, floor0 + 1, cz + 3, FURNACE);
  s.set(cx + 2, floor0 + 1, cz + 3, LANTERN);

  // Archive: bookshelves lining walls.
  for (let dx = -3; dx <= 3; dx++) {
    if (Math.abs(dx) <= 1) continue;
    s.set(cx + dx, floor0 + 11, cz - 3, BOOKSHELF);
    s.set(cx + dx, floor0 + 12, cz - 3, BOOKSHELF);
    s.set(cx + dx, floor0 + 11, cz + 3, BOOKSHELF);
  }
  s.set(cx + 3, floor0 + 11, cz, LANTERN);
  s.set(cx - 3, floor0 + 11, cz, CRYSTAL);

  // Ceremonial hall: open brick floor, central glow altar.
  s.set(cx, floor0 + 21, cz + 2, GLOWSTONE);
  s.set(cx, floor0 + 22, cz + 2, CRYSTAL);
  s.set(cx - 2, floor0 + 21, cz - 2, GOLD_ORE);
  s.set(cx + 2, floor0 + 21, cz - 2, EMERALD_ORE);
  for (const [dx, dz] of [
    [-2, 0],
    [2, 0],
    [0, -2],
    [0, 2],
  ] as const) {
    s.fill(cx + dx, floor0 + 21, cz + dz, cx + dx, floor0 + 26, cz + dz, DEEPSLATE);
  }

  // Guardian chamber: tighter, metal-feel fences + furnace forges.
  s.set(cx - 2, floor0 + 31, cz - 2, FURNACE);
  s.set(cx + 2, floor0 + 31, cz - 2, FURNACE);
  s.set(cx - 2, floor0 + 31, cz + 2, COBBLE_WALL);
  s.set(cx + 2, floor0 + 31, cz + 2, COBBLE_WALL);
  s.set(cx, floor0 + 31, cz + 2, LANTERN);
  s.set(cx, floor0 + 32, cz + 2, GLOWSTONE);

  // Upper shrine: crystal circle.
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * 2);
    const pz = Math.round(cz + Math.sin(ang) * 2);
    s.set(px, floor0 + 41, pz, CRYSTAL);
  }
  s.set(cx, floor0 + 41, cz, GLOWSTONE);
  s.set(cx, floor0 + 42, cz, CRYSTAL);

  // ── Summit crown ───────────────────────────────────────────────────────────
  const summit = floor0 + 46;
  for (let dy = 0; dy <= 10; dy++) {
    const rr = Math.max(1, 4 - Math.floor(dy / 2));
    for (let dz = -rr; dz <= rr; dz++) {
      for (let dx = -rr; dx <= rr; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
        const id = dy < 3 ? DEEPSLATE : dy < 6 ? BRICK : dy < 9 ? CRYSTAL : GLOWSTONE;
        s.set(cx + dx, summit + dy, cz + dz, id);
      }
    }
  }
  s.fill(cx, summit + 11, cz, cx, summit + 16, cz, GLOWSTONE);
  s.set(cx, summit + 17, cz, CRYSTAL);

  // Summit walk ring (final viewpoint).
  for (let a = 0; a < 20; a++) {
    const ang = (a / 20) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * 4);
    const pz = Math.round(cz + Math.sin(ang) * 4);
    s.set(px, summit, pz, STONE);
    s.set(px, summit + 1, pz, OAK_FENCE);
  }
  // Stairs from shrine to summit deck.
  for (let i = 0; i < 5; i++) {
    s.set(cx + 2, floor0 + 41 + i, cz, STAIRS_COBBLE, packState(FACING.W, 0));
  }

  // Ember glow veins on outer foundation.
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(ang) * 10);
    const pz = Math.round(cz + Math.sin(ang) * 10);
    s.set(px, baseY + 1, pz, GLOWSTONE);
  }
}

/** Ceremonial lakefront plaza + enhanced causeway approach (bridge already exists). */
export function buildCeremonialApproach(s: CitadelStamp, seed: WorldSeed): void {
  // Lakefront plaza at dock — wider ceremonial apron.
  const zPlaza = 50;
  for (let z = zPlaza - 4; z <= zPlaza + 2; z++) {
    for (let x = -4; x <= 20; x++) {
      const h = ashenSurfaceAt(seed, x, z);
      const y = Math.max(h, ASHEN.shoreY);
      s.set(x, y, z, (x + z) % 3 === 0 ? BRICK : STONE);
      s.fill(x, y + 1, z, x, y + 3, z, AIR);
    }
  }
  // Twin pylons flanking the causeway start.
  for (const x of [2, 14]) {
    const h = Math.max(ashenSurfaceAt(seed, x, 58), ASHEN.shoreY);
    s.fill(x, h + 1, 58, x + 1, h + 8, 59, DEEPSLATE);
    s.set(x, h + 9, 58, GLOWSTONE);
    s.set(x + 1, h + 9, 59, CRYSTAL);
  }
  // Statue plinths (simple columns) on plaza.
  for (const [x, z] of [
    [-2, 48],
    [18, 48],
  ] as const) {
    const h = Math.max(ashenSurfaceAt(seed, x, z), ASHEN.shoreY);
    s.fill(x, h + 1, z, x, h + 4, z, STONE);
    s.set(x, h + 5, z, LANTERN);
  }
}
