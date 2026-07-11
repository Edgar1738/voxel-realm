import {
  Color,
  Euler,
  Group,
  InstancedMesh,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Object3D,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  Texture,
} from 'three';
import { propAssetUrl, type PropAssetDef } from '../assets/PropCatalog';
import type { WorldPropInstance } from '../persistence/WorldProps';

export interface GltfLoaderLike {
  loadAsync(url: string): Promise<{ scene: Group }>;
}

class LazyGltfLoader implements GltfLoaderLike {
  async loadAsync(url: string): Promise<{ scene: Group }> {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    return new GLTFLoader().loadAsync(url);
  }
}

function materialsOf(material: Material | Material[]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function baseColorMap(material: Material): Texture | null {
  const candidate = (material as Material & { map?: unknown }).map;
  return candidate instanceof Texture ? candidate : null;
}

function normalizeMaterial(material: Material): MeshBasicMaterial {
  const map = baseColorMap(material);
  if (map) {
    map.colorSpace = SRGBColorSpace;
    map.magFilter = NearestFilter;
    map.minFilter = LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.needsUpdate = true;
  }
  const sourceColor =
    'color' in material && material.color instanceof Color ? material.color : null;
  return new MeshBasicMaterial({ map, color: sourceColor?.clone() ?? new Color(0xffffff) });
}

export class PropModelCache {
  private readonly promises = new Map<string, Promise<Group | undefined>>();
  private readonly scenes = new Set<Group>();
  private readonly warned = new Set<string>();

  constructor(
    private readonly loader: GltfLoaderLike = new LazyGltfLoader(),
    private readonly warn: (message: string) => void = console.warn,
  ) {}

  load(url: string): Promise<Group | undefined> {
    const existing = this.promises.get(url);
    if (existing) return existing;
    const pending = this.loader
      .loadAsync(url)
      .then(({ scene }) => {
        scene.traverse((object) => {
          if (!(object instanceof Mesh)) return;
          const originals = materialsOf(object.material);
          object.material = originals.map(normalizeMaterial);
          if (object.material.length === 1) object.material = object.material[0];
          for (const material of originals) material.dispose();
          object.castShadow = false;
          object.receiveShadow = false;
        });
        scene.updateMatrixWorld(true);
        this.scenes.add(scene);
        return scene;
      })
      .catch((error: unknown) => {
        if (!this.warned.has(url)) {
          this.warned.add(url);
          this.warn(`Decorative prop model unavailable (${url}): ${(error as Error).message}`);
        }
        return undefined;
      });
    this.promises.set(url, pending);
    return pending;
  }

  dispose(): void {
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    for (const scene of this.scenes) {
      scene.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        for (const material of materialsOf(object.material)) {
          materials.add(material);
          const map = baseColorMap(material);
          if (map) textures.add(map);
        }
      });
    }
    for (const geometry of geometries) geometry.dispose();
    for (const texture of textures) texture.dispose();
    for (const material of materials) material.dispose();
    this.scenes.clear();
    this.promises.clear();
  }
}

function instanceMatrix(instance: WorldPropInstance, asset: PropAssetDef): Matrix4 {
  const position = new Vector3(instance.x, instance.y + (asset.yOffset ?? 0), instance.z);
  const rotation = new Quaternion().setFromEuler(
    new Euler(instance.pitch, instance.yaw + (asset.yawOffset ?? 0), instance.roll, 'XYZ'),
  );
  const scale = new Vector3(1, 1, 1).multiplyScalar(instance.scale * asset.defaultScale);
  return new Matrix4().compose(position, rotation, scale);
}

export class WorldPropLayer {
  private readonly cache: PropModelCache;
  private readonly owned: Object3D[] = [];
  private disposed = false;

  constructor(
    private readonly parent: Object3D,
    private readonly catalog: readonly PropAssetDef[],
    private readonly baseUrl: string,
    loader: GltfLoaderLike = new LazyGltfLoader(),
    warn: (message: string) => void = console.warn,
  ) {
    this.cache = new PropModelCache(loader, warn);
  }

  async render(instances: readonly WorldPropInstance[]): Promise<void> {
    if (this.disposed) return;
    for (const object of this.owned.splice(0)) this.parent.remove(object);
    if (instances.length === 0) return;
    const assets = new Map(this.catalog.map((asset) => [asset.id, asset]));
    const grouped = new Map<string, WorldPropInstance[]>();
    for (const instance of instances) {
      const group = grouped.get(instance.asset) ?? [];
      group.push(instance);
      grouped.set(instance.asset, group);
    }

    await Promise.all(
      [...grouped].map(async ([assetId, entries]) => {
        const asset = assets.get(assetId);
        if (!asset) return;
        const template = await this.cache.load(propAssetUrl(asset, this.baseUrl));
        if (!template || this.disposed) return;
        template.updateMatrixWorld(true);
        const meshes: Mesh[] = [];
        template.traverse((object) => {
          if (object instanceof Mesh) meshes.push(object);
        });
        if (meshes.length === 1) {
          const source = meshes[0];
          const instanced = new InstancedMesh(source.geometry, source.material, entries.length);
          entries.forEach((entry, index) => {
            instanced.setMatrixAt(index, instanceMatrix(entry, asset).multiply(source.matrixWorld));
          });
          instanced.instanceMatrix.needsUpdate = true;
          this.parent.add(instanced);
          this.owned.push(instanced);
          return;
        }
        for (const entry of entries) {
          const clone = template.clone(true);
          clone.applyMatrix4(instanceMatrix(entry, asset));
          this.parent.add(clone);
          this.owned.push(clone);
        }
      }),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const object of this.owned.splice(0)) this.parent.remove(object);
    this.cache.dispose();
  }
}
