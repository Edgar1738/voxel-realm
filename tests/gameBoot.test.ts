import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeBootSave, loadBootMeta } from '../src/app/saveBootstrap';
import { registerInputListeners } from '../src/app/input';
import { createCreativeUi } from '../src/app/CreativeUi';

type SkinSelectorConfig = {
  initial: { id: string; name: string };
  onCycle: () => void;
};

type FakeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'> & {
  values: Map<string, string>;
};

type FakeUi = {
  hotbar: { addEventListener: (...args: unknown[]) => void };
  picker: { addEventListener: (...args: unknown[]) => void };
  reset: { addEventListener: (...args: unknown[]) => void };
  worldButton: {
    addEventListener: (...args: unknown[]) => void;
    style: Record<string, string>;
    textContent: string;
  };
  blueprintButton: { addEventListener: (...args: unknown[]) => void };
  infoButton: { addEventListener: (...args: unknown[]) => void };
  modeButton: {
    addEventListener: (...args: unknown[]) => void;
    style: Record<string, string>;
    textContent: string;
  };
  tourPrev: { addEventListener: (...args: unknown[]) => void };
  tourNext: { addEventListener: (...args: unknown[]) => void };
  tourEnd: { addEventListener: (...args: unknown[]) => void };
  muteButton: { addEventListener: (...args: unknown[]) => void };
  volumeSlider: { addEventListener: (...args: unknown[]) => void; value: string };
  weatherButton: { addEventListener: (...args: unknown[]) => void };
  timeSlider: { addEventListener: (...args: unknown[]) => void; value: string };
  skinButton: { addEventListener: (...args: unknown[]) => void };
  handButton: { addEventListener: (...args: unknown[]) => void };
  setWeatherUi: (mode: string) => void;
  setTimeUi: (t: number) => void;
  setSkinUi: ReturnType<typeof vi.fn>;
  setHandUi: ReturnType<typeof vi.fn>;
  inventoryOpen: boolean;
  setActiveTool: (tool: string) => void;
  setReachValue: (reach: number) => void;
  setHoldRepeatUi: (enabled: boolean) => void;
  setStatus: ReturnType<typeof vi.fn>;
  setExperienceMode: ReturnType<typeof vi.fn>;
  setTourHud: (status: unknown) => void;
  showWorldInfoDialog: (info: unknown) => Promise<unknown>;
  setNotice: (text: string | null) => void;
  setSoundUi: (volume: number, muted: boolean) => void;
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
    blueprintButton: { addEventListener: vi.fn() },
    infoButton: { addEventListener: vi.fn() },
    modeButton: { addEventListener: vi.fn(), style: {}, textContent: '' },
    tourPrev: { addEventListener: vi.fn() },
    tourNext: { addEventListener: vi.fn() },
    tourEnd: { addEventListener: vi.fn() },
    muteButton: { addEventListener: vi.fn() },
    volumeSlider: { addEventListener: vi.fn(), value: '60' },
    weatherButton: { addEventListener: vi.fn() },
    timeSlider: { addEventListener: vi.fn(), value: '500' },
    skinButton: { addEventListener: vi.fn() },
    handButton: { addEventListener: vi.fn() },
    setWeatherUi: vi.fn(),
    setTimeUi: vi.fn(),
    setSkinUi: vi.fn(),
    setHandUi: vi.fn(),
    inventoryOpen: false,
    setActiveTool: vi.fn(),
    setReachValue: vi.fn(),
    setHoldRepeatUi: vi.fn(),
    setStatus: vi.fn(),
    setNotice: vi.fn(),
    setSoundUi: vi.fn(),
    renderHotbar: vi.fn(),
    setLoadingHud: vi.fn(),
    setInventoryOpen: vi.fn((open: boolean) => {
      ui.inventoryOpen = open;
    }),
    isInventoryOpen: () => ui.inventoryOpen,
    showDialog: vi.fn().mockResolvedValue('cancel'),
    showWorldDialog: vi.fn().mockResolvedValue(undefined),
    showBlueprintDialog: vi.fn().mockResolvedValue(undefined),
    setExperienceMode: vi.fn(),
    setTourHud: vi.fn(),
    showWorldInfoDialog: vi.fn().mockResolvedValue(undefined),
  };
  return ui;
}

