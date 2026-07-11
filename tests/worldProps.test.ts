import { BufferGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Texture } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { PROP_CATALOG, propAssetUrl, type PropAssetDef } from '../src/assets/PropCatalog';
import { loadWorldPropInstances, parseWorldPropInstances } from '../src/persistence/WorldProps';
import { PropModelCache, WorldPropLayer } from '../src/render/WorldProps';

const catalog: readonly PropAssetDef[] = [
  { id: 'crate', url: 'models/fantasy/crate.glb', defaultScale: 0.5, yOffset: 0.25 },
];

describe('world prop data', () => {
  it('parses defensive instances with default transforms', () => {
    const parsed = parseWorldPropInstances(
      [{ id: 'crate-1', asset: 'crate', x: 1, y: 2, z: 3 }],
      catalog,
    );
    expect(parsed.instances).toEqual([
      {
        id: 'crate-1',
        asset: 'crate',
        x: 1,
        y: 2,
        z: 3,
        yaw: 0,
        pitch: 0,
        roll: 0,
        scale: 1,
      },
    ]);
    expect(parsed.problems).toEqual([]);
  });

  it('drops unknown assets, malformed entries, and duplicate instance ids nonfatally', () => {
    const parsed = parseWorldPropInstances(
      [
        { id: 'unknown-1', asset: 'missing', x: 0, y: 0, z: 0 },
        { id: 'crate-1', asset: 'crate', x: 0, y: 0, z: 0 },
        { id: 'crate-1', asset: 'crate', x: 2, y: 0, z: 0 },
        { id: 'bad', asset: 'crate', x: Number.NaN, y: 0, z: 0 },
      ],
      catalog,
    );
    expect(parsed.instances.map((instance) => instance.id)).toEqual(['crate-1']);
    expect(parsed.problems.join('\n')).toMatch(/unknown asset.*duplicate.*finite/is);
  });

  it('resolves base paths and makes an empty catalog a fetch-free no-op', async () => {
    expect(propAssetUrl(catalog[0], '/voxel-realm/')).toBe(
      '/voxel-realm/assets/models/fantasy/crate.glb',
    );
    const fetcher = vi.fn();
    expect(
      await loadWorldPropInstances('ashen-reach', PROP_CATALOG, '/voxel-realm/', fetcher),
    ).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('loads placement data from the base-aware world slug URL', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [{ id: 'crate-1', asset: 'crate', x: 0, y: 0, z: 0 }],
    }));
    const instances = await loadWorldPropInstances(
      'ashen-reach',
      catalog,
      '/voxel-realm/',
      fetcher,
    );
    expect(fetcher).toHaveBeenCalledWith('/voxel-realm/worlds/props/ashen-reach.json');
    expect(instances).toHaveLength(1);
  });
});

describe('world prop rendering', () => {
  it('loads each unique model URL once and disposes owned geometry, maps, and materials', async () => {
    const geometry = new BufferGeometry();
    const map = new Texture();
    const sourceMaterial = new MeshStandardMaterial({ map });
    const scene = new Group();
    scene.add(new Mesh(geometry, sourceMaterial));
    const loader = { loadAsync: vi.fn(async () => ({ scene })) };
    const warn = vi.fn();
    const cache = new PropModelCache(loader, warn);

    const [first, second] = await Promise.all([
      cache.load('/assets/crate.glb'),
      cache.load('/assets/crate.glb'),
    ]);
    expect(first).toBe(second);
    expect(loader.loadAsync).toHaveBeenCalledOnce();
    const normalized = (scene.children[0] as Mesh).material;
    expect((normalized as { isMeshBasicMaterial?: boolean }).isMeshBasicMaterial).toBe(true);

    const geometryDispose = vi.spyOn(geometry, 'dispose');
    const mapDispose = vi.spyOn(map, 'dispose');
    const materialDispose = vi.spyOn(normalized as MeshStandardMaterial, 'dispose');
    cache.dispose();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(mapDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('renders an empty prop list as a complete no-op', async () => {
    const root = new Group();
    const loader = { loadAsync: vi.fn() };
    const layer = new WorldPropLayer(root, catalog, '/', loader);
    await layer.render([]);
    expect(root.children).toHaveLength(0);
    expect(loader.loadAsync).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('warns only once when repeated instances share a missing model URL', async () => {
    const loader = { loadAsync: vi.fn(async () => Promise.reject(new Error('missing'))) };
    const warn = vi.fn();
    const cache = new PropModelCache(loader, warn);
    await Promise.all([cache.load('/missing.glb'), cache.load('/missing.glb')]);
    expect(loader.loadAsync).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledOnce();
  });

  it('preserves vertex colors when normalizing imported materials', async () => {
    const scene = new Group();
    scene.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial({ vertexColors: true })));
    const cache = new PropModelCache({ loadAsync: vi.fn(async () => ({ scene })) });
    await cache.load('/assets/painted.glb');
    const normalized = (scene.children[0] as Mesh).material as MeshStandardMaterial;
    expect(normalized.vertexColors).toBe(true);
    cache.dispose();
  });

  it('disposes InstancedMesh GPU buffers on re-render and teardown', async () => {
    const scene = new Group();
    scene.add(new Mesh(new BufferGeometry(), new MeshStandardMaterial()));
    const root = new Group();
    const layer = new WorldPropLayer(root, catalog, '/', {
      loadAsync: vi.fn(async () => ({ scene })),
    });
    const instances = [
      { id: 'crate-1', asset: 'crate', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
      { id: 'crate-2', asset: 'crate', x: 2, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, scale: 1 },
    ];

    await layer.render(instances);
    const firstBatch = root.children.filter((child) => child instanceof InstancedMesh);
    expect(firstBatch).toHaveLength(1);
    const firstDispose = vi.spyOn(firstBatch[0], 'dispose');

    await layer.render(instances); // re-render replaces the batch and must free the old one
    expect(firstDispose).toHaveBeenCalledOnce();
    const secondBatch = root.children.filter((child) => child instanceof InstancedMesh);
    expect(secondBatch).toHaveLength(1);
    const secondDispose = vi.spyOn(secondBatch[0], 'dispose');

    layer.dispose();
    expect(secondDispose).toHaveBeenCalledOnce();
    expect(root.children).toHaveLength(0);
  });
});
