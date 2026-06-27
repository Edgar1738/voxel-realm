// scripts/worldRestore.ts
//
// CLI: copy an archived world.json out of the Obsidian vault back into `.saves/<save>.json`.
//
//   npm run world:restore -- --archive 2026-06-27-medieval-village-and-castle --save medieval-village-roam-restored
//   npm run world:restore -- --archive <folder> --save <name> --force

import { resolve } from 'node:path';
import { restoreWorld } from './archiveCore.ts';

const VAULT_ROOT = process.env.VR_VAULT ?? 'C:/Users/Edgar/Documents/Obsidian Vault/Voxel Realm';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const archiveId = getFlag(args, 'archive');
const saveName = getFlag(args, 'save');

if (!archiveId || !saveName) {
  console.error(
    'Usage: npm run world:restore -- --archive <archive-folder> --save <save-name> [--force] [--port 5175]',
  );
  process.exit(1);
}

const force = args.includes('--force');
const portArg = getFlag(args, 'port');
const cwd = process.cwd();

try {
  const result = restoreWorld({
    archiveId,
    saveName,
    artifactsDir: resolve(VAULT_ROOT, 'Artifacts'),
    savesDir: resolve(cwd, '.saves'),
    force,
    ...(portArg ? { roamPort: Number(portArg) } : {}),
  });

  console.log(`Restored ${archiveId} -> ${result.savePath}`);
  console.log(`Roam: ${result.roamUrl}`);
} catch (err) {
  console.error(`world:restore failed: ${(err as Error).message}`);
  process.exit(1);
}
