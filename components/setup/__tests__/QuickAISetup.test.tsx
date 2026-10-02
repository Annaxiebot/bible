/**
 * QuickAISetup.test.tsx — the one-field key dialog · 设置AI测试
 *
 * Save stores the key under the existing storage key and applies the shared
 * defaults; Test calls the existing OpenRouter validator (mocked — no second
 * validator); the field is masked until Show is pressed; the key never
 * appears in the "get a key" link. Strings are imported (R3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { DEFAULT_AI_SETUP, OPENROUTER_KEYS_URL } from '../../../services/aiDefaults';
import {
  SETUP_TITLE, SETUP_EXPLANATION, SETUP_KEY_LABEL, SETUP_SHOW_KEY, SETUP_HIDE_KEY,
  SETUP_GET_KEY, SETUP_TEST, SETUP_TEST_OK, SETUP_TEST_FAILED, SETUP_SAVE, SETUP_EMPTY_KEY,
  SETUP_CLOSE,
} from '../setupStrings';

const testApiKeyMock = vi.fn();
vi.mock('../../../services/openrouter', () => ({
  testApiKey: (...args: unknown[]) => testApiKeyMock(...args),
}));

import { QuickAISetupForm, QuickAISetupDialog, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../QuickAISetup';

function makeStorage() {
  const store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = v; },
    removeItem: (k: string) => { delete store[k]; },
    dump: () => ({ ...store }),
  };
}
let storage: ReturnType<typeof makeStorage>;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('localStorage', storage);
  testApiKeyMock.mockReset().mockResolvedValue({ success: true, model: 'x' });
});

const keyField = () => screen.getByLabelText(SETUP_KEY_LABEL) as HTMLInputElement;

describe('QuickAISetupForm', () => {
  it('renders title, explanation, masked field and the get-a-key link in a new tab', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: SETUP_TITLE })).toBeInTheDocument();
    expect(screen.getByText(SETUP_EXPLANATION)).toBeInTheDocument();
    expect(keyField().type).toBe('password');
    const link = screen.getByRole('link', { name: new RegExp(SETUP_GET_KEY) });
    expect(link).toHaveAttribute('href', OPENROUTER_KEYS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('strings are Chinese first (ADR-0003)', () => {
    for (const s of [SETUP_TITLE, SETUP_EXPLANATION, SETUP_GET_KEY, SETUP_TEST, SETUP_SAVE]) {
      expect(s).toMatch(/^[一-鿿]/);
    }
  });

  it('meets the senior-type floors: ≥18px text, ≥48px tap targets', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(SETUP_MIN_FONT_PX).toBeGreaterThanOrEqual(18);
    expect(SETUP_MIN_TAP_PX).toBeGreaterThanOrEqual(48);
    expect(keyField().style.fontSize).toBe(`${SETUP_MIN_FONT_PX}px`);
    expect(keyField().style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
    expect(screen.getByRole('button', { name: SETUP_SAVE }).style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
  });

  it('Show/Hide toggles masking without changing the value', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'sk-or-secret' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_SHOW_KEY }));
    expect(keyField().type).toBe('text');
    fireEvent.click(screen.getByRole('button', { name: SETUP_HIDE_KEY }));
    expect(keyField().type).toBe('password');
    expect(keyField().value).toBe('sk-or-secret');
  });

  it('Save stores the key under the existing storage key, applies defaults, calls onSaved', () => {
    const onSaved = vi.fn();
    render(<QuickAISetupForm onSaved={onSaved} />);
    fireEvent.change(keyField(), { target: { value: ' sk-or-abc ' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_SAVE }));
    expect(storage.dump()).toEqual({
      [STORAGE_KEYS.OPENROUTER_API_KEY]: 'sk-or-abc',
      [STORAGE_KEYS.AI_PROVIDER]: DEFAULT_AI_SETUP.provider,
      [STORAGE_KEYS.AI_MODEL]: DEFAULT_AI_SETUP.model,
    });
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('Save with an empty field shows the bilingual error and stores nothing', () => {
    const onSaved = vi.fn();
    render(<QuickAISetupForm onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_SAVE }));
    expect(screen.getByRole('alert')).toHaveTextContent(SETUP_EMPTY_KEY);
    expect(storage.dump()).toEqual({});
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('Test uses the existing OpenRouter validator and reports success', async () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'sk-or-abc' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_TEST }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SETUP_TEST_OK));
    expect(testApiKeyMock).toHaveBeenCalledWith('sk-or-abc');
    expect(storage.dump()).toEqual({}); // Test does not save
  });

  it('Test reports the validator error without throwing', async () => {
    testApiKeyMock.mockResolvedValue({ success: false, error: 'HTTP 401' });
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'bad' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_TEST }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SETUP_TEST_FAILED));
    expect(screen.getByRole('status')).toHaveTextContent('HTTP 401');
  });
});

describe('QuickAISetupDialog', () => {
  it('renders nothing when closed, a labelled dialog when open', () => {
    const { rerender } = render(<QuickAISetupDialog open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<QuickAISetupDialog open onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: SETUP_TITLE })).toBeInTheDocument();
  });

  it('closes on Escape and on the close button; save closes and reports', () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(<QuickAISetupDialog open onClose={onClose} onSaved={onSaved} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: SETUP_CLOSE }));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.change(keyField(), { target: { value: 'sk-or-abc' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_SAVE }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
