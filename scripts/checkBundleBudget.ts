import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

interface Budget {
  label: string;
  match: (name: string) => boolean;
  rawKiB: number;
  gzipKiB: number;
}

const DIST = join(process.cwd(), 'dist');
const files = readdirSync(DIST, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => join(entry.parentPath, entry.name));

const budgets: Budget[] = [
  {
    label: 'application JavaScript',
    match: (name) => /^index-.*\.js$/.test(name),
    rawKiB: 1100,
    gzipKiB: 320,
  },
  {
    label: 'generation worker',
    match: (name) => /^genWorker-.*\.js$/.test(name),
    rawKiB: 180,
    gzipKiB: 55,
  },
  {
    label: 'mesh worker',
    match: (name) => /^meshWorker-.*\.js$/.test(name),
    rawKiB: 40,
    gzipKiB: 15,
  },
];

const kib = (bytes: number): number => bytes / 1024;
let failed = false;

for (const budget of budgets) {
  const file = files.find((candidate) => budget.match(basename(candidate)));
  if (!file) {
    console.error(`bundle budget: missing ${budget.label} artifact`);
    failed = true;
    continue;
  }
  const content = readFileSync(file);
  const raw = kib(content.byteLength);
  const gzip = kib(gzipSync(content).byteLength);
  const rawOk = raw <= budget.rawKiB;
  const gzipOk = gzip <= budget.gzipKiB;
  console.log(
    `${rawOk && gzipOk ? 'PASS' : 'FAIL'} ${budget.label}: ` +
      `${raw.toFixed(1)}/${budget.rawKiB} KiB raw, ` +
      `${gzip.toFixed(1)}/${budget.gzipKiB} KiB gzip`,
  );
  failed ||= !rawOk || !gzipOk;
}

if (failed) process.exitCode = 1;
