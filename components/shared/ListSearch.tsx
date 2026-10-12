/**
 * ListSearch.tsx — the one search box for long lists · 列表搜索
 *
 * Generalised from PackListing (R3): a leader's studies and the admin's
 * leaders list both search the same way — from LIST_SEARCH_FROM rows a
 * search box appears; a case-insensitive "contains" over whatever text each
 * page says a row is made of; an empty query keeps every row. Each caller
 * gives its own placeholder and test id.
 */
import React from 'react';
import { controlStyle } from '../newstudy/newStudyStyles';

/** From this many rows a search box appears. */
export const LIST_SEARCH_FROM = 8;

/** Rows whose text contains the query; case-insensitive, trimmed; an empty query keeps all. */
export function filterByQuery<T>(rows: readonly T[], query: string, textOf: (row: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter(row => textOf(row).toLowerCase().includes(q));
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Placeholder and accessible name. */
  label: string;
  testId: string;
}

export const ListSearchBox: React.FC<Props> = ({ value, onChange, label, testId }) => (
  <input type="search" value={value} onChange={e => onChange(e.target.value)} data-testid={testId}
    placeholder={label} aria-label={label}
    className="rounded-lg border border-stl-border bg-stl-surface px-4 text-stl-text" style={controlStyle} />
);
