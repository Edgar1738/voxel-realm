import { GRAND_KEEP } from './GrandKeepGenerator';

/** Shared world-space frame for the prosperous capital's newest defensive circuit. */
export const CAPITAL_CENTER_X = GRAND_KEEP.centerX;
export const CAPITAL_CENTER_Z = GRAND_KEEP.centerZ;
export const CAPITAL_GROUND_Y = GRAND_KEEP.groundY;

export const CAPITAL_X0 = -232;
export const CAPITAL_X1 = 248;
export const CAPITAL_Z0 = -220;
export const CAPITAL_Z1 = 260;

export const CAPITAL_WALL_THICKNESS = 5;
export const CAPITAL_WALL_BASE_Y = CAPITAL_GROUND_Y + 1;
export const CAPITAL_WALK_Y = CAPITAL_GROUND_Y + 10;
export const CAPITAL_MERLON_Y = CAPITAL_WALK_Y + 1;

/** Eleven-wide secondary gates and a fifteen-wide royal south gate. */
export const CAPITAL_GATE_HALF = 5;
export const CAPITAL_SOUTH_GATE_HALF = 7;
export const CAPITAL_GATE_TOP_Y = CAPITAL_GROUND_Y + 7;

/** Distance from the wall face to the near and far banks of the defensive ditch. */
export const CAPITAL_DITCH_INSET = 7;
export const CAPITAL_DITCH_OUTSET = 12;

/** Corner towers followed by south, north, west, and east midpoint gate towers. */
export const CAPITAL_TOWER_CENTERS = [
  [CAPITAL_X0, CAPITAL_Z0],
  [CAPITAL_X1, CAPITAL_Z0],
  [CAPITAL_X0, CAPITAL_Z1],
  [CAPITAL_X1, CAPITAL_Z1],
  [CAPITAL_CENTER_X, CAPITAL_Z0],
  [CAPITAL_CENTER_X, CAPITAL_Z1],
  [CAPITAL_X0, CAPITAL_CENTER_Z],
  [CAPITAL_X1, CAPITAL_CENTER_Z],
] as const;
