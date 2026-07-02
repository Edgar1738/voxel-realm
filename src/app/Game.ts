import { Color } from 'three';
import { Renderer } from '../render/Renderer';
import { createTextureArray } from '../render/TextureArray';
import {
  createChunkMaterial,
  createTransparentMaterial,
  createCutoutMaterial,
  applyTime,
} from '../render/ChunkMaterial';
import { applyUnderwater, stepUnderwaterFactor, type FogParams } from '../render/underwater';
import { Weather } from '../render/Weather';
import { AmbientLife } from '../render/AmbientLife';
import { skyState } from '../render/Sky';
import { WeatherClock, type WeatherKind } from './weatherSchedule';
import { DayNight } from '../render/DayNight';
import { CelestialSky } from '../render/CelestialSky';
import { ChunkMeshRegistry } from '../render/ChunkMeshRegistry';
import { CameraRig } from '../render/CameraRig';
import { ChunkManager } from '../world/ChunkManager';
import { createGenerator, resolveBootPreset, type WorldPreset } from '../worldgen/Presets';
import { GreedyMesher } from '../mesh/GreedyMesher';
import { BlockRegistry } from '../blocks/BlockRegistry';
import { PlayerController } from '../player/PlayerController';
import type { SoliditySampler } from '../player/Collision';
import { EditService } from '../edit/EditService';
import { CreativeInventory } from './CreativeInventory';
import { createCreativeUi, type DialogAction } from './CreativeUi';
import { IndexedDbSaveStore } from '../persistence/IndexedDbSaveStore';
import { ServerSaveStore } from '../persistence/ServerSaveStore';
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
import { applyFogRange } from '../render/fog';
import { applyHeadlamp } from '../render/headlamp';
import type { Vec3, WorldSeed, BlockId } from '../core/types';
import type { SetVoxel, VoxelChange } from '../edit/EditTypes';
import { createPersistence } from './persistence';
import { loadBootMeta, initializeBootSave } from './saveBootstrap';
import { withinEditCap, MAX_EDIT_VOXELS } from './editCap';
import { registerInputListeners, TOOLS, toolLabel, REACH, type Tool } from './input';
import { placementState } from './placement';
import type { PreviewDeps } from './targetPreview';
import { resolveTarget } from './targetPreview';
import { raycastVoxels } from '../edit/VoxelRaycast';
import { TargetOverlay } from '../render/TargetOverlay';
import type { FrameProfiler } from './FrameProfiler';
import type { RoamDriver } from './RoamBench';
import { resolveSpawn, parseSpawnOverrides, clampSpawnY, groundSpawnY } from './bootSpawn';
import { initialExperienceMode, isCuratedWorld, type ExperienceMode } from './experienceMode';
import { tourRoute, tourTick, tourStep } from './tour';
import { BuilderState } from './BuilderState';
import type { BuilderIntent } from './builderInput';
import { dominantHorizontalAxis } from './builderInput';
import { SelectionBox } from '../render/SelectionBox';
import { PasteGhost } from '../render/PasteGhost';
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
} from './RegionOps';
import {
  ServerBlueprintStore,
  LocalStorageBlueprintStore,
  type BlueprintStore,
} from './BlueprintStore';
import type { Prefab } from '../core/Prefab';
import {
  cottage,
  well,
  lampPost,
  ruinedTower,
  barn,
  watchtower,
  marketStall,
  brokenWall,
  bridge,
  farmPlot,
} from '../worldgen/prefabs';

/** Built-in structures offered read-only in the blueprint dialog alongside saved blueprints. */
const CURATED_BLUEPRINTS: Record<string, () => Prefab> = {
  cottage,
  well,
  'lamp-post': lampPost,
  'ruined-tower': ruinedTower,
  barn,
  watchtower,
  'market-stall': marketStall,
  'broken-wall': brokenWall,
  bridge,
  'farm-plot': farmPlot,
};

const SEED: WorldSeed = 1337;
const SPAWN: Vec3 = { x: 8, y: 100, z: 8 }; // start flying above origin while chunks load
const MAX_DT = 0.05; // clamp to keep collision substeps sane on frame drops

