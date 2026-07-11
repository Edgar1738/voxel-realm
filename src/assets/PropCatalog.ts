export interface PropAssetDef {
  id: string;
  /** Path relative to public/assets/. */
  url: string;
  defaultScale: number;
  yOffset?: number;
  yawOffset?: number;
}

/** Reviewed, optimized CC0 fantasy props available to world placement files. */
export const PROP_CATALOG: readonly PropAssetDef[] = [
  { id: 'dead_tree', url: 'models/fantasy/dead_tree.glb', defaultScale: 1 },
  { id: 'crystal', url: 'models/fantasy/crystal.glb', defaultScale: 1 },
  { id: 'chest', url: 'models/fantasy/chest.glb', defaultScale: 1 },
  { id: 'barrel', url: 'models/fantasy/barrel.glb', defaultScale: 1 },
  { id: 'crate', url: 'models/fantasy/crate.glb', defaultScale: 1 },
  { id: 'table', url: 'models/fantasy/table.glb', defaultScale: 1 },
  { id: 'bench', url: 'models/fantasy/bench.glb', defaultScale: 1 },
  { id: 'candle', url: 'models/fantasy/candle.glb', defaultScale: 1 },
  { id: 'books', url: 'models/fantasy/books.glb', defaultScale: 1 },
  { id: 'broken_column', url: 'models/fantasy/broken_column.glb', defaultScale: 1 },
  { id: 'rubble', url: 'models/fantasy/rubble.glb', defaultScale: 1 },
  { id: 'statue', url: 'models/fantasy/statue.glb', defaultScale: 1 },
];

export function propAssetUrl(asset: PropAssetDef, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}assets/${asset.url.replace(/^\/+/, '')}`;
}
