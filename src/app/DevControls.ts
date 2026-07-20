import type { Renderer } from '../render/Renderer';
import type { CameraRig } from '../render/CameraRig';
import type { PlayerController, InputState, PlayerWorld } from '../player/PlayerController';
import { simulateSteps, walkToward, makeInput, type WalkResult } from '../player/Simulate';
import type { ChunkManager } from '../world/ChunkManager';
import type { DayNight } from '../render/DayNight';
import type { CelestialSky } from '../render/CelestialSky';
import type { EditService } from '../edit/EditService';
import type { CreativeInventory } from './CreativeInventory';
import { CREATIVE_BLOCKS } from './CreativeInventory';
import type { BlockRegistry } from '../blocks/BlockRegistry';
import {
  applyVoxelsInBatches,
  buildTerrainPathVoxels,
  createMemoryBookmarks,
  type BatchedEditResult,
  type EditResult,
  type Pose,
  type TerrainPathOptions,
  type TerrainPathPoint,
} from './DevBuildTools';
import { collectDevState, type DevState } from './DevState';
import { DEV_HELP } from './devHelp';
import type { FrameProfiler, ProfilerSummary } from './FrameProfiler';
import { routeDistance, type RoamDriver } from './RoamBench';
import { frameBox } from './studioFraming';
import {
  lineVoxels,
  cylinderVoxels,
  pyramidVoxels,
  hollowBoxVoxels,
  octagonVoxels,
  ringVoxels,
  coneVoxels,
  hollowCylinderVoxels,
} from './DevShapes';
import { stairState, stairFacingToward, type StairFacing } from './stairFacing';
import { boxVoxels, sphereVoxels, tunnelVoxels } from '../edit/Brushes';
import { AIR } from '../blocks/blocks';
import { WORLD_HEIGHT } from '../core/constants';
import { chunkKey, worldToChunkCoord } from '../core/coords';
import type { BlockId, Vec3 } from '../core/types';
import type { EditOutcome, SetVoxel } from '../edit/EditTypes';
import type { NpcPoseState } from '../npc/NpcTypes';
import type { EquipmentLoadout } from '../character/Equipment';
import type { PlayerAnimationState } from '../render/PlayerAvatar';
import type { CharacterJointState, CharacterJointTransform } from '../character/CharacterRig';
import {
  listWorlds,
  copyWorld,
  deleteWorld,
  readWorldMeta,
  writeWorldMeta,
} from '../persistence/ServerWorldCatalog';
import type { WorldMeta } from '../persistence/SaveTypes';
import { mergeMeta, appendLandmark, auditWorldMeta } from './worldMeta';
import type { WorldPreset } from '../worldgen/Presets';
import {
  rotateY,
  mirror as mirrorPrefab,
  repeat,
  validatePrefab,
  type Prefab,
} from '../core/Prefab';
import { toggleOpen } from '../world/VoxelState';
import {
  replaceVoxels,
  prefabToVoxels,
  unloadedChunksInBox,
  captureRegion,
  orientedStateReader,
} from './RegionOps';

/**
 * Dev-only "roam studio" exposed as `window.__vr`: pose the camera, roam, build, capture, and
 * introspect the world headlessly. The live WebGL context hangs CDP screenshots, so capture
 * renders one frame and returns/writes a JPEG instead. Imported only under import.meta.env.DEV,
 * so none of this ships in production.
 */
export interface DevControlsContext {
  renderer: Renderer;
  player: PlayerController;
  rig: CameraRig;
  manager: ChunkManager;
  edit: EditService;
  inventory: CreativeInventory;
  registry: BlockRegistry;
  daynight: DayNight;
  celestial: CelestialSky;
  preset: WorldPreset;
  worldName: string;
  profiler: FrameProfiler;
  roam: RoamDriver;
  /** Toggles the headlamp shader glow (session-only; never touches localStorage). */
  headlamp: (on: boolean) => void;
  /** Gets (no arg) or sets the first-person hand mode; session-only, never persisted. */
  hand: (mode?: string) => string;
  /** Shared player/NPC equipment state and session-only mutations. */
  equipment: (target?: string) => EquipmentLoadout;
  equip: (target: string, slot: string, item: string) => EquipmentLoadout;
  unequip: (target: string, slot: string) => EquipmentLoadout;
  /** Local-player third-person animation inspection and manual playback. */
  playerAnimation: {
    list(): PlayerAnimationState;
    play(animationId: string): PlayerAnimationState;
    cycle(direction?: number): PlayerAnimationState;
    stop(): PlayerAnimationState;
  };
  /** Live pose-authoring surface shared by the player rig and articulated NPCs. */
  character: {
    player: {
      joints(): CharacterJointState[];
      joint(id: string, transform?: CharacterJointTransform): CharacterJointState;
      reset(): CharacterJointState[];
      exportPose(): Record<string, CharacterJointTransform>;
    };
    npc: {
      joints(npcId: string): CharacterJointState[];
      joint(npcId: string, id: string, transform?: CharacterJointTransform): CharacterJointState;
      reset(npcId: string): CharacterJointState[];
      exportPose(npcId: string): Record<string, CharacterJointTransform>;
    };
  };
  /** Play-mode tour HUD controls; `tick` steps the loop path once (hidden tabs suspend rAF). */
  tour?: { start(): void; end(): void; tick(): void };
  /** Authored NPC pose inspection and manual playback. */
  npc: {
    list(): NpcPoseState[];
    pose(npcId: string, poseId?: string): NpcPoseState;
    cycle(npcId: string, direction?: number): NpcPoseState;
    animate(npcId: string, animationId: string): NpcPoseState;
    cycleAnimation(npcId: string, direction?: number): NpcPoseState;
    stop(npcId: string): NpcPoseState;
  };
  /** Pins the weather ('auto' resumes the natural cycle); returns the active kind. */
  weather?: (kind: 'clear' | 'rain' | 'storm' | 'snow' | 'auto') => string;
  /** Live ambient-creature census; pass a dt to step the swarm once headlessly. */
  life?: (dtSeconds?: number) => Record<string, number>;
  /** Block-physics ticker introspection + headless stepping. */
  flow?: { queued(): number; tick(dtSeconds?: number): number };
  /** Critter census (birds/fish/rabbits); pass a dt to step them once headlessly. */
  critters?: (dtSeconds?: number) => Record<string, number>;
  /** Sound engine handle for the `sound` dev command. */
  audio: {
    setMuted(muted: boolean): void;
    setVolume(v: number): void;
    muted: boolean;
    volume: number;
  };
}

