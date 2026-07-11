import type { PropAssetDef } from '../assets/PropCatalog';

export interface WorldPropInstance {
  id: string;
  asset: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
}

export interface ParsedWorldProps {
  instances: WorldPropInstance[];
  problems: string[];
}

type PropsFetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseWorldPropInstances(
  input: unknown,
  catalog: readonly PropAssetDef[],
): ParsedWorldProps {
  const source = Array.isArray(input)
    ? input
    : input && typeof input === 'object' && Array.isArray((input as { props?: unknown }).props)
      ? (input as { props: unknown[] }).props
      : [];
  const knownAssets = new Set(catalog.map((asset) => asset.id));
  const seenIds = new Set<string>();
  const instances: WorldPropInstance[] = [];
  const problems: string[] = [];

  source.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      problems.push(`props[${index}] must be an object`);
      return;
    }
    const value = raw as Record<string, unknown>;
    if (typeof value.id !== 'string' || !value.id.trim()) {
      problems.push(`props[${index}] has no id`);
      return;
    }
    if (seenIds.has(value.id)) {
      problems.push(`props[${index}] has duplicate id "${value.id}"`);
      return;
    }
    seenIds.add(value.id);
    if (typeof value.asset !== 'string' || !knownAssets.has(value.asset)) {
      problems.push(`props[${index}] references unknown asset "${String(value.asset)}"`);
      return;
    }
    if (!finite(value.x) || !finite(value.y) || !finite(value.z)) {
      problems.push(`props[${index}] position must be finite`);
      return;
    }
    const yaw = value.yaw === undefined ? 0 : value.yaw;
    const pitch = value.pitch === undefined ? 0 : value.pitch;
    const roll = value.roll === undefined ? 0 : value.roll;
    const scale = value.scale === undefined ? 1 : value.scale;
    if (!finite(yaw) || !finite(pitch) || !finite(roll) || !finite(scale) || scale <= 0) {
      problems.push(`props[${index}] transforms must be finite and scale must be positive`);
      return;
    }
    instances.push({
      id: value.id,
      asset: value.asset,
      x: value.x,
      y: value.y,
      z: value.z,
      yaw,
      pitch,
      roll,
      scale,
    });
  });

  return { instances, problems };
}

function worldPropsUrl(slug: string, baseUrl: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Invalid world prop slug');
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}worlds/props/${slug}.json`;
}

export async function loadWorldPropInstances(
  slug: string,
  catalog: readonly PropAssetDef[],
  baseUrl: string,
  fetcher: PropsFetch = fetch,
  warn: (message: string) => void = console.warn,
): Promise<WorldPropInstance[]> {
  if (catalog.length === 0) return [];
  try {
    const response = await fetcher(worldPropsUrl(slug, baseUrl));
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`HTTP ${response.status}`);
    }
    const parsed = parseWorldPropInstances(await response.json(), catalog);
    if (parsed.problems.length > 0) {
      warn(`World props for "${slug}" skipped invalid entries: ${parsed.problems.join('; ')}`);
    }
    return parsed.instances;
  } catch (error) {
    warn(`World props for "${slug}" unavailable: ${(error as Error).message}`);
    return [];
  }
}
