/**
 * cors.ts — the one CORS policy for the site's edge functions · 跨域策略
 *
 * Pure (no Deno), shared by ai-proxy and send-checkins. Browsers on
 * scripturetolife.org or localhost (dev) get their origin echoed back; any
 * other origin gets no Access-Control-Allow-Origin, so its browser refuses
 * the response. Server-to-server callers (pg_cron, the owner's shell) send
 * no Origin and are unaffected.
 */
export const SITE_ORIGIN = 'https://scripturetolife.org';

const LOCALHOST_ORIGIN = /^http:\/\/localhost(:\d{1,5})?$/;

export function isAllowedOrigin(origin: string | null): boolean {
  return origin !== null && (origin === SITE_ORIGIN || LOCALHOST_ORIGIN.test(origin));
}

/** CORS headers: the origin is echoed only when allowed (a browser elsewhere gets no ACAO). */
export function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  return isAllowedOrigin(origin) ? { ...base, 'Access-Control-Allow-Origin': origin as string } : base;
}

/** The answer to a browser's preflight (OPTIONS): 204 for an allowed origin, else 403. */
export function preflightResponse(origin: string | null): Response {
  return new Response(null, { status: isAllowedOrigin(origin) ? 204 : 403, headers: corsHeaders(origin) });
}

/** The same response with the CORS headers added (handlers stay CORS-unaware). */
export function withCors(response: Response, origin: string | null): Response {
  for (const [name, value] of Object.entries(corsHeaders(origin))) response.headers.set(name, value);
  return response;
}