function makeStorage(initial: Record<string, string> = {}): FakeStorage {
  const values = new Map<string, string>(Object.entries(initial));
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    clear: vi.fn(() => {
      values.clear();
    }),
  };
}

function skinSelectorConfig(): SkinSelectorConfig {
  return vi.mocked(createCreativeUi).mock.calls[0][8] as SkinSelectorConfig;
}

const boot = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    scene: {},
    camera: { position: { x: 0, z: 0 }, fov: 70, updateProjectionMatrix: vi.fn() },
    texture: { dispose: vi.fn(() => order.push('texture.dispose')) },
    material: { dispose: vi.fn(() => order.push('material.dispose')) },
    transparentMaterial: { dispose: vi.fn(() => order.push('transparentMaterial.dispose')) },
    cutoutMaterial: { dispose: vi.fn(() => order.push('cutoutMaterial.dispose')) },
    registryConstructorArgs: [] as unknown[],
    cameraRigConstructorArgs: [] as unknown[],
    chunkManagerConstructorArgs: [] as unknown[],
    playerConstructorArgs: [] as unknown[],
    playerAvatarConstructorArgs: [] as unknown[],
    avatarSetSkin: vi.fn(),
    avatarAttach: vi.fn(),
    avatarDispose: vi.fn(() => order.push('avatar.dispose')),
    avatarUpdate: vi.fn(),
    rigInstance: undefined as { yaw: number; pitch: number } | undefined,
    ui: undefined as FakeUi | undefined,
    abortInput: vi.fn(() => order.push('abortInput')),
    persistenceDispose: vi.fn(() => order.push('persistence.dispose')),
    rendererAdd: vi.fn(),
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
      add: boot.rendererAdd,
      start: boot.rendererStart,
      dispose: boot.rendererDispose,
    };
  }),
}));

vi.mock('../src/render/TextureArray', () => ({
  createTextureArray: vi.fn(() => boot.texture),
  mipmappedArray: vi.fn(() => ({ dispose: vi.fn() })),
}));

vi.mock('../src/render/ChunkMaterial', () => ({
  createChunkMaterial: vi.fn(() => boot.material),
  createTransparentMaterial: vi.fn(() => boot.transparentMaterial),
  createCutoutMaterial: vi.fn(() => boot.cutoutMaterial),
}));

// applyHeadlamp writes material uniforms during boot; the stub materials have none.
vi.mock('../src/render/headlamp', () => ({
  applyHeadlamp: vi.fn(),
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
  THIRD_PERSON_DISTANCE: 4,
  lookDirectionFromYawPitch: (yaw: number, pitch: number) => {
    const cp = Math.cos(pitch);
    return { x: -cp * Math.sin(yaw), y: Math.sin(pitch), z: -cp * Math.cos(yaw) };
  },
  CameraRig: vi.fn(function CameraRig(...args: unknown[]) {
    boot.cameraRigConstructorArgs = args;
    const rig = {
      yaw: 0,
      pitch: 0,
      locked: false,
      mode: 'first' as 'first' | 'third',
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
      applyPlayerView: vi.fn(),
      setLookSettings: vi.fn(),
      toggleMode: vi.fn(() => {
        rig.mode = rig.mode === 'first' ? 'third' : 'first';
        return rig.mode;
      }),
      dispose: boot.rigDispose,
    };
    boot.rigInstance = rig;
    return rig;
  }),
}));

vi.mock('../src/render/HeldBlock', () => ({
  HeldBlock: vi.fn(function HeldBlock() {
    return {
      attach: vi.fn(),
      punch: vi.fn(),
      setBlock: vi.fn(),
      setMode: vi.fn(),
      update: vi.fn(),
      dispose: vi.fn(),
    };
  }),
}));

vi.mock('../src/app/WorldMapUi', () => ({
  createWorldMapUi: vi.fn(() => ({
    toggle: vi.fn(() => true),
    close: vi.fn(),
    isOpen: vi.fn(() => false),
    dispose: vi.fn(),
  })),
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
  PlayerController: vi.fn(function PlayerController(...args: unknown[]) {
    boot.playerConstructorArgs = args;
    return {
      position: { x: 0, z: 0 },
      update: vi.fn(),
      eye: vi.fn(() => ({ x: 0, y: 0, z: 0 })),
    };
  }),
}));

