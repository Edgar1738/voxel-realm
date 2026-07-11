import { buildAssets } from './assetPipeline.ts';

try {
  await buildAssets();
} catch (error) {
  console.error(`assets:build failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