/** A portable structure: per-voxel [dx,dy,dz,id] offsets from the min corner (non-air only). */
export type Blueprint = Prefab;

type Html2Canvas = (
  el: HTMLElement,
  opts?: { backgroundColor?: string | null; scale?: number; logging?: boolean },
) => Promise<HTMLCanvasElement>;

const PITCH_LIMIT = Math.PI / 2 - 0.01;
const clampPitch = (p: number): number => Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, p));
const round = (v: number, decimals: number): number => Number(v.toFixed(decimals));

export function installDevControls(ctx: DevControlsContext): void {
  const {
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
  } = ctx;

  // Physics world for headless movement simulation (mirrors Game's live sampler).
  const playerWorld: PlayerWorld = {
    collisionBoxes: (x, y, z) => manager.collisionBoxesAt(x, y, z),
    isWater: (x, y, z) => manager.isWater(x, y, z),
    isClimbable: (x, y, z) => registry.isClimbable(manager.getBlock(x, y, z)),
    isBarrier: (x, y, z) => registry.isBarrier(manager.getBlock(x, y, z)),
  };

  const currentWorld = worldName;
  const gotoWorld = (name: string): void => {
    const u = new URL(window.location.href);
    u.searchParams.set('save', name);
    window.location.href = u.toString();
  };

  /** Read the current world's meta, apply `mutate`, and persist the complete result. */
  const patchMeta = async (mutate: (base: WorldMeta) => WorldMeta): Promise<WorldMeta> => {
    const current = await readWorldMeta(currentWorld);
    if (!current) {
      throw new Error(
        'Voxel Realm: world has no saved meta yet — make an edit so the save is written first',
      );
    }
    const next = mutate(current);
    await writeWorldMeta(currentWorld, next);
    return next;
  };

  // Push the current player eye + look into the camera so a teleport/aim is reflected
  // immediately on the next capture, independent of the rAF render loop's timing.
  const syncCamera = (): void => {
    const eye = player.eye();
    rig.applyEye(eye.x, eye.y, eye.z);
  };

  // Shared bench reporting: a headline (with portable totals) plus the full percentile table,
  // then best-effort copy the raw JSON to the clipboard. Used by both bench and benchRoute.
  const reportBench = async (headline: string, summary: ProfilerSummary): Promise<void> => {
    console.log(headline);
    console.table({
      framesSampled: summary.framesSampled,
      meanFps: round(summary.meanFps, 1),
      frameMsP50: round(summary.frameMs.p50, 2),
      frameMsP95: round(summary.frameMs.p95, 2),
      frameMsP99: round(summary.frameMs.p99, 2),
      frameMsMax: round(summary.frameMs.max, 2),
      updateMsP50: round(summary.updateMs.p50, 2),
      updateMsP95: round(summary.updateMs.p95, 2),
      updateMsMax: round(summary.updateMs.max, 2),
      totalGens: summary.totalGens,
      totalMeshes: summary.totalMeshes,
      peakGensPerFrame: summary.peakGensPerFrame,
      peakMeshesPerFrame: summary.peakMeshesPerFrame,
      longFrames16: summary.longFrames16,
      longFrames33: summary.longFrames33,
    });
    try {
      const write = navigator.clipboard?.writeText(JSON.stringify(summary, null, 2));
      if (write) {
        // Permissionless/headless browsers can leave clipboard promises pending forever.
        await Promise.race([
          write,
          new Promise<void>((resolve) => window.setTimeout(resolve, 250)),
        ]);
      }
    } catch {
      /* clipboard needs focus/permission; the returned + logged summary is the source of truth */
    }
  };

  const downscale = (src: HTMLCanvasElement, maxWidth: number): HTMLCanvasElement => {
    const scale = Math.min(1, maxWidth / src.width);
    const off = document.createElement('canvas');
    off.width = Math.max(1, Math.round(src.width * scale));
    off.height = Math.max(1, Math.round(src.height * scale));
    off.getContext('2d')?.drawImage(src, 0, 0, off.width, off.height);
    return off;
  };

  const renderToCanvas = (maxWidth: number): HTMLCanvasElement => {
    syncCamera();
    // Re-place the sun/moon/stars for the (possibly just-moved) camera before this one-off render,
    // since the rAF loop's update may be throttled in a headless/background tab.
    celestial.update(daynight.time, renderer.camera.position);
    // Headless preview tabs can report a 0×0 viewport, which yields a 0-sized canvas and an opaque
    // drawImage error downstream. Fall back to a sane size so capture still works.
    const el = renderer.domElement;
    if (!el.width || !el.height) {
      renderer.resize(
        Math.max(window.innerWidth || 0, 960),
        Math.max(window.innerHeight || 0, 540),
      );
    }
    renderer.renderOnce();
    if (!renderer.domElement.width || !renderer.domElement.height)
      throw new Error(
        'render canvas is 0×0 — resize the preview viewport (e.g. 1200×800) and retry',
      );
    return downscale(renderer.domElement, maxWidth);
  };

  const view = (maxWidth = 720, quality = 0.6): string =>
    renderToCanvas(maxWidth).toDataURL('image/jpeg', quality);

  let html2canvas: Html2Canvas | undefined;
  const shot = async (maxWidth = 720, quality = 0.65): Promise<string> => {
    const frame = renderToCanvas(maxWidth);
    try {
      if (!html2canvas) {
        const mod = await import(/* @vite-ignore */ 'https://esm.sh/html2canvas@1.4.1');
        html2canvas = mod.default;
      }
      const hud = document.getElementById('creative-ui');
      if (hud) {
        const rendered = await html2canvas(hud, { backgroundColor: null, logging: false });
        frame.getContext('2d')?.drawImage(rendered, 0, 0, frame.width, frame.height);
      }
    } catch (err) {
      console.warn('Voxel Realm: HUD composite failed, returning world-only frame', err);
    }
    return frame.toDataURL('image/jpeg', quality);
  };

  let lastSavedPath = '';
  /** Capture and write the JPEG to .captures/<name>.jpg via the dev server; returns the path. */
  const save = async (
    name = 'frame',
    opts: { hud?: boolean; maxWidth?: number; quality?: number } = {},
  ): Promise<string> => {
    const dataUrl = opts.hud
      ? await shot(opts.maxWidth ?? 960, opts.quality ?? 0.7)
      : view(opts.maxWidth ?? 960, opts.quality ?? 0.7);
    const res = await fetch('/__capture', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, dataUrl }),
    });
    if (!res.ok)
      throw new Error(`Voxel Realm: capture save failed (${res.status} ${res.statusText})`);
    const { path } = (await res.json()) as { path: string };
    lastSavedPath = path;
    return path;
  };

  const lookAt = (tx: number, ty: number, tz: number): void => {
    const eye = player.eye();
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    const horizontal = Math.hypot(dx, dz);
    rig.yaw = Math.atan2(-dx, -dz);
    rig.pitch = clampPitch(Math.atan2(dy, horizontal));
  };

  const MAX_BUILD = 50000;
  const applyBatch = (voxels: SetVoxel[]): EditResult => {
    if (voxels.length > MAX_BUILD)
      throw new Error(`build too large (${voxels.length} > ${MAX_BUILD})`);
    let outOfWorld = 0;
    let unloaded = 0;
    const unloadedChunkSet = new Set<string>();
    for (const v of voxels) {
      if (v.y < 0 || v.y >= WORLD_HEIGHT) outOfWorld++;
      else if (!manager.isLoaded(v.x, v.z)) {
        unloaded++;
        unloadedChunkSet.add(chunkKey(worldToChunkCoord(v.x), worldToChunkCoord(v.z)));
      }
    }
    const batch = edit.apply(voxels);
    const applied = batch ? batch.changes.length : 0;
    const noChange = Math.max(0, voxels.length - applied - outOfWorld - unloaded);
    return {
      requested: voxels.length,
      applied,
      outOfWorld,
      unloaded,
      noChange,
      invalid: 0,
      unloadedChunks: [...unloadedChunkSet],
    };
  };
  const voxelBounds = (voxels: SetVoxel[]) => {
    let minX = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxZ = -Infinity;
    for (const v of voxels) {
      if (v.x < minX) minX = v.x;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.z > maxZ) maxZ = v.z;
    }
    return { minX, minZ, maxX, maxZ };
  };

  const applyAny = (
    voxels: SetVoxel[],
    opts: { label?: string; maxBatchSize?: number; preload?: boolean } = {},
  ): BatchedEditResult => {
    if (voxels.length > MAX_BUILD)
      throw new Error(`build too large (${voxels.length} > ${MAX_BUILD})`);
    const valid = voxels.filter((v) => registry.has(v.id));
    const invalidCount = voxels.length - valid.length;
    if (invalidCount > 0) {
      const prefix = opts.label ? `[${opts.label}] ` : '';
      console.warn(
        `Voxel Realm build: ${prefix}${invalidCount} voxel(s) rejected for unknown block id`,
      );
    }
    if (valid.length > 0 && opts.preload !== false) {
      const b = voxelBounds(valid);
      try {
        manager.preloadBox(b.minX, b.minZ, b.maxX, b.maxZ);
      } catch {
        /* region too large to auto-preload; fall through and report unloaded honestly */
      }
    }
    const maxBatchSize = Math.min(
      MAX_BUILD,
      Math.max(1, Math.floor(opts.maxBatchSize ?? MAX_BUILD)),
    );
    const result = edit.group(() => applyVoxelsInBatches(valid, applyBatch, maxBatchSize));
    const finalResult: BatchedEditResult = {
      ...result,
      requested: result.requested + invalidCount,
      invalid: result.invalid + invalidCount,
    };
    if (finalResult.unloaded > 0) {
      const prefix = opts.label ? `[${opts.label}] ` : '';
      console.warn(
        `Voxel Realm build: ${prefix}${finalResult.unloaded} voxel(s) hit unloaded chunks ${finalResult.unloadedChunks.join(' ')}`,
      );
    }
    if (opts.label) console.debug(`Voxel Realm build: ${opts.label}`, finalResult);
    return finalResult;
  };

  const orbitCamera = (
    cx: number,
    cy: number,
    cz: number,
    radius: number,
    angle = 0,
    height?: number,
  ): void => {
    player.position.x = cx + radius * Math.cos(angle);
    player.position.z = cz + radius * Math.sin(angle);
    player.position.y = height ?? cy + radius * 0.6;
    lookAt(cx, cy, cz);
  };

  const bookmarks = createMemoryBookmarks(
    (): Pose => ({
      pos: { ...player.position },
      yaw: rig.yaw,
      pitch: rig.pitch,
    }),
    (pose) => {
      player.position.x = pose.pos.x;
      player.position.y = pose.pos.y;
      player.position.z = pose.pos.z;
      rig.yaw = pose.yaw;
      rig.pitch = clampPitch(pose.pitch);
      syncCamera();
    },
  );

  // ---- primitive voxel builders (pure generators live in DevShapes.ts) ----

  // ---- blueprint library (persisted to .blueprints/ via the dev server) ----
  const saveBlueprint = async (name: string, bp: Blueprint): Promise<string> => {
    const res = await fetch('/__blueprint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, blueprint: bp }),
    });
    if (!res.ok)
      throw new Error(`Voxel Realm: blueprint save failed (${res.status} ${res.statusText})`);
    return ((await res.json()) as { path: string }).path;
  };
  const loadBlueprint = async (name: string): Promise<Blueprint> => {
    const res = await fetch(`/__blueprint?name=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`blueprint not found: ${name}`);
    const bp: unknown = await res.json();
    const reason = validatePrefab(bp);
    if (reason) throw new Error(`invalid blueprint: ${reason}`);
    return bp as Blueprint;
  };

  const api = {
    npc: ctx.npc,
    playerAnimation: ctx.playerAnimation,
    character: ctx.character,
    equipment: ctx.equipment,
    equip: ctx.equip,
    unequip: ctx.unequip,
    // --- roam ---
    pos: (): Vec3 => ({ ...player.position }),
    look: (): { yaw: number; pitch: number } => ({ yaw: rig.yaw, pitch: rig.pitch }),
    teleport: (x: number, y: number, z: number): void => {
      player.position.x = x;
      player.position.y = y;
      player.position.z = z;
    },
    aim: (yaw: number, pitch = rig.pitch): void => {
      rig.yaw = yaw;
      rig.pitch = clampPitch(pitch);
    },
    turn: (dyaw: number, dpitch = 0): void => {
      rig.yaw += dyaw;
      rig.pitch = clampPitch(rig.pitch + dpitch);
    },
    lookAt,
    /** Place the camera on a circle of `radius` around (cx,cy,cz) at `angle` rad, looking in. */
    orbit: (cx: number, cy: number, cz: number, radius: number, angle = 0, height?: number): void =>
      orbitCamera(cx, cy, cz, radius, angle, height),
    /**
     * Position the camera to frame an axis-aligned box (corners need not be ordered).
     * Sizes the distance to fit the box for the current fov/aspect; returns the eye/target used.
     * `dir` optionally overrides the viewing direction from the box center toward the eye.
     */
    frame: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      dir?: Vec3,
    ): { eye: Vec3; target: Vec3 } => {
      const min = { x: Math.min(x1, x2), y: Math.min(y1, y2), z: Math.min(z1, z2) };
      const max = { x: Math.max(x1, x2), y: Math.max(y1, y2), z: Math.max(z1, z2) };
      const { eye, target } = frameBox(min, max, renderer.camera.fov, renderer.camera.aspect, dir);
      player.position.x = eye.x;
      player.position.y = eye.y;
      player.position.z = eye.z;
      lookAt(target.x, target.y, target.z);
      return { eye, target };
    },
    /** Move along the current look direction by `dist` blocks (fly roaming). */
    forward: (dist: number): void => {
      const { yaw, pitch } = rig;
      player.position.x += -Math.sin(yaw) * Math.cos(pitch) * dist;
      player.position.y += Math.sin(pitch) * dist;
      player.position.z += -Math.cos(yaw) * Math.cos(pitch) * dist;
    },
    fly: (on = true): void => {
      player.flying = on;
    },
    /** First-person pose in one call: put the eye at (ex,ey,ez) and look toward (tx,ty,tz). */
    pov: (ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): void => {
      player.position.x = ex;
      player.position.y = ey;
      player.position.z = ez;
      lookAt(tx, ty, tz);
    },

    // --- headless movement (the rAF loop is paused in preview tabs; step physics on demand) ---
    /**
     * Step the real player physics `frames` times at fixed `dt` with the given movement intents
     * (partial InputState; missing = false). Defaults to fly OFF so gravity + collision apply.
     * The only way to exercise walking/gravity/collision in a headless tab. Returns net horizontal
     * movement + whether the player ended grounded.
     */
    simulate: (
      input: Partial<InputState> = {},
      opts: { frames?: number; dt?: number; yaw?: number; fly?: boolean } = {},
    ): { pos: Vec3; grounded: boolean; moved: number } => {
      player.flying = opts.fly ?? false;
      const r = simulateSteps(
        player,
        playerWorld,
        makeInput(input),
        opts.yaw ?? rig.yaw,
        Math.max(1, Math.floor(opts.frames ?? 30)),
        opts.dt ?? 1 / 60,
      );
      syncCamera();
      return { pos: { ...player.position }, grounded: r.grounded, moved: r.moved };
    },
    /** Walk from the current spot toward (x,y,z) on foot under real physics. */
    walkTo: (
      x: number,
      y: number,
      z: number,
      opts: { maxFrames?: number; dt?: number; arriveDist?: number; stuckFrames?: number } = {},
    ): WalkResult => {
      player.flying = false;
      const r = walkToward(player, playerWorld, { x, y, z }, opts);
      syncCamera();
      return r;
    },
    /**
     * Can a player walk from `from` to `to` on foot? Teleports there, beelines toward the target
     * under real physics (re-aiming each frame), then (by default) restores the camera.
     * `arrived:false, stuck:true` with a large `remaining` means blocked — a wall, an unclimbable
     * ledge, or a capped exit. Catches walkability bugs no screenshot can; for winding paths
     * (a spiral stair) check leg-by-leg with waypoints.
     */
    reachable: (
      from: Vec3,
      to: Vec3,
      opts: {
        maxFrames?: number;
        dt?: number;
        arriveDist?: number;
        stuckFrames?: number;
        restore?: boolean;
      } = {},
    ): WalkResult => {
      const prev = { ...player.position };
      const prevFly = player.flying;
      player.position.x = from.x;
      player.position.y = from.y;
      player.position.z = from.z;
      player.flying = false;
      const r = walkToward(player, playerWorld, to, opts);
      if (opts.restore ?? true) {
        player.position.x = prev.x;
        player.position.y = prev.y;
        player.position.z = prev.z;
        player.flying = prevFly;
      }
      syncCamera();
      return r;
    },
    /** Set time of day (0=midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset). */
    time: (t: number): void => daynight.set(t),
    timeOfDay: (): number => daynight.time,
    /** Real seconds for a full day/night cycle (default 600). */
    dayLength: (seconds: number): void => {
      daynight.dayLengthSec = Math.max(1, seconds);
    },
    /** Camera-centered glow for dark caves — lights captures without placing blocks. */
    headlamp: (on = true): void => ctx.headlamp(on),
    /** Get or set the first-person hand mode (block/pickaxe/axe/sword/empty; not persisted). */
    hand: (mode?: string): string => ctx.hand(mode),
    /** Play-mode tour HUD: start()/end()/tick() — tick after moving (hidden tabs suspend rAF). */
    tourHud: ctx.tour,
    weather: ctx.weather,
    life: ctx.life,
    flow: ctx.flow,
    critters: ctx.critters,
    /** Toggle audio and optionally set the master volume (0..1). */
    sound: (on = true, volume?: number): { muted: boolean; volume: number } => {
      ctx.audio.setMuted(!on);
      if (volume !== undefined) ctx.audio.setVolume(volume);
      return { muted: ctx.audio.muted, volume: ctx.audio.volume };
    },

    // --- see ---
    view,
    shot,
    save,
    /** Path of the most recent save()/capture write (synchronous; '' before the first capture). */
    lastCapturePath: (): string => lastSavedPath,
    capture: {
      overview: async (
        name: string,
        target: Vec3,
        opts: {
          radius?: number;
          angle?: number;
          height?: number;
          hud?: boolean;
          maxWidth?: number;
          quality?: number;
        } = {},
      ): Promise<string> => {
        orbitCamera(
          target.x,
          target.y,
          target.z,
          opts.radius ?? 60,
          opts.angle ?? Math.PI / 4,
          opts.height,
        );
        const saveOpts: { hud?: boolean; maxWidth?: number; quality?: number } = {
          hud: opts.hud ?? true,
        };
        if (opts.maxWidth !== undefined) saveOpts.maxWidth = opts.maxWidth;
        if (opts.quality !== undefined) saveOpts.quality = opts.quality;
        return save(name, saveOpts);
      },
    },

    // --- build (via the real EditService, so undo/redo + persistence apply) ---
    apply: (
      voxels: SetVoxel[],
      opts: { label?: string; maxBatchSize?: number } = {},
    ): BatchedEditResult => applyAny(voxels, opts),
    path: (
      points: TerrainPathPoint[],
      opts: Partial<TerrainPathOptions> & { label?: string } = {},
    ): BatchedEditResult => {
      const block = opts.block ?? inventory.selectedBlock;
      const pathOpts: TerrainPathOptions = { block };
      if (opts.width !== undefined) pathOpts.width = opts.width;
      if (opts.supportBlock !== undefined) pathOpts.supportBlock = opts.supportBlock;
      if (opts.markerEvery !== undefined) pathOpts.markerEvery = opts.markerEvery;
      if (opts.markerBlock !== undefined) pathOpts.markerBlock = opts.markerBlock;
      return applyAny(
        buildTerrainPathVoxels(points, pathOpts, (x, z) => api.surface(x, z).y ?? 0),
        { label: opts.label ?? 'path' },
      );
    },
    place: (x: number, y: number, z: number, id: BlockId, state?: number): BatchedEditResult => {
      const voxel: SetVoxel = { x, y, z, id };
      if (state !== undefined) voxel.state = state;
      return applyAny([voxel]);
    },
    toggle: (x: number, y: number, z: number): BatchedEditResult | { toggled: false } => {
      const id = manager.getBlock(x, y, z);
      if (!registry.isToggleable(id)) return { toggled: false };
      const state = manager.getState(x, y, z);
      return applyAny([{ x, y, z, id, state: toggleOpen(state) }]);
    },
    fill: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ): BatchedEditResult =>
      applyAny(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id })),
      ),
    clearBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): BatchedEditResult =>
      applyAny(
        boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({ ...v, id: AIR })),
      ),
    sphere: (cx: number, cy: number, cz: number, radius: number, id: BlockId): BatchedEditResult =>
      applyAny(sphereVoxels({ x: cx, y: cy, z: cz }, radius).map((v) => ({ ...v, id }))),
    tunnel: (
      x: number,
      y: number,
      z: number,
      dir: Vec3,
      length: number,
      radius: number,
      id: BlockId,
    ): BatchedEditResult =>
      applyAny(tunnelVoxels({ x, y, z }, dir, length, radius).map((v) => ({ ...v, id }))),
    /** Copy a region into a portable blueprint (relative coords, non-air only). */
    copy: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): Blueprint & { unloaded: string[] } => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      if ((bx - ax + 1) * (by - ay + 1) * (bz - az + 1) > 200000)
        throw new Error('copy region too large (>200k)');
      try {
        manager.preloadBox(ax, az, bx, bz);
      } catch {
        /* region too large to auto-preload */
      }
      // Capture state too so copied stairs/gates keep their orientation (Phase 3). The
      // oriented reader keeps even a zero state for facing shapes (N stair packs to 0).
      const captured = captureRegion(
        (x, y, z) => manager.getBlock(x, y, z),
        { x1: ax, y1: ay, z1: az, x2: bx, y2: by, z2: bz },
        orientedStateReader(
          (x, y, z) => manager.getBlock(x, y, z),
          (x, y, z) => manager.getState(x, y, z),
          (id) => registry.hasFacing(id),
        ),
      );
      const unloaded = unloadedChunksInBox((x, z) => manager.isLoaded(x, z), {
        x1: ax,
        y1: ay,
        z1: az,
        x2: bx,
        y2: by,
        z2: bz,
      });
      return { ...captured, unloaded };
    },
    /** Stamp a blueprint with its min corner at (ox,oy,oz), preserving block state. */
    paste: (bp: Blueprint, ox: number, oy: number, oz: number): BatchedEditResult =>
      applyAny(prefabToVoxels(bp, ox, oy, oz)),

    /** Replace every `fromId` voxel in the box with `toId` (one undo). */
    replace: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      fromId: BlockId,
      toId: BlockId,
    ): BatchedEditResult => {
      try {
        manager.preloadBox(Math.min(x1, x2), Math.min(z1, z2), Math.max(x1, x2), Math.max(z1, z2));
      } catch {
        /* region too large to auto-preload */
      }
      return applyAny(
        replaceVoxels(
          (x, y, z) => manager.getBlock(x, y, z),
          { x1, y1, z1, x2, y2, z2 },
          fromId,
          toId,
        ),
        { label: 'replace' },
      );
    },

    /** Move a box by (dx,dy,dz): copy, clear the source, paste at the offset — one undo. */
    move: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      dx: number,
      dy: number,
      dz: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      const clear = boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(bp, ox + dx, oy + dy, oz + dz);
      return applyAny([...clear, ...paste], { label: 'move' });
    },

    /**
     * Mirror a box in place across 'x' or 'z': copy, clear the source, paste the reflection —
     * one undo. Clearing first (like `move`) means a single undo() fully restores the original
     * even when the reflected footprint doesn't exactly cover the source box.
     */
    mirror: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      axis: 'x' | 'z',
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      const clear = boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(mirrorPrefab(bp, axis), ox, oy, oz);
      return applyAny([...clear, ...paste], { label: 'mirror' });
    },

    /**
     * Rotate a box about Y by `quarterTurns` * 90deg, re-anchored at the min corner: copy, clear
     * the source, paste the rotated result — one undo. Clearing first (like `move`) is required
     * for non-square regions, where the rotated footprint's x/z extents swap and no longer match
     * the source box; without it, a single undo() couldn't restore the exact original state.
     */
    rotate: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      quarterTurns: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      const clear = boxVoxels({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 }).map((v) => ({
        ...v,
        id: AIR,
      }));
      const paste = prefabToVoxels(rotateY(bp, quarterTurns), ox, oy, oz);
      return applyAny([...clear, ...paste], { label: 'rotate' });
    },

    /** Tile a box into an nx*ny*nz grid with the given per-axis stride (one undo). */
    array: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      nx: number,
      ny: number,
      nz: number,
      sx: number,
      sy: number,
      sz: number,
    ): BatchedEditResult => {
      const bp = api.copy(x1, y1, z1, x2, y2, z2);
      const projected = bp.blocks.length * nx * ny * nz;
      if (projected > MAX_BUILD)
        throw new Error(`array build too large (${projected} > ${MAX_BUILD})`);
      const ox = Math.min(x1, x2),
        oy = Math.min(y1, y2),
        oz = Math.min(z1, z2);
      return applyAny(prefabToVoxels(repeat(bp, nx, ny, nz, [sx, sy, sz]), ox, oy, oz), {
        label: 'array',
      });
    },

    line: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, id: BlockId) =>
      applyAny(lineVoxels(x1, y1, z1, x2, y2, z2, id)),
    cylinder: (cx: number, cy: number, cz: number, radius: number, height: number, id: BlockId) =>
      applyAny(cylinderVoxels(cx, cy, cz, radius, height, id)),
    pyramid: (cx: number, cy: number, cz: number, baseRadius: number, id: BlockId) =>
      applyAny(pyramidVoxels(cx, cy, cz, baseRadius, id)),
    hollowBox: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
    ) => applyAny(hollowBoxVoxels(x1, y1, z1, x2, y2, z2, id)),
    /** Octagonal prism (radius r, extruded `height` up). `opts.hollow` for walls only. */
    octagon: (
      cx: number,
      cy: number,
      cz: number,
      radius: number,
      height: number,
      id: BlockId,
      opts: { hollow?: boolean } = {},
    ) => applyAny(octagonVoxels(cx, cy, cz, radius, height, id, opts)),
    /** Single-layer boundary ring. `opts.shape`: 'octagon' (default) | 'circle' | 'square'. */
    ring: (
      cx: number,
      cy: number,
      cz: number,
      radius: number,
      id: BlockId,
      opts: { shape?: 'octagon' | 'circle' | 'square' } = {},
    ) => applyAny(ringVoxels(cx, cy, cz, radius, id, opts)),
    /** Tapering cone/spire to a point (wizard-hat / turret cap). `opts`: shape, solid. */
    cone: (
      cx: number,
      cy: number,
      cz: number,
      baseRadius: number,
      id: BlockId,
      opts: { shape?: 'octagon' | 'square'; solid?: boolean } = {},
    ) => applyAny(coneVoxels(cx, cy, cz, baseRadius, id, opts)),
    /** Hollow upright cylinder (a 1-thick round tube), extruded `height` up. */
    hollowCylinder: (
      cx: number,
      cy: number,
      cz: number,
      radius: number,
      height: number,
      id: BlockId,
    ) => applyAny(hollowCylinderVoxels(cx, cy, cz, radius, height, id)),
    /**
     * Place one oriented stair. `facing` is the direction the stair's low/front side points
     * (n/e/s/w) — the way you'd walk up it; `top: true` flips it upside-down. Warns if `id` isn't a
     * stair block (the orientation state is only meaningful for stairs).
     */
    stairs: (
      x: number,
      y: number,
      z: number,
      id: BlockId,
      facing: StairFacing,
      opts: { top?: boolean } = {},
    ): BatchedEditResult => {
      if (registry.shape(id) !== 'stair')
        console.warn(
          `Voxel Realm build: stairs() got non-stair block ${registry.get(id).name} (id ${id}); its orientation state may be ignored`,
        );
      return applyAny([{ x, y, z, id, state: stairState(facing, opts) }], { label: 'stairs' });
    },
    /**
     * Run a line of identically-oriented stairs between two points (Bresenham): ramps, steps, or a
     * roof edge. `facing` sets every stair's low side (see `stairs`); use `stairFacingToward(dx,dz)`
     * to get the outward facing for a roof edge.
     */
    stairsRun: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
      id: BlockId,
      facing: StairFacing,
      opts: { top?: boolean } = {},
    ): BatchedEditResult => {
      const state = stairState(facing, opts);
      const voxels = lineVoxels(x1, y1, z1, x2, y2, z2, id).map((v) => ({ ...v, state }));
      return applyAny(voxels, { label: 'stairsRun' });
    },
    /** The outward stair facing ('n'|'e'|'s'|'w') for a roof-edge / ramp direction vector. */
    stairFacingToward: (dx: number, dz: number): StairFacing => stairFacingToward(dx, dz),
    /** Persist a blueprint to .blueprints/<name>.json (reusable across sessions). */
    saveBlueprint: (name: string, bp: Blueprint): Promise<string> => saveBlueprint(name, bp),
    loadBlueprint: (name: string): Promise<Blueprint> => loadBlueprint(name),
    /** Load a named blueprint and stamp it at (ox,oy,oz). */
    stamp: async (name: string, ox: number, oy: number, oz: number): Promise<BatchedEditResult> => {
      const bp = await loadBlueprint(name);
      const reason = validatePrefab(bp);
      if (reason) throw new Error(`invalid blueprint: ${reason}`);
      return applyAny(
        bp.blocks.map(([dx, dy, dz, id]) => ({ x: ox + dx, y: oy + dy, z: oz + dz, id })),
      );
    },
    undo: (): EditOutcome => edit.undo(),
    redo: (): EditOutcome => edit.redo(),
    /** Force-generate + mesh chunks within `radius` chunks of world (x,z) so edits/scans work now. */
    preloadArea: (x: number, z: number, radius = 2): { generated: number; meshed: number } =>
      manager.preload(worldToChunkCoord(x), worldToChunkCoord(z), Math.max(0, Math.floor(radius))),
    /**
     * Like preloadArea, but spreads the work across animation frames (yielding every `perFrame`
     * chunks) so a large preload doesn't freeze the tab. Prefer this for big regions in a live tab;
     * the synchronous preloadArea is faster when you don't care about responsiveness.
     */
    preloadAreaAsync: async (
      x: number,
      z: number,
      radius = 4,
      perFrame = 4,
    ): Promise<{ generated: number; meshed: number }> => {
      const cx0 = worldToChunkCoord(x);
      const cz0 = worldToChunkCoord(z);
      const r = Math.max(0, Math.floor(radius));
      const step = Math.max(1, Math.floor(perFrame));
      let generated = 0;
      let meshed = 0;
      let sinceYield = 0;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const res = manager.preload(cx0 + dx, cz0 + dz, 0);
          generated += res.generated;
          meshed += res.meshed;
          if (++sinceYield >= step) {
            sinceYield = 0;
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }
      }
      return { generated, meshed };
    },
    /** Whether the chunk at world (x,z) is loaded (editable/scannable). */
    isLoaded: (x: number, z: number): boolean => manager.isLoaded(x, z),

    // --- named worlds (shared storage) ---
    world: {
      list: (): Promise<string[]> => listWorlds(),
      current: (): string => currentWorld,
      /** Copy the current world to `name` (does not switch). Returns the new name. */
      saveAs: async (name: string): Promise<string> => {
        await copyWorld(currentWorld, name);
        return name;
      },
      /** Reload into world `name` (creates it on first edit if absent). */
      load: (name: string): void => gotoWorld(name),
      delete: (name: string): Promise<void> => deleteWorld(name),

      // --- curated-world metadata (spawn / landmarks / tour) ---
      /** Read the current world's stored meta, or undefined if it has none yet. */
      meta: (): Promise<WorldMeta | undefined> => readWorldMeta(currentWorld),
      /** Check whether player-facing curation metadata is complete enough for a first visit. */
      audit: async () => auditWorldMeta(await readWorldMeta(currentWorld)),
      /** Merge a partial patch into the stored meta and persist the complete result. */
      setMeta: (patch: Partial<WorldMeta>): Promise<WorldMeta> =>
        patchMeta((base) => mergeMeta(base, patch)),
      /** Set spawn+look from the current player pose; optionally also drop a named landmark there. */
      setSpawn: (name?: string): Promise<WorldMeta> => {
        const spawn = {
          x: round(player.position.x, 2),
          y: round(player.position.y, 2),
          z: round(player.position.z, 2),
        };
        const look = { yaw: round(rig.yaw, 3), pitch: round(rig.pitch, 3) };
        return patchMeta((base) => {
          const merged = mergeMeta(base, { spawn, look });
          return name ? appendLandmark(merged, { name, ...spawn }) : merged;
        });
      },
      /** Append a landmark; coordinates default to the current player position. */
      addLandmark: (name: string, x?: number, y?: number, z?: number): Promise<WorldMeta> => {
        const point = {
          x: round(x ?? player.position.x, 2),
          y: round(y ?? player.position.y, 2),
          z: round(z ?? player.position.z, 2),
        };
        return patchMeta((base) => appendLandmark(base, { name, ...point }));
      },
      /** Replace the tour waypoints. */
      setTour: (
        points: Array<{ name?: string; x: number; y: number; z: number }>,
      ): Promise<WorldMeta> => patchMeta((base) => mergeMeta(base, { tour: points })),
      /** A shareable roam URL for the current world (strips debug spawn/look overrides). */
      roamUrl: (): string => {
        const u = new URL(window.location.href);
        u.searchParams.set('save', currentWorld);
        if (preset !== 'default') u.searchParams.set('world', preset);
        else u.searchParams.delete('world');
        u.searchParams.delete('spawn');
        u.searchParams.delete('look');
        return u.toString();
      },
    },
    bookmark: bookmarks,

    // --- introspect / structural perception ---
    blockAt: (x: number, y: number, z: number): string =>
      registry.get(manager.getBlock(x, y, z)).name,
    /** Full voxel: id, name, and packed orientation/open state (blockAt returns the name only). */
    blockInfo: (x: number, y: number, z: number): { id: BlockId; name: string; state: number } => {
      const id = manager.getBlock(x, y, z);
      return { id, name: registry.get(id).name, state: manager.getState(x, y, z) };
    },
    /** Packed state byte at a voxel (facing | half<<2 | open<<3). */
    stateAt: (x: number, y: number, z: number): number => manager.getState(x, y, z),
    /** Highest non-air voxel in the (x,z) column: {y, block, unloaded}, or y=null if all air/unloaded. */
    surface: (x: number, z: number): { y: number | null; block: string; unloaded: boolean } => {
      const unloaded = !manager.isLoaded(x, z);
      for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
        const id = manager.getBlock(x, y, z);
        if (id !== AIR) return { y, block: registry.get(id).name, unloaded };
      }
      return { y: null, block: 'air', unloaded };
    },
    /** Block histogram over a box (capped at 200k voxels): { dims, nonAir, counts, unloaded }. */
    scan: (
      x1: number,
      y1: number,
      z1: number,
      x2: number,
      y2: number,
      z2: number,
    ): {
      dims: [number, number, number];
      nonAir: number;
      counts: Record<string, number>;
      unloaded: string[];
    } => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [ay, by] = [Math.min(y1, y2), Math.max(y1, y2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      const dims: [number, number, number] = [bx - ax + 1, by - ay + 1, bz - az + 1];
      if (dims[0] * dims[1] * dims[2] > 200000) throw new Error('scan region too large (>200k)');
      const box = { x1: ax, y1: ay, z1: az, x2: bx, y2: by, z2: bz };
      try {
        manager.preloadBox(ax, az, bx, bz);
      } catch {
        /* region too large to auto-preload */
      }
      const counts: Record<string, number> = {};
      let nonAir = 0;
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          for (let x = ax; x <= bx; x++) {
            const id = manager.getBlock(x, y, z);
            if (id === AIR) continue;
            nonAir++;
            const name = registry.get(id).name;
            counts[name] = (counts[name] ?? 0) + 1;
          }
      const unloaded = unloadedChunksInBox((x, z) => manager.isLoaded(x, z), box);
      return { dims, nonAir, counts, unloaded };
    },
    /** ASCII top-down floor plan of one y-layer (area capped at 80x80): { y, legend, rows, unloaded }. */
    slice: (
      y: number,
      x1: number,
      z1: number,
      x2: number,
      z2: number,
    ): { y: number; legend: Record<string, string>; rows: string[]; unloaded: string[] } => {
      const [ax, bx] = [Math.min(x1, x2), Math.max(x1, x2)];
      const [az, bz] = [Math.min(z1, z2), Math.max(z1, z2)];
      if ((bx - ax + 1) * (bz - az + 1) > 6400) throw new Error('slice area too large (>80x80)');
      try {
        manager.preloadBox(ax, az, bx, bz);
      } catch {
        /* region too large to auto-preload */
      }
      const palette = '#@%&*+=oxOXNHBW';
      const chars = new Map<BlockId, string>();
      const rows: string[] = [];
      for (let z = az; z <= bz; z++) {
        let row = '';
        for (let x = ax; x <= bx; x++) {
          const id = manager.getBlock(x, y, z);
          if (id === AIR) {
            row += ' ';
            continue;
          }
          if (!chars.has(id)) chars.set(id, palette[chars.size % palette.length]);
          row += chars.get(id);
        }
        rows.push(row);
      }
      const legend: Record<string, string> = {};
      for (const [id, ch] of chars) legend[ch] = registry.get(id).name;
      const unloaded = unloadedChunksInBox((x, z) => manager.isLoaded(x, z), {
        x1: ax,
        y1: y,
        z1: az,
        x2: bx,
        y2: y,
        z2: bz,
      });
      return { y, legend, rows, unloaded };
    },
    blocks: (): Array<{ id: BlockId; name: string }> =>
      CREATIVE_BLOCKS.map((id) => ({ id, name: registry.get(id).name })),
    state: (): DevState =>
      collectDevState({ player, rig, manager, inventory, registry, preset, worldName, profiler }),
    /**
     * Roam benchmark (P0): warm up so chunks settle, then fly `distance` units along `axis`
     * at `speed` (default flight speed) while sampling per-frame stats. Logs a table, copies
     * the JSON to the clipboard, and returns the summary. Portable metrics (totalGens/
     * totalMeshes) compare across machines; frame-time percentiles are same-machine only.
     */
    bench: async (opts?: {
      axis?: 'x' | 'z';
      distance?: number;
      speed?: number;
      warmupMs?: number;
      start?: Vec3;
    }): Promise<ProfilerSummary> => {
      const axis = opts?.axis ?? 'x';
      const distance = opts?.distance ?? 256;
      const speed = opts?.speed ?? 30;
      const warmupMs = opts?.warmupMs ?? 1500;

      const prevPos = { ...player.position };
      const prevFlying = player.flying;
      player.flying = true;
      if (opts?.start) {
        player.position.x = opts.start.x;
        player.position.y = opts.start.y;
        player.position.z = opts.start.z;
      }
      syncCamera();

      // Warm up (no sampling) so we measure steady-state roam, not cold spawn-load.
      await new Promise((resolve) => setTimeout(resolve, warmupMs));
      profiler.reset();
      await roam.start({ axis, distance, speed }); // resolved by the render loop's per-frame step

      const summary = profiler.summary();
      player.position.x = prevPos.x;
      player.position.y = prevPos.y;
      player.position.z = prevPos.z;
      player.flying = prevFlying;
      syncCamera();

      await reportBench(
        `[vr.bench] preset=${preset} world=${currentWorld} axis=${axis} distance=${distance} ` +
          `speed=${speed} | portable: totalGens=${summary.totalGens} totalMeshes=${summary.totalMeshes}`,
        summary,
      );
      return summary;
    },
    /**
     * Route benchmark: fly through a series of x/z waypoints at a fixed speed while sampling.
     * Warms up first and restores the prior pose/fly state afterwards. Returns the profiler
     * summary plus route metadata. Only totalGens/totalMeshes are portable across machines;
     * frame-time percentiles are same-machine guardrails.
     */
    benchRoute: async (
      points: Array<{ x: number; z: number }>,
      opts?: { speed?: number; warmupMs?: number },
    ): Promise<ProfilerSummary & { waypoints: number; distance: number }> => {
      const clean = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
      if (clean.length < 2) throw new Error('benchRoute needs at least 2 finite waypoints');
      const distance = routeDistance(clean);
      if (distance <= 0) throw new Error('benchRoute waypoints have zero total length');
      const speed = opts?.speed ?? 30;
      const warmupMs = opts?.warmupMs ?? 1500;

      const prevPos = { ...player.position };
      const prevFlying = player.flying;
      player.flying = true;
      player.position.x = clean[0].x;
      player.position.z = clean[0].z;
      syncCamera();

      await new Promise((resolve) => setTimeout(resolve, warmupMs));
      profiler.reset();
      await roam.startRoute({ points: clean, speed });

      const summary = profiler.summary();
      player.position.x = prevPos.x;
      player.position.y = prevPos.y;
      player.position.z = prevPos.z;
      player.flying = prevFlying;
      syncCamera();

      await reportBench(
        `[vr.benchRoute] preset=${preset} world=${currentWorld} waypoints=${clean.length} ` +
          `distance=${round(distance, 1)} speed=${speed} | portable: totalGens=${summary.totalGens} ` +
          `totalMeshes=${summary.totalMeshes} (frame percentiles are same-machine only)`,
        summary,
      );
      return { ...summary, waypoints: clean.length, distance };
    },
    /** Route benchmark over the current world's saved `meta.tour` waypoints. */
    benchTour: async (opts?: {
      speed?: number;
      warmupMs?: number;
    }): Promise<ProfilerSummary & { waypoints: number; distance: number }> => {
      const meta = await readWorldMeta(currentWorld);
      const tour = meta?.tour;
      if (!tour || tour.length < 2) {
        throw new Error('benchTour: world meta has no tour with at least 2 points');
      }
      return api.benchRoute(
        tour.map((p) => ({ x: p.x, z: p.z })),
        opts,
      );
    },
    /** Dev-only: override the distance-fog band on chunk materials (for clean wide captures). */
    fog: (near: number, far: number): { patched: number } => {
      let patched = 0;
      renderer.scene.traverse((obj: object) => {
        const mat = (obj as { material?: unknown }).material;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          const u = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
          if (u && 'uFogNear' in u && 'uFogFar' in u) {
            u.uFogNear.value = near;
            u.uFogFar.value = far;
            patched++;
          }
        }
      });
      return { patched };
    },
    /** Dev-only: scale vertex-AO corner shading (0 = off, 1 = baked value, >1 exaggerated). */
    ao: (strength = 1): { patched: number } => {
      let patched = 0;
      renderer.scene.traverse((obj: object) => {
        const mat = (obj as { material?: unknown }).material;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          const u = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
          if (u && 'uAoStrength' in u) {
            u.uAoStrength.value = strength;
            patched++;
          }
        }
      });
      return { patched };
    },
    /** Dev-only: scale hemispheric sky-tint ambient (0 = off/legacy look, 0.35 = default). */
    ambient: (strength = 0.35): { patched: number } => {
      let patched = 0;
      renderer.scene.traverse((obj: object) => {
        const mat = (obj as { material?: unknown }).material;
        const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
        for (const m of mats) {
          const u = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
          if (u && 'uAmbientStrength' in u) {
            u.uAmbientStrength.value = strength;
            patched++;
          }
        }
      });
      return { patched };
    },
    /** Signatures + one-line docs for the API (pass a method name for just that one). */
    help: (name?: string): Record<string, string> | string =>
      name !== undefined ? (DEV_HELP[name] ?? `no such method: ${name}`) : DEV_HELP,
  };

  (window as typeof window & { __vr?: typeof api }).__vr = api;
}
