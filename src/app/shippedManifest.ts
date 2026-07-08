// src/app/shippedManifest.ts
import manifestJson from '../../world-manifest.json';
import type { WorldManifest } from '../persistence/worldManifest';

/**
 * The curated collection, bundled at build time. The cast is safe because the committed file is
 * CI-gated: tests/shippedWorlds.test.ts runs validateManifest and cross-checks every entry
 * against its bundled snapshot in public/worlds/.
 */
export const SHIPPED_MANIFEST = manifestJson as WorldManifest;
