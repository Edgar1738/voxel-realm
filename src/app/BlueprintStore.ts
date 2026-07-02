import { validatePrefab, type Prefab } from '../core/Prefab';

/**
 * Named, durable blueprint storage for the in-game builder. Dev uses the vite server's
 * `/__blueprint` endpoint (shared `.blueprints/` on disk, same files as `__vr.saveBlueprint`);
 * production falls back to localStorage.
 */
export interface BlueprintStore {
  list(): Promise<string[]>;
  /** Loads and validates a blueprint; throws on missing or malformed data. */
  load(name: string): Promise<Prefab>;
  save(name: string, blueprint: Prefab): Promise<void>;
  remove(name: string): Promise<void>;
}

/** Mirror of the dev server's file-name sanitizer so list/load/delete round-trip one name. */
export function safeBlueprintName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_');
}

function parseBlueprint(raw: string, name: string): Prefab {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`blueprint "${name}" is not valid JSON`);
  }
  const reason = validatePrefab(parsed);
  if (reason) throw new Error(`invalid blueprint "${name}": ${reason}`);
  return parsed as Prefab;
}

/** Dev: blueprints live in `.blueprints/` on the vite server (shared across sessions/agents). */
export class ServerBlueprintStore implements BlueprintStore {
  constructor(private readonly fetchFn: typeof fetch = (...args) => fetch(...args)) {}

  async list(): Promise<string[]> {
    const res = await this.fetchFn('/__blueprint?list');
    if (!res.ok) throw new Error(`blueprint list failed (${res.status})`);
    const { blueprints } = (await res.json()) as { blueprints?: unknown };
    return Array.isArray(blueprints)
      ? blueprints.filter((n): n is string => typeof n === 'string')
      : [];
  }

  async load(name: string): Promise<Prefab> {
    const safe = safeBlueprintName(name);
    const res = await this.fetchFn(`/__blueprint?name=${encodeURIComponent(safe)}`);
    if (!res.ok) throw new Error(`blueprint not found: ${safe}`);
    return parseBlueprint(await res.text(), safe);
  }

  async save(name: string, blueprint: Prefab): Promise<void> {
    const safe = safeBlueprintName(name);
    const res = await this.fetchFn('/__blueprint', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: safe, blueprint }),
    });
    if (!res.ok) throw new Error(`blueprint save failed (${res.status})`);
  }

  async remove(name: string): Promise<void> {
    const safe = safeBlueprintName(name);
    const res = await this.fetchFn(`/__blueprint?name=${encodeURIComponent(safe)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error(`blueprint delete failed (${res.status})`);
  }
}

const LS_PREFIX = 'vr.blueprint.';

/** Minimal Storage surface so tests can inject a Map-backed fake (node has no localStorage). */
export interface StringStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/** Production: blueprints in localStorage under `vr.blueprint.<name>` (per-browser). */
export class LocalStorageBlueprintStore implements BlueprintStore {
  constructor(private readonly storage: StringStore = window.localStorage) {}

  list(): Promise<string[]> {
    const names: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(LS_PREFIX)) names.push(key.slice(LS_PREFIX.length));
    }
    return Promise.resolve(names.sort());
  }

  load(name: string): Promise<Prefab> {
    const safe = safeBlueprintName(name);
    const raw = this.storage.getItem(LS_PREFIX + safe);
    if (raw === null) return Promise.reject(new Error(`blueprint not found: ${safe}`));
    try {
      return Promise.resolve(parseBlueprint(raw, safe));
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)));
    }
  }

  save(name: string, blueprint: Prefab): Promise<void> {
    try {
      this.storage.setItem(LS_PREFIX + safeBlueprintName(name), JSON.stringify(blueprint));
      return Promise.resolve();
    } catch {
      // localStorage quota (~5MB) exceeded, or storage unavailable in private mode.
      return Promise.reject(new Error('blueprint save failed: storage full or unavailable'));
    }
  }

  remove(name: string): Promise<void> {
    this.storage.removeItem(LS_PREFIX + safeBlueprintName(name));
    return Promise.resolve();
  }
}
