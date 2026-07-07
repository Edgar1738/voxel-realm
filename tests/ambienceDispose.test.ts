import { describe, it, expect, vi } from 'vitest';
import type { Object3D } from 'three';
import { Weather } from '../src/render/Weather';
import { AmbientLife } from '../src/render/AmbientLife';
import { Critters } from '../src/render/Critters';
import { BlockParticles } from '../src/render/BlockParticles';
import { SelectionBox } from '../src/render/SelectionBox';
import { PasteGhost } from '../src/render/PasteGhost';
import { TargetOverlay } from '../src/render/TargetOverlay';

/**
 * Every ambience/overlay object attaches one or more meshes to the scene, each owning a
 * BufferGeometry + Material that the GPU keeps until .dispose() is called. Game.cleanup()
 * now disposes all of them; these tests assert each class frees the resources it attaches.
 */

interface Attachable {
  attach(add: (o: Object3D) => void): void;
  dispose(): void;
}

const factories: Array<[string, () => Attachable]> = [
  ['Weather', () => new Weather()],
  ['AmbientLife', () => new AmbientLife()],
  ['Critters', () => new Critters()],
  ['BlockParticles', () => new BlockParticles()],
  ['SelectionBox', () => new SelectionBox()],
  ['PasteGhost', () => new PasteGhost()],
  ['TargetOverlay', () => new TargetOverlay()],
];

type WithResources = {
  geometry?: { dispose: () => void };
  material?: { dispose: () => void } | { dispose: () => void }[];
};

describe('ambience/overlay dispose() frees attached GPU resources', () => {
  for (const [name, make] of factories) {
    it(`${name}.dispose() disposes every attached geometry and material`, () => {
      const inst = make();
      const objs: WithResources[] = [];
      inst.attach((o) => objs.push(o as unknown as WithResources));
      expect(objs.length).toBeGreaterThan(0);

      const geoSpies = objs.filter((o) => o.geometry).map((o) => vi.spyOn(o.geometry!, 'dispose'));
      const matSpies = objs
        .filter((o) => o.material && !Array.isArray(o.material))
        .map((o) => vi.spyOn(o.material as { dispose: () => void }, 'dispose'));

      inst.dispose();

      expect(geoSpies.length).toBeGreaterThan(0);
      for (const s of geoSpies) expect(s).toHaveBeenCalled();
      for (const s of matSpies) expect(s).toHaveBeenCalled();
    });
  }
});
