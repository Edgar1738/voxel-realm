// scripts/worldPackage.ts
//
// CLI: validate that a finished `.saves/<save>.json` world is roam-ready, print summary
// stats, then archive it into the Obsidian vault via the shared archive logic.
//
//   npm run world:package -- --save moonspire-realm --title "Moonspire Realm" --port 5191

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { archiveWorld, roamUrl, type GitInfo } from './archiveCore.ts';
import { validatePackage, summarizePackage } from './packageCore.ts';
import { auditWorldMeta } from '../src/app/worldMeta.ts';
import { WORLD_HEIGHT } from '../src/core/constants.ts';
import type { WorldMeta } from '../src/persistence/SaveTypes.ts';

const VAULT_ROOT = process.env.VR_VAULT ?? 'C:/Users/Edgar/Documents/Obsidian Vault/Voxel Realm';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function gitInfo(cwd: string): GitInfo {
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
    'Usage: npm run world:package -- --save <save-name> --title "<title>" [--captures a.jpg,b.png] [--port 5175]',
  );
  process.exit(1);
}

const cwd = process.cwd();
const savesDir = resolve(cwd, '.saves');
const saveFile = resolve(savesDir, `${saveName}.json`);

if (!existsSync(saveFile)) {
  console.error(`world:package: save not found: ${saveFile}`);
  process.exit(1);
}

const snapshot = JSON.parse(readFileSync(saveFile, 'utf8')) as {
  meta?: WorldMeta;
  chunks?: Record<string, Array<[number, number] | [number, number, number]>>;
};

// Two readiness levels share this gate: validatePackage is the STRUCTURAL contract (finite,
// in-bounds meta — a broken save must not archive; fatal), auditWorldMeta is the CURATION
// contract (title/description/landmarks/tour — a bare save may still package; warn only).
const problems = validatePackage(snapshot.meta, WORLD_HEIGHT);
if (problems.length > 0) {
  console.error(`world:package: "${saveName}" is not roam-ready:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

const audit = auditWorldMeta(snapshot.meta);
if (!audit.ready) {
  console.warn(`world:package: "${saveName}" packages, but is not player-ready:`);
  for (const field of audit.missing) console.warn(`  - missing: ${field}`);
  for (const warning of audit.warnings) console.warn(`  - ${warning}`);
  for (const suggestion of audit.suggestions) console.warn(`  - fix: ${suggestion}`);
}

const summary = summarizePackage(snapshot);
const blockList =
  Object.entries(summary.blockCounts)
    .map(([id, count]) => `${id}×${count}`)
    .join(', ') || 'none';
console.log(`Packaging "${title}" (save: ${saveName})`);
console.log(
  `  chunks: ${summary.chunkCount} · entries: ${summary.totalEntries} · non-air: ${summary.nonAirEntries}`,
);
console.log(`  block ids: ${blockList}`);

const capturesArg = getFlag(args, 'captures');
const portArg = getFlag(args, 'port');
const port = portArg ? Number(portArg) : undefined;

try {
  const result = archiveWorld({
    saveName,
    title,
    savesDir,
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
    ...(port ? { roamPort: port } : {}),
  });

  console.log(`Packaged "${title}" -> ${result.archiveDir}`);
  console.log(
    `Captures copied: ${result.copiedCaptures.length ? result.copiedCaptures.join(', ') : 'none'}`,
  );
  console.log(
    `Restore: npm run world:restore -- --archive ${result.archiveId} --save ${saveName}-restored`,
  );
  console.log(`Roam: ${roamUrl(saveName, port, snapshot.meta?.preset)}`);
} catch (err) {
  console.error(`world:package failed: ${(err as Error).message}`);
  process.exit(1);
}
