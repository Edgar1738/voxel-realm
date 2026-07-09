// src/persistence/atlasBase.ts
//
// I/O wrapper around the pure atlas assembler: fetch each region's shipped snapshot from static
// hosting (the same public/worlds/<slug>.json bundles the single shipped worlds use), then hand
// the parsed bases to buildAtlasWorld. The result is a ShippedWorldBase, so the atlas rides the
// existing ShippedWorldStore + overlay pipeline unchanged.
import { fetchShippedWorld, type ShippedWorldBase } from './ShippedWorldStore';
import {
  buildAtlasWorld,
  ATLAS_SOURCES,
  type AtlasRegionSource,
} from '../worldgen/atlas/atlasWorld';

/**
 * Fetch every atlas region's packaged snapshot and assemble the master world. Rejects if any
 * region snapshot fails to load (fetchShippedWorld throws), so boot's fail-closed volatile
 * fallback engages instead of silently dropping a region.
 */
export async function assembleAtlasWorld(
  baseUrl: string,
  isValidBlockId: (id: number) => boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<ShippedWorldBase> {
  const sources: AtlasRegionSource[] = await Promise.all(
    ATLAS_SOURCES.map(async (region) => ({
      region,
      base: await fetchShippedWorld(baseUrl, region.sourceSave, isValidBlockId, fetchImpl),
    })),
  );
  return buildAtlasWorld(sources);
}
