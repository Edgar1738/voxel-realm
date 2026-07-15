import { describe, expect, it } from 'vitest';
import { Group, MeshBasicMaterial, type Mesh } from 'three';
import {
  createEquipmentModel,
  EquipmentRig,
  isEquipmentId,
  isEquipmentSlot,
} from '../src/character/Equipment';

describe('shared equipment', () => {
  it('builds the sword and scored baguette from reusable box models', () => {
    const sword = createEquipmentModel('sword', {
      material: 'unlit',
      depthTest: false,
      renderOrder: 1000,
    });
    const baguette = createEquipmentModel('baguette');
    expect(sword.group.getObjectByName('equipment-part:sword:blade')).toBeDefined();
    expect(baguette.group.getObjectByName('equipment-part:baguette:score-3')).toBeDefined();
    const swordMesh = sword.group.children[0] as Mesh<never, MeshBasicMaterial>;
    expect(swordMesh.material.depthTest).toBe(false);
    expect(swordMesh.renderOrder).toBe(1000);
    sword.dispose();
    baguette.dispose();
  });

  it('equips and replaces independent main/off wrist slots', () => {
    const rightWrist = new Group();
    const leftWrist = new Group();
    const rig = new EquipmentRig({ main: rightWrist, off: leftWrist });
    expect(rig.isEmpty()).toBe(true);
    rig.setLoadout({ main: 'sword', off: 'baguette' });
    expect(rig.isEmpty()).toBe(false);
    expect(rig.state()).toEqual({ main: 'sword', off: 'baguette' });
    expect(rightWrist.getObjectByName('equipment:sword')).toBeDefined();
    expect(leftWrist.getObjectByName('equipment:baguette')).toBeDefined();

    expect(rig.equip('main', 'baguette')).toBe(true);
    expect(rightWrist.getObjectByName('equipment:sword')).toBeUndefined();
    expect(rig.state()).toEqual({ main: 'baguette', off: 'baguette' });
    expect(rig.unequip('off')).toBe(true);
    expect(rig.state()).toEqual({ main: 'baguette' });
    rig.dispose();
  });

  it('rejects unsupported ids/slots and cannot equip an absent wrist anchor', () => {
    expect(isEquipmentId('sword')).toBe(true);
    expect(isEquipmentId('pickaxe')).toBe(false);
    expect(isEquipmentSlot('off')).toBe(true);
    expect(isEquipmentSlot('head')).toBe(false);
    const rig = new EquipmentRig({ main: new Group() });
    expect(rig.equip('off', 'baguette')).toBe(false);
    expect(rig.state()).toEqual({});
  });
});
