/** Horizontal chunk footprint (X). */
export const CHUNK_SIZE_X = 16;
/** Horizontal chunk footprint (Z). */
export const CHUNK_SIZE_Z = 16;
/** Bounded vertical extent of the world (tunable; bump persistence version if changed). */
export const WORLD_HEIGHT = 192;

export const CHUNK_AREA = CHUNK_SIZE_X * CHUNK_SIZE_Z;
export const CHUNK_VOLUME = CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z;

/** Chunk radius (Chebyshev) loaded around the camera column. */
export const VIEW_DISTANCE = 4;
/** Max chunks generated per frame (avoid hitches). */
export const GEN_BUDGET = 2;
/** Max chunks meshed per frame (unified: counts main + neighbor remeshes, P5). */
export const MESH_BUDGET = 2;
/** Soft per-frame wall-clock ceiling (ms) for streaming work before yielding to the next frame (P5). */
export const FRAME_WORK_MS = 6;

/** Water surface height (used by later worldgen stages; defined now for the pipeline). */
export const SEA_LEVEL = 62;

/** Lower bound for the adaptive view-distance governor (also the initial radius). */
export const MIN_VIEW_DISTANCE = 4;
/** Hard upper bound for the adaptive view-distance governor. */
export const MAX_VIEW_DISTANCE = 16;

/** Cold-start streaming budgets: fill the spawn area fast until the first ring drains. */
export const BURST_GEN_BUDGET = 8;
export const BURST_MESH_BUDGET = 6;
export const BURST_FRAME_WORK_MS = 10;
