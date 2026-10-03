/**
 * NewStudyEditor.test.tsx — the toolbar on a stateful host: move down/up
 * reorders sections (keeping DOM nodes), remove asks inline and needs
 * 确定, cancel keeps the section, fixed sections offer no toolbar, Add
 * section inserts a validating default at its allowed position, and
 * Save/Preview stay disabled with the bilingual reason while invalid.
 */
import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { StudyPack } from '../../studypack/packTypes';
import { assemblePack, SECTION_HEADINGS } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import NewStudyEditor from '../NewStudyEditor';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import {
  NS_SECTION_REMOVE_CONFIRM, NS_ERR_EMPTY_QUESTION, NS_SECTION_UP, NS_SECTION_DOWN, NS_SECTION_REMOVE, NS_FORM_CONNECT,
  NS_FORM_CREATED,
} from '../newStudyStrings';

vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({ verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) }),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const original = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED));

const Host: React.FC<{ onChange?: (p: StudyPack) => void; onSave?: (p: StudyPack) => Promise<void> }> = ({ onChange, onSave }) => {
  const [pack, setPack] = useState(original);
  return (
    <NewStudyEditor pack={pack} onChange={next => { setPack(next); onChange?.(next); }}
      onSave={onSave ?? (async () => {})} onPreview={async () => {}} onBack={() => {}} />
  );
};

/** Render and wait for the range selects' bundled-chapter load so no state update lands after a test. */
async function renderHost(props: React.ComponentProps<typeof Host> = {}) {
  render(<Host {...props} />);
  await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
}

const kindsOnScreen = () => screen.getAllByTestId('ns-section').map(el => el.getAttribute('data-kind'));
const sectionOf = (kind: string) => screen.getAllByTestId('ns-section').find(el => el.getAttribute('data-kind') === kind)!;
const button = (kind: string, label: string) => within(sectionOf(kind)).getByRole('button', { name: new RegExp(`^${label}`) });

