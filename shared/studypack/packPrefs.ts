/**
 * packPrefs.ts — per-viewer display preferences for a pack · 显示偏好
 *
 * Anyone viewing a pack (leader or member) can hide optional sections and
 * swap the bilingual line order for this device. Pure view-time transform:
 * the stored pack never changes, so the leader's edits and the share link
 * are untouched. localStorage only (members have no account); blocked
 * storage falls back to the defaults.
 */
import { STORAGE_KEYS } from '../constants/storageKeys';
import { BILINGUAL_SEPARATOR } from './principles';
import type { PackSection, SectionKind, StudyPack } from './packTypes';

/**
 * Kinds a viewer may hide. The spine of the study stays: title, scripture,
 * discussion, closing; qr/picture/sharing are leader-managed, not prefs.
 */
export const HIDEABLE_KINDS = [
  'worship', 'context', 'originalLanguage', 'crossRefs', 'lifeMenu', 'reflection',
] as const satisfies readonly SectionKind[];
export type HideableKind = (typeof HIDEABLE_KINDS)[number];

export interface ViewPrefs {
  /** Section kinds this viewer hides (subset of HIDEABLE_KINDS). */
  hidden: HideableKind[];
  /** Show "English · 中文" instead of the stored "中文 · English" body lines. */
  enFirst: boolean;
}

export const DEFAULT_VIEW_PREFS: ViewPrefs = { hidden: [], enFirst: false };

function isHideable(kind: unknown): kind is HideableKind {
  return (HIDEABLE_KINDS as readonly string[]).includes(kind as string);
}

/** Stored prefs, with unknown kinds and shapes dropped; blocked storage → defaults. */
export function loadViewPrefs(store: Pick<Storage, 'getItem'> = window.localStorage): ViewPrefs {
  try {
    const raw = store.getItem(STORAGE_KEYS.STUDYPACK_VIEW_PREFS);
    if (!raw) return DEFAULT_VIEW_PREFS;
    const parsed = JSON.parse(raw) as Partial<ViewPrefs>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter(isHideable) : [],
      enFirst: parsed.enFirst === true,
    };
  } catch {
    // Storage blocked or corrupted JSON: the viewer just gets the full pack.
    return DEFAULT_VIEW_PREFS;
  }
}

export function saveViewPrefs(prefs: ViewPrefs, store: Pick<Storage, 'setItem'> = window.localStorage): void {
  try {
    store.setItem(STORAGE_KEYS.STUDYPACK_VIEW_PREFS, JSON.stringify(prefs));
  } catch {
    // Storage blocked: prefs still apply for this session via state.
  }
}

/** "中文 · English" → "English · 中文"; lines without exactly one separator pass through. */
export function swapBilingualLine(line: string): string {
  const parts = line.split(BILINGUAL_SEPARATOR);
  return parts.length === 2 ? `${parts[1]}${BILINGUAL_SEPARATOR}${parts[0]}` : line;
}

function swapSection(section: PackSection): PackSection {
  return {
    ...section,
    ...(section.body ? { body: section.body.map(swapBilingualLine) } : {}),
    ...(section.questions ? { questions: section.questions.map(swapBilingualLine) } : {}),
    ...(section.rows ? { rows: section.rows.map(r => ({ ...r, practice: swapBilingualLine(r.practice) })) } : {}),
  };
}

/** The pack as this viewer sees it: hidden kinds removed, line order swapped. Pure — the input pack is untouched. */
export function applyViewPrefs(pack: StudyPack, prefs: ViewPrefs): StudyPack {
  const kept = pack.sections.filter(s => !isHideable(s.kind) || !prefs.hidden.includes(s.kind));
  return { ...pack, sections: prefs.enFirst ? kept.map(swapSection) : kept };
}
