/**
 * PackList.test.tsx — each local pack has Edit (#/new/<id>) and links to its leader sign-up list · 我的查经包测试
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PackList, { PACK_LIST_PREVIEW, PACK_SEARCH_FROM, packMetaLine, searchPacks } from '../PackList';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_SIGNUPS, NS_EDIT, NS_DELETE, NS_BACKUP_TOGGLE, NS_BACKUP_DOWNLOAD } from '../newStudyStrings';
import { leaderHash } from '../../leader/leaderRoute';
import { newStudyHash } from '../../landing/landingRoute';
import { fireEvent } from '@testing-library/react';
import type { LocalPacks } from '../useLocalPacks';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

const packs: LocalPacks = {
  packs: [pack], invalid: [], error: null, loaded: true,
  refresh: vi.fn(), save: vi.fn(), remove: vi.fn(), exportBackup: vi.fn(), importBackup: vi.fn(),
};

describe('PackList', () => {
  it('each row has an Edit link to #/new/<id> (opening in place), a Sign-ups link to #/leader/<id>, and Delete', () => {
    const onOpen = vi.fn();
    render(<PackList packs={packs} onOpen={onOpen} />);
    const row = screen.getByTestId('pack-row');
    const edit = within(row).getByRole('link', { name: NS_EDIT });
    expect(edit).toHaveAttribute('href', newStudyHash(pack.id));
    fireEvent.click(edit);
    expect(onOpen).toHaveBeenCalledWith(pack);
    expect(within(row).queryByText(/JSON/)).toBeNull(); // no per-pack JSON button (owner: too technical, rarely used)
    expect(within(row).getByRole('button', { name: NS_DELETE })).toBeInTheDocument();
    const link = within(row).getByRole('link', { name: NS_SIGNUPS });
    expect(link).toHaveAttribute('href', leaderHash(pack.id));
    expect(link).toHaveAttribute('data-testid', 'pack-signups');
  });

  it('backup & restore is one quiet link; its panel explains it and downloads every study as one file', () => {
    render(<PackList packs={packs} onOpen={vi.fn()} />);
    expect(screen.queryByTestId('backup-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: NS_BACKUP_TOGGLE }));
    fireEvent.click(screen.getByRole('button', { name: NS_BACKUP_DOWNLOAD }));
    expect(packs.exportBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('pack-list').textContent).not.toMatch(/JSON/);
  });

  it('shows the newest 5 studies first, then "Show all N"; a passage already in the title is not repeated', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...pack, id: `p${i}`, date: `2026-10-0${i + 1}` }));
    render(<PackList packs={{ ...packs, packs: many }} onOpen={vi.fn()} />);
    expect(screen.getAllByTestId('pack-row')).toHaveLength(PACK_LIST_PREVIEW);
    expect(screen.getAllByTestId('pack-row')[0]).toHaveTextContent('2026-10-07');
    fireEvent.click(screen.getByTestId('pack-show-all'));
    expect(screen.getAllByTestId('pack-row')).toHaveLength(7);
    expect(packMetaLine({ title: '第1课 X — 约翰福音 3:22–36', passageRef: '约翰福音 3:22–36 · John 3:22–36', date: '2026-10-02' })).toBe('2026-10-02');
    expect(packMetaLine({ title: 'X', passageRef: '约翰福音 3:22–36 · John 3:22–36', date: '2026-10-02' })).toBe('约翰福音 3:22–36 · John 3:22–36 · 2026-10-02');
  });

  it('with many studies a search box appears; it matches title, passage (Chinese or English) and date', () => {
    const many = Array.from({ length: PACK_SEARCH_FROM }, (_, i) => ({ ...pack, id: `p${i}`, title: `第${i + 1}课 Study ${i + 1}`, date: `2026-09-1${i}` }));
    many[3] = { ...many[3], passageRef: '箴言 2:1–22 · Proverbs 2:1–22' };
    render(<PackList packs={{ ...packs, packs: many }} onOpen={vi.fn()} />);
    fireEvent.change(screen.getByTestId('pack-search'), { target: { value: 'proverbs' } });
    expect(screen.getAllByTestId('pack-row')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('pack-search'), { target: { value: '2026-09-1' } });
    expect(screen.getAllByTestId('pack-row')).toHaveLength(PACK_SEARCH_FROM); // a search shows every match, not 5
    fireEvent.change(screen.getByTestId('pack-search'), { target: { value: '启示录' } });
    expect(screen.queryAllByTestId('pack-row')).toHaveLength(0);
    expect(searchPacks(many, '  ')).toHaveLength(PACK_SEARCH_FROM);
  });

  it('few studies → no search box', () => {
    render(<PackList packs={packs} onOpen={vi.fn()} />);
    expect(screen.queryByTestId('pack-search')).toBeNull();
  });
});
