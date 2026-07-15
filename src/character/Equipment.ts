import {
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
  type Object3D,
} from 'three';

export const EQUIPMENT_SLOTS = ['main', 'off'] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const EQUIPMENT_IDS = ['sword', 'baguette'] as const;
export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export interface EquipmentLoadout {
  main?: EquipmentId;
  off?: EquipmentId;
}

export const DEFAULT_PLAYER_EQUIPMENT: Readonly<EquipmentLoadout> = {
  main: 'sword',
};

interface EquipmentPart {
  id: string;
  size: readonly [number, number, number];
  pos: readonly [number, number, number];
  color: number;
  rotation?: readonly [number, number, number];
}

/** Models point along local +Y from a grip at the origin; wrist mounts choose the final pose. */
const MODELS: Readonly<Record<EquipmentId, readonly EquipmentPart[]>> = {
  sword: [
    { id: 'pommel', size: [0.14, 0.12, 0.14], pos: [0, -0.25, 0], color: 0xb59a55 },
    { id: 'grip', size: [0.11, 0.34, 0.11], pos: [0, -0.06, 0], color: 0x674329 },
    { id: 'guard', size: [0.42, 0.1, 0.16], pos: [0, 0.14, 0], color: 0xc8a84f },
    { id: 'blade', size: [0.16, 0.78, 0.08], pos: [0, 0.58, 0], color: 0xcfd5df },
    { id: 'blade-core', size: [0.055, 0.7, 0.085], pos: [0, 0.57, 0], color: 0xf0f3f8 },
    { id: 'tip', size: [0.1, 0.16, 0.08], pos: [0, 1.04, 0], color: 0xe1e6ee },
  ],
  baguette: [
    { id: 'heel', size: [0.22, 0.16, 0.2], pos: [0, 0.04, 0], color: 0xb96b25 },
    { id: 'loaf', size: [0.26, 0.78, 0.22], pos: [0, 0.46, 0], color: 0xd99135 },
    { id: 'crown', size: [0.21, 0.16, 0.19], pos: [0, 0.9, 0], color: 0xe0a047 },
    {
      id: 'score-1',
      size: [0.19, 0.055, 0.035],
      pos: [0, 0.25, -0.125],
      color: 0xf2cf83,
      rotation: [0, 0, -0.35],
    },
    {
      id: 'score-2',
      size: [0.19, 0.055, 0.035],
      pos: [0, 0.46, -0.125],
      color: 0xf2cf83,
      rotation: [0, 0, -0.35],
    },
    {
      id: 'score-3',
      size: [0.19, 0.055, 0.035],
      pos: [0, 0.67, -0.125],
      color: 0xf2cf83,
      rotation: [0, 0, -0.35],
    },
  ],
};

export interface EquipmentModelOptions {
  material?: 'lit' | 'unlit';
  depthTest?: boolean;
  renderOrder?: number;
}

export interface EquipmentModel {
  group: Group;
  dispose(): void;
}

export function isEquipmentId(value: string): value is EquipmentId {
  return (EQUIPMENT_IDS as readonly string[]).includes(value);
}

export function isEquipmentSlot(value: string): value is EquipmentSlot {
  return (EQUIPMENT_SLOTS as readonly string[]).includes(value);
}

export function copyEquipmentLoadout(loadout: Readonly<EquipmentLoadout>): EquipmentLoadout {
  return {
    ...(loadout.main ? { main: loadout.main } : {}),
    ...(loadout.off ? { off: loadout.off } : {}),
  };
}

/** Builds one reusable block-model definition for a world character or unlit viewmodel. */
export function createEquipmentModel(
  id: EquipmentId,
  options: EquipmentModelOptions = {},
): EquipmentModel {
  const group = new Group();
  group.name = `equipment:${id}`;
  const disposables: Array<BoxGeometry | Material> = [];
  for (const part of MODELS[id]) {
    const geometry = new BoxGeometry(...part.size);
    const material =
      options.material === 'unlit'
        ? new MeshBasicMaterial({ color: part.color, depthTest: options.depthTest ?? true })
        : new MeshLambertMaterial({ color: part.color });
    const mesh = new Mesh(geometry, material);
    mesh.name = `equipment-part:${id}:${part.id}`;
    mesh.position.set(...part.pos);
    if (part.rotation) mesh.rotation.set(...part.rotation);
    if (options.renderOrder !== undefined) mesh.renderOrder = options.renderOrder;
    group.add(mesh);
    disposables.push(geometry, material);
  }
  if (options.renderOrder !== undefined) group.renderOrder = options.renderOrder;
  return {
    group,
    dispose: () => {
      for (const disposable of disposables) disposable.dispose();
    },
  };
}

export interface EquipmentRigOptions extends EquipmentModelOptions {
  transforms?: Partial<
    Record<
      EquipmentSlot,
      {
        pos?: readonly [number, number, number];
        rotation?: readonly [number, number, number];
        scale?: number;
      }
    >
  >;
}

/** Shared two-slot attachment layer used by first-person hands, player avatars, and NPCs. */
export class EquipmentRig {
  private readonly mounts = new Map<EquipmentSlot, Group>();
  private readonly models = new Map<EquipmentSlot, EquipmentModel>();
  private readonly loadout: EquipmentLoadout = {};

  constructor(
    anchors: Partial<Record<EquipmentSlot, Object3D>>,
    private readonly options: EquipmentRigOptions = {},
  ) {
    for (const slot of EQUIPMENT_SLOTS) {
      const anchor = anchors[slot];
      if (!anchor) continue;
      const mount = new Group();
      mount.name = `equipment-slot:${slot}`;
      const transform = options.transforms?.[slot];
      if (transform?.pos) mount.position.set(...transform.pos);
      if (transform?.rotation) mount.rotation.set(...transform.rotation);
      if (transform?.scale !== undefined) mount.scale.setScalar(transform.scale);
      anchor.add(mount);
      this.mounts.set(slot, mount);
    }
  }

  setLoadout(loadout: Readonly<EquipmentLoadout>): void {
    for (const slot of EQUIPMENT_SLOTS) {
      const id = loadout[slot];
      if (id) this.equip(slot, id);
      else this.unequip(slot);
    }
  }

  equip(slot: EquipmentSlot, id: EquipmentId): boolean {
    const mount = this.mounts.get(slot);
    if (!mount) return false;
    if (this.loadout[slot] === id) return true;
    this.drop(slot);
    const model = createEquipmentModel(id, this.options);
    mount.add(model.group);
    this.models.set(slot, model);
    this.loadout[slot] = id;
    return true;
  }

  unequip(slot: EquipmentSlot): boolean {
    if (!this.mounts.has(slot)) return false;
    this.drop(slot);
    delete this.loadout[slot];
    return true;
  }

  state(): EquipmentLoadout {
    return copyEquipmentLoadout(this.loadout);
  }

  setVisible(visible: boolean): void {
    for (const mount of this.mounts.values()) mount.visible = visible;
  }

  dispose(): void {
    for (const slot of EQUIPMENT_SLOTS) this.drop(slot);
  }

  private drop(slot: EquipmentSlot): void {
    const model = this.models.get(slot);
    if (!model) return;
    this.mounts.get(slot)?.remove(model.group);
    model.dispose();
    this.models.delete(slot);
  }
}
