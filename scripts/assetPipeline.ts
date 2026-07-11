import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, weld } from '@gltf-transform/functions';
import { PNG } from 'pngjs';

const TILE_SIZE = 16;
const MAX_TEXTURES = 15;
const MAX_MODELS = 12;
const MAX_PNG_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_GLB_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_PROD_BYTES = 10 * 1024 * 1024;
const MAX_REPO_BYTES = 15 * 1024 * 1024;

type AssetRecord = {
  id: string;
  package: string;
  creator: string;
  sourcePage: string;
  license: string;
  retrievedAt: string;
  stagedFile: string;
  originalFiles: string[];
  outputFiles: string[];
  modifications: string[];
  sha256: string;
};

export type TextureAssetRecord = AssetRecord & { semanticKey: string };
export type ModelAssetRecord = AssetRecord & {
  defaultScale: number;
  yOffset?: number;
  yawOffset?: number;
};

export type AssetCatalog = {
  version: number;
  note: string;
  textures: TextureAssetRecord[];
  models: ModelAssetRecord[];
};

export type AssetBuildResult = {
  processedTextures: number;
  processedModels: number;
  skipped: string[];
  warnings: string[];
  outputBytes: number;
};

type BuildOptions = {
  rootDir?: string;
  log?: (message: string) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be a string array`);
  }
}

function assertSafeRelativePath(path: string, prefix: string, field: string): void {
  const normalized = path.replaceAll('\\', '/');
  if (
    isAbsolute(path) ||
    normalized.includes('/../') ||
    normalized.startsWith('../') ||
    !normalized.startsWith(prefix)
  ) {
    throw new Error(`${field} must stay under ${prefix}`);
  }
}

function validateCommonAsset(value: unknown, field: string): asserts value is AssetRecord {
  if (!isRecord(value)) throw new Error(`${field} must be an object`);
  for (const key of [
    'id',
    'package',
    'creator',
    'sourcePage',
    'license',
    'retrievedAt',
    'stagedFile',
    'sha256',
  ]) {
    assertString(value[key], `${field}.${key}`);
  }
  assertStringArray(value.originalFiles, `${field}.originalFiles`);
  assertStringArray(value.outputFiles, `${field}.outputFiles`);
  assertStringArray(value.modifications, `${field}.modifications`);
  const asset = value as unknown as AssetRecord;
  if (!asset.id.trim()) throw new Error(`${field}.id must not be empty`);
  if (asset.license !== 'CC0-1.0') throw new Error(`${field}.license must be CC0-1.0`);
  if (asset.outputFiles.length !== 1) {
    throw new Error(`${field}.outputFiles must contain one path`);
  }
  assertSafeRelativePath(asset.stagedFile, '.asset-staging/', `${field}.stagedFile`);
}

export function validateAssetCatalog(input: unknown): AssetCatalog & { warnings: string[] } {
  if (!isRecord(input)) throw new Error('Asset catalog must be an object');
  if (input.version !== 1) throw new Error('Asset catalog version must be 1');
  assertString(input.note, 'note');
  if (!Array.isArray(input.textures) || !Array.isArray(input.models)) {
    throw new Error('textures and models must be arrays');
  }

  const ids = new Set<string>();
  const semanticKeys = new Set<string>();
  input.textures.forEach((entry, index) => {
    const field = `textures[${index}]`;
    validateCommonAsset(entry, field);
    const candidate = entry as unknown as Record<string, unknown>;
    assertString(candidate.semanticKey, `${field}.semanticKey`);
    const texture = entry as TextureAssetRecord;
    if (ids.has(texture.id)) throw new Error(`Duplicate asset id: ${texture.id}`);
    if (semanticKeys.has(texture.semanticKey)) {
      throw new Error(`Duplicate texture semantic key: ${texture.semanticKey}`);
    }
    assertSafeRelativePath(
      texture.outputFiles[0],
      'public/assets/textures/fantasy/',
      `${field}.outputFiles[0]`,
    );
    ids.add(texture.id);
    semanticKeys.add(texture.semanticKey);
  });
  input.models.forEach((entry, index) => {
    const field = `models[${index}]`;
    validateCommonAsset(entry, field);
    const model = entry as ModelAssetRecord;
    if (typeof model.defaultScale !== 'number' || !Number.isFinite(model.defaultScale)) {
      throw new Error(`${field}.defaultScale must be finite`);
    }
    if (ids.has(model.id)) throw new Error(`Duplicate asset id: ${model.id}`);
    assertSafeRelativePath(
      model.outputFiles[0],
      'public/assets/models/fantasy/',
      `${field}.outputFiles[0]`,
    );
    ids.add(model.id);
  });

  const warnings: string[] = [];
  if (input.textures.length > MAX_TEXTURES) {
    warnings.push(
      `Texture budget exceeded: ${input.textures.length} catalog entries (maximum ${MAX_TEXTURES})`,
    );
  }
  if (input.models.length > MAX_MODELS) {
    warnings.push(
      `Model budget exceeded: ${input.models.length} catalog entries (maximum ${MAX_MODELS})`,
    );
  }
  return { ...(input as AssetCatalog), warnings };
}

function resolvedWithin(rootDir: string, relativePath: string): string {
  const target = resolve(rootDir, relativePath);
  const fromRoot = relative(resolve(rootDir), target);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error(`Asset path escapes the repository: ${relativePath}`);
  }
  return target;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function prepareTexture(source: Buffer): Buffer {
  let decoded: PNG;
  try {
    decoded = PNG.sync.read(source);
  } catch (error) {
    throw new Error(`Corrupt PNG: ${(error as Error).message}`);
  }
  if (decoded.width < 1 || decoded.height < 1) throw new Error('PNG has invalid dimensions');
  const cropSize = Math.min(decoded.width, decoded.height);
  const cropX = Math.floor((decoded.width - cropSize) / 2);
  const cropY = Math.floor((decoded.height - cropSize) / 2);
  const output = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  for (let y = 0; y < TILE_SIZE; y += 1) {
    const sourceY = cropY + Math.floor((y * cropSize) / TILE_SIZE);
    for (let x = 0; x < TILE_SIZE; x += 1) {
      const sourceX = cropX + Math.floor((x * cropSize) / TILE_SIZE);
      const sourceOffset = (sourceY * decoded.width + sourceX) * 4;
      const outputOffset = (y * TILE_SIZE + x) * 4;
      output.data.set(decoded.data.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
  return PNG.sync.write(output, { colorType: 6, inputColorType: 6, bitDepth: 8 });
}

async function prepareModel(sourcePath: string): Promise<Uint8Array> {
  const io = new NodeIO();
  const document = await io.read(sourcePath);
  for (const animation of document.getRoot().listAnimations()) animation.dispose();
  await document.transform(prune({ keepLeaves: true }), dedup(), weld());
  return io.writeBinary(document);
}

async function writeOutput(path: string, data: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export async function buildAssets(options: BuildOptions = {}): Promise<AssetBuildResult> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const log = options.log ?? console.log;
  const catalogPath = resolve(rootDir, 'assets/asset-sources.json');
  const catalog = validateAssetCatalog(JSON.parse(await readFile(catalogPath, 'utf8')));
  const warnings = [...catalog.warnings];
  const skipped: string[] = [];
  const tiles: Record<string, number[]> = {};
  const outputPaths: string[] = [];
  let processedTextures = 0;
  let processedModels = 0;

  for (const asset of catalog.textures) {
    const sourcePath = resolvedWithin(rootDir, asset.stagedFile);
    if (!(await exists(sourcePath))) {
      skipped.push(asset.stagedFile);
      continue;
    }
    const inputStat = await stat(sourcePath);
    if (inputStat.size > MAX_PNG_INPUT_BYTES) {
      throw new Error(`${asset.stagedFile} exceeds the 16 MB PNG input limit`);
    }
    const prepared = prepareTexture(await readFile(sourcePath));
    const outputPath = resolvedWithin(rootDir, asset.outputFiles[0]);
    await writeOutput(outputPath, prepared);
    const decoded = PNG.sync.read(prepared);
    tiles[asset.semanticKey] = Array.from(decoded.data);
    asset.sha256 = sha256(prepared);
    outputPaths.push(outputPath);
    processedTextures += 1;
  }

  for (const asset of catalog.models) {
    const sourcePath = resolvedWithin(rootDir, asset.stagedFile);
    if (!(await exists(sourcePath))) {
      skipped.push(asset.stagedFile);
      continue;
    }
    const inputStat = await stat(sourcePath);
    if (inputStat.size > MAX_GLB_INPUT_BYTES) {
      throw new Error(`${asset.stagedFile} exceeds the 64 MB GLB input limit`);
    }
    let prepared: Uint8Array;
    try {
      prepared = await prepareModel(sourcePath);
    } catch (error) {
      throw new Error(`Corrupt GLB ${asset.stagedFile}: ${(error as Error).message}`);
    }
    const outputPath = resolvedWithin(rootDir, asset.outputFiles[0]);
    await writeOutput(outputPath, prepared);
    asset.sha256 = sha256(prepared);
    outputPaths.push(outputPath);
    processedModels += 1;
  }

  const themePath = resolve(rootDir, 'public/assets/textures/fantasy/theme.tiles.json');
  const themeData = Buffer.from(`${JSON.stringify(tiles)}\n`);
  await writeOutput(themePath, themeData);
  outputPaths.push(themePath);

  if (processedTextures + processedModels > 0) {
    const { warnings: _warnings, ...persistedCatalog } = catalog;
    await writeFile(catalogPath, `${JSON.stringify(persistedCatalog, null, 2)}\n`);
  }

  let outputBytes = 0;
  for (const outputPath of outputPaths) outputBytes += (await stat(outputPath)).size;
  if (outputBytes > MAX_PROD_BYTES) {
    warnings.push(
      `Production asset budget exceeded: ${outputBytes} bytes (maximum ${MAX_PROD_BYTES})`,
    );
  }
  if (outputBytes > MAX_REPO_BYTES) {
    warnings.push(
      `Repository asset budget exceeded: ${outputBytes} bytes (maximum ${MAX_REPO_BYTES})`,
    );
  }
  for (const warning of warnings) log(`Warning: ${warning}`);
  if (skipped.length > 0) {
    log(`Skipped ${skipped.length} unstaged asset${skipped.length === 1 ? '' : 's'}:`);
    for (const path of skipped) log(`  - ${path}`);
  }
  log(`Prepared ${processedTextures} texture(s) and ${processedModels} model(s).`);

  return { processedTextures, processedModels, skipped, warnings, outputBytes };
}
