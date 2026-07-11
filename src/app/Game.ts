import { DirectionalLight, HemisphereLight } from 'three';
import { Renderer } from '../render/Renderer';
import { createTextureArray, mipmappedArray } from '../render/TextureArray';
import {
  createChunkMaterial,
  createTransparentMaterial,
  createCutoutMaterial,
  applyTime,
} from '../render/ChunkMaterial';
import { applyUnderwater, stepUnderwaterFactor, type FogParams } from '../render/underwater';
import { Weather } from '../render/Weather';
import { AmbientLife } from '../render/AmbientLife';
import { Critters } from '../render/Critters';
import { skyState } from '../render/Sky';
import { WeatherClock, type WeatherKind } from './weatherSchedule';
import { BlockTicker } from '../world/BlockTicker';
import { DayNight } from '../render/DayNight';
import { CelestialSky } from '../render/CelestialSky';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { CameraRig, lookDirectionFromYawPitch, THIRD_PERSON_DISTANCE } from '../render/CameraRig';
import { PlayerAvatar } from '../render/PlayerAvatar';
import { HeldBlock } from '../render/HeldBlock';
import {
  loadPlayerSkinId,
  nextPlayerSkinId,
  resolvePlayerSkin,
  savePlayerSkinId,
} from '../character/PlayerSkins';
import {
  loadHandModeId,
  nextHandModeId,
  resolveHandMode,
  saveHandModeId,
} from '../character/HandModes';
import { clipCameraDistance } from './aim';
import { ChunkManager } from '../world/ChunkManager';
import { MeshWorkerPool } from '../world/MeshWorkerPool';
import { GenWorkerPool } from '../world/GenWorkerPool';
import { setSharedChunkBuffers } from '../world/chunkBuffers';
import { createGenerator, resolveBootPreset, type WorldPreset } from '../worldgen/Presets';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { PlayerController, PLAYER_HALF } from '../player/PlayerController';
import type { SoliditySampler } from '../player/Collision';
import { EditService } from '../edit/EditService';
import { CreativeInventory } from './CreativeInventory';
import { createCreativeUi, type DialogAction, type BlueprintEntry } from './CreativeUi';
import { createWorldMapUi } from './WorldMapUi';
import { buildMapPalette } from './worldMapRender';
import { LandmarkDiscovery } from './landmarkDiscovery';
import { exportWorldJson, exportFileName } from '../persistence/worldShare';
import { createBootStore } from './bootStore';
import { BootStats, type BootReport } from './bootStats';
import { SHIPPED_MANIFEST } from './shippedManifest';
import { worldNameFromSearch } from '../persistence/worldName';
import type { SaveStore } from '../persistence/SaveStore';
import { SAVE_VERSION, type WorldDeltas } from '../persistence/SaveTypes';
import { worldToChunkCoord } from '../core/coords';
import {
  FRAME_WORK_MS,
  WORLD_HEIGHT,
  GEN_BUDGET,
  MESH_BUDGET,
  VIEW_DISTANCE,
  MIN_VIEW_DISTANCE,
  MAX_VIEW_DISTANCE,
  BURST_GEN_BUDGET,
  BURST_MESH_BUDGET,
  BURST_FRAME_WORK_MS,
  CHUNK_SIZE_X,
} from '../core/constants';
import { ViewDistanceGovernor } from './ViewDistanceGovernor';
import { applyFogRange, fogRangeFor } from '../render/fog';
import { applyHeadlamp } from '../render/headlamp';
import type { Vec3, WorldSeed, BlockId } from '../core/types';
import type { SetVoxel, VoxelChange } from '../edit/EditTypes';
import { createPersistence } from './persistence';
import { loadBootMeta, initializeBootSave } from './saveBootstrap';
import { withinEditCap, MAX_EDIT_VOXELS } from './editCap';
import type { TunnelConfig } from '../edit/Brushes';
import {
  registerInputListeners,
  TOOLS,
  toolLabel,
  DEFAULT_TUNNEL_CONFIG,
  REACH_STEP,
  voxelIntersectsPlayer,
  getHoldRepeat,
  setHoldRepeat,
  loadHoldRepeat,
  saveHoldRepeat,
  getReach,
  setReach,
  loadReach,
  saveReach,
  type Tool,
} from './input';
import { placementState } from './placement';
import type { PreviewDeps } from './targetPreview';
import { resolveTarget } from './targetPreview';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { TargetOverlay } from '../render/TargetOverlay';
import type { FrameProfiler } from './FrameProfiler';
import type { RoamDriver } from './RoamBench';
import { resolveSpawn, parseSpawnOverrides, clampSpawnY, groundSpawnY } from './bootSpawn';
import { initialExperienceMode, isCuratedWorld, type ExperienceMode } from './experienceMode';
import { curatedPresetMeta } from './curatedPreset';
import { tourRoute, tourTick, tourStep } from './tour';
import { BuilderState } from './BuilderState';
import type { BuilderIntent } from './builderInput';
import { dominantHorizontalAxis, nudgeDelta } from './builderInput';
import { SelectionBox } from '../render/SelectionBox';
import { PasteGhost } from '../render/PasteGhost';
import { TourMarker } from '../render/TourMarker';
import { BlockParticles, particleColorOf } from '../render/BlockParticles';
import { AudioEngine } from '../audio/AudioEngine';
import { MovementSoundTracker } from '../audio/MovementSounds';
import { batchSound, familyOf } from '../audio/sounds';
import { AIR } from '../blocks/blocks';
import {
  fillBox,
  clearBox,
  replaceVoxels,
  captureRegion,
  prefabToVoxels,
  orientedStateReader,
  boxDims,
} from './RegionOps';
import {
  ServerBlueprintStore,
  LocalStorageBlueprintStore,
  type BlueprintStore,
} from './BlueprintStore';
import { CURATED_BLUEPRINTS, curatedCategory } from './curatedBlueprints';

const SEED: WorldSeed = 1337;
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops
const BASE_FOV = 70; // must match the Renderer's PerspectiveCamera construction
const SPRINT_FOV_KICK = 8; // Minecraft-style widening while sprinting
// Camera eye eases up this many blocks/sec when the player steps up (stairs/ledges), so a
// 1-block step-up smooths over ~110ms instead of snapping the view a full block.
const STEP_EYE_SPEED = 9;

