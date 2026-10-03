/**
 * PackList.test.tsx — each local pack has Edit (#/new/<id>) and links to its leader sign-up list · 我的查经包测试
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PackList from '../PackList';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_SIGNUPS, NS_EDIT, NS_EXPORT, NS_DELETE } from '../newStudyStrings';
import { leaderHash } from '../../leader/leaderRoute';
import { newStudyHash } from '../../landing/landingRoute';
import { fireEvent } from '@testing-library/react';
import type { LocalPacks } from '../useLocalPacks';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

const packs: LocalPacks = {
  packs: [pack], invalid: [], error: null,
  refresh: vi.fn(), save: vi.fn(), remove: vi.fn(), exportJson: vi.fn(), importJson: vi.fn(),
};

describe('PackList', () => {
  it('each row has an Edit link to #/new/<id> (opening in place), Export, a Sign-ups link to #/leader/<id>, and Delete', () => {
    const onOpen = vi.fn();
    render(<PackList packs={packs} onOpen={onOpen} />);
    const row = screen.getByTestId('pack-row');
    const edit = within(row).getByRole('link', { name: NS_EDIT });
    expect(edit).toHaveAttribute('href', newStudyHash(pack.id));
    fireEvent.click(edit);
    expect(onOpen).toHaveBeenCalledWith(pack);
    expect(within(row).getByRole('button', { name: NS_EXPORT })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: NS_DELETE })).toBeInTheDocument();
    const link = within(row).getByRole('link', { name: NS_SIGNUPS });
    expect(link).toHaveAttribute('href', leaderHash(pack.id));
    expect(link).toHaveAttribute('data-testid', 'pack-signups');
  });
});
