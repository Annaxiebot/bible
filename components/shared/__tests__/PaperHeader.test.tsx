/**
 * PaperHeader.test.tsx — the member pages' brand link home · 品牌栏测试
 *
 * One link to the landing ("#"), named "返回首页 · Home", the wordmark
 * English-first with the Chinese in WenKai, a ≥ 48px target, hidden in print.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PaperHeader, { PAPER_HOME_TEST_ID } from '../PaperHeader';
import { LANDING_HASH, resolveRootView } from '../../landing/landingRoute';
import { BRAND_EN, BRAND_ZH, HOME_LINK_LABEL } from '../../landing/landingStrings';
import { SETUP_MIN_TAP_PX } from '../../setup/setupStrings';

describe('PaperHeader', () => {
  it('is one link to the landing named 返回首页 · Home', () => {
    render(<PaperHeader />);
    const link = screen.getByRole('link', { name: HOME_LINK_LABEL });
    expect(link).toBe(screen.getByTestId(PAPER_HOME_TEST_ID));
    expect(link).toHaveAttribute('href', LANDING_HASH);
    expect(resolveRootView(LANDING_HASH)).toBe('landing');
    expect(HOME_LINK_LABEL).toBe('返回首页 · Home');
  });

  it('shows the wordmark English-first, the Chinese in WenKai; ≥ 48px target; never printed', () => {
    render(<PaperHeader />);
    const link = screen.getByTestId(PAPER_HOME_TEST_ID);
    expect(link.textContent!.indexOf(BRAND_EN)).toBeLessThan(link.textContent!.indexOf(BRAND_ZH));
    expect(screen.getByText(BRAND_ZH).style.fontFamily).toBe('var(--stl-font-zh-head)');
    expect(parseFloat(link.style.minHeight)).toBeGreaterThanOrEqual(SETUP_MIN_TAP_PX);
    expect(link.className).toContain('print:hidden');
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
