import { Color, Mesh, type Material, type Object3D } from 'three';
import { NpcActor } from '../npc/NpcActor';
import type { NpcPlacementCandidate } from '../npc/NpcPlacement';
import type { NpcDefinition } from '../npc/NpcTypes';

interface GhostMaterial {
  material: Material & {
    color?: Color;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
    wireframe?: boolean;
  };
  color?: Color;
  wireframe?: boolean;
}

/** Translucent live preview built from the selected catalog NPC's real model definition. */
export class NpcPlacementGhost {
  private readonly invalidColor = new Color(0xff4444);
  private actor: NpcActor | undefined;
  private materials: GhostMaterial[] = [];
  private addToScene: ((object: Object3D) => void) | undefined;
  private typeId = '';

  attach(add: (object: Object3D) => void): void {
    this.addToScene = add;
    if (this.actor) this.actor.attach(add);
  }

  setDefinition(type: string, definition: NpcDefinition): void {
    if (this.typeId === type) return;
    this.clearActor();
    this.typeId = type;
    this.actor = new NpcActor({
      ...definition,
      id: '__npc-placement-ghost__',
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
    });
    this.actor.group.visible = false;
    this.actor.group.renderOrder = 998;
    this.actor.group.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.renderOrder = 998;
      const source = Array.isArray(object.material) ? object.material : [object.material];
      for (const raw of source) {
        const material = raw as GhostMaterial['material'];
        const item: GhostMaterial = {
          material,
          ...(material.color ? { color: material.color.clone() } : {}),
          ...(material.wireframe !== undefined ? { wireframe: material.wireframe } : {}),
        };
        material.transparent = true;
        material.opacity = 0.45;
        material.depthWrite = false;
        material.needsUpdate = true;
        this.materials.push(item);
      }
    });
    if (this.addToScene) this.actor.attach(this.addToScene);
  }

  update(candidate: NpcPlacementCandidate | undefined, show: boolean): void {
    const actor = this.actor;
    if (!actor || !show || !candidate) {
      if (actor) actor.group.visible = false;
      return;
    }
    actor.group.position.set(candidate.position.x, candidate.position.y, candidate.position.z);
    actor.group.rotation.y = candidate.yaw;
    actor.group.visible = true;
    for (const item of this.materials) {
      item.material.opacity = candidate.valid ? 0.45 : 0.28;
      if (item.material.color && item.color) {
        item.material.color.copy(candidate.valid ? item.color : this.invalidColor);
      }
      if (item.material.wireframe !== undefined) {
        item.material.wireframe = candidate.valid ? (item.wireframe ?? false) : true;
      }
    }
  }

  dispose(): void {
    this.clearActor();
    this.addToScene = undefined;
  }

  private clearActor(): void {
    if (!this.actor) return;
    this.actor.group.removeFromParent();
    this.actor.dispose();
    this.actor = undefined;
    this.materials = [];
    this.typeId = '';
  }
}
