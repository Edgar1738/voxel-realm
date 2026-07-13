import {
  AIR,
  LIMESTONE,
  CARVED_LIMESTONE,
  LANTERN,
  GLOWSTONE,
  PLANKS,
  GOLD_TRIM,
  OAK_FENCE,
  SLATE,
} from '../blocks/blocks';
import { CitadelStamp, hash2 } from './CitadelStamp';
import { G, CX, Z0, X0, X1, Z1, WALK_Y, CATH, KEEP, KCX, FLOOR, SPAWN } from './cloudspireFrame';
import { pinnacle, skyBridge } from './cloudspirePrimitives';

/** Extra silhouette, lighting, banners, secrets. */
export function dressWorld(s: CitadelStamp): void {
  // Banner poles along approach
  for (let z = Z0 - 50; z < Z0; z += 10) {
    for (const x of [CX - 8, CX + 8]) {
      s.fill(x, G + 1, z, x, G + 8, z, CARVED_LIMESTONE);
      s.set(x, G + 9, z, LANTERN);
    }
  }

  // Wall lanterns
  for (let x = X0 + 10; x < X1; x += 16) {
    s.set(x, WALK_Y + 1, Z0 + 2, LANTERN);
    s.set(x, WALK_Y + 1, Z1 - 2, LANTERN);
  }

  // Secret crypt under cathedral (optional hero secret)
  const cryptY = CATH.floor - 10;
  s.fill(CATH.x0 + 8, cryptY, CATH.z0 + 10, CATH.x1 - 8, CATH.floor - 1, CATH.z0 + 28, LIMESTONE);
  s.fill(CATH.x0 + 9, cryptY + 1, CATH.z0 + 11, CATH.x1 - 9, CATH.floor - 2, CATH.z0 + 27, AIR);
  s.slab(CATH.x0 + 9, CATH.z0 + 11, CATH.x1 - 9, CATH.z0 + 27, cryptY + 1, PLANKS);
  s.set(KCX, cryptY + 2, CATH.z0 + 19, GLOWSTONE);
  s.set(KCX, cryptY + 3, CATH.z0 + 19, GOLD_TRIM);
  // Hatch from nave side aisle
  s.fill(CATH.x0 + 10, cryptY + 1, CATH.z0 + 12, CATH.x0 + 12, CATH.floor, CATH.z0 + 14, AIR);
  for (let y = cryptY + 1; y < CATH.floor; y++) {
    s.set(CATH.x0 + 11, y, CATH.z0 + 13, PLANKS); // ladder-like steps
  }

  // Hidden garden alcove (secret 2)
  s.fill(CX + 42, G + 1, -55, CX + 50, G + 6, -48, LIMESTONE);
  s.fill(CX + 43, G + 1, -54, CX + 49, G + 5, -49, AIR);
  s.set(CX + 46, G + 2, -51, GLOWSTONE);
  s.fill(CX + 42, G + 2, -52, CX + 42, G + 4, -50, AIR); // entrance slit

  // Extra roof pinnacles on outer towers for skyline
  for (let i = 0; i < 12; i++) {
    const x = X0 + 20 + i * 18;
    if (hash2(x, Z0, 0x51) > 0.4) pinnacle(s, x, WALK_Y + 2, Z0 + 2, 5);
  }

  // Bridge from west garden tower area to wall
  skyBridge(s, -48, -40, X0 + 8, -40, G + 20, 3);

  // Cathedral roof walk rail
  s.outline(CATH.x0, CATH.z0, CATH.x1, CATH.z1, CATH.floor + CATH.wallH + 1, OAK_FENCE);

  // Palace crown glow
  s.set(KCX, FLOOR.roof + 2, KEEP.z0 + 10, GLOWSTONE);
  s.set(KCX, FLOOR.roof + 2, KEEP.z1 - 10, GLOWSTONE);

  // Distant ruin shell
  s.walls(SPAWN.x - 40, G + 10, SPAWN.z - 20, SPAWN.x - 30, G + 28, SPAWN.z - 10, LIMESTONE);
  s.slab(SPAWN.x - 40, SPAWN.z - 20, SPAWN.x - 30, SPAWN.z - 10, G + 28, SLATE);
}

/** Final pass: guarantee hero-route openings. */
export function clearHeroRoute(s: CitadelStamp): void {
  // Overlook air
  s.fill(
    SPAWN.x - 4,
    Math.floor(SPAWN.y) - 1,
    SPAWN.z - 2,
    SPAWN.x + 4,
    Math.floor(SPAWN.y) + 3,
    SPAWN.z + 4,
    AIR,
  );
  // Gate passage
  s.fill(CX - 5, G + 1, Z0 - 3, CX + 5, G + 9, Z0 + 20, AIR);
  // Path spine
  for (let z = Z0 + 20; z < CATH.z0; z++) {
    s.fill(CX - 2, G + 1, z, CX + 2, G + 4, z, AIR);
    s.fill(CX - 2, GG_safe() + 1, z, CX + 2, GG_safe() + 4, z, AIR);
  }
  // Cathedral
  s.fill(CX - 3, CATH.floor + 1, CATH.z0 - 2, CX + 3, CATH.floor + 6, CATH.z1 + 12, AIR);
  // Court
  s.fill(CX - 3, KEEP.floor + 1, KEEP.z0 - 18, CX + 3, KEEP.floor + 5, KEEP.z0 + 3, AIR);
}

function GG_safe(): number {
  return 104;
}
