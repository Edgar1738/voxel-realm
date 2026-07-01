import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeBootSave } from '../src/app/saveBootstrap';

type FakeUi = {
  hotbar: { addEventListener: (...args: unknown[]) => void };
  picker: { addEventListener: (...args: unknown[]) => void };
  reset: { addEventListener: (...args: unknown[]) => void };
  worldButton: {
    addEventListener: (...args: unknown[]) => void;
    style: Record<string, string>;
    textContent: string;
  };
  inventoryOpen: boolean;
  setActiveTool: (tool: string) => void;
  setStatus: (text: string) => void;
  setNotice: (text: string | null) => void;
  renderHotbar: () => void;
  setInventoryOpen: (open: boolean) => void;
  isInventoryOpen: () => boolean;
};

function makeUi(): FakeUi {
  const ui = {
    hotbar: { addEventListener: vi.fn() },
    picker: { addEventListener: vi.fn() },
    reset: { addEventListener: vi.fn() },
    worldButton: { addEventListener: vi.fn(), style: {}, textContent: '' },
    inventoryOpen: false,
    setActiveTool: vi.fn(),
    setStatus: vi.fn(),
    setNotice: vi.fn(),
    renderHotbar: vi.fn(),
    setInventoryOpen: vi.fn((open: boolean) => {
      ui.inventoryOpen = open;
    }),
    isInventoryOpen: () => ui.inventoryOpen,
  };
  return ui;
}

const boot = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    scene: {},
    camera: { position: { x: 0, z: 0 } },
    texture: { dispose: vi.fn(() => order.push('texture.dispose')) },
    material: { dispose: vi.fn(() => order.push('material.dispose')) },
    transparentMaterial: { dispose: vi.fn(() => order.push('transparentMaterial.dispose')) },
    cutoutMaterial: { dispose: vi.fn(() => order.push('cutoutMaterial.dispose')) },
    registryConstructorArgs: [] as unknown[],
    cameraRigConstructorArgs: [] as unknown[],
    chunkManagerConstructorArgs: [] as unknown[],
    ui: undefined as FakeUi | undefined,
    abortInput: vi.fn(() => order.push('abortInput')),
    persistenceDispose: vi.fn(() => order.push('persistence.dispose')),
    rendererStart: vi.fn(),
    rendererDispose: vi.fn(() => order.push('renderer.dispose')),
    celestialDispose: vi.fn(() => order.push('celestial.dispose')),
    sinkDisposeAll: vi.fn(() => order.push('sink.disposeAll')),
    rigDispose: vi.fn(() => order.push('rig.dispose')),
  };
});

vi.mock('../src/render/Renderer', () => ({
  Renderer: vi.fn(function Renderer(_canvas: unknown) {
    return {
      scene: boot.scene,
      camera: boot.camera,
      add: vi.fn(),
      start: boot.rendererStart,
      dispose: boot.rendererDispose,
    };
  }),
}));

vi.mock('../src/render/TextureArray', () => ({
  createTextureArray: vi.fn(() => boot.texture),
}));

vi.mock('../src/render/ChunkMaterial', () => ({
  createChunkMaterial: vi.fn(() => boot.material),
  createTransparentMaterial: vi.fn(() => boot.transparentMaterial),
  createCutoutMaterial: vi.fn(() => boot.cutoutMaterial),
}));

vi.mock('../src/render/DayNight', () => ({
  DayNight: vi.fn(function DayNight() {
    return { time: 0, advance: vi.fn() };
  }),
}));

vi.mock('../src/render/CelestialSky', () => ({
  CelestialSky: vi.fn(function CelestialSky() {
    return { update: vi.fn(), dispose: boot.celestialDispose };
  }),
}));

vi.mock('../src/render/ChunkMeshRegistry', () => ({
  ChunkMeshRegistry: vi.fn(function ChunkMeshRegistry(...args: unknown[]) {
    boot.registryConstructorArgs = args;
    return { sortTransparent: vi.fn(), disposeAll: boot.sinkDisposeAll };
  }),
}));

vi.mock('../src/render/CameraRig', () => ({
  CameraRig: vi.fn(function CameraRig(...args: unknown[]) {
    boot.cameraRigConstructorArgs = args;
    return {
      yaw: 0,
      locked: false,
      getInput: vi.fn(() => ({
        forward: false,
        back: false,
        left: false,
        right: false,
        up: false,
        down: false,
        toggleFly: false,
      })),
      applyEye: vi.fn(),
      dispose: boot.rigDispose,
    };
  }),
}));

vi.mock('../src/world/ChunkManager', () => ({
  ChunkManager: vi.fn(function ChunkManager(...args: unknown[]) {
    boot.chunkManagerConstructorArgs = args;
    return {
      onChunkDeltaChanged: undefined,
      isSolid: vi.fn(() => false),
      isWater: vi.fn(() => false),
      solidBox: vi.fn(() => 'none'),
      update: vi.fn(),
      getBlock: vi.fn(() => 0),
      getChunkDelta: vi.fn(() => []),
    };
  }),
}));

vi.mock('../src/worldgen/Presets', () => ({
  createGenerator: vi.fn(() => ({ generator: {}, overlays: [] })),
  resolveBootPreset: vi.fn(() => 'default'),
}));

vi.mock('../src/mesh/GreedyMesher', () => ({
  GreedyMesher: vi.fn(function GreedyMesher() {
    return {};
  }),
}));

vi.mock('../src/blocks/BlockRegistry', () => ({
  BlockRegistry: vi.fn(function BlockRegistry() {
    return {
      has: vi.fn(() => true),
      get: vi.fn(() => ({ name: 'Air' })),
      shape: vi.fn(() => 'cube'),
    };
  }),
}));

