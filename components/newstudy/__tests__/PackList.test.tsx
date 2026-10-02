/**
 * PackList.test.tsx — each local pack links to its leader sign-up list · 我的查经包测试
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import PackList from '../PackList';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import { NS_SIGNUPS, NS_OPEN, NS_EXPORT, NS_DELETE } from '../newStudyStrings';
import { leaderHash } from '../../leader/leaderRoute';
import type { LocalPacks } from '../useLocalPacks';

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));

const packs: LocalPacks = {
  packs: [pack], invalid: [], error: null,
  refresh: vi.fn(), save: vi.fn(), remove: vi.fn(), exportJson: vi.fn(), importJson: vi.fn(),
};

describe('PackList', () => {
  it('each row has Open, Export, a Sign-ups link to #/leader/<id>, and Delete', () => {
    render(<PackList packs={packs} onOpen={vi.fn()} />);
    const row = screen.getByTestId('pack-row');
    expect(within(row).getByRole('button', { name: NS_OPEN })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: NS_EXPORT })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: NS_DELETE })).toBeInTheDocument();
    const link = within(row).getByRole('link', { name: NS_SIGNUPS });
    expect(link).toHaveAttribute('href', leaderHash(pack.id));
    expect(link).toHaveAttribute('data-testid', 'pack-signups');
  });
});
