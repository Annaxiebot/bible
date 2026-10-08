// The one list both "My packs" (New study) and the leader home use (R3): newest 5, Show all, search from 8.
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'fs';
import { parseStudyPack, StudyPack } from '../../studypack/packTypes';
import { TEST_PACK_PATH } from '../../studypack/__tests__/fixtures';
import { PackListing, PACK_LIST_PREVIEW, PACK_SEARCH_FROM } from '../PackListing';

const base: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));
const packs = (n: number) => Array.from({ length: n }, (_, i) => ({ ...base, id: `p${i}`, title: `Study ${i}`, date: `2026-0${(i % 9) + 1}-01` }));
const row = (p: StudyPack) => <li key={p.id} data-testid="row">{p.title}</li>;

describe('PackListing', () => {
  it('a long list: newest 5, then Show all; a search box; a search shows every match', () => {
    render(<PackListing packs={packs(30)} renderRow={row} />);
    expect(screen.getAllByTestId('row')).toHaveLength(PACK_LIST_PREVIEW);
    expect(screen.getAllByTestId('row')[0]).toHaveTextContent(/Study (8|17|26)/); // a 2026-09 study comes first
    fireEvent.click(screen.getByTestId('pack-show-all'));
    expect(screen.getAllByTestId('row')).toHaveLength(30);
    fireEvent.change(screen.getByTestId('pack-search'), { target: { value: '2026-03' } });
    expect(screen.getAllByTestId('row').length).toBeGreaterThan(PACK_LIST_PREVIEW - 2);
    expect(screen.queryByTestId('pack-show-all')).toBeNull();
  });

  it('a short list: no search box and no Show all', () => {
    render(<PackListing packs={packs(PACK_SEARCH_FROM - 4)} renderRow={row} />);
    expect(screen.queryByTestId('pack-search')).toBeNull();
    expect(screen.queryByTestId('pack-show-all')).toBeNull();
  });
});