vi.mock('../src/player/PlayerController', () => ({
  PlayerController: vi.fn(function PlayerController() {
    return {
      position: { x: 0, z: 0 },
      update: vi.fn(),
      eye: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    };
  }),
}));

vi.mock('../src/edit/EditService', () => ({
  EditService: vi.fn(function EditService() {
    return {
      apply: vi.fn(() => ({ changes: [] })),
      undo: vi.fn(() => 'empty'),
      redo: vi.fn(() => 'empty'),
    };
  }),
}));

vi.mock('../src/app/CreativeInventory', () => ({
  CreativeInventory: vi.fn(function CreativeInventory() {
    return {
      selectedBlock: 1,
      selectedSlot: 0,
      hotbar: [1],
      pickBlock: vi.fn(),
      selectSlot: vi.fn(),
    };
  }),
}));

vi.mock('../src/app/CreativeUi', () => ({
  createCreativeUi: vi.fn(() => boot.ui),
}));

vi.mock('../src/persistence/IndexedDbSaveStore', () => ({
  IndexedDbSaveStore: vi.fn(function IndexedDbSaveStore() {
    return {};
  }),
}));

vi.mock('../src/persistence/ServerSaveStore', () => ({
  ServerSaveStore: vi.fn(function ServerSaveStore() {
    return {};
  }),
}));

vi.mock('../src/persistence/worldName', () => ({
  worldNameFromSearch: vi.fn(() => 'default'),
}));

vi.mock('../src/app/persistence', () => ({
  createPersistence: vi.fn(() => ({
    scheduleFlush: vi.fn(),
    suppressAndClear: vi.fn(async () => undefined),
    dispose: boot.persistenceDispose,
  })),
}));

vi.mock('../src/app/saveBootstrap', () => ({
  loadBootMeta: vi.fn(async (store: unknown) => ({
    store,
    meta: undefined,
    persistent: true,
  })),
  initializeBootSave: vi.fn(async (state: { store: unknown }) => ({
    store: state.store,
    savedDeltas: new Map(),
    persistent: true,
    discardedIncompatible: false,
  })),
}));

vi.mock('../src/app/input', () => ({
  TOOLS: ['single'],
  toolLabel: vi.fn((tool: string) => tool),
  registerInputListeners: vi.fn(() => boot.abortInput),
}));

vi.mock('../src/persistence/ServerWorldCatalog', () => ({
  listWorlds: vi.fn(async () => []),
  copyWorld: vi.fn(async () => undefined),
}));

vi.mock('../src/app/DevControls', () => ({
  installDevControls: vi.fn(),
}));

vi.mock('../src/app/DevHud', () => ({
  installDevHud: vi.fn(() => vi.fn(() => boot.order.push('hudTeardown'))),
}));

async function bootGame(): Promise<() => void> {
  const { Game } = await import('../src/app/Game');
  return Game.boot({} as HTMLCanvasElement);
}

describe('Game.boot composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    boot.order.length = 0;
    boot.registryConstructorArgs = [];
    boot.cameraRigConstructorArgs = [];
    boot.chunkManagerConstructorArgs = [];
    boot.ui = makeUi();
    vi.stubGlobal('window', {
      location: { search: '', href: 'http://localhost/' },
      prompt: vi.fn(),
      confirm: vi.fn(),
      setTimeout: vi.fn(() => 0),
      clearTimeout: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal('document', {
      getElementById: vi.fn(() => undefined),
      exitPointerLock: vi.fn(),
    });
  });

  it('passes the shared texture to ChunkMeshRegistry so cleanup owns it', async () => {
    const cleanup = await bootGame();

    expect(boot.registryConstructorArgs[4]).toBe(boot.texture);

    cleanup();
  });

  it('wires CameraRig to the inventory-open input gate', async () => {
    const cleanup = await bootGame();
    const inputBlocked = boot.cameraRigConstructorArgs[3] as () => boolean;

    expect(inputBlocked()).toBe(false);
    boot.ui!.setInventoryOpen(true);
    expect(inputBlocked()).toBe(true);

    cleanup();
  });

  it('disposes scene resources before disposing the renderer', async () => {
    const cleanup = await bootGame();

    cleanup();

    const rendererIndex = boot.order.indexOf('renderer.dispose');
    expect(boot.order.indexOf('celestial.dispose')).toBeLessThan(rendererIndex);
    expect(boot.order.indexOf('sink.disposeAll')).toBeLessThan(rendererIndex);
  });

  it('shows a persistent notice when storage falls back to volatile memory', async () => {
    vi.mocked(initializeBootSave).mockResolvedValueOnce({
      store: {} as never,
      savedDeltas: new Map(),
      persistent: false,
      discardedIncompatible: false,
    });

    const cleanup = await bootGame();

    expect(boot.ui!.setNotice).toHaveBeenCalledWith(expect.stringContaining('NOT be saved'));

    cleanup();
  });

  it('warns via the status toast when an incompatible save was discarded', async () => {
    vi.mocked(initializeBootSave).mockResolvedValueOnce({
      store: {} as never,
      savedDeltas: new Map(),
      persistent: true,
      discardedIncompatible: true,
    });

    const cleanup = await bootGame();

    expect(boot.ui!.setStatus).toHaveBeenCalledWith(expect.stringContaining('cleared'));
    // A discard is not a volatile-storage situation, so the persistent notice stays silent.
    expect(boot.ui!.setNotice).not.toHaveBeenCalled();

    cleanup();
  });

  it('stays silent about storage on a normal persistent boot', async () => {
    const cleanup = await bootGame();

    expect(boot.ui!.setNotice).not.toHaveBeenCalled();

    cleanup();
  });
});
