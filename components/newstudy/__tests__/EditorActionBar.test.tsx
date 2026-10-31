/**
 * EditorActionBar.test.tsx — Preview pinned to the screen's bottom · 操作栏测试
 *
 * The bar renders with the editor (and only then), is the editor's last
 * child (sticky, so it keeps its place in the flow and never covers the
 * last section), pads for the iPhone home indicator, keeps the ns-preview
 * id, calls the handler with the pack, carries the status line, and Back
 * moved to the heading (not duplicated). The explicit Save button is GONE
 * (owner, 2026-10-31): auto-save + flush made it a redundant second
 * control, so the bar must have exactly one button. When
 * generation finishes the editor's top scrolls into view — smooth, or
 * instant under reduced motion; opening a saved pack does not scroll.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { assemblePack } from '../packAssembly';
import { validateGenerated } from '../generatedPack';
import { JOHN3_GENERATED, JOHN3_REQUEST } from './fixtures';
import NewStudyEditor from '../NewStudyEditor';
import PhaseView, { Phase, PhaseViewProps } from '../PhaseView';
import EditorActionBar, { actionBarStyle } from '../EditorActionBar';
import { NS_BACK, NS_PREVIEW, NS_AUTOSAVED } from '../newStudyStrings';
import { REDUCED_MOTION_QUERY } from '../../shared/reducedMotion';

vi.mock('../../../services/bibleDataSource', () => ({
  fetchBundledChapter: async () => ({ verses: Array.from({ length: 36 }, (_, i) => ({ verse: i + 1, text: `v${i + 1}` })) }),
}));

const verses = Array.from({ length: 15 }, (_, i) => ({ num: 22 + i, cuv: `第${22 + i}节`, en: `verse ${22 + i}` }));
const pack = assemblePack(JOHN3_REQUEST, verses, validateGenerated(JOHN3_GENERATED, JOHN3_REQUEST.contentLanguage));

const scrollIntoView = vi.fn();
beforeEach(() => {
  scrollIntoView.mockReset();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
});
afterEach(() => {
  delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView;
});

const rangeReady = () => waitFor(() => expect(screen.getByTestId('ns-range-verse-to')).toBeEnabled());

describe('EditorActionBar', () => {
  it('is the last child of the editor, sticky at the bottom, with safe-area padding and large targets', async () => {
    render(<NewStudyEditor pack={pack} onChange={() => {}} onPreview={async () => {}} onBack={() => {}} />);
    await rangeReady();
    const bar = screen.getByTestId('ns-action-bar');
    expect(screen.getByTestId('new-study-editor').lastElementChild).toBe(bar);
    expect(bar.className).toMatch(/\bsticky\b/);
    expect(bar.className).toMatch(/\bbottom-0\b/);
    expect(String(actionBarStyle.paddingBottom)).toContain('env(safe-area-inset-bottom');
    const button = screen.getByTestId('ns-preview');
    expect(bar).toContainElement(button);
    expect(button.style.minHeight).toBe('48px');
    expect(parseFloat(button.style.fontSize)).toBeGreaterThanOrEqual(20);
    // One button only: no Save (auto-save covers it), so no second control.
    expect(screen.queryByTestId('ns-save')).toBeNull();
    expect(bar.querySelectorAll('button')).toHaveLength(1);
  });

  it('Preview calls the handler with the pack; Back sits at the top, once', async () => {
    const onPreview = vi.fn(async () => {});
    const onBack = vi.fn();
    render(<NewStudyEditor pack={pack} onChange={() => {}} onPreview={onPreview} onBack={onBack} />);
    await rangeReady();
    expect(screen.getByTestId('ns-preview')).toHaveTextContent(NS_PREVIEW);
    expect(screen.getAllByTestId('ns-preview')).toHaveLength(1);
    fireEvent.click(screen.getByTestId('ns-preview'));
    await waitFor(() => expect(onPreview).toHaveBeenCalledWith(pack));
    const backs = screen.getAllByRole('button', { name: NS_BACK });
    expect(backs).toHaveLength(1);
    expect(screen.getByTestId('ns-action-bar')).not.toContainElement(backs[0]);
    fireEvent.click(backs[0]);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('carries the status line and the error, and disables Preview while invalid', () => {
    render(<EditorActionBar invalid error="讨论题不能为空" status={NS_AUTOSAVED} onPreview={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(NS_AUTOSAVED);
    expect(screen.getByRole('alert')).toHaveTextContent('讨论题不能为空');
    expect(screen.getByTestId('ns-preview')).toBeDisabled();
  });

  it('is not rendered outside the editor (form phase)', () => {
    render(<PhaseView {...phaseProps({ kind: 'form' })} />);
    expect(screen.queryByTestId('ns-action-bar')).not.toBeInTheDocument();
  });
});

function phaseProps(phase: Phase): PhaseViewProps {
  return {
    phase, configured: true, onGenerate: () => {}, onCancel: () => {}, onBack: () => {}, onChange: () => {},
    onPreview: async () => {}, autosave: { status: 'clean', error: null },
  };
}

describe('scroll to the editor when generation finishes', () => {
  const generating: Phase = { kind: 'generating', req: JOHN3_REQUEST, step: 'AI', detail: '' };

  it('generating → editor scrolls the editor top into view, smoothly', async () => {
    const { rerender } = render(<PhaseView {...phaseProps(generating)} />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    rerender(<PhaseView {...phaseProps({ kind: 'editor', pack })} />);
    await rangeReady();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByTestId('new-study-editor'));
    // Later edits re-render the editor without scrolling again.
    rerender(<PhaseView {...phaseProps({ kind: 'editor', pack: { ...pack } })} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('jumps instantly under prefers-reduced-motion', async () => {
    type MatchMedia = (query: string) => MediaQueryList;
    const media = window.matchMedia as unknown as ReturnType<typeof vi.fn<MatchMedia>>;
    const original = media.getMockImplementation()!;
    media.mockImplementation((query: string) => ({ ...original(query), matches: query === REDUCED_MOTION_QUERY }));
    try {
      const { rerender } = render(<PhaseView {...phaseProps(generating)} />);
      rerender(<PhaseView {...phaseProps({ kind: 'editor', pack })} />);
      await rangeReady();
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'auto' });
    } finally {
      media.mockImplementation(original);
    }
  });

  it('opening a saved pack (form → editor) does not scroll', async () => {
    const { rerender } = render(<PhaseView {...phaseProps({ kind: 'form' })} />);
    rerender(<PhaseView {...phaseProps({ kind: 'editor', pack })} />);
    await rangeReady();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
