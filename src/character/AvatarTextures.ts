// Procedural pixel textures for avatar parts: instead of one flat Lambert color per box,
// clothing/leather/metal parts get a tiny deterministic texture built from the skin's
// palette color. Variation amplitude scales with the base color's brightness, so the
// Shadow Wanderer's near-black palette still reads as a solid silhouette.

export type AvatarStyle = 'fabric' | 'leather' | 'metal' | 'plain';

/** Texture edge in pixels — small enough to stay crisp and cheap, like the block tiles. */
export const AVATAR_TILE = 16;

/** Deterministic 32-bit PRNG (mulberry32) so a given color+style always paints the same. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function channels(color: number): [number, number, number] {
  return [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff];
}

const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * Paints one AVATAR_TILE² RGBA tile for `style` tinted from `color`.
 *
 * - fabric: soft per-pixel weave noise plus faint horizontal thread rows.
 * - leather: coarser blotches with a darker stitch line near the top and bottom edge.
 * - metal: vertical brushed streaks with a bright burnish row (reads as plate).
 * - plain: the flat color (kept for skin/hair/eyes so faces stay clean).
 *
 * Variation is proportional to luminance: a bright tunic gets visible texture while a
 * near-black palette (Shadow Wanderer) stays within a couple of values of solid.
 */
export function paintAvatarTile(out: Uint8Array, color: number, style: AvatarStyle): void {
  const [r, g, b] = channels(color);
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const rng = mulberry32((color ^ (style.length * 0x9e3779b9)) >>> 0);
  for (let y = 0; y < AVATAR_TILE; y++) {
    for (let x = 0; x < AVATAR_TILE; x++) {
      let f = 0; // additive offset in 0..255 space
      if (style === 'fabric') {
        f = (rng() - 0.5) * 36 * lum + (y % 2 === 0 ? 6 : -6) * lum;
      } else if (style === 'leather') {
        const blotch = rng() < 0.22 ? -26 : rng() < 0.12 ? 18 : 0;
        const stitch = y === 1 || y === AVATAR_TILE - 2 ? -40 : 0;
        f = (blotch + stitch + (rng() - 0.5) * 18) * lum;
      } else if (style === 'metal') {
        const streak = Math.sin(x * 2.4 + (color % 7)) * 14;
        const burnish = y === 4 ? 26 : y === 5 ? 14 : 0;
        f = (streak + burnish + (rng() - 0.5) * 10) * lum;
      }
      const i = (y * AVATAR_TILE + x) * 4;
      out[i] = clamp255(r + f);
      out[i + 1] = clamp255(g + f);
      out[i + 2] = clamp255(b + f);
      out[i + 3] = 255;
    }
  }
}

/** Style each palette slot renders with; slots not listed stay 'plain' (flat color). */
export const SLOT_STYLE: Readonly<Record<string, AvatarStyle>> = {
  tunic: 'fabric',
  sleeves: 'fabric',
  pants: 'fabric',
  cloak: 'fabric',
  hood: 'fabric',
  boots: 'leather',
  gloves: 'leather',
  belt: 'leather',
  leather: 'leather',
  metal: 'metal',
  trim: 'metal',
};

export function styleForSlot(slot: string): AvatarStyle {
  return SLOT_STYLE[slot] ?? 'plain';
}
