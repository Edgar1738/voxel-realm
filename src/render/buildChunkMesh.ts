import { BufferGeometry, BufferAttribute, Mesh, type Material } from 'three';
import type { MeshData } from '../mesh/MeshTypes';

/** Converts renderer-agnostic MeshData into a THREE.Mesh with the given material. */
export function buildChunkMesh(mesh: MeshData, material: Material): Mesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(mesh.normals, 3));
  geometry.setAttribute('uv', new BufferAttribute(mesh.uvs, 2));
  geometry.setAttribute('layer', new BufferAttribute(mesh.layers, 1));
  geometry.setAttribute('ao', new BufferAttribute(mesh.ao, 1));
  geometry.setIndex(new BufferAttribute(mesh.indices, 1));
  return new Mesh(geometry, material);
}
