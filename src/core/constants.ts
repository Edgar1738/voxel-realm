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
/** Max chunks meshed per frame. */
export const MESH_BUDGET = 2;

/** Water surface height (used by later worldgen stages; defined now for the pipeline). */
export const SEA_LEVEL = 62;