/** Composition root: a player flying/walking and sculpting the streamed voxel world. */
export class Game {
  /**
   * Boots the game and returns a cleanup function.
   * The returned cleanup disposes all resources: render loop, listeners, persistence, HUD.
   */
  static async boot(canvas: HTMLCanvasElement): Promise<() => void> {
    // Boot telemetry: every startup phase is timed; window.__vrBootStats() reads the report.
    const bootStats = new BootStats();
    bootStats.begin('renderer+materials');
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    // Opaque/transparent block faces use a mipmapped sibling (less distant shimmer); the cutout
    // plant pass keeps the crisp base so mip alpha-averaging can't erode thin foliage at range.
    const mipTexture = mipmappedArray(texture);
    const material = createChunkMaterial(mipTexture);
    const transparentMaterial = createTransparentMaterial(mipTexture);
    const cutoutMaterial = createCutoutMaterial(texture);
    const chunkMaterials = [material, transparentMaterial, cutoutMaterial];
    const daynight = new DayNight(renderer.scene, chunkMaterials);
    const celestial = new CelestialSky(renderer.scene);
    bootStats.end('renderer+materials');

    // Load the durable save (or start fresh / discard an incompatible one). Dev uses the
    // server-owned disk store; production serves shipped worlds from static hosting with a
    // per-slug IndexedDB overlay, and everything else from per-name IndexedDB.
    const worldName = worldNameFromSearch(window.location.search);
    let store: SaveStore = createBootStore(worldName, (id) => registry.has(id), SHIPPED_MANIFEST, {
      dev: import.meta.env.DEV,
      baseUrl: import.meta.env.BASE_URL,
    });
    const bootMeta = await bootStats.span('load-meta', () => loadBootMeta(store));
    store = bootMeta.store;
    const worldTitle = bootMeta.meta?.title?.trim();
    if (worldTitle) document.title = `${worldTitle} — Voxel Realm`;

    // Pick the world environment. An explicit `?world=` wins; otherwise an existing save keeps its
    // own stored preset, so a bare `?save=<name>` can't mismatch the generator and wipe the world.
    const requested = new URLSearchParams(window.location.search).get('world');
    const preset: WorldPreset = resolveBootPreset(requested, bootMeta.meta);
    const generatedMeta = curatedPresetMeta(preset, SEED, SAVE_VERSION);
    const activeMeta = bootMeta.meta ?? generatedMeta;
    const curatedTitle = activeMeta?.title?.trim();
    if (curatedTitle) document.title = `${curatedTitle} — Voxel Realm`;
    const { generator, overlays } = createGenerator(preset);

    const bootSave = await bootStats.span('load-deltas', () =>
      initializeBootSave(bootMeta, SEED, SAVE_VERSION, preset, undefined, generatedMeta),
    );
    store = bootSave.store;
    const savedDeltas: WorldDeltas = bootSave.savedDeltas;

    bootStats.begin('chunk-manager');
    const sink = new ChunkMeshRegistry(
      renderer.scene,
      material,
      transparentMaterial,
      cutoutMaterial,
      texture,
    );
    // P6: off-thread meshing via SharedArrayBuffer-backed chunks. Requires cross-origin
    // isolation (COOP/COEP headers); without it (e.g. GitHub Pages) meshing stays
    // synchronous on the main thread — identical output, just the pre-P6 behavior.
    const meshPool = MeshWorkerPool.supported() ? new MeshWorkerPool() : undefined;
    setSharedChunkBuffers(meshPool !== undefined);
    // P7: off-thread base-chunk generation (terrain + overlays). Needs only Worker support —
    // result buffers transfer (or share, when isolated) — so this stays on even on GitHub
    // Pages. Constructed AFTER setSharedChunkBuffers so its workers allocate matching buffers.
    const genPool = GenWorkerPool.supported() ? new GenWorkerPool(preset, SEED) : undefined;
    const manager = new ChunkManager(
      generator,
      new GreedyMesher(registry),
      registry,
      sink,
      SEED,
      overlays,
      {
        viewDistance: VIEW_DISTANCE,
        genBudget: BURST_GEN_BUDGET,
        meshBudget: BURST_MESH_BUDGET,
        frameWorkMs: BURST_FRAME_WORK_MS,
        ...(meshPool ? { meshPool } : {}),
        ...(genPool ? { genPool } : {}),
      },
      savedDeltas,
    );
    bootStats.end('chunk-manager');
    bootStats.begin('systems+ui');

    // Debounced per-chunk persistence.
    const persistence = createPersistence(store, manager);
    manager.onChunkDeltaChanged = (key) => persistence.scheduleFlush(key);

    // Block physics: water flows, sand falls. Every edit batch (player, builder,
    // undo, or the ticker's own writes) re-activates the touched cells.
    const ticker = new BlockTicker(
      {
        getBlock: (x, y, z) => manager.getBlock(x, y, z),
        getState: (x, y, z) => manager.getState(x, y, z),
        isLoaded: (x, z) => manager.isLoaded(x, z),
      },
      (edits) => manager.applyEdits(edits),
    );
    manager.onEditsApplied = (changes) => ticker.notifyChanges(changes);

    const overlay = document.getElementById('overlay') ?? undefined;
    // Curated worlds can carry their own spawn/look in meta; a URL override wins for debugging.
    const spawnOverrides = parseSpawnOverrides(window.location.search);
    const spawnState = clampSpawnY(
      resolveSpawn(activeMeta, spawnOverrides, {
        spawn: SPAWN,
        look: { yaw: 0, pitch: 0 },
      }),
      WORLD_HEIGHT,
    );
    // Only the fixed default spawn hovers waiting for terrain; curated/overridden spawns are
    // intentional vantage points and must not be settled onto the ground.
    const usingDefaultSpawn = spawnOverrides.spawn === undefined && activeMeta?.spawn === undefined;
    const player = new PlayerController(spawnState.spawn, true);
    const sampler: SoliditySampler & {
      isWater(x: number, y: number, z: number): boolean;
      isClimbable(x: number, y: number, z: number): boolean;
      isBarrier(x: number, y: number, z: number): boolean;
    } = {
      collisionBoxes: (x: number, y: number, z: number) => manager.collisionBoxesAt(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
      isClimbable: (x: number, y: number, z: number) =>
        registry.isClimbable(manager.getBlock(x, y, z)),
      isBarrier: (x: number, y: number, z: number) => registry.isBarrier(manager.getBlock(x, y, z)),
    };

    const edit = new EditService(manager);
    const inventory = new CreativeInventory();
    const audio = new AudioEngine();
    const movementSounds = new MovementSoundTracker();
    const particles = new BlockParticles();
    particles.attach((o) => renderer.add(o));

    // First-person held block (the selected hotbar block in the lower right, build mode only).
    const heldBlock = new HeldBlock(registry);
    heldBlock.attach(renderer.scene, renderer.camera);

    // Ambience: weather cycles on its own clock; __vr.weather() pins a kind for testing.
    const weather = new Weather((intensity) => audio.playThunder(intensity));
    weather.attach((o) => renderer.add(o));
    const weatherClock = new WeatherClock();
    const ambientLife = new AmbientLife();
    ambientLife.attach((o) => renderer.add(o));
    const critters = new Critters(() => audio.playChirp());
    critters.attach((o) => renderer.add(o));
    const RAIN_LEVEL: Record<WeatherKind, number> = { clear: 0, rain: 0.6, storm: 1, snow: 0 };
    let underwaterFactor = 0;
    let animTime = 0;
    let tool: Tool = 'single';
    let anchorVoxel: { x: number; y: number; z: number } | undefined;
    let tunnelConfig: TunnelConfig = { ...DEFAULT_TUNNEL_CONFIG };
    let playerSkinId = resolvePlayerSkin().id;
    try {
      playerSkinId = loadPlayerSkinId(localStorage);
    } catch {
      /* localStorage unavailable - use the default built-in skin */
    }
    let handModeId = resolveHandMode().id;
    try {
      handModeId = loadHandModeId(localStorage);
    } catch {
      /* localStorage unavailable - use the default block hand */
    }
    const initialHandMode = resolveHandMode(handModeId);
    const avatarSkinTarget: { current?: PlayerAvatar } = {};
    const initialPlayerSkin = resolvePlayerSkin(playerSkinId);

    const ui = createCreativeUi(
      registry,
      inventory,
      TOOLS,
      toolLabel,
      (t) => setTool(t as Tool),
      {
        initial: tunnelConfig,
        onChange: (config) => {
          tunnelConfig = config;
        },
      },
      (direction) => applyReachStep(direction),
      () => toggleHoldRepeat(),
      {
        initial: { id: initialPlayerSkin.id, name: initialPlayerSkin.name },
        onCycle: () => cyclePlayerSkin(),
      },
      {
        initial: { id: initialHandMode.id, name: initialHandMode.name },
        onCycle: () => cycleHandMode(),
      },
    );

    const applyPlayerSkin = (id: string, persist: boolean): void => {
      const skin = resolvePlayerSkin(id);
      playerSkinId = skin.id;
      avatarSkinTarget.current?.setSkin(skin.id);
      ui.setSkinUi(skin.id, skin.name);
      if (persist) {
        try {
          savePlayerSkinId(localStorage, skin.id);
        } catch {
          /* ignore persistence failure */
        }
        ui.setStatus(`Skin: ${skin.name}`);
      }
    };

    function cyclePlayerSkin(): void {
      applyPlayerSkin(nextPlayerSkinId(playerSkinId), true);
    }

    const applyHandMode = (id: string, persist: boolean): void => {
      const mode = resolveHandMode(id);
      handModeId = mode.id;
      heldBlock.setMode(mode.id);
      ui.setHandUi(mode.id, mode.name);
      if (persist) {
        try {
          saveHandModeId(localStorage, mode.id);
        } catch {
          /* ignore persistence failure */
        }
        ui.setStatus(`Hand: ${mode.name}`);
      }
    };

    function cycleHandMode(): void {
      applyHandMode(nextHandModeId(handModeId), true);
    }
    applyHandMode(handModeId, false);

    // Dock hold-to-repeat toggle: flip, persist, and reflect in the UI + status toast.
    const toggleHoldRepeat = (): void => {
      setHoldRepeat(!getHoldRepeat());
      const enabled = getHoldRepeat();
      try {
        saveHoldRepeat(localStorage, enabled);
      } catch {
        /* ignore persistence failure */
      }
      ui.setHoldRepeatUi(enabled);
      ui.setStatus(enabled ? 'Hold-to-repeat on' : 'Hold-to-repeat off — one edit per click');
    };

    // Dock +/- reach buttons: apply one Shift+wheel-sized step and persist/report it.
    const applyReachStep = (direction: 1 | -1): void => {
      setReach(getReach() + direction * REACH_STEP);
      const reach = getReach();
      try {
        saveReach(localStorage, reach);
      } catch {
        /* ignore persistence failure */
      }
      ui.setReachValue(reach);
      ui.setStatus(`Build reach: ${reach} blocks`);
    };

    // Experience mode: curated worlds (title/description/spawn/look) open explore-first in
    // `play` (creative UI hidden, edit inputs gated in input.ts); `build` is full creative.
    const curated = isCuratedWorld(activeMeta);
    let experience: ExperienceMode = initialExperienceMode(activeMeta);
    const rig = new CameraRig(renderer.camera, canvas, overlay as HTMLElement | undefined, () =>
      ui.isInventoryOpen(),
    );
    rig.yaw = spawnState.look.yaw;
    rig.pitch = spawnState.look.pitch;

    // Dev world catalog (named server saves). `copyWorldFn` doubles as the reset dialog's
    // "duplicate first" capability; undefined in production (single IndexedDB world).
    let copyWorldFn: ((from: string, to: string) => Promise<void>) | undefined;
    if (import.meta.env.DEV) {
      const { listWorlds, copyWorld } = await import('../persistence/ServerWorldCatalog');
      copyWorldFn = copyWorld;
      ui.worldButton.title = `Current world: ${worldName}`;
      ui.worldButton.addEventListener('click', () => {
        void (async () => {
          const worlds = await listWorlds();
          const choice = await ui.showWorldDialog(worldName, worlds);
          if (!choice) return;
          if (choice.kind === 'duplicate') await copyWorld(worldName, choice.name);
          const u = new URL(window.location.href);
          u.searchParams.set('save', choice.name);
          window.location.href = u.toString();
        })();
      });
    } else {
      ui.worldButton.style.display = 'none';
    }

    const setStatus = (text: string): void => {
      ui.setStatus(text);
    };
    const setTool = (next: Tool): void => {
      tool = next;
      anchorVoxel = undefined;
      ui.setActiveTool(next);
      setStatus(`Tool: ${toolLabel(next)}`);
    };
    setTool('single');

    // Surface boot-time storage problems so the player never silently works in a world that can't
    // be saved (volatile fallback) or assumes prior edits survived an incompatible-save reset.
    if (!bootSave.persistent) {
      ui.setNotice('Storage unavailable — your edits will NOT be saved.');
    } else if (bootSave.discardedIncompatible) {
      setStatus('Save was from an older or incompatible world — previous edits were cleared.');
    }

    // Re-renders the hotbar and ticks when the selection actually changed (key, wheel, click).
    let lastHotbarKey = `${inventory.selectedSlot}:${inventory.selectedBlock}`;
    const renderHotbar = (): void => {
      ui.renderHotbar();
      const key = `${inventory.selectedSlot}:${inventory.selectedBlock}`;
      if (key !== lastHotbarKey) {
        lastHotbarKey = key;
        audio.playTick();
      }
    };

    ui.setSoundUi(audio.volume, audio.muted);
    ui.muteButton.addEventListener('click', () => {
      audio.setMuted(!audio.muted);
      ui.setSoundUi(audio.volume, audio.muted);
      setStatus(audio.muted ? 'Sound muted' : 'Sound on');
    });
    ui.volumeSlider.addEventListener('input', () => {
      audio.setVolume(Number(ui.volumeSlider.value) / 100);
      audio.playTick(); // audible feedback while dragging
    });

    // Climate controls: weather-cycle button + time-of-day slider. The engine logic already
    // exists (weatherClock/daynight); these just drive it and keep the UI and `__vr` in sync.
    const WEATHER_CYCLE: readonly (WeatherKind | 'auto')[] = [
      'auto',
      'clear',
      'rain',
      'storm',
      'snow',
    ];
    let weatherMode: WeatherKind | 'auto' = 'auto';
    let scrubbingTime = false;
    const applyWeatherMode = (mode: WeatherKind | 'auto'): void => {
      weatherMode = mode;
      if (mode === 'auto') {
        weatherClock.resume();
      } else {
        weatherClock.force(mode);
        weather.setKind(mode);
      }
      ui.setWeatherUi(mode);
    };
    ui.setWeatherUi(weatherMode); // reflect the default (auto) without re-rolling the clock
    ui.weatherButton.addEventListener('click', () => {
      const next = WEATHER_CYCLE[(WEATHER_CYCLE.indexOf(weatherMode) + 1) % WEATHER_CYCLE.length];
      applyWeatherMode(next);
      setStatus(next === 'auto' ? 'Weather: auto cycle' : `Weather: ${next}`);
    });

    // The slider tracks the day cycle each frame, except while the player is actively scrubbing it.
    ui.setTimeUi(daynight.time);
    ui.timeSlider.addEventListener('pointerdown', () => {
      scrubbingTime = true;
    });
    ui.timeSlider.addEventListener('input', () => {
      daynight.set(Number(ui.timeSlider.value) / 1000);
    });
    const stopScrub = (): void => {
      scrubbingTime = false;
    };
    ui.timeSlider.addEventListener('pointerup', stopScrub);
    ui.timeSlider.addEventListener('blur', stopScrub);
    window.addEventListener('pointerup', stopScrub);

    ui.picker.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-block]');
      if (!btn) return;
      inventory.pickBlock(Number(btn.dataset.block) as BlockId);
      renderHotbar();
      setStatus(`Selected ${registry.get(inventory.selectedBlock).name}`);
      ui.setInventoryOpen(false);
    });
    ui.hotbar.addEventListener('click', (event) => {
      const btn = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-slot]');
      if (!btn) return;
      inventory.selectSlot(Number(btn.dataset.slot));
      renderHotbar();
    });
    ui.reset.addEventListener('click', () => {
      void (async () => {
        const actions: DialogAction[] = [{ id: 'cancel', label: 'Cancel' }];
        // Offer a backup copy first when the world catalog supports it (dev server saves).
        if (copyWorldFn) actions.push({ id: 'duplicate', label: 'Copy, then reset' });
        actions.push({ id: 'reset', label: 'Reset world', kind: 'danger' });
        const choice = await ui.showDialog({
          title: 'Reset world',
          message:
            `Reset "${worldName}" back to generated terrain? ` +
            'All edits in this world will be lost.',
          actions,
        });
        if (choice !== 'reset' && choice !== 'duplicate') return;
        if (choice === 'duplicate' && copyWorldFn) {
          const backup = `${worldName}-backup-${new Date().toISOString().slice(0, 10)}`;
          try {
            await copyWorldFn(worldName, backup);
            setStatus(`Copied to "${backup}"`);
          } catch (err) {
            console.error('Voxel Realm: backup copy failed — reset aborted', err);
            setStatus('Backup copy failed — world NOT reset');
            return;
          }
        }
        // suppressAndClear cancels the debounce, clears dirty set, and drains in-flight writes
        // so the pagehide flush can't resurrect stale deltas after clearDeltas().
        try {
          await persistence.suppressAndClear();
          await store.clearDeltas();
        } catch (err) {
          console.error('Voxel Realm: reset failed', err);
        }
        window.location.reload();
      })();
    });

    /** Sound + particles for what an edit batch actually changed (one sound per action). */
    const MAX_EFFECT_VOXELS = 6;
    const playEditEffects = (changes: readonly VoxelChange[]): void => {
      const sound = batchSound(changes);
      if (sound) audio.playBlock(sound.family, sound.kind);
      let bursts = 0;
      let pops = 0;
      for (const c of changes) {
        if (c.after === AIR && c.before !== AIR && bursts < MAX_EFFECT_VOXELS) {
          particles.burst(c.x, c.y, c.z, particleColorOf(registry.get(c.before)));
          bursts++;
        } else if (c.after !== AIR && c.before === AIR && pops < 4) {
          particles.pop(c.x, c.y, c.z);
          pops++;
        }
        if (bursts >= MAX_EFFECT_VOXELS && pops >= 4) break;
      }
    };

    /** Applies an edit set (capped), reports the result, and clears any pending selection. */
    const run = (voxels: SetVoxel[], verb: string): void => {
      // Defense-in-depth behind the input gating: play mode never mutates the world.
      if (experience === 'play') {
        setStatus('Play mode — press B to build');
        return;
      }
      if (!withinEditCap(voxels.length, MAX_EDIT_VOXELS)) {
        setStatus(`Selection too large (${voxels.length} > ${MAX_EDIT_VOXELS})`);
        return;
      }
      const batch = edit.apply(voxels);
      if (batch) {
        playEditEffects(batch.changes);
        heldBlock.punch(); // every successful edit funnels through here — one swing hook
      }
      setStatus(batch ? `${verb} ${batch.changes.length} voxel(s)` : 'No editable voxels');
    };

    const previewDeps: PreviewDeps = {
      isToggleable: (id) => registry.isToggleable(id),
      shapeOf: (id) => registry.shape(id),
      placementState: (shape, yaw, hit) => placementState(shape, yaw, hit),
      canPlaceAt: (x, y, z) => manager.canApply([{ x, y, z }]),
    };

    const targetOverlay = new TargetOverlay();
    targetOverlay.attach((o) => renderer.add(o));
    const previewSampler = {
      getBlock: (x: number, y: number, z: number) => manager.getBlock(x, y, z),
    };

    const builder = new BuilderState();

    // Adjustable build reach (Shift+wheel in build mode), persisted across sessions.
    try {
      setReach(loadReach(localStorage));
    } catch {
      /* ignore persistence failure — falls back to DEFAULT_REACH */
    }
    ui.setReachValue(getReach());

    // Hold-to-repeat (dock toggle), persisted across sessions.
    try {
      setHoldRepeat(loadHoldRepeat(localStorage));
    } catch {
      /* ignore persistence failure — falls back to enabled */
    }
    ui.setHoldRepeatUi(getHoldRepeat());

    // Blueprint library: named clipboard saves (dev: shared .blueprints/ on the vite server —
    // the same files as __vr.saveBlueprint; prod: this browser's localStorage).
    const blueprints: BlueprintStore = import.meta.env.DEV
      ? new ServerBlueprintStore()
      : new LocalStorageBlueprintStore();
    const openBlueprints = async (): Promise<void> => {
      let saved: string[] = [];
      try {
        saved = await blueprints.list();
      } catch (err) {
        console.error('Voxel Realm: blueprint list failed', err);
      }
      const entries: BlueprintEntry[] = [
        ...saved.map(
          (name): BlueprintEntry => ({
            name,
            curated: false,
            category: 'Saved',
            load: () => blueprints.load(name),
          }),
        ),
        ...Object.keys(CURATED_BLUEPRINTS).map(
          (name): BlueprintEntry => ({
            name,
            curated: true,
            category: curatedCategory(name),
            load: () => CURATED_BLUEPRINTS[name](),
          }),
        ),
      ];
      const choice = await ui.showBlueprintDialog({
        entries,
        canSave: builder.clipboard !== undefined,
      });
      if (!choice) return;
      if (choice.kind === 'load') {
        try {
          const p = choice.curated
            ? CURATED_BLUEPRINTS[choice.name]()
            : await blueprints.load(choice.name);
          builder.setClipboard(p);
          setStatus(`Blueprint "${choice.name}" loaded — aim and click to paste`);
        } catch (err) {
          console.error('Voxel Realm: blueprint load failed', err);
          setStatus(`Could not load blueprint "${choice.name}"`);
        }
        return;
      }
      if (choice.kind === 'save') {
        const clip = builder.clipboard;
        if (!clip)
          return void setStatus('Nothing to save — copy a selection first (B, corners, C)');
        try {
          await blueprints.save(choice.name, clip);
          setStatus(`Saved blueprint "${choice.name}"`);
        } catch (err) {
          console.error('Voxel Realm: blueprint save failed', err);
          setStatus('Blueprint save failed');
        }
        return;
      }
      try {
        await blueprints.remove(choice.name);
      } catch (err) {
        console.error('Voxel Realm: blueprint delete failed', err);
        setStatus('Blueprint delete failed');
      }
      void openBlueprints(); // reopen with the refreshed list
    };
    ui.blueprintButton.addEventListener('click', () => void openBlueprints());

    const applyExperience = (mode: ExperienceMode): void => {
      experience = mode;
      if (mode === 'play') {
        ui.setInventoryOpen(false);
        if (builder.mode !== 'off') builder.toggleMode(); // leave build tools; keep clipboard
        anchorVoxel = undefined;
      }
      ui.setExperienceMode(mode);
      // The world button is dev-only; play mode hides it, build restores the dev-only state.
      ui.worldButton.style.display = import.meta.env.DEV && mode === 'build' ? '' : 'none';
      ui.modeButton.style.display = curated ? '' : 'none';
    };
    ui.modeButton.addEventListener('click', () => {
      applyExperience(experience === 'play' ? 'build' : 'play');
      setStatus(experience === 'play' ? 'Play mode — exploring' : 'Build mode');
    });

    // Guided tour (meta.tour): active waypoint + distance in the HUD, advancing on arrival.
    // World-space gold beacon tracks the active waypoint so players can navigate by sight,
    // not only by the distance readout.
    const tourMarker = new TourMarker();
    tourMarker.attach((o) => renderer.add(o));
    const route = tourRoute(activeMeta);
    let tourIndex: number | undefined;
    const endTour = (message: string): void => {
      tourIndex = undefined;
      ui.setTourHud(undefined);
      tourMarker.update(undefined, false);
      setStatus(message);
    };
    const startTour = (): void => {
      if (!route) return void setStatus('This world has no tour');
      tourIndex = 0;
      setStatus('Tour started — follow the gold beacon');
    };
    ui.tourPrev.addEventListener('click', () => {
      if (route && tourIndex !== undefined) tourIndex = tourStep(route, tourIndex, -1);
    });
    ui.tourNext.addEventListener('click', () => {
      if (route && tourIndex !== undefined) tourIndex = tourStep(route, tourIndex, 1);
    });
    ui.tourEnd.addEventListener('click', () => endTour('Tour ended'));
    /** One tour tick: advance from the player position and refresh the HUD + beacon. */
    const updateTour = (): void => {
      if (!route || tourIndex === undefined) {
        tourMarker.update(undefined, false);
        return;
      }
      const s = tourTick(route, tourIndex, player.position.x, player.position.z);
      tourIndex = s.index;
      if (s.done) endTour(`Tour complete — ${s.name}`);
      else {
        ui.setTourHud(s);
        tourMarker.update(route[s.index], true);
      }
    };

    // Landmark discovery medals: walking near a landmark marks it found, persisted per save.
    // The map and info dialog hide undiscovered names behind "???" so exploring reveals them.
    const discovery = new LandmarkDiscovery(
      bootMeta.meta?.landmarks ?? [],
      `vr.landmarksFound.${worldName}`,
    );
    let discoveryTimer = 0;
    const tickDiscovery = (cdt: number): void => {
      if (discovery.total === 0) return;
      discoveryTimer -= cdt;
      if (discoveryTimer > 0) return;
      discoveryTimer = 0.5; // a stroll covers ~3 blocks between checks — plenty inside radius 12
      const found = discovery.tick(player.position.x, player.position.z);
      if (found.length === 0) return;
      audio.playTick();
      setStatus(
        discovery.complete
          ? `All ${discovery.total} landmarks discovered — world explored!`
          : `Discovered: ${found.map((l) => l.name).join(', ')} (${discovery.foundCount}/${discovery.total})`,
      );
    };

    // World intro/info panel: shown once per save on a curated first visit, reopenable via Info.
    const introKey = `vr.introSeen.${worldName}`;
    const introSeen = (): boolean => {
      try {
        return localStorage.getItem(introKey) === '1';
      } catch {
        return true; // storage unavailable — never nag on every boot
      }
    };
    const openWorldInfo = async (): Promise<void> => {
      const meta = activeMeta;
      const action = await ui.showWorldInfoDialog(
        {
          title: meta?.title?.trim() || `World: ${worldName}`,
          description: meta?.description ?? '',
          landmarks: (meta?.landmarks ?? []).map((l) => ({
            name: l.name,
            found: discovery.isFound(l.name),
          })),
          tourCount: meta?.tour?.length ?? 0,
        },
        worldName,
      );
      try {
        localStorage.setItem(introKey, '1');
      } catch {
        /* ignore persistence failure */
      }
      if (action === 'build') {
        applyExperience('build');
        setStatus('Build mode');
      } else if (action === 'tour') {
        startTour();
      } else if (action === 'explore' && curated && experience !== 'play') {
        applyExperience('play');
        setStatus('Play mode — exploring');
      }
    };
    ui.infoButton.addEventListener('click', () => void openWorldInfo());
    applyExperience(experience);
    if (curated && !introSeen()) void openWorldInfo();

    // World map (M): a player-centered top-down snapshot of the loaded world with landmark
    // labels and the tour route. Rendered once per open.
    const worldMap = createWorldMapUi();
    const mapPalette = buildMapPalette();
    const toggleWorldMap = (): void => {
      worldMap.toggle({
        center: { x: Math.floor(player.position.x), z: Math.floor(player.position.z) },
        yaw: rig.yaw,
        radius: manager.viewDistance * CHUNK_SIZE_X,
        sample: (x, z) => manager.surfaceAt(x, z),
        palette: mapPalette,
        title: bootMeta.meta?.title?.trim() || `World: ${worldName}`,
        landmarks: (bootMeta.meta?.landmarks ?? []).map((l) => ({
          ...l,
          found: discovery.isFound(l.name),
        })),
        tour: route ?? [],
      });
    };

    // Escape pause menu: losing pointer lock in-game (Esc, alt-tab) opens it. The lock-loss
    // event is the only Escape signal the page gets — the browser reserves the key while
    // locked. Programmatic unlocks (inventory `I`) and already-open dialogs skip it.
    let pauseBusy = false;
    const openPauseMenu = async (): Promise<void> => {
      pauseBusy = true;
      worldMap.close(); // the pause dialog owns the screen
      // The dialog scrim dims the scene itself; hide the click-to-play overlay text behind it.
      overlay?.style.setProperty('visibility', 'hidden');
      try {
        const action = await ui.showPauseDialog({
          title: activeMeta?.title?.trim() || `World: ${worldName}`,
          volume: audio.volume,
          muted: audio.muted,
          onVolume: (v) => {
            audio.setVolume(v);
            audio.playTick(); // audible feedback while dragging
            ui.setSoundUi(audio.volume, audio.muted);
          },
          onMute: (m) => {
            audio.setMuted(m);
            ui.setSoundUi(audio.volume, audio.muted);
          },
          viewBob: viewBobOn,
          onViewBob: (on) => setViewBob(on),
          onShare: () => {
            void (async () => {
              // Fresh meta (dev setMeta can change it after boot) + the live delta map, so
              // the export never waits on (or races) the debounced persistence flush.
              const meta = (await store.loadMeta().catch(() => undefined)) ?? bootMeta.meta;
              const json = exportWorldJson(meta, manager.allDeltas());
              const blob = new Blob([json], { type: 'application/json' });
              const link = document.createElement('a');
              link.href = URL.createObjectURL(blob);
              link.download = exportFileName(meta?.title, worldName);
              link.click();
              window.setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
              setStatus('World copy downloaded — import it from the menu on any device');
            })();
          },
        });
        if (action === 'resume') {
          // Chrome enforces a ~1.25s cooldown after an Escape-exit; when the request is
          // rejected the click-to-play overlay is already back up, so a click resumes.
          const request = canvas.requestPointerLock() as Promise<void> | undefined;
          void request?.catch(() => {});
        } else if (action === 'guide') {
          await openWorldInfo();
        } else if (action === 'worlds') {
          window.location.href = './';
        }
      } finally {
        overlay?.style.removeProperty('visibility');
        pauseBusy = false;
      }
    };
    const pauseListener = new AbortController();
    document.addEventListener(
      'pointerlockchange',
      () => {
        if (document.pointerLockElement === canvas) return;
        if (pauseBusy || ui.isInventoryOpen() || ui.isDialogOpen()) return;
        void openPauseMenu();
      },
      { signal: pauseListener.signal },
    );

    const selectionBox = new SelectionBox();
    selectionBox.attach((o) => renderer.add(o));
    const pasteGhost = new PasteGhost(mapPalette); // same block colors as the world map
    pasteGhost.attach((o) => renderer.add(o));

    // Visible player character, shown only in third-person view.
    const avatar = new PlayerAvatar(playerSkinId);
    avatarSkinTarget.current = avatar;
    avatar.attach((o) => renderer.add(o));
    // The avatar is the scene's only lit (MeshLambert) material — chunks, particles, weather,
    // critters, overlays and the sky are all unlit — so without any lights it rendered pure black
    // and every skin looked identical. A soft hemisphere fill plus a gentle key light give the
    // avatar readable form and let the skins show; nothing else in the scene responds to lights.
    const avatarFill = new HemisphereLight(0xffffff, 0x45484f, 2.2);
    const avatarKey = new DirectionalLight(0xffffff, 1.4);
    avatarKey.position.set(0.5, 1.0, 0.3);
    renderer.add(avatarFill);
    renderer.add(avatarKey);

    // Interaction ray: origin at the player's eye, direction from yaw/pitch. Used for every
    // break/place/toggle/builder aim so reach stays anchored to the head, not the render camera
    // (which sits behind the player in third-person).
    const aimRay = (): { origin: Vec3; dir: Vec3 } => ({
      origin: player.eye(),
      dir: lookDirectionFromYawPitch(rig.yaw, rig.pitch),
    });

    const builderAim = (): import('../edit/VoxelRaycast').VoxelRaycastHit | undefined => {
      const { origin, dir } = aimRay();
      return raycastVoxels(previewSampler, origin, dir, getReach());
    };

    /** Paste origin (min corner) = the aim-adjacent empty cell, shifted by the dialed-in nudge. */
    const pasteOrigin = (): { x: number; y: number; z: number } | undefined => {
      const aim = builderAim();
      return aim ? builder.applyNudge(aim.adjacent) : undefined;
    };

    /** Preload the chunks under a world XZ box; on the manager's over-size throw, warn and signal abort. */
    const preloadOrWarn = (minX: number, minZ: number, maxX: number, maxZ: number): boolean => {
      try {
        manager.preloadBox(minX, minZ, maxX, maxZ);
        return true;
      } catch {
        setStatus('Selection too large to load');
        return false;
      }
    };

    const handleBuilderIntent = (intent: BuilderIntent): void => {
      const box = builder.selectionBox();
      switch (intent) {
        case 'toggleMode':
          builder.toggleMode();
          setStatus(builder.mode === 'off' ? 'Build mode off' : 'Build mode: pick two corners');
          return;
        case 'cancel': {
          const msg = builder.mode === 'pasting' ? 'Left paste mode' : 'Selection cleared';
          if (builder.mode === 'pasting') builder.exitPaste();
          else builder.clearSelection();
          setStatus(msg);
          return;
        }
        case 'fill':
          if (!box) return void setStatus('Select two corners first');
          if (!preloadOrWarn(box.x1, box.z1, box.x2, box.z2)) return;
          run(fillBox(box, inventory.selectedBlock), 'Filled');
          return;
        case 'clear':
          if (!box) return void setStatus('Select two corners first');
          if (!preloadOrWarn(box.x1, box.z1, box.x2, box.z2)) return;
          run(clearBox(box), 'Cleared');
          return;
        case 'replace': {
          if (!box) return void setStatus('Select two corners first');
          const aim = builderAim();
          if (!aim) return void setStatus('Aim at the block type to replace');
          if (!preloadOrWarn(box.x1, box.z1, box.x2, box.z2)) return;
          run(
            replaceVoxels(
              (x, y, z) => manager.getBlock(x, y, z),
              box,
              aim.id,
              inventory.selectedBlock,
            ),
            'Replaced',
          );
          return;
        }
        case 'copy': {
          if (!box) return void setStatus('Select two corners first');
          if (!preloadOrWarn(box.x1, box.z1, box.x2, box.z2)) return;
          let clip;
          try {
            clip = captureRegion(
              (x, y, z) => manager.getBlock(x, y, z),
              box,
              orientedStateReader(
                (x, y, z) => manager.getBlock(x, y, z),
                (x, y, z) => manager.getState(x, y, z),
                (id) => registry.hasFacing(id),
              ),
            );
          } catch {
            setStatus('Selection too large to copy');
            return;
          }
          if (clip.blocks.length === 0)
            return void setStatus('Nothing to copy (selection is empty)');
          builder.setClipboard(clip);
          setStatus(`Copied ${clip.blocks.length} block(s) — aim and click to paste`);
          return;
        }
        case 'rotateCW':
          builder.rotate(1);
          setStatus(`Rotated (${builder.transform.turns * 90}°)`);
          return;
        case 'rotateCCW':
          builder.rotate(-1);
          setStatus(`Rotated (${builder.transform.turns * 90}°)`);
          return;
        case 'mirror': {
          const f = aimRay().dir;
          builder.mirrorAxis(dominantHorizontalAxis(f.x, f.z));
          setStatus('Mirrored');
          return;
        }
        case 'arrayInc':
        case 'arrayDec': {
          const f = aimRay().dir;
          builder.arrayAdjust(intent === 'arrayInc' ? 1 : -1, dominantHorizontalAxis(f.x, f.z));
          setStatus(`Array x${builder.transform.arrayCount}`);
          return;
        }
        case 'nudgeReset':
          if (builder.mode !== 'pasting') return;
          builder.resetNudge();
          setStatus('Nudge reset');
          return;
        default: {
          const delta = nudgeDelta(intent);
          if (delta && builder.mode === 'pasting') {
            builder.nudgeBy(...delta);
            const { x, y, z } = builder.nudge;
            setStatus(
              `Nudge: ${x >= 0 ? '+' : ''}${x}X ${y >= 0 ? '+' : ''}${y}Y ${z >= 0 ? '+' : ''}${z}Z`,
            );
          }
          return;
        }
      }
    };

    // Placement-ghost visibility (the green preview cube). Toggled with V; persisted across reloads.
    let showGhost = true;
    try {
      showGhost = localStorage.getItem('vr.placementGhost') !== 'off';
    } catch {
      /* localStorage unavailable (e.g. private mode) — default to showing the ghost */
    }

    // Headlamp: camera-centered shader glow for cave roaming. Toggled with L; persisted
    // across reloads. Dev toggles (__vr.headlamp) skip persistence so agent capture tabs
    // don't leave the lamp on for the next session.
    let headlampOn = false;
    try {
      headlampOn = localStorage.getItem('vr.headlamp') === 'on';
    } catch {
      /* localStorage unavailable — default to off */
    }
    const setHeadlamp = (on: boolean, persist: boolean): void => {
      headlampOn = on;
      applyHeadlamp(chunkMaterials, on);
      if (!persist) return;
      try {
        localStorage.setItem('vr.headlamp', on ? 'on' : 'off');
      } catch {
        /* ignore persistence failure */
      }
    };
    applyHeadlamp(chunkMaterials, headlampOn);

    // Register all input listeners through a single AbortController.
    const abortInput = registerInputListeners({
      canvas,
      rig,
      manager,
      inventory,
      registry,
      edit,
      previewDeps,
      aim: aimRay,
      callbacks: {
        onStatusChange: setStatus,
        onToolChange: setTool,
        onHotbarRender: () => renderHotbar(),
        onInventoryToggle: (open) => ui.setInventoryOpen(open),
        isInventoryOpen: () => ui.isInventoryOpen(),
        onRun: run,
        getAnchor: () => anchorVoxel,
        setAnchor: (v) => {
          anchorVoxel = v;
        },
        getTool: () => tool,
        getTunnelConfig: () => tunnelConfig,
        intersectsPlayer: (x, y, z) => voxelIntersectsPlayer(x, y, z, player.position, PLAYER_HALF),
        getBuildMode: () => builder.mode,
        getExperienceMode: () => experience,
        onEnterBuild: () => {
          applyExperience('build');
          setStatus('Build mode — I inventory, T tools, B build tools');
        },
        onBuilderIntent: handleBuilderIntent,
        onBuilderClick: (hit) => {
          if (builder.mode === 'selecting') {
            builder.setCorner(hit.block);
            const b = builder.selectionBox();
            if (b) {
              const [sx, sy, sz] = boxDims(b);
              setStatus(`Selection ${sx}×${sy}×${sz} (${sx * sy * sz} blocks)`);
            } else {
              setStatus('Pick the opposite corner');
            }
            return;
          }
          if (builder.mode === 'pasting') {
            const p = builder.transformedClipboard();
            if (!p) return;
            const origin = builder.applyNudge(hit.adjacent);
            if (
              !preloadOrWarn(origin.x, origin.z, origin.x + p.dims[0] - 1, origin.z + p.dims[2] - 1)
            )
              return;
            run(prefabToVoxels(p, origin.x, origin.y, origin.z), 'Pasted');
          }
        },
        onToggleGhost: () => {
          showGhost = !showGhost;
          try {
            localStorage.setItem('vr.placementGhost', showGhost ? 'on' : 'off');
          } catch {
            /* ignore persistence failure */
          }
          setStatus(`Placement ghost ${showGhost ? 'on' : 'off'}`);
        },
        onToggleHeadlamp: () => {
          setHeadlamp(!headlampOn, true);
          setStatus(`Headlamp ${headlampOn ? 'on' : 'off'}`);
        },
        onCycleHand: () => cycleHandMode(),
        onToggleMap: toggleWorldMap,
        onToggleView: () => {
          const next = rig.toggleMode();
          setStatus(next === 'third' ? 'Third-person view (F1)' : 'First-person view (F1)');
        },
        onReachChange: (reach) => {
          try {
            saveReach(localStorage, reach);
          } catch {
            /* ignore persistence failure */
          }
          ui.setReachValue(reach);
          setStatus(`Build reach: ${reach} blocks`);
        },
      },
    });

    // Dev-only roam profiler + scripted-roam driver (P0); set in the DEV block below.
    let devProfiler: FrameProfiler | undefined;
    let devRoam: RoamDriver | undefined;

    const governor = new ViewDistanceGovernor(
      { minVd: MIN_VIEW_DISTANCE, maxVd: MAX_VIEW_DISTANCE },
      VIEW_DISTANCE,
    );
    let burstActive = true;
    let loadingElapsed = 0;
    let fogInitialized = false;
    let settlePending = usingDefaultSpawn;
    let smoothEyeY = player.eye().y; // eased eye height so stair/ledge step-ups don't snap the view
    // View bob: on by default, toggleable from the pause menu (motion-sickness opt-out).
    let viewBobOn = true;
    try {
      viewBobOn = localStorage.getItem('vr.viewBob') !== 'off';
    } catch {
      /* localStorage unavailable — keep the default */
    }
    const setViewBob = (on: boolean): void => {
      viewBobOn = on;
      try {
        localStorage.setItem('vr.viewBob', on ? 'on' : 'off');
      } catch {
        /* ignore persistence failure */
      }
    };
    let bobPhase = 0;
    let bobAmp = 0;
    // Previous horizontal position, so the avatar's walk cycle can be driven by ground covered.
    let avatarPrevX = player.position.x;
    let avatarPrevZ = player.position.z;

    // Stable per-frame callbacks, hoisted so the render loop allocates no closures each frame.
    const isSolidOrWater = (x: number, y: number, z: number): boolean =>
      manager.isSolid(x, y, z) || manager.isWater(x, y, z);
    const getBlockAt = (x: number, y: number, z: number): number => manager.getBlock(x, y, z);
    const critterEnv = { getBlock: getBlockAt, player: player.position };

    bootStats.end('systems+ui');
    // Report hook for scripts/benchmarks (all builds; overwritten by the next boot).
    (window as typeof window & { __vrBootStats?: () => BootReport }).__vrBootStats = () =>
      bootStats.report();

    renderer.start((dt) => {
      bootStats.event('first-frame');
      const cdt = Math.min(dt, MAX_DT);
      if (import.meta.env.DEV) devRoam?.step(cdt);
      daynight.advance(cdt);
      if (!scrubbingTime) ui.setTimeUi(daynight.time); // keep the slider tracking the day cycle
      celestial.update(daynight.time, renderer.camera.position);
      player.update(cdt, rig.getInput(), rig.yaw, sampler);

      // Sprint feedback: ease the FOV out while sprinting and back on release.
      const targetFov = BASE_FOV + (player.sprinting ? SPRINT_FOV_KICK : 0);
      if (Math.abs(renderer.camera.fov - targetFov) > 0.05) {
        renderer.camera.fov += (targetFov - renderer.camera.fov) * Math.min(1, cdt * 8);
        renderer.camera.updateProjectionMatrix();
      }
      const eye = player.eye();
      // Ease the camera up small step-ups (stairs/ledges) instead of snapping a full block; snap
      // for jumps, falls, flying, and teleports so those stay responsive.
      const stepDy = eye.y - smoothEyeY;
      if (player.grounded && stepDy > 0 && stepDy < 1.3) {
        smoothEyeY = Math.min(eye.y, smoothEyeY + STEP_EYE_SPEED * cdt);
      } else {
        smoothEyeY = eye.y;
      }
      const viewEye = { x: eye.x, y: smoothEyeY, z: eye.z };
      const avatarDh = Math.hypot(player.position.x - avatarPrevX, player.position.z - avatarPrevZ);
      avatarPrevX = player.position.x;
      avatarPrevZ = player.position.z;
      // View bob: stride-driven sway while walking on the ground, first-person only. The
      // amplitude eases in/out so starts and stops never snap the camera; phase advances by
      // ground covered, so bob speed tracks walk vs sprint automatically.
      const bobTarget =
        viewBobOn && player.grounded && rig.mode === 'first' && avatarDh > 0.0005 ? 1 : 0;
      bobAmp += (bobTarget - bobAmp) * Math.min(1, cdt * 8);
      let bobY = 0;
      if (bobAmp > 0.002) {
        bobPhase += avatarDh * 1.7;
        const lateral = Math.cos(bobPhase) * 0.022 * bobAmp;
        bobY = Math.sin(bobPhase * 2) * 0.042 * bobAmp;
        viewEye.y += bobY;
        viewEye.x += Math.cos(rig.yaw) * lateral;
        viewEye.z += -Math.sin(rig.yaw) * lateral;
      }
      // Third-person: trail the camera behind the eye, pulled in short of any wall it would clip.
      let thirdDistance = THIRD_PERSON_DISTANCE;
      if (rig.mode === 'third') {
        const look = lookDirectionFromYawPitch(rig.yaw, rig.pitch);
        thirdDistance = clipCameraDistance(
          (x, y, z) => manager.isSolid(x, y, z),
          eye,
          { x: -look.x, y: -look.y, z: -look.z },
          THIRD_PERSON_DISTANCE,
        );
      }
      rig.applyPlayerView(viewEye, thirdDistance);
      // First-person hand: the block cube shows in build mode only (play mode reads as
      // scenery, not a toolbar), but cosmetic tools may roam in play mode too.
      heldBlock.setBlock(inventory.selectedBlock);
      const handAllowed = handModeId === 'block' ? experience === 'build' : true;
      heldBlock.update(cdt, {
        visible: rig.mode === 'first' && handAllowed && rig.locked && !ui.isInventoryOpen(),
        yaw: rig.yaw,
        pitch: rig.pitch,
        bobY,
      });
      avatar.update(player.position, rig.yaw, rig.mode === 'third', { dh: avatarDh, dt: cdt });
      const move = movementSounds.update(
        cdt,
        player.position.x,
        player.position.y,
        player.position.z,
        player.grounded,
      );
      if (move.stepped || move.landed > 0) {
        // Feet sit 0.9 below body center; sample just beneath them for the surface material.
        const surface = familyOf(
          manager.getBlock(
            Math.floor(player.position.x),
            Math.floor(player.position.y - 0.95),
            Math.floor(player.position.z),
          ),
        );
        if (move.landed > 0) {
          audio.playLanding(move.landed);
          if (surface) audio.playBlock(surface, 'step', move.landed);
        } else if (surface) {
          audio.playBlock(surface, 'step');
        }
      }
      particles.update(cdt);

      // Ambience: weather cycle, precipitation, animated shaders, underwater fog/audio.
      animTime += cdt;
      applyTime(chunkMaterials, animTime);
      const rolled = weatherClock.advance(cdt);
      if (rolled !== undefined) weather.setKind(rolled);
      // Drops die on solids *and* water surfaces — rain must not streak through lakes.
      weather.update(cdt, eye, isSolidOrWater);
      const skyNow = skyState(daynight.time);
      ambientLife.update(cdt, eye, skyNow.daylight, getBlockAt);
      ticker.update(cdt);
      critters.update(cdt, eye, critterEnv);
      audio.setRainLevel(RAIN_LEVEL[weather.kind]);
      const submerged = manager.isWater(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
      underwaterFactor = stepUnderwaterFactor(underwaterFactor, submerged, cdt);
      const fogRange = fogRangeFor(manager.viewDistance * CHUNK_SIZE_X);
      const surfaceFog: FogParams = {
        // Source the surface fog from the sky model, not scene.background: the background stores
        // color-managed (linear) components, and reading it back would feed linear values into
        // the raw fog uniforms and re-ingest the previous frame's flash/underwater writes.
        color: [skyNow.sky[0] / 255, skyNow.sky[1] / 255, skyNow.sky[2] / 255],
        near: fogRange.near,
        far: fogRange.far,
      };
      applyUnderwater(chunkMaterials, renderer.scene, surfaceFog, underwaterFactor);
      weather.applyFlash(chunkMaterials, renderer.scene);
      audio.setUnderwater(underwaterFactor > 0.5);

      manager.update(
        worldToChunkCoord(Math.floor(player.position.x)),
        worldToChunkCoord(Math.floor(player.position.z)),
      );
      // Cold-start burst: once the first fill drains, settle to the smooth-roam budgets.
      if (burstActive && !manager.streaming) {
        burstActive = false;
        manager.setStreamingBudgets(GEN_BUDGET, MESH_BUDGET, FRAME_WORK_MS);
        ui.setLoadingHud(undefined);
        bootStats.event('streamed');
        if (import.meta.env.DEV) console.info('[vr] boot', bootStats.report());
      }
      // Streaming status: honest progress while the first ring fills (delayed slightly so
      // fast loads never flash a banner). Percent is capped — the last chunks are the sort
      // tail, and 100% would linger.
      if (burstActive) {
        loadingElapsed += cdt;
        if (loadingElapsed > 0.35) {
          const pct = Math.min(
            99,
            Math.round((100 * manager.loadedChunkCount()) / manager.desiredChunkCount()),
          );
          ui.setLoadingHud(`Building ${worldTitle ?? 'the world'} — ${pct}%`);
        }
      }

      // Enter the world on the ground: the default spawn hovers while chunks stream in. As
      // soon as the spawn column has real terrain, drop a player who is still hovering near
      // spawn onto it and start walking (Minecraft-style) instead of a debug fly camera.
      // (Unloaded chunks read solid at the world ceiling, which fails the <= check, so this
      // keeps retrying until the column is actually generated.)
      if (settlePending) {
        if (
          !player.flying ||
          Math.abs(player.position.x - SPAWN.x) >= 4 ||
          Math.abs(player.position.z - SPAWN.z) >= 4
        ) {
          settlePending = false; // the player took over (flew away or toggled fly)
        } else {
          const groundY = groundSpawnY(
            (x, y, z) => manager.isSolid(x, y, z),
            Math.floor(player.position.x),
            Math.floor(player.position.z),
            WORLD_HEIGHT,
            0.9, // player half-height (feet sit 0.9 below body center)
          );
          if (groundY !== undefined && groundY <= player.position.y) {
            player.position.y = groundY + 0.001;
            player.flying = false;
            settlePending = false;
            bootStats.event('spawn-settled');
          }
        }
      }

      // Set fog for the initial radius on the first frame (before the first render).
      if (!fogInitialized) {
        fogInitialized = true;
        applyFogRange(chunkMaterials, manager.viewDistance * CHUNK_SIZE_X);
      }

      // Adaptive view distance (targets ~60fps); retune fog to the new boundary on change.
      const nextVd = governor.sample(cdt * 1000, manager.streaming);
      if (nextVd !== undefined) {
        manager.setViewDistance(nextVd);
        applyFogRange(chunkMaterials, nextVd * CHUNK_SIZE_X);
      }
      if (import.meta.env.DEV) {
        devProfiler?.push({ frameMs: cdt * 1000, ...manager.lastFrameStats });
      }
      if (builder.mode !== 'off' && rig.locked && !ui.isInventoryOpen()) {
        targetOverlay.update(undefined, false);
        selectionBox.update(builder.selectionBox(), true);
        if (builder.mode === 'pasting') {
          pasteGhost.update(
            builder.transformedClipboard(),
            pasteOrigin(),
            true,
            builder.clipboardRevision,
          );
        } else {
          pasteGhost.update(undefined, undefined, false);
        }
      } else {
        selectionBox.update(undefined, false);
        pasteGhost.update(undefined, undefined, false);
        // Play mode: no targeting outline/ghost — the world reads as scenery, not edit targets.
        const previewOn = rig.locked && !ui.isInventoryOpen() && experience === 'build';
        if (previewOn) {
          const aimHere = aimRay();
          const previewHit = raycastVoxels(previewSampler, aimHere.origin, aimHere.dir, getReach());
          targetOverlay.update(
            previewHit
              ? resolveTarget(previewHit, inventory.selectedBlock, rig.yaw, previewDeps)
              : undefined,
            true,
            showGhost,
          );
        } else {
          targetOverlay.update(undefined, false);
        }
      }
      // Tour HUD: live distance to the active waypoint, advancing (and finishing) on arrival.
      updateTour();
      tickDiscovery(cdt);
      sink.sortTransparent({ x: renderer.camera.position.x, z: renderer.camera.position.z });
    });

    // Dev-only frame capture + roam/capture controls (window.__vr).
    // Dynamically imported so the whole module — and its html2canvas dependency —
    // is excluded from production builds.
    let hudTeardown: (() => void) | undefined;
    if (import.meta.env.DEV) {
      const [{ FrameProfiler }, { RoamDriver }] = await Promise.all([
        import('./FrameProfiler'),
        import('./RoamBench'),
      ]);
      const profiler = new FrameProfiler();
      const roam = new RoamDriver(player);
      devProfiler = profiler;
      devRoam = roam;

      const devContext = {
        renderer,
        player,
        rig,
        manager,
        edit,
        inventory,
        registry,
        daynight,
        celestial,
        preset,
        worldName,
        profiler,
        roam,
        headlamp: (on: boolean) => setHeadlamp(on, false),
        hand: (mode?: string) => {
          if (mode !== undefined) applyHandMode(mode, false);
          return handModeId;
        },
        // Headless tour driving: rAF is suspended in hidden capture tabs, so agents step the
        // same loop path (`tick`) after moving the player.
        tour: { start: startTour, end: () => endTour('Tour ended'), tick: updateTour },
        // Optional dt steps the swarm once headlessly (hidden capture tabs suspend rAF).
        life: (dtSeconds?: number) => {
          if (dtSeconds && dtSeconds > 0) {
            const e = player.eye();
            ambientLife.update(dtSeconds, e, skyState(daynight.time).daylight, (x, y, z) =>
              manager.getBlock(x, y, z),
            );
          }
          return ambientLife.census();
        },
        // Optional dt steps the critters once headlessly (hidden capture tabs suspend rAF).
        critters: (dtSeconds?: number) => {
          if (dtSeconds && dtSeconds > 0) {
            critters.update(dtSeconds, player.eye(), {
              getBlock: (x, y, z) => manager.getBlock(x, y, z),
              player: player.position,
            });
          }
          return critters.census();
        },
        // Headless block-physics driving (hidden tabs suspend rAF): tick advances the sim clock.
        flow: {
          queued: () => ticker.queued,
          tick: (dtSeconds = 0.2) => {
            ticker.update(dtSeconds);
            return ticker.queued;
          },
        },
        // Pins the weather for testing/captures ('auto' resumes the natural cycle). Routes through
        // applyWeatherMode so dev-console changes keep the HUD button in sync.
        weather: (kind: WeatherKind | 'auto') => {
          applyWeatherMode(kind);
          return weather.kind;
        },
        // Wraps the engine so dev-console changes keep the HUD controls in sync.
        audio: {
          setMuted: (m: boolean) => {
            audio.setMuted(m);
            ui.setSoundUi(audio.volume, audio.muted);
          },
          setVolume: (v: number) => {
            audio.setVolume(v);
            ui.setSoundUi(audio.volume, audio.muted);
          },
          get muted() {
            return audio.muted;
          },
          get volume() {
            return audio.volume;
          },
        },
      };
      void import('./DevControls').then((m) => m.installDevControls(devContext));
      void import('./DevHud').then((m) => {
        hudTeardown = m.installDevHud({
          player,
          rig,
          manager,
          inventory,
          registry,
          preset,
          worldName,
          profiler,
        });
      });
    }

    /** Releases all resources acquired during boot. */
    function cleanup(): void {
      abortInput();
      pauseListener.abort();
      worldMap.dispose();
      meshPool?.dispose();
      genPool?.dispose();
      audio.dispose();
      persistence.dispose();
      hudTeardown?.();
      celestial.dispose();
      avatar.dispose();
      weather.dispose();
      ambientLife.dispose();
      critters.dispose();
      particles.dispose();
      selectionBox.dispose();
      pasteGhost.dispose();
      heldBlock.dispose();
      tourMarker.dispose();
      targetOverlay.dispose();
      sink.disposeAll();
      mipTexture.dispose(); // sink.disposeAll frees the crisp base; free its mipmapped sibling too
      renderer.dispose();
      rig.dispose();
    }

    return cleanup;
  }
}
