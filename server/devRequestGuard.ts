/**
 * Same-origin guard for dev-only disk endpoints.
 *
 * Cross-origin browser requests always include an `Origin` header with the
 * attacker's origin, so checking it is sufficient to block CSRF. Same-origin
 * navigations and non-browser clients (curl, Vite's own HMR) omit the header
 * entirely, which we allow.
 */

const ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Returns `true` when the request should be allowed through the dev guard.
 *
 * @param origin - Value of the `Origin` request header (may be undefined).
 * @param host   - Value of the `Host` request header. When provided, the origin's
 *                 host:port must match the server's `Host` header exactly.
 */
export function isAllowedDevOrigin(
  origin: string | undefined,
  host: string | undefined,
): boolean {
  // No Origin header → same-origin navigation or non-browser client → allow.
  if (origin === undefined) return true;

  try {
    const originUrl = new URL(origin);
    if (!ALLOWED_HOSTNAMES.has(originUrl.hostname)) return false;
    // When the server Host header is known, require the origin's host:port to match.
    if (host !== undefined && originUrl.host !== host) return false;
    return true;
  } catch {
    // Unparseable origin → deny defensively.
    return false;
  }
}
