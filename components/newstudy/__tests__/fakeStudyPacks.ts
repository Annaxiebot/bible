/**
 * fakeStudyPacks.ts — an in-memory study_packs table for the sync tests · 云端查经包替身
 *
 * Mirrors the real table's guards that the code relies on (test harness
 * fidelity): rows are keyed by id; select/delete apply every .eq() filter;
 * an upsert onto an id another leader owns is rejected like RLS would; any
 * operation can be told to fail with a PostgREST-style error.
 */
import { STUDY_PACKS_TABLE } from '../packRemote';

export interface Row { id: string; leader_id: string; title: string; pack: unknown }
type Result = { data: unknown; error: { message: string } | null };
type Op = 'select' | 'upsert' | 'delete';

interface Query extends PromiseLike<Result> {
  eq(column: string, value: string): Query;
  maybeSingle(): Promise<Result>;
}

export function makeFakeStudyPacks() {
  const rows = new Map<string, Row>();
  const errors: Partial<Record<Op, string>> = {};
  const calls = { upsert: [] as Row[], delete: [] as Record<string, string>[], select: 0 };

  const query = (op: 'select' | 'delete'): Query => {
    const filters: Record<string, string> = {};
    const run = (): Result => {
      if (errors[op]) return { data: null, error: { message: errors[op]! } };
      const match = [...rows.values()].filter(r =>
        Object.entries(filters).every(([c, v]) => (r as unknown as Record<string, string>)[c] === v));
      if (op === 'delete') { calls.delete.push({ ...filters }); match.forEach(r => rows.delete(r.id)); return { data: null, error: null }; }
      calls.select += 1;
      return { data: match, error: null };
    };
    const q: Query = {
      eq: (column, value) => { filters[column] = value; return q; },
      maybeSingle: async () => { const r = run(); return r.error ? r : { data: (r.data as Row[])[0] ?? null, error: null }; },
      then: (onFulfilled, onRejected) => Promise.resolve(run()).then(onFulfilled, onRejected),
    };
    return q;
  };

  const client = {
    from: (table: string) => {
      if (table !== STUDY_PACKS_TABLE) throw new Error(`unexpected table ${table}`);
      return {
        select: () => query('select'),
        delete: () => query('delete'),
        upsert: async (row: Row): Promise<Result> => {
          if (errors.upsert) return { data: null, error: { message: errors.upsert } };
          const existing = rows.get(row.id);
          if (existing && existing.leader_id !== row.leader_id) {
            return { data: null, error: { message: 'new row violates row-level security policy' } };
          }
          calls.upsert.push(row);
          rows.set(row.id, row);
          return { data: null, error: null };
        },
      };
    },
  };
  return { client, rows, errors, calls };
}
