import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LayoutToolbar, {
  getLayoutMode,
  layoutModeToSplits,
  getSavedLayout,
} from '../LayoutToolbar';

// The setup.ts mock provides a localStorage mock via vi.fn()

describe('getLayoutMode', () => {
  it('returns "bible" when vertical >= 95', () => {
    expect(getLayoutMode(100, 100)).toBe('bible');
    expect(getLayoutMode(95, 0)).toBe('bible');
  });

  it('returns "chat" when vertical <= 5 and horizontal >= 95', () => {
    expect(getLayoutMode(0, 100)).toBe('chat');
    expect(getLayoutMode(5, 95)).toBe('chat');
  });

  it('returns "notes" when vertical <= 5 and horizontal <= 5', () => {
    expect(getLayoutMode(0, 0)).toBe('notes');
    expect(getLayoutMode(5, 5)).toBe('notes');
  });

  it('returns "study" for split values in between', () => {
    expect(getLayoutMode(50, 50)).toBe('study');
    expect(getLayoutMode(30, 70)).toBe('study');
  });
});

describe('layoutModeToSplits', () => {
  it('maps bible to v=100, h=100', () => {
    expect(layoutModeToSplits('bible')).toEqual({ vertical: 100, horizontal: 100 });
  });

  it('maps chat to v=0, h=100', () => {
    expect(layoutModeToSplits('chat')).toEqual({ vertical: 0, horizontal: 100 });
  });

  it('maps notes to v=0, h=0', () => {
    expect(layoutModeToSplits('notes')).toEqual({ vertical: 0, horizontal: 0 });
  });

  it('maps study to v=50, h=50', () => {
    expect(layoutModeToSplits('study')).toEqual({ vertical: 50, horizontal: 50 });
  });
});

describe('getSavedLayout', () => {
  beforeEach(() => {
    vi.mocked(localStorage.getItem).mockReset();
  });

  it('returns saved layout when valid', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('study');
    expect(getSavedLayout(false)).toBe('study');
  });

  it('returns "bible" as default for mobile when nothing saved', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(getSavedLayout(true)).toBe('bible');
  });

  it('returns "bible" as default for desktop when nothing saved', () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    expect(getSavedLayout(false)).toBe('bible');
  });

  it('ignores invalid saved values', () => {
    vi.mocked(localStorage.getItem).mockReturnValue('invalid');
    expect(getSavedLayout(false)).toBe('bible');
  });
});

describe('LayoutToolbar component', () => {
  const defaultProps = {
    currentMode: 'bible' as const,
    onLayoutChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 4 layout buttons', () => {
    render(<LayoutToolbar {...defaultProps} />);

    expect(screen.getByTestId('layout-btn-bible')).toBeDefined();
    expect(screen.getByTestId('layout-btn-chat')).toBeDefined();
    expect(screen.getByTestId('layout-btn-notes')).toBeDefined();
    expect(screen.getByTestId('layout-btn-study')).toBeDefined();
  });

  it('highlights the active layout button', () => {
    render(<LayoutToolbar {...defaultProps} currentMode="study" />);

    const studyBtn = screen.getByTestId('layout-btn-study');
    expect(studyBtn.className).toContain('text-indigo-600');

    const bibleBtn = screen.getByTestId('layout-btn-bible');
    expect(bibleBtn.className).toContain('text-slate-500');
  });

  it('calls onLayoutChange and saves to localStorage when a button is clicked', () => {
    const onLayoutChange = vi.fn();
    render(<LayoutToolbar {...defaultProps} onLayoutChange={onLayoutChange} />);

    fireEvent.click(screen.getByTestId('layout-btn-chat'));

    expect(onLayoutChange).toHaveBeenCalledWith('chat');
    expect(localStorage.setItem).toHaveBeenCalledWith('biblePreferredLayout', 'chat');
  });

  it('renders with taller bar on iPhone', () => {
    const { container } = render(<LayoutToolbar {...defaultProps} isIPhone={true} />);

    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('h-14');
  });

  it('renders with shorter bar on desktop', () => {
    const { container } = render(<LayoutToolbar {...defaultProps} isIPhone={false} />);

    const bar = container.firstChild as HTMLElement;
    expect(bar.className).toContain('h-11');
  });
});
