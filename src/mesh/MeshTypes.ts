/** Renderer-agnostic mesh payload (no three.js). Consumed by render/buildChunkMesh. */
export interface MeshData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Texture array layer index per vertex. */
  layers: Float32Array;
  /** Baked ambient-occlusion brightness multiplier per vertex (0..1). */
  ao: Float32Array;
  indices: Uint32Array;
}
