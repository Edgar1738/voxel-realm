/** Renderer-agnostic mesh payload (no three.js). Consumed by render/buildChunkMesh. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Texture array layer index per vertex. */
  layers: Float32Array;
  /** Baked ambient-occlusion brightness multiplier per vertex (0..1). */
  ao: Float32Array;
  /** Packed per-vertex light: skyLevel*16 + blockLevel (each 0..15). */
  light: Float32Array;
  /** Per-vertex biome-tint multiplier (r,g,b in 0..1); white = no tint. */
  tint: Float32Array;
  indices: Uint32Array;
}

/** The opaque + transparent (water/glass) + cutout (plants) meshes produced for one chunk. */
export interface ChunkMeshes {
  opaque: MeshData;
  transparent: MeshData;
  cutout: MeshData;
}
