import { defineConfig } from 'vitest/config';

/**
 * High-signal local loop for pure builder, prefab, placement, edit, camera, and UI state code.
 * This is intentionally additive: `npm test` remains the required worldgen/streaming/integration
 * gate, while this suite gives everyday authoring changes feedback in a few seconds.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/{aim,blueprintStore,blueprintThumbnail,builderInput,builderState,cameraRig,creativeInventory,curatedBlueprints,devHud,devState,editCap,editService,editServiceState,frameProfiler,inputHelpers,placement,prefab,prefabKits,regionOps,regionOpsBuilder,regionOpsTransform,tour,tourMarker,voxelState,worldMeta}.test.ts',
    ],
    maxWorkers: 4,
    testTimeout: 20000,
  },
});
