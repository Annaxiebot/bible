/**
 * Pill.test.tsx — the one CTA shape (landing + member pages) · 按钮测试
 *
 * A link with href, else a button (submit when asked); the "中文 English"
 * label renders as two halves but the accessible name stays whole.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pill from '../Pill';
import { bilingual, bilingualLine } from '../../studypack/principles';

const NEXT = bilingual('下一步', 'Next');

describe('Pill', () => {
  it('a button by default: whole accessible name, Chinese half first, click handler', () => {
    const onClick = vi.fn();
    render(<Pill label={NEXT} onClick={onClick} testId="p" />);
    const button = screen.getByRole('button', { name: NEXT });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toBe('stl-pill');
    expect(button.firstElementChild).toHaveTextContent('下一步');
    expect(button.querySelector('.stl-pill-en')).toHaveTextContent('Next');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('submit, ghost, small and extra classes; disabled', () => {
    render(<Pill label={bilingualLine('恢复', 'Resume')} type="submit" ghost small disabled className="w-full" />);
    const button = screen.getByRole('button', { name: bilingualLine('恢复', 'Resume') });
    expect(button).toHaveAttribute('type', 'submit');
    expect(button.className).toBe('stl-pill stl-pill-ghost stl-pill-sm w-full');
    expect(button).toBeDisabled();
  });

  it('a link when given href', () => {
    render(<Pill label={NEXT} href="#/x" arrow />);
    expect(screen.getByRole('link', { name: NEXT })).toHaveAttribute('href', '#/x');
  });
});