describe('NewStudyEditor section toolbar', () => {
  it('moves a section down and back up, keeping its DOM node', async () => {
    const onChange = vi.fn();
    await renderHost({ onChange });
    const discussionNode = sectionOf('discussion');
    fireEvent.click(button('discussion', NS_SECTION_DOWN));
    expect(kindsOnScreen().slice(5, 7)).toEqual(['lifeMenu', 'discussion']);
    expect(sectionOf('discussion')).toBe(discussionNode);
    expect((onChange.mock.calls[0][0] as StudyPack).sections.map(s => s.kind).slice(5, 7)).toEqual(['lifeMenu', 'discussion']);
    fireEvent.click(button('discussion', NS_SECTION_UP));
    expect(kindsOnScreen()).toEqual(original.sections.map(s => s.kind));
    expect(screen.getByTestId('ns-save')).toBeEnabled();
  });

  it('offers no toolbar on title/scripture/qr and disables moves across fixed neighbours', async () => {
    await renderHost();
    for (const kind of ['title', 'scripture', 'qr']) {
      expect(within(sectionOf(kind)).queryByTestId('ns-section-toolbar')).toBeNull();
    }
    expect(button('context', NS_SECTION_UP)).toBeDisabled();       // scripture is above
    expect(button('reflection', NS_SECTION_DOWN)).toBeDisabled();  // qr is below
    expect(button('closing', NS_SECTION_UP)).toBeDisabled();
    expect(button('closing', NS_SECTION_DOWN)).toBeDisabled();
    expect(button('closing', NS_SECTION_REMOVE)).toBeEnabled();
  });

  it('removes a section only after the inline 确定; 取消 keeps it', async () => {
    const onChange = vi.fn();
    await renderHost({ onChange });
    fireEvent.click(button('originalLanguage', NS_SECTION_REMOVE));
    const confirm = within(sectionOf('originalLanguage')).getByTestId('ns-section-remove-confirm');
    expect(confirm).toHaveTextContent(NS_SECTION_REMOVE_CONFIRM);
    fireEvent.click(within(confirm).getByTestId('ns-section-remove-no'));
    expect(kindsOnScreen()).toContain('originalLanguage');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(button('originalLanguage', NS_SECTION_REMOVE));
    fireEvent.click(within(sectionOf('originalLanguage')).getByTestId('ns-section-remove-yes'));
    expect(kindsOnScreen()).not.toContain('originalLanguage');
    expect(kindsOnScreen()).toHaveLength(9);
    expect(screen.getByTestId('ns-save')).toBeEnabled();
  });

  it('adds a section at its allowed position; a new discussion blocks Save until its question is written', async () => {
    await renderHost();
    fireEvent.click(screen.getByTestId('ns-add-section'));
    expect(screen.getByTestId('ns-add-lifeMenu')).toBeDisabled();   // already present (singleton)
    expect(screen.getByTestId('ns-add-closing')).toBeDisabled();
    fireEvent.click(screen.getByTestId('ns-add-discussion'));
    expect(kindsOnScreen().slice(7)).toEqual(['reflection', 'discussion', 'qr', 'closing']);
    expect(screen.queryByTestId('ns-add-section-menu')).toBeNull();
    expect(screen.getByTestId('ns-save')).toBeDisabled();
    expect(screen.getByTestId('ns-preview')).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(NS_ERR_EMPTY_QUESTION);

    const added = screen.getAllByTestId('ns-questions')[1];
    expect(within(added).getByText(SECTION_HEADINGS.discussion)).toBeInTheDocument();
    fireEvent.change(within(added).getByRole('textbox'), { target: { value: '新题 · New question' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('ns-save')).toBeEnabled();
  });

  it('re-adds a removed closing at the very end', async () => {
    await renderHost();
    fireEvent.click(button('closing', NS_SECTION_REMOVE));
    fireEvent.click(within(sectionOf('closing')).getByTestId('ns-section-remove-yes'));
    expect(kindsOnScreen().at(-1)).toBe('qr');
    fireEvent.click(screen.getByTestId('ns-add-section'));
    fireEvent.click(screen.getByTestId('ns-add-closing'));
    expect(kindsOnScreen().slice(-2)).toEqual(['qr', 'closing']);
    expect(screen.getByTestId('ns-save')).toBeEnabled();
  });
});

describe('NewStudyEditor Google Forms opt-in', () => {
  it('no form state: the URL field is empty, no Connect button, no notice (the built-in check-in page is the default)', async () => {
    await renderHost();
    expect(screen.getByTestId('ns-feedback-url')).toHaveValue('');
    expect(screen.queryByTestId('ns-form-connect')).toBeNull();
    expect(screen.queryByTestId('ns-form-notice')).toBeNull();
  });

  it('with form state: Connect (≥48px) calls connect, is disabled while busy, hides once a URL is set; the notice renders', async () => {
    const connect = vi.fn();
    const Opt: React.FC<{ busy: boolean }> = ({ busy }) => {
      const [pack, setPack] = useState(original);
      return (
        <NewStudyEditor pack={pack} onChange={setPack} onSave={async () => {}} onPreview={async () => {}} onBack={() => {}}
          form={{ notice: { ok: true, text: NS_FORM_CREATED, link: 'https://docs.google.com/forms/d/e/x/viewform' }, busy, connect }} />
      );
    };
    const { rerender } = render(<Opt busy={false} />);
    await waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());
    const button = screen.getByRole('button', { name: NS_FORM_CONNECT });
    expect(button).toHaveAttribute('data-testid', 'ns-form-connect');
    expect(parseFloat(getComputedStyle(button).minHeight)).toBeGreaterThanOrEqual(48);
    fireEvent.click(button);
    expect(connect).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('ns-form-notice')).toHaveTextContent(NS_FORM_CREATED);
    expect(within(screen.getByTestId('ns-form-notice')).getByRole('link')).toHaveAttribute('href', 'https://docs.google.com/forms/d/e/x/viewform');
    rerender(<Opt busy={true} />);
    expect(screen.getByTestId('ns-form-connect')).toBeDisabled();
    fireEvent.change(screen.getByTestId('ns-feedback-url'), { target: { value: 'https://docs.google.com/forms/d/e/y/viewform' } });
    expect(screen.queryByTestId('ns-form-connect')).toBeNull();
  });
});