vi.mock('../src/render/PlayerAvatar', () => ({
  PlayerAvatar: vi.fn(function PlayerAvatar(...args: unknown[]) {
    boot.playerAvatarConstructorArgs = args;
    return {
      attach: boot.avatarAttach,
      setSkin: boot.avatarSetSkin,
      update: boot.avatarUpdate,
      dispose: boot.avatarDispose,
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
  resolveActiveMeta: vi.fn((loaded: unknown, generated: unknown, discarded: boolean) =>
    discarded ? generated : (loaded ?? generated),
  ),
}));

vi.mock('../src/app/input', () => ({
  TOOLS: ['single'],
  toolLabel: vi.fn((tool: string) => tool),
  registerInputListeners: vi.fn(() => boot.abortInput),
  DEFAULT_TUNNEL_CONFIG: { size: 3, length: 8, path: 'straight' },
  REACH_STEP: 2,
  getReach: vi.fn(() => 6),
  setReach: vi.fn(),
  loadReach: vi.fn(() => 6),
  saveReach: vi.fn(),
  getHoldRepeat: vi.fn(() => true),
  setHoldRepeat: vi.fn(),
  loadHoldRepeat: vi.fn(() => true),
  saveHoldRepeat: vi.fn(),
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
    boot.playerConstructorArgs = [];
    boot.playerAvatarConstructorArgs = [];
    boot.rigInstance = undefined;
    boot.ui = makeUi();
    vi.stubGlobal('localStorage', makeStorage());
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
      // The pause menu listens for pointer-lock changes on the document.
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
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

  it('starts the player flying at the fixed fallback spawn when meta has none', async () => {
    const cleanup = await bootGame();

    expect(boot.playerConstructorArgs).toEqual([{ x: 8, y: 100, z: 8 }, true]);

    cleanup();
  });

  it('spawns at and looks toward the saved world meta when present', async () => {
    vi.mocked(loadBootMeta).mockResolvedValueOnce({
      store: {} as never,
      meta: {
        seed: 1,
        version: 1,
        spawn: { x: 20, y: 70, z: -20 },
        look: { yaw: 1.5, pitch: -0.3 },
      },
      persistent: true,
    });

    const cleanup = await bootGame();

    expect(boot.playerConstructorArgs[0]).toEqual({ x: 20, y: 70, z: -20 });
    expect(boot.rigInstance).toMatchObject({ yaw: 1.5, pitch: -0.3 });

    cleanup();
  });

  it('adds a light to the scene so the lit avatar is not rendered black', async () => {
    // Regression guard for the all-black-avatar bug: the avatar's MeshLambert material needs a
    // scene light to show any color. Boot must add at least one Light to the scene.
    const cleanup = await bootGame();

    const addedALight = boot.rendererAdd.mock.calls.some(
      ([o]) => (o as { isLight?: boolean } | undefined)?.isLight === true,
    );
    expect(addedALight).toBe(true);

    cleanup();
  });

  it('boots the avatar and selector from a stored built-in skin', async () => {
    vi.stubGlobal('localStorage', makeStorage({ 'vr.playerSkin': 'keep-mage' }));

    const cleanup = await bootGame();

    expect(boot.playerAvatarConstructorArgs).toEqual(['keep-mage']);
    expect(skinSelectorConfig().initial).toEqual({ id: 'keep-mage', name: 'Mage of the Keep' });

    cleanup();
  });

  it('falls back to the default skin when the stored id is unknown', async () => {
    vi.stubGlobal('localStorage', makeStorage({ 'vr.playerSkin': 'retired-skin-v1' }));

    const cleanup = await bootGame();

    expect(boot.playerAvatarConstructorArgs).toEqual(['realm-scout']);
    expect(skinSelectorConfig().initial).toEqual({ id: 'realm-scout', name: 'Realm Scout' });

    cleanup();
  });

  it('boots on the default skin when localStorage reads throw', async () => {
    const storage = makeStorage();
    storage.getItem = vi.fn(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.stubGlobal('localStorage', storage);

    const cleanup = await bootGame();

    expect(boot.playerAvatarConstructorArgs).toEqual(['realm-scout']);
    expect(skinSelectorConfig().initial).toEqual({ id: 'realm-scout', name: 'Realm Scout' });

    cleanup();
  });

  it('still cycles the skin when localStorage writes throw', async () => {
    const storage = makeStorage();
    storage.setItem = vi.fn(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    vi.stubGlobal('localStorage', storage);

    const cleanup = await bootGame();

    expect(() => skinSelectorConfig().onCycle()).not.toThrow();
    expect(boot.avatarSetSkin).toHaveBeenLastCalledWith('castle-mason');
    expect(boot.ui!.setSkinUi).toHaveBeenLastCalledWith('castle-mason', 'Castle Mason');
    expect(boot.ui!.setStatus).toHaveBeenCalledWith('Skin: Castle Mason');

    cleanup();
  });

  it('cycles the selector through built-in skins and persists the chosen id', async () => {
    const cleanup = await bootGame();

    skinSelectorConfig().onCycle();

    expect(boot.avatarSetSkin).toHaveBeenLastCalledWith('castle-mason');
    expect(boot.ui!.setSkinUi).toHaveBeenLastCalledWith('castle-mason', 'Castle Mason');
    expect(localStorage.getItem('vr.playerSkin')).toBe('castle-mason');
    expect(boot.ui!.setStatus).toHaveBeenCalledWith('Skin: Castle Mason');

    cleanup();
  });

  const curatedMeta = {
    seed: 1,
    version: 1,
    preset: 'flat',
    title: 'Moonspire Realm',
    description: 'A castle approach.',
    spawn: { x: 8, y: 72, z: 94 },
    look: { yaw: 0, pitch: 0 },
    landmarks: [{ name: 'Gatehouse', x: 8, y: 64, z: 47 }],
    tour: [
      { name: 'Road', x: 8, y: 72, z: 94 },
      { name: 'Gatehouse', x: 8, y: 64, z: 47 },
    ],
  };

  function inputCtx(): {
    getExperienceMode: () => 'play' | 'build';
    onEnterBuild: () => void;
    onRun: (voxels: unknown[], verb: string) => void;
  } {
    const call = vi.mocked(registerInputListeners).mock.calls[0][0] as {
      callbacks: ReturnType<typeof inputCtx>;
    };
    return call.callbacks;
  }

  it('a curated world boots into play mode; B enters build', async () => {
    vi.mocked(loadBootMeta).mockResolvedValueOnce({
      store: {} as never,
      meta: curatedMeta,
      persistent: true,
    });

    const cleanup = await bootGame();
    const callbacks = inputCtx();

    expect(boot.ui!.setExperienceMode).toHaveBeenLastCalledWith('play');
    expect(callbacks.getExperienceMode()).toBe('play');

    callbacks.onEnterBuild();
    expect(callbacks.getExperienceMode()).toBe('build');
    expect(boot.ui!.setExperienceMode).toHaveBeenLastCalledWith('build');

    cleanup();
  });

  it('uncurated worlds keep creative build mode', async () => {
    const cleanup = await bootGame(); // default boot: meta undefined

    expect(boot.ui!.setExperienceMode).toHaveBeenLastCalledWith('build');
    expect(inputCtx().getExperienceMode()).toBe('build');

    cleanup();
  });

  it('play mode blocks edits end-to-end: onRun becomes a no-op with a hint', async () => {
    vi.mocked(loadBootMeta).mockResolvedValueOnce({
      store: {} as never,
      meta: curatedMeta,
      persistent: true,
    });

    const cleanup = await bootGame();
    const { EditService } = await import('../src/edit/EditService');
    const editInstance = vi.mocked(EditService).mock.results[0].value as {
      apply: ReturnType<typeof vi.fn>;
    };

    inputCtx().onRun([{ x: 0, y: 0, z: 0, id: 0 }], 'Broke');
    expect(editInstance.apply).not.toHaveBeenCalled();
    expect(boot.ui!.setStatus).toHaveBeenCalledWith(expect.stringContaining('press B to build'));

    // Entering build mode re-enables the same path.
    inputCtx().onEnterBuild();
    inputCtx().onRun([{ x: 0, y: 0, z: 0, id: 0 }], 'Broke');
    expect(editInstance.apply).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
