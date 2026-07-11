import type { CitadelStamp } from './CitadelStamp';
import { buildCapitalDistricts } from './grandKeepCapitalDistricts';
import { buildGrandKeepCapitalWalls } from './grandKeepCapitalWalls';
import { buildCapitalSuburbs } from './grandKeepSuburbs';

/** Builds the capital fabric around the historical Grand Keep town. */
export function buildCapitalExpansion(s: CitadelStamp): void {
  buildGrandKeepCapitalWalls(s);
  buildCapitalDistricts(s);
  buildCapitalSuburbs(s);
}
