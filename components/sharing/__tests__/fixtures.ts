/**
 * fixtures.ts — packs, sign-ups with identifiers, shared answers and a fake
 * PostgREST client for the sharing tests · 上周分享测试数据
 *
 * The answers deliberately mention the members' names, an email and a phone
 * so every test can assert none of them reaches the AI request.
 */
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudyPack } from '../../studypack/packTypes';
import type { SignupRecord, AnswerRecord } from '../../leader/leaderData';
import { SIGNUPS_TABLE, CHECKIN_ANSWERS_TABLE } from '../../signup/signupSchema';
import { CLOSING_LEAD } from '../../newstudy/packAssembly';

export const LEADER = 'uid-leader';
export const CLOSING_Q = '这周忧虑在哪里与真实生活相撞？ · Where did worry meet real life this week?';

export function makePack(id: string, date: string, extra: Partial<StudyPack> = {}): StudyPack {
  return {
    id, date, title: `Pack ${id}`, passageRef: '马太福音 6:25–34 · Matthew 6:25–34', enVersion: 'BSB', leaderId: LEADER,
    contentLanguage: 'zh-keywords',
    sections: [
      { kind: 'title', heading: `Pack ${id}`, body: ['马太福音 6:25–34 · Matthew 6:25–34'] },
      { kind: 'scripture', heading: '经文 Scripture', verses: [{ num: 25, cuv: '所以我告诉你们', en: 'Therefore I tell you' }] },
      { kind: 'context', heading: '背景 Context', body: ['一行'] },
      { kind: 'closing', heading: '闭环 Closing', body: [CLOSING_LEAD, CLOSING_Q] },
    ],
    ...extra,
  };
}

export const PREVIOUS = makePack('local-2026-10-02-matt6', '2026-10-02');
export const CURRENT = makePack('local-2026-10-09-jhn3', '2026-10-09');

const signup = (id: string, name: string, email: string | null, phone: string | null, area: string | null): SignupRecord => ({
  id, leader_id: LEADER, name, email, phone, consent_checkins: true, created_at: '2026-10-02T20:00:00Z',
  practice_area: area, practice_text: '散步 · Walk', practice2_area: null, practice2_text: null, practice_note: '和王小明一起散步',
});

export const SIGNUPS: SignupRecord[] = [
  signup('s-1', '王小明', 'ming@example.org', '+14085551234', '健康 Health'),
  signup('s-2', 'Ann Lee', 'ann@example.org', null, '健康 Health'),
  signup('s-3', '陈静', null, '(408) 555-9876', '家庭 Family'),
  { ...signup('s-4', 'Other Leader Member', 'x@example.org', null, '工作 Work'), leader_id: 'uid-someone-else' },
];

const answer = (id: string, signupId: string, text: string): AnswerRecord => ({
  id, signup_id: signupId, leader_id: LEADER, kind: 'tue', answer: text, created_at: '2026-10-06T00:00:00Z',
});

export const ANSWERS: AnswerRecord[] = [
  answer('a-1', 's-1', '王小明：每天晚饭后散步，焦虑少了。'),
  answer('a-2', 's-2', 'Ann here — walked with my sister, email me at ann@example.org'),
  answer('a-3', 's-3', '陈静 和孩子一起祷告，电话 408-555-9876 随时找我'),
];

/** Every identifier a sign-up row carries: none may appear in what is sent to the AI. */
export const IDENTIFIERS = [
  '王小明', 'Ann Lee', 'Ann', 'Lee', '陈静', 'ming@example.org', 'ann@example.org', '+14085551234', '555-9876', '5551234',
  's-1', 's-2', 's-3', 'a-1', 'a-2', 'a-3',
];

type Rows = { data: unknown; error: { message: string } | null };

/** A client answering study_signups / checkin_answers selects; records each table's .eq filters. */
export function fakeClient(tables: Partial<Record<string, Rows>> = {}) {
  const filters: Record<string, Array<[string, string]>> = {};
  const from = vi.fn((table: string) => {
    filters[table] = [];
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, val: string) => { filters[table].push([col, val]); return chain; }),
      order: vi.fn(async () => tables[table] ?? { data: [], error: null }),
    };
    return chain;
  });
  return { client: { from } as unknown as SupabaseClient, from, filters };
}

export function defaultClient() {
  return fakeClient({
    [SIGNUPS_TABLE]: { data: SIGNUPS, error: null },
    [CHECKIN_ANSWERS_TABLE]: { data: ANSWERS, error: null },
  });
}

/** An SSE body for a streamed reply whose text is `text`. */
export function sseResponse(text: string): Response {
  const sse = `data: ${JSON.stringify({ model: 'anthropic/claude-sonnet-4.5', choices: [{ delta: { content: text }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`;
  return {
    ok: true, status: 200,
    body: new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close(); } }),
  } as unknown as Response;
}

export const GOOD_REPLY = JSON.stringify({
  themes: [{ zh: '散步让焦虑（anxiety）变少' }, { zh: '家人一起操练更容易坚持' }],
  quotes: [{ zh: '晚饭后走一走，心里松了' }, { zh: '和孩子一起祷告' }],
  question: { zh: '上周的操练里，哪一刻你经历了不再忧虑？' },
});
