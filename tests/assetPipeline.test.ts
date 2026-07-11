import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { buildAssets, validateAssetCatalog } from '../scripts/assetPipeline';

function catalog(stagedFile = '.asset-staging/textures/stone.png') {
  return {
    version: 1,
    note: 'test',
    textures: [
      {
        id: 'stone',
        semanticKey: 'stone',
        package: 'Test pack',
        creator: 'Test creator',
        sourcePage: 'https://example.com',
        license: 'CC0-1.0',
        retrievedAt: '',
        stagedFile,
        originalFiles: [],
        outputFiles: ['public/assets/textures/fantasy/stone.png'],
        modifications: [],
        sha256: '',
      },
    ],
    models: [],
  };
}

async function fixture() {
  const rootDir = await mkdtemp(join(tmpdir(), 'voxel-assets-'));
  await mkdir(join(rootDir, 'assets'), { recursive: true });
  await writeFile(
    join(rootDir, 'assets/asset-sources.json'),
    `${JSON.stringify(catalog(), null, 2)}\n`,
  );
  return rootDir;
}

describe('asset preparation pipeline', () => {
  it('validates the committed catalog with unique ids and semantic keys', async () => {
    const committed = JSON.parse(await readFile('assets/asset-sources.json', 'utf8')) as unknown;
    const validated = validateAssetCatalog(committed);
    expect(validated.textures).toHaveLength(13);
    expect(validated.models).toHaveLength(12);
    expect(validated.warnings).toEqual([]);
  });

  it('builds successfully with an empty staging directory and reports skipped entries', async () => {
    const rootDir = await fixture();
    const messages: string[] = [];

    const result = await buildAssets({ rootDir, log: (message) => messages.push(message) });

    expect(result).toMatchObject({ processedTextures: 0, processedModels: 0 });
    expect(result.skipped).toEqual(['.asset-staging/textures/stone.png']);
    expect(messages.join('\n')).toContain('Skipped 1 unstaged asset');
    expect(
      JSON.parse(
        await readFile(join(rootDir, 'public/assets/textures/fantasy/theme.tiles.json'), 'utf8'),
      ),
    ).toEqual({});
  });

  it('center-crops and nearest-neighbor resizes PNG input to deterministic 16x16 RGBA', async () => {
    const rootDir = await fixture();
    const input = new PNG({ width: 32, height: 16 });
    for (let y = 0; y < input.height; y += 1) {
      for (let x = 0; x < input.width; x += 1) {
        const offset = (y * input.width + x) * 4;
        input.data[offset] = x < 8 ? 255 : x >= 24 ? 0 : x;
        input.data[offset + 1] = y;
        input.data[offset + 2] = 77;
        input.data[offset + 3] = x === 8 ? 0 : 255;
      }
    }
    await mkdir(join(rootDir, '.asset-staging/textures'), { recursive: true });
    await writeFile(join(rootDir, '.asset-staging/textures/stone.png'), PNG.sync.write(input));

    await buildAssets({ rootDir, log: () => undefined });
    const first = await readFile(join(rootDir, 'public/assets/textures/fantasy/stone.png'));
    await buildAssets({ rootDir, log: () => undefined });
    const second = await readFile(join(rootDir, 'public/assets/textures/fantasy/stone.png'));
    const output = PNG.sync.read(first);

    expect(output.width).toBe(16);
    expect(output.height).toBe(16);
    expect(output.data[3]).toBe(0);
    expect(second).toEqual(first);
    const tiles = JSON.parse(
      await readFile(join(rootDir, 'public/assets/textures/fantasy/theme.tiles.json'), 'utf8'),
    ) as Record<string, number[]>;
    expect(tiles.stone).toHaveLength(16 * 16 * 4);
  });

  it('rejects duplicate ids, duplicate semantic keys, unsafe paths, and budget overflow', () => {
    const duplicate = catalog();
    duplicate.textures.push({ ...duplicate.textures[0] });
    expect(() => validateAssetCatalog(duplicate)).toThrow(/duplicate asset id/i);

    const unsafe = catalog('../outside.png');
    expect(() => validateAssetCatalog(unsafe)).toThrow(/stagedFile.*\.asset-staging/i);

    const overBudget = catalog();
    overBudget.textures = Array.from({ length: 16 }, (_, index) => ({
      ...overBudget.textures[0],
      id: `tile-${index}`,
      semanticKey: `tile-${index}`,
      stagedFile: `.asset-staging/textures/tile-${index}.png`,
      outputFiles: [`public/assets/textures/fantasy/tile-${index}.png`],
    }));
    expect(validateAssetCatalog(overBudget).warnings).toContain(
      'Texture budget exceeded: 16 catalog entries (maximum 15)',
    );
  });
});
