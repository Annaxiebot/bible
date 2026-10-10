/**
 * askHistory.ts — an in-memory ask_ai_history behind the fake PostgREST base · 问一问记录测试替身 (ADR-0021)
 *
 * Routes what the app calls (components/studypack/askHistory.ts) under the
 * fake Supabase base of helpers/signup: the list (GET, filtered by pack and
 * leader, oldest first), deletes (by id or by pack), the save RPC and the
 * study_packs permission column (GET / PATCH). The RPC mirrors
 * database/ask-ai-history-schema.sql's save_ask_ai_exchange — the same
 * limit, the same refusal code, replace drops the oldest and stores the
 * permission — so the e2e meets the server's real rule (mock fidelity).
 */
import { Page, Route } from '@playwright/test';
import { E2E_SUPABASE_PATH, E2E_LEADER_ID } from './signup';
import { STUDY_PACKS_TABLE } from '../../../supabase/functions/_shared/signup';
import {
  ASK_HISTORY_LIMIT, ASK_HISTORY_TABLE, SAVE_ASK_EXCHANGE_FN, ASK_HISTORY_FULL_CODE, ASK_REPLACE_COLUMN,
} from '../../../components/studypack/askHistoryRules';

export interface FakeExchange {
  id: string; leader_id: string; pack_id: string; question: string; answer: string; model: string | null; created_at: string;
}

export interface AskHistoryServer {
  rows: () => FakeExchange[];
  replaceAllowed: (packId: string) => boolean;
  rpcCalls: () => Array<Record<string, unknown>>;
}

const json = { 'Content-Type': 'application/json' };
/** PostgREST's "col=eq.value" filter, or null when absent. */
const eqParam = (url: URL, col: string) => url.searchParams.get(col)?.replace(/^eq\./, '') ?? null;

/** n saved rows for `packId`, one minute apart, starting `start` (oldest first). */
export function seedExchanges(packId: string, n: number, start = Date.parse('2026-10-01T18:00:00Z')): FakeExchange[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `seed-${i + 1}`, leader_id: E2E_LEADER_ID, pack_id: packId, question: `旧问题 ${i + 1} · Old question ${i + 1}`,
    answer: `旧回答 ${i + 1} · Old answer ${i + 1}`, model: 'google/gemini-2.5-flash', created_at: new Date(start + i * 60_000).toISOString(),
  }));
}

/** save_ask_ai_exchange, as the SQL does it (the caller is E2E_LEADER_ID and owns the pack). */
function save(rows: FakeExchange[], allowed: Set<string>, body: Record<string, unknown>): { status: number; body: unknown } {
  const packId = String(body.p_pack_id);
  const mine = rows.filter(r => r.pack_id === packId).sort((a, b) => a.created_at.localeCompare(b.created_at));
  let verdict = 'saved';
  if (mine.length >= ASK_HISTORY_LIMIT) {
    if (!(body.p_replace_oldest === true || allowed.has(packId))) {
      return { status: 400, body: { code: ASK_HISTORY_FULL_CODE, message: 'ask_ai_history_full', details: null, hint: null } };
    }
    for (const old of mine.slice(0, mine.length - ASK_HISTORY_LIMIT + 1)) rows.splice(rows.indexOf(old), 1);
    verdict = 'replaced';
  }
  if (body.p_replace_oldest === true) allowed.add(packId);
  rows.push({
    id: crypto.randomUUID(), leader_id: E2E_LEADER_ID, pack_id: packId, question: String(body.p_question),
    answer: String(body.p_answer), model: (body.p_model as string | null) ?? null, created_at: new Date().toISOString(),
  });
  return { status: 200, body: verdict };
}

function serveTable(route: Route, rows: FakeExchange[]) {
  const request = route.request();
  const url = new URL(request.url());
  const pack = eqParam(url, 'pack_id');
  const id = eqParam(url, 'id');
  const leader = eqParam(url, 'leader_id');
  const hit = (r: FakeExchange) => (!pack || r.pack_id === pack) && (!id || r.id === id) && (!leader || r.leader_id === leader);
  if (request.method() === 'DELETE') {
    for (const r of rows.filter(hit)) rows.splice(rows.indexOf(r), 1);
    return route.fulfill({ status: 204 });
  }
  const list = rows.filter(hit).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return route.fulfill({ status: 200, headers: json, body: JSON.stringify(list) });
}

/** Route the history table, the save RPC and the permission column; `seed` rows (and `allowedPacks` permissions) are on the server already. */
export async function mockAskHistory(page: Page, seed: FakeExchange[] = [], allowedPacks: string[] = []): Promise<AskHistoryServer> {
  const rows = [...seed];
  const allowed = new Set<string>(allowedPacks);
  const rpcCalls: Array<Record<string, unknown>> = [];
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${ASK_HISTORY_TABLE}**`, route => serveTable(route, rows));
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/rpc/${SAVE_ASK_EXCHANGE_FN}**`, route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    rpcCalls.push(body);
    const reply = save(rows, allowed, body);
    return route.fulfill({ status: reply.status, headers: json, body: JSON.stringify(reply.body) });
  });
  await page.route(`**${E2E_SUPABASE_PATH}/rest/v1/${STUDY_PACKS_TABLE}**`, route => {
    const request = route.request();
    const packId = eqParam(new URL(request.url()), 'id') ?? '';
    if (request.method() === 'PATCH') {
      const patch = request.postDataJSON() as Record<string, unknown>;
      if (patch[ASK_REPLACE_COLUMN] === false) allowed.delete(packId); else allowed.add(packId);
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ status: 200, headers: json, body: JSON.stringify({ [ASK_REPLACE_COLUMN]: allowed.has(packId) }) });
  });
  return { rows: () => rows, replaceAllowed: packId => allowed.has(packId), rpcCalls: () => rpcCalls };
}
