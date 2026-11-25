/**
 * aiProxyRoute.ts — where the hosted AI proxy lives · 本站AI地址 (ADR-0007)
 *
 * Pure (no Supabase client, no import.meta.env) so Playwright specs can
 * import it next to services/aiTransport, which sends the requests.
 */

/** The Edge Function name (supabase/functions/ai-proxy). */
export const AI_PROXY_FUNCTION = 'ai-proxy';

/** The bearer the dev-only e2e session seam sends (never a real token). */
export const E2E_ACCESS_TOKEN = 'e2e-access-token';

export function aiProxyUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/functions/v1/${AI_PROXY_FUNCTION}`;
}
