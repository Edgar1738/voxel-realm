export interface PropAssetDef {
  id: string;
  /** Path relative to public/assets/. */
  url: string;
  defaultScale: number;
  yOffset?: number;
  yawOffset?: number;
}

/** Populated only after optimized model derivatives have been staged and reviewed. */
export const PROP_CATALOG: readonly PropAssetDef[] = [];

export function propAssetUrl(asset: PropAssetDef, baseUrl: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${base}assets/${asset.url.replace(/^\/+/, '')}`;
}
