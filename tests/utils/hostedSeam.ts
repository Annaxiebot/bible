/**
 * hostedSeam.ts — sign a unit test in the way Playwright does · 单元测试登录替身
 *
 * Since 2026-10-23 every AI call needs sign-in (ADR-0007): there is no own
 * key to plant any more. The dev-only seam window.__LEADER_E2E__ +
 * window.__SUPABASE_E2E__ (services/e2eLeader, services/aiTransport) makes
 * a test "signed in"; hosted AI then posts to the ai-proxy under SEAM_BASE
 * with E2E_ACCESS_TOKEN. Returns the undo for afterEach / finally.
 */
import { finalAIBody } from '../../services/aiFinalBody';
import type { AIRole } from '../../supabase/functions/ai-proxy/policy';

export const SEAM_UID = 'e2e-uid';
export const SEAM_BASE = 'http://localhost:3000/e2e-supabase';
export const SEAM_ANON_KEY = 'e2e-anon';

type Seams = Window & { __LEADER_E2E__?: unknown; __SUPABASE_E2E__?: unknown };

export function signInSeam(uid = SEAM_UID): () => void {
  const w = window as Seams;
  w.__LEADER_E2E__ = { uid, email: 'leader@example.org', name: 'Leader' };
  w.__SUPABASE_E2E__ = { url: SEAM_BASE, anonKey: SEAM_ANON_KEY };
  return signOutSeam;
}

export function signOutSeam(): void {
  const w = window as Seams;
  delete w.__LEADER_E2E__;
  delete w.__SUPABASE_E2E__;
}

/**
 * The body the proxy forwards for one the browser sent: `role` dropped, the
 * server's final messages built by the same builder (services/aiFinalBody).
 * Equals the old own-key POST body, so pre-2026-10-23 golden hashes still pin it.
 */
export function finalOfSent(sentBody: string): string {
  const { role, ...data } = JSON.parse(sentBody) as Record<string, unknown> & { role: AIRole };
  return finalAIBody(role, JSON.stringify(data));
}
