import { CitadelStamp } from './CitadelStamp';
import type { Overlay } from './Generator';
import {
  buildArrivalAndApproach,
  buildOuterWalls,
  buildGatehouse,
  buildLowerDistrict,
  buildWallAccess,
} from './cloudspireTerrain';
import { buildCathedral, clearCathedralRoute } from './cloudspireCathedral';
import {
  buildPalace,
  buildMainSpire,
  buildPalaceSkyBridge,
  clearPalaceRoute,
} from './cloudspirePalace';
import { buildSecondaryTowers } from './cloudspireTowers';
import { buildGardens, buildInnerCourt } from './cloudspireGardens';
import { buildWater } from './cloudspireWater';
import { dressWorld, clearHeroRoute } from './cloudspireDressing';

/**
 * Cloudspire Citadel site overlay — deterministic multi-terrace castle-city.
 *
 * Hero route:
 * Arrival Overlook → Approach → Outer Gate → Gardens → Cathedral →
 * Palace Court → Great Hall → Grand Stair → Upper Palace → Sky Bridge →
 * Spire stages → Crown Balcony
 */
export function cloudspireSite(): Overlay {
  return (chunk, cx, cz) => {
    const s = new CitadelStamp(chunk, cx, cz);

    buildArrivalAndApproach(s);
    buildOuterWalls(s);
    buildGatehouse(s);
    buildWallAccess(s);
    buildLowerDistrict(s);

    buildGardens(s);
    buildWater(s);

    buildCathedral(s);
    buildInnerCourt(s);

    buildPalace(s);
    buildMainSpire(s);
    buildPalaceSkyBridge(s);
    buildSecondaryTowers(s);

    dressWorld(s);

    // Final circulation guarantees
    clearCathedralRoute(s);
    clearPalaceRoute(s);
    clearHeroRoute(s);
  };
}
