/** Horizontal chunk footprint (X). */
export const CHUNK_SIZE_X = 16;
/** Horizontal chunk footprint (Z). */
export const CHUNK_SIZE_Z = 16;
/** Bounded vertical extent of the world (tunable; bump persistence version if changed). */
export const WORLD_HEIGHT = 192;

export const CHUNK_AREA = CHUNK_SIZE_X * CHUNK_SIZE_Z;
export const CHUNK_VOLUME = CHUNK_SIZE_X * WORLD_HEIGHT * CHUNK_SIZE_Z;
