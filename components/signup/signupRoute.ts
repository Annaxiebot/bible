/**
 * signupRoute.ts — the per-pack sign-up route, its URL, and how the QR encodes it · 报名路由
 *
 * "#/signup/<packId>" is the member-facing sign-up page (scanned from the
 * TV QR); "#/qr/<packId>" is the leader's page that SHOWS that QR (screen
 * or print). Pure module: the hash helpers take no globals, and the browser
 * wrapper `currentSignupUrl` is the one place that reads window/BASE_URL,
 * so packTypes.buildSlides, TVSlide, the landing and tests all derive the
 * same URL (R3).
 */

export const SIGNUP_HASH_PREFIX = '#/signup/';

const SIGNUP_HASH_RE = /^#\/signup\/([A-Za-z0-9._-]+)$/;

export function signupHash(packId: string): string {
  return `${SIGNUP_HASH_PREFIX}${packId}`;
}

/** "#/signup/<id>" → pack id, anything else → null. */
export function getSignupPackIdFromHash(hash: string): string | null {
  const match = SIGNUP_HASH_RE.exec(hash);
  return match ? match[1] : null;
}

export const QR_HASH_PREFIX = '#/qr/';

const QR_HASH_RE = /^#\/qr\/([A-Za-z0-9._-]+)$/;

/** The leader's QR page for a pack: shows (and prints) the code that encodes signupUrl. */
export function qrHash(packId: string): string {
  return `${QR_HASH_PREFIX}${packId}`;
}

/** "#/qr/<id>" → pack id, anything else → null. */
export function getQrPackIdFromHash(hash: string): string | null {
  const match = QR_HASH_RE.exec(hash);
  return match ? match[1] : null;
}

/** Absolute sign-up URL: origin + app base path + hash, e.g. https://scripturetolife.org/#/signup/<id>. */
export function signupUrl(packId: string, origin: string, base: string): string {
  return `${origin}${base}${signupHash(packId)}`;
}

/** The sign-up URL for this deployment (what the QR encodes). */
export function currentSignupUrl(packId: string): string {
  return signupUrl(packId, window.location.origin, import.meta.env.BASE_URL);
}

/** How SignupQr draws the URL (and how tests re-encode it to compare): SVG, 1-module quiet zone, level M. */
export const QR_SVG_OPTIONS = { type: 'svg', margin: 1, errorCorrectionLevel: 'M' } as const;

/**
 * The dark-module path data of a library SVG (its second <path>). Tests
 * compare this instead of the whole markup because browsers re-serialize
 * self-closing tags; the path data is the encoded QR itself.
 */
export function qrModulesPath(svg: string): string {
  const match = /<path stroke="[^"]*" d="([^"]+)"/.exec(svg);
  if (!match) throw new Error('No QR module path in SVG');
  return match[1];
}