/** Composition root: a player flying/walking and sculpting the streamed voxel world. */
export class Game {
  /**
   * Boots the game and returns a cleanup function.
   * The returned cleanup disposes all resources: render loop, listeners, persistence, HUD.
   */
  static async boot(canvas: HTMLCanvasElement): Promise<() => void> {
    const registry = new BlockRegistry();
    const renderer = new Renderer(canvas);
    const texture = createTextureArray();
    const material = createChunkMaterial(texture);
    const transparentMaterial = createTransparentMaterial(texture);
    const cutoutMaterial = createCutoutMaterial(texture);
    const chunkMaterials = [material, transparentMaterial, cutoutMaterial];
    const daynight = new DayNight(renderer.scene, chunkMaterials);
    const celestial = new CelestialSky(renderer.scene);

    // Load the durable save (or start fresh / discard an incompatible one).
    // Shared storage in dev (server-owned, named worlds via ?save=); IndexedDB in production.
    const worldName = worldNameFromSearch(window.location.search);
    let store: SaveStore = import.meta.env.DEV
      ? new ServerSaveStore(worldName, (id) => registry.has(id))
      : new IndexedDbSaveStore();
    const bootMeta = await loadBootMeta(store);
    store = bootMeta.store;

    // Pick the world environment. An explicit `?world=` wins; otherwise an existing save keeps its
    // own stored preset, so a bare `?save=<name>` can't mismatch the generator and wipe the world.
    const requested = new URLSearchParams(window.location.search).get('world');
    const preset: WorldPreset = resolveBootPreset(requested, bootMeta.meta);
    const { generator, overlays } = createGenerator(preset);

    const bootSave = await initializeBootSave(bootMeta, SEED, SAVE_VERSION, preset);
    store = bootSave.store;
    const savedDeltas: WorldDeltas = bootSave.savedDeltas;

    const sink = new ChunkMeshRegistry(
      renderer.scene,
      material,
      transparentMaterial,
      cutoutMaterial,
      texture,
    );
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
      },
      savedDeltas,
    );

    // Debounced per-chunk persistence.
    const persistence = createPersistence(store, manager);
    manager.onChunkDeltaChanged = (key) => persistence.scheduleFlush(key);

    const overlay = document.getElementById('overlay') ?? undefined;
    // Curated worlds can carry their own spawn/look in meta; a URL override wins for debugging.
    const spawnOverrides = parseSpawnOverrides(window.location.search);
    const spawnState = clampSpawnY(
      resolveSpawn(bootMeta.meta, spawnOverrides, {
        spawn: SPAWN,
        look: { yaw: 0, pitch: 0 },
      }),
      WORLD_HEIGHT,
    );
    // Only the fixed default spawn hovers waiting for terrain; curated/overridden spawns are
    // intentional vantage points and must not be settled onto the ground.
    const usingDefaultSpawn =
      spawnOverrides.spawn === undefined && bootMeta.meta?.spawn === undefined;
    const player = new PlayerController(spawnState.spawn, true);
    const sampler: SoliditySampler & { isWater(x: number, y: number, z: number): boolean } = {
      collisionBoxes: (x: number, y: number, z: number) => manager.collisionBoxesAt(x, y, z),
      isWater: (x: number, y: number, z: number) => manager.isWater(x, y, z),
    };

    const edit = new EditService(manager);
    const inventory = new CreativeInventory();
    const audio = new AudioEngine();
    const movementSounds = new MovementSoundTracker();
    const particles = new BlockParticles();
    particles.attach((o) => renderer.add(o));

    // Ambience: weather cycles on its own clock; __vr.weather() pins a kind for testing.
    const weather = new Weather((intensity) => audio.playThunder(intensity));
    weather.attach((o) => renderer.add(o));
    const weatherClock = new WeatherClock();
    const ambientLife = new AmbientLife();
    ambientLife.attach((o) => renderer.add(o));
    const RAIN_LEVEL: Record<WeatherKind, number> = { clear: 0, rain: 0.6, storm: 1, snow: 0 };
    let underwaterFactor = 0;
    let animTime = 0;
    let tool: Tool = 'single';
    let anchorVoxel: { x: number; y: number; z: number } | undefined;

    const ui = createCreativeUi(registry, inventory, TOOLS, toolLabel, (t) => setTool(t as Tool));

    // Experience mode: curated worlds (title/description/spawn/look) open explore-first in
    // `play` (creative UI hidden, edit inputs gated in input.ts); `build` is full creative.
    const curated = isCuratedWorld(bootMeta.meta);
    let experience: ExperienceMode = initialExperienceMode(bootMeta.meta);
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
      ui.worldButton.textContent = `World: ${worldName}`;
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
      if (batch) playEditEffects(batch.changes);
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
      const choice = await ui.showBlueprintDialog({
        saved,
        curated: Object.keys(CURATED_BLUEPRINTS),
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
    const route = tourRoute(bootMeta.meta);
    let tourIndex: number | undefined;
    const endTour = (message: string): void => {
      tourIndex = undefined;
      ui.setTourHud(undefined);
      setStatus(message);
    };
    const startTour = (): void => {
      if (!route) return void setStatus('This world has no tour');
      tourIndex = 0;
      setStatus('Tour started — follow the marker distance');
    };
    ui.tourPrev.addEventListener('click', () => {
      if (route && tourIndex !== undefined) tourIndex = tourStep(route, tourIndex, -1);
    });
    ui.tourNext.addEventListener('click', () => {
      if (route && tourIndex !== undefined) tourIndex = tourStep(route, tourIndex, 1);
    });
    ui.tourEnd.addEventListener('click', () => endTour('Tour ended'));
    /** One tour tick: advance from the player position and refresh the HUD (loop + dev hook). */
    const updateTour = (): void => {
      if (!route || tourIndex === undefined) return;
      const s = tourTick(route, tourIndex, player.position.x, player.position.z);
      tourIndex = s.index;
      if (s.done) endTour(`Tour complete — ${s.name}`);
      else ui.setTourHud(s);
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
      const meta = bootMeta.meta;
      const action = await ui.showWorldInfoDialog({
        title: meta?.title?.trim() || `World: ${worldName}`,
        description: meta?.description ?? '',
        landmarks: (meta?.landmarks ?? []).map((l) => l.name),
        tourCount: meta?.tour?.length ?? 0,
      });
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

    const selectionBox = new SelectionBox();
    selectionBox.attach((o) => renderer.add(o));
    const pasteGhost = new PasteGhost();
    pasteGhost.attach((o) => renderer.add(o));

    const builderAim = (): import('../edit/VoxelRaycast').VoxelRaycastHit | undefined =>
      raycastVoxels(previewSampler, renderer.camera.position, rig.forward(), REACH);

    /** Paste origin (min corner) = the empty cell adjacent to the aimed face. */
    const pasteOrigin = (): { x: number; y: number; z: number } | undefined => {
      const aim = builderAim();
      return aim ? { x: aim.adjacent.x, y: aim.adjacent.y, z: aim.adjacent.z } : undefined;
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
          const f = rig.forward();
          builder.mirrorAxis(dominantHorizontalAxis(f.x, f.z));
          setStatus('Mirrored');
          return;
        }
        case 'arrayInc':
        case 'arrayDec': {
          const f = rig.forward();
          builder.arrayAdjust(intent === 'arrayInc' ? 1 : -1, dominantHorizontalAxis(f.x, f.z));
          setStatus(`Array x${builder.transform.arrayCount}`);
          return;
        }
        default:
          return;
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
      renderer,
      manager,
      inventory,
      registry,
      edit,
      previewDeps,
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
        getBuildMode: () => builder.mode,
        getExperienceMode: () => experience,
        onEnterBuild: () => {
          applyExperience('build');
          setStatus('Build mode — E inventory, T tools, B build tools');
        },
        onBuilderIntent: handleBuilderIntent,
        onBuilderClick: (hit) => {
          if (builder.mode === 'selecting') {
            builder.setCorner(hit.block);
            const b = builder.selectionBox();
            setStatus(b ? 'Selection set' : 'Pick the opposite corner');
            return;
          }
          if (builder.mode === 'pasting') {
            const p = builder.transformedClipboard();
            if (!p) return;
            const origin = { x: hit.adjacent.x, y: hit.adjacent.y, z: hit.adjacent.z };
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
    let fogInitialized = false;
    let settlePending = usingDefaultSpawn;

    renderer.start((dt) => {
      const cdt = Math.min(dt, MAX_DT);
      if (import.meta.env.DEV) devRoam?.step(cdt);
      daynight.advance(cdt);
      celestial.update(daynight.time, renderer.camera.position);
      player.update(cdt, rig.getInput(), rig.yaw, sampler);
      const eye = player.eye();
      rig.applyEye(eye.x, eye.y, eye.z);
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
      weather.update(cdt, eye, (x, y, z) => manager.isSolid(x, y, z) || manager.isWater(x, y, z));
      ambientLife.update(cdt, eye, skyState(daynight.time).daylight, (x, y, z) =>
        manager.getBlock(x, y, z),
      );
      audio.setRainLevel(RAIN_LEVEL[weather.kind]);
      const submerged = manager.isWater(Math.floor(eye.x), Math.floor(eye.y), Math.floor(eye.z));
      underwaterFactor = stepUnderwaterFactor(underwaterFactor, submerged, cdt);
      const skyBg = renderer.scene.background;
      const fogFar = Math.max(1, manager.viewDistance * CHUNK_SIZE_X);
      const surfaceFog: FogParams = {
        color: skyBg instanceof Color ? [skyBg.r, skyBg.g, skyBg.b] : [0.529, 0.725, 0.91],
        near: fogFar * 0.55,
        far: fogFar,
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
          pasteGhost.update(builder.transformedClipboard()?.dims, pasteOrigin(), true);
        } else {
          pasteGhost.update(undefined, undefined, false);
        }
      } else {
        selectionBox.update(undefined, false);
        pasteGhost.update(undefined, undefined, false);
        // Play mode: no targeting outline/ghost — the world reads as scenery, not edit targets.
        const previewOn = rig.locked && !ui.isInventoryOpen() && experience === 'build';
        if (previewOn) {
          const previewHit = raycastVoxels(
            previewSampler,
            renderer.camera.position,
            rig.forward(),
            REACH,
          );
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
        // Pins the weather for testing/captures ('auto' resumes the natural cycle).
        weather: (kind: WeatherKind | 'auto') => {
          if (kind === 'auto') {
            weatherClock.resume();
          } else {
            weatherClock.force(kind);
            weather.setKind(kind);
          }
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
      audio.dispose();
      persistence.dispose();
      hudTeardown?.();
      celestial.dispose();
      sink.disposeAll();
      renderer.dispose();
      rig.dispose();
    }

    return cleanup;
  }
}
