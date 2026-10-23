/**
 * ReaderTools — the reader header's tools render once for the bar and once in
 * the phone ⋯ panel (2026-10: at 390px they were past the right edge). The
 * layout itself is pinned in e2e (reader-phone-header.spec); here: the panel's
 * contents, its open state, and which taps close it.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readerStrings } from '../readerStrings';
import {
  ReaderTools, ReaderEditions, ReaderMoreMenu, ReaderStatusPill, READER_MORE_PANEL_ID, FONT_SIZE_MIN, FONT_SIZE_MAX,
} from '../ReaderTools';

const s = readerStrings('zh');

function toolProps(overrides: Partial<React.ComponentProps<typeof ReaderTools>> = {}) {
  return {
    s,
    showLabels: true,
    className: 'flex',
    isAnnotationMode: false,
    onToggleAnnotationMode: vi.fn(),
    showSearch: false,
    onToggleSearch: vi.fn(),
    onShowReadingHistory: vi.fn(),
    isSimplified: true,
    onToggleChineseMode: vi.fn(),
    fontSize: 18,
    onAdjustFontSize: vi.fn(),
    onToolUsed: vi.fn(),
    ...overrides,
  };
}

function renderMenu(open: boolean, onToggle = vi.fn()) {
  return render(
    <ReaderMoreMenu s={s} open={open} onToggle={onToggle} menuRef={React.createRef<HTMLDivElement>()}>
      <ReaderEditions
        s={s} compact={false} chineseVersion="cuv" englishVersion="bsb"
        onChineseVersionChange={vi.fn()} onEnglishVersionChange={vi.fn()} className="flex"
      />
      <ReaderTools {...toolProps()} />
      <ReaderStatusPill s={s} isOffline={false} className="flex" />
    </ReaderMoreMenu>,
  );
}

describe('ReaderMoreMenu — the phone ⋯ panel', () => {
  it('closed: only the ⋯ button, which reports collapsed and is hidden from 640px up', () => {
    renderMenu(false);
    const more = screen.getByRole('button', { name: s.moreOptions });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more.parentElement).toHaveClass('sm:hidden');
    expect(document.getElementById(READER_MORE_PANEL_ID)).toBeNull();
  });

  it('open: editions, every tool and the status, in a labelled panel the button controls', () => {
    const onToggle = vi.fn();
    renderMenu(true, onToggle);
    const more = screen.getByRole('button', { name: s.moreOptions });
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(more).toHaveAttribute('aria-controls', READER_MORE_PANEL_ID);
    const panel = screen.getByRole('group', { name: s.moreOptions });
    expect(panel.id).toBe(READER_MORE_PANEL_ID);
    for (const name of [s.chineseEditionLabel, s.englishEditionLabel]) {
      expect(screen.getByRole('combobox', { name })).toBeInTheDocument();
    }
    for (const name of [s.annotateTitle, s.searchTitle, s.historyTitle, '简', '繁', s.fontSmaller, s.fontLarger]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
    // Labels are shown in the panel (the bar hides them on an iPhone).
    expect(panel).toHaveTextContent(s.annotate);
    expect(panel).toHaveTextContent(s.online);
    fireEvent.click(more);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('ReaderTools', () => {
  it.each([
    ['annotate', s.annotateTitle, 'onToggleAnnotationMode'],
    ['search', s.searchTitle, 'onToggleSearch'],
    ['history', s.historyTitle, 'onShowReadingHistory'],
  ] as const)('%s runs its action, then onToolUsed (the panel closes)', (_tool, name, action) => {
    const props = toolProps();
    render(<ReaderTools {...props} />);
    fireEvent.click(screen.getByRole('button', { name }));
    expect(props[action]).toHaveBeenCalledTimes(1);
    expect(props.onToolUsed).toHaveBeenCalledTimes(1);
  });

  it('font and script stay in the panel: no onToolUsed', () => {
    const onAdjustFontSize = vi.fn();
    const props = toolProps({ onAdjustFontSize });
    render(<ReaderTools {...props} />);
    fireEvent.click(screen.getByRole('button', { name: s.fontLarger }));
    fireEvent.click(screen.getByRole('button', { name: s.fontSmaller }));
    fireEvent.click(screen.getByRole('button', { name: '繁' }));
    expect(onAdjustFontSize.mock.calls).toEqual([[2], [-2]]);
    expect(props.onToggleChineseMode).toHaveBeenCalledTimes(1);
    expect(props.onToolUsed).not.toHaveBeenCalled();
  });

  it('the font buttons stop at the shared bounds', () => {
    const { rerender } = render(<ReaderTools {...toolProps({ fontSize: FONT_SIZE_MIN })} />);
    expect(screen.getByRole('button', { name: s.fontSmaller })).toBeDisabled();
    expect(screen.getByRole('button', { name: s.fontLarger })).toBeEnabled();
    rerender(<ReaderTools {...toolProps({ fontSize: FONT_SIZE_MAX })} />);
    expect(screen.getByRole('button', { name: s.fontLarger })).toBeDisabled();
  });

  it('showLabels=false keeps icons only (iPhone bar), with the same accessible names', () => {
    render(<ReaderTools {...toolProps({ showLabels: false })} />);
    expect(screen.queryByText(s.annotate)).toBeNull();
    expect(screen.getByRole('button', { name: s.annotateTitle })).toBeInTheDocument();
  });
});
