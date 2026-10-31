/**
 * QuickAISetup.test.tsx — the AI service form and dialog shell · AI 服务测试
 *
 * The form is a status page with one rule since 2026-10-23 (ADR-0007): sign
 * in to use AI. Its states (signed in / out, usage) live in AIStatus.test.tsx;
 * here: the title, the senior type floors, Cancel, the modal (Escape, the
 * close button, backdrop) and that no own-key, model or "Save" control is
 * left anywhere. Strings are imported (R3).
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SETUP_TITLE, SETUP_CLOSE, SETUP_CANCEL, SETUP_SIGN_IN_TO_USE_AI, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../setupStrings';

vi.mock('../../../services/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: () => true,
  authManager: {
    getState: () => ({ user: null, session: null, isAuthenticated: false, isLoading: false }),
    getUserId: () => null,
    subscribe: (l: (s: unknown) => void) => { l({ user: null, session: null, isAuthenticated: false, isLoading: false }); return () => undefined; },
    signInWithGoogle: vi.fn(async () => ({ error: null })),
  },
}));

import { QuickAISetupForm, QuickAISetupDialog } from '../QuickAISetup';

describe('QuickAISetupForm', () => {
  it('the bilingual title (Chinese first) over the sign-in prompt; no key field, no Save, no model rows', () => {
    render(<QuickAISetupForm />);
    const heading = screen.getByRole('heading', { name: SETUP_TITLE });
    expect(SETUP_TITLE.startsWith('AI 服务')).toBe(true);
    expect(parseFloat(heading.style.fontSize)).toBeGreaterThanOrEqual(SETUP_MIN_FONT_PX);
    expect(screen.getByText(SETUP_SIGN_IN_TO_USE_AI)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /OpenRouter/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /保存 Save|测试 Test|更换 Replace/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/OpenRouter|密钥|模型 Models/);
  });

  it('Cancel (when given) closes it, with a ≥48px tap target', () => {
    const onCancel = vi.fn();
    render(<QuickAISetupForm onCancel={onCancel} />);
    const cancel = screen.getByRole('button', { name: SETUP_CANCEL });
    expect(cancel.style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('no Cancel unless the caller can close it', () => {
    render(<QuickAISetupForm />);
    expect(screen.queryByRole('button', { name: SETUP_CANCEL })).toBeNull();
  });
});

describe('QuickAISetupDialog', () => {
  it('renders nothing when closed, a labelled dialog when open', () => {
    const { rerender } = render(<QuickAISetupDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<QuickAISetupDialog open onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
  });

  it('closes on Escape, on the close button and on the backdrop — not on a click inside', () => {
    const onClose = vi.fn();
    render(<QuickAISetupDialog open onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: SETUP_CLOSE }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('quick-ai-setup'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByTestId('quick-ai-setup-dialog'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
