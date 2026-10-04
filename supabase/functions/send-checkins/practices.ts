/**
 * practices.ts — the practices a sign-up chose, new rows and old · 所选操练
 *
 * Single source (R3) for the browser (signup insert, leader roster, check-in
 * page) and this edge function (emails). Pure, no imports, so both runtimes
 * load it (the app imports it extensionless, like ai-proxy/policy).
 *
 * Storage (ADR-0004 §7): `practices` JSONB holds every chosen life-menu row
 * in tap order. The legacy columns practice_area/practice_text (= first) and
 * practice2_area/practice2_text (= second) are still written for older
 * readers; rows from before multi-select have only those.
 */

export interface ChosenPractice {
  area: string;
  practice: string;
}

/** The practice columns of a study_signups row (or the checkin_context reply); all optional for old rows. */
export interface PracticeColumns {
  practices?: unknown;
  practice_area?: string | null;
  practice_text?: string | null;
  practice2_area?: string | null;
  practice2_text?: string | null;
  practice_note?: string | null;
}

/** What a reader shows for one practice: its area and its text. */
export interface PracticeItem {
  area: string;
  text: string;
}

function isChosen(value: unknown): value is ChosenPractice {
  const v = value as Partial<ChosenPractice> | null;
  return typeof v === 'object' && v !== null && typeof v.area === 'string' && typeof v.practice === 'string' && v.practice.length > 0;
}

/** The full list: `practices` when the row has a usable one, else the legacy first/second pair. */
export function chosenPractices(row: PracticeColumns): ChosenPractice[] {
  const list = Array.isArray(row.practices) ? row.practices.filter(isChosen) : [];
  if (list.length > 0) return list.map(p => ({ area: p.area, practice: p.practice }));
  const legacy: ChosenPractice[] = [];
  if (row.practice_text) legacy.push({ area: row.practice_area ?? '', practice: row.practice_text });
  if (row.practice2_text) legacy.push({ area: row.practice2_area ?? '', practice: row.practice2_text });
  return legacy;
}

/**
 * One item per chosen practice, in order. The member's own version
 * (practice_note) replaces the FIRST practice's menu text, as it always
 * has; a note on a row without a practice is the one item.
 */
export function practiceItems(row: PracticeColumns): PracticeItem[] {
  const items = chosenPractices(row).map(p => ({ area: p.area, text: p.practice }));
  const note = row.practice_note?.trim();
  if (!note) return items;
  if (items.length === 0) return [{ area: '', text: note }];
  return [{ area: items[0].area, text: note }, ...items.slice(1)];
}

/** Just the texts of practiceItems (one line each in messages). */
export function practiceTexts(row: PracticeColumns): string[] {
  return practiceItems(row).map(item => item.text);
}

/** The insert's practice columns: the full list plus the legacy first/second pair for older readers. */
export function practiceColumns(list: readonly ChosenPractice[]): {
  practices: ChosenPractice[];
  practice_area: string | null;
  practice_text: string | null;
  practice2_area: string | null;
  practice2_text: string | null;
} {
  const [first, second] = list;
  return {
    practices: list.map(p => ({ area: p.area, practice: p.practice })),
    practice_area: first?.area ?? null,
    practice_text: first?.practice ?? null,
    practice2_area: second?.area ?? null,
    practice2_text: second?.practice ?? null,
  };
}
