// scripts/worldArchive.ts
//
// CLI: copy a finished `.saves/<save>.json` world into the Obsidian vault as a durable archive.
//
//   npm run world:archive -- --save medieval-village-roam --title "Medieval Village and Castle"
//   npm run world:archive -- --save foo --title "Foo" --captures a.jpg,b.jpg --port 5175

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { archiveWorld, type GitInfo } from './archiveCore.ts';

const VAULT_ROOT = process.env.VR_VAULT ?? 'C:/Users/Edgar/Documents/Obsidian Vault/Voxel Realm';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function gitInfo(cwd: string): GitInfo {
  // Fixed arg arrays, no shell — git metadata is best-effort, failures are swallowed.
  const read = (gitArgs: string[]): string | undefined => {
    try {
      return (
        execFileSync('git', gitArgs, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
          .toString()
          .trim() || undefined
      );
    } catch {
      return undefined;
    }
  };
  const info: GitInfo = {};
  const branch = read(['rev-parse', '--abbrev-ref', 'HEAD']);
  const commit = read(['rev-parse', '--short', 'HEAD']);
  if (branch) info.branch = branch;
  if (commit) info.commit = commit;
  return info;
}

const args = process.argv.slice(2);
const saveName = getFlag(args, 'save');
const title = getFlag(args, 'title');

if (!saveName || !title) {
  console.error(
    'Usage: npm run world:archive -- --save <save-name> --title "<title>" [--captures a.jpg,b.jpg] [--port 5175]',
  );
  process.exit(1);
}

const capturesArg = getFlag(args, 'captures');
const portArg = getFlag(args, 'port');
const cwd = process.cwd();

try {
  const result = archiveWorld({
    saveName,
    title,
    savesDir: resolve(cwd, '.saves'),
    capturesDir: resolve(cwd, '.captures'),
    artifactsDir: resolve(VAULT_ROOT, 'Artifacts'),
    catalogPath: resolve(VAULT_ROOT, 'World Archive.md'),
    repoPath: cwd,
    git: gitInfo(cwd),
    ...(capturesArg
      ? {
          captures: capturesArg
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        }
      : {}),
    ...(portArg ? { roamPort: Number(portArg) } : {}),
  });

  console.log(`Archived "${title}" -> ${result.archiveDir}`);
  console.log(
    `Captures copied: ${result.copiedCaptures.length ? result.copiedCaptures.join(', ') : 'none'}`,
  );
  console.log(`Roam (original save): ${result.roamUrl}`);
  console.log(`Catalog: ${resolve(VAULT_ROOT, 'World Archive.md')}`);
} catch (err) {
  console.error(`world:archive failed: ${(err as Error).message}`);
  process.exit(1);
}
