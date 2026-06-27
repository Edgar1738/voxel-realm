// src/persistence/ServerWorldCatalog.ts
const ENDPOINT = '/__world';

export async function listWorlds(): Promise<string[]> {
  try {
    const res = await fetch(`${ENDPOINT}?list=1`);
    if (!res.ok) return [];
    const json = (await res.json()) as { worlds?: string[] };
    return json.worlds ?? [];
  } catch {
    return [];
  }
}

export async function copyWorld(from: string, to: string): Promise<void> {
  await fetch(`${ENDPOINT}?name=${encodeURIComponent(from)}&copyTo=${encodeURIComponent(to)}`, {
    method: 'POST',
  });
}

export async function deleteWorld(name: string): Promise<void> {
  await fetch(`${ENDPOINT}?name=${encodeURIComponent(name)}`, { method: 'DELETE' });
}
