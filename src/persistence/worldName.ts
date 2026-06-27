// src/persistence/worldName.ts
/** The world name selected by `?save=`, sanitized; defaults to "default". */
export function worldNameFromSearch(search: string): string {
  const raw = new URLSearchParams(search).get('save') ?? '';
  const clean = raw.replace(/[^a-z0-9_-]/gi, '_').slice(0, 64);
  return clean.length > 0 ? clean : 'default';
}
