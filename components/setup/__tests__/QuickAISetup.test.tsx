/**
 * QuickAISetup.test.tsx — the one-field key dialog · 设置AI测试
 *
 * Save stores the key under the existing storage key and applies the shared
 * defaults; Test calls the existing OpenRouter validator (mocked — no second
 * validator) with the model Ask AI resolves and reports a typed outcome; the
 * field is masked until Show is pressed; the key never appears in the "get
 * a key" link. With a stored key the dialog opens in the saved state (last 4
 * only, model line, Replace, Use recommended model). Strings are imported (R3).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { DEFAULT_AI_SETUP, ASK_AI_MODEL, OPENROUTER_KEYS_URL } from '../../../services/aiDefaults';
import { modelLine, modelUnavailableLine } from '../../studypack/tvHints';
import {
  SETUP_TITLE, SETUP_EXPLANATION, SETUP_KEY_LABEL, SETUP_SHOW_KEY, SETUP_HIDE_KEY,
  SETUP_GET_KEY, SETUP_TEST, SETUP_TEST_OK, SETUP_TEST_INVALID, SETUP_TEST_NO_CREDITS, SETUP_TEST_ERROR,
  SETUP_SAVE, SETUP_EMPTY_KEY, SETUP_CLOSE, SETUP_REPLACE, SETUP_USE_RECOMMENDED, savedKeyLine, maskApiKey,
} from '../setupStrings';

const testApiKeyMock = vi.fn();
vi.mock('../../../services/openrouter', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../services/openrouter')>()),
  testApiKey: (...args: unknown[]) => testApiKeyMock(...args),
}));

import { QuickAISetupForm, QuickAISetupDialog, SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../QuickAISetup';

function makeStorage(initial: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initial };
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
const clickTest = () => fireEvent.click(screen.getByRole('button', { name: SETUP_TEST }));

describe('QuickAISetupForm', () => {
  it('renders title, explanation, masked field and the get-a-key link in a new tab', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(screen.getByRole('heading', { name: SETUP_TITLE })).toBeInTheDocument();
    expect(screen.getByText(SETUP_EXPLANATION)).toBeInTheDocument();
    expect(SETUP_EXPLANATION).toContain('低成本可靠模型');
    expect(keyField().type).toBe('password');
    const link = screen.getByRole('link', { name: new RegExp(SETUP_GET_KEY) });
    expect(link).toHaveAttribute('href', OPENROUTER_KEYS_URL);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('strings are Chinese first (ADR-0003)', () => {
    for (const s of [SETUP_TITLE, SETUP_EXPLANATION, SETUP_GET_KEY, SETUP_TEST, SETUP_SAVE, SETUP_REPLACE,
      SETUP_USE_RECOMMENDED, SETUP_TEST_OK, SETUP_TEST_INVALID, SETUP_TEST_NO_CREDITS, SETUP_TEST_ERROR,
      savedKeyLine('sk-or-…abcd')]) {
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

  it('Test uses the existing OpenRouter validator with the model Ask AI resolves and reports success', async () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'sk-or-abc' } });
    clickTest();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SETUP_TEST_OK));
    expect(testApiKeyMock).toHaveBeenCalledWith('sk-or-abc', ASK_AI_MODEL);
    expect(storage.dump()).toEqual({}); // Test does not save
  });

  it.each([
    [401, 'User not found.', `${SETUP_TEST_INVALID} · HTTP 401: User not found.`],
    [402, 'Insufficient credits', `${SETUP_TEST_NO_CREDITS} · HTTP 402: Insufficient credits`],
    [404, 'No endpoints found', `${modelUnavailableLine(ASK_AI_MODEL)} · HTTP 404: No endpoints found`],
    [500, 'HTTP 500: Internal Server Error', `${SETUP_TEST_ERROR} · HTTP 500: Internal Server Error`],
  ])('Test maps a %i reply to its bilingual outcome with the status', async (status, error, expected) => {
    testApiKeyMock.mockResolvedValue({ success: false, status, error });
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'bad' } });
    clickTest();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(expected));
  });

  it('Test reports a network failure (no status) as a test failure with the message', async () => {
    testApiKeyMock.mockResolvedValue({ success: false, error: 'Failed to fetch' });
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.change(keyField(), { target: { value: 'k' } });
    clickTest();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(`${SETUP_TEST_ERROR} · Failed to fetch`));
  });
});

describe('QuickAISetupForm — saved state (a key is already stored)', () => {
  const STORED = 'sk-or-v1-0123456789abcdef';
  beforeEach(() => {
    storage = makeStorage({
      [STORAGE_KEYS.OPENROUTER_API_KEY]: STORED,
      [STORAGE_KEYS.AI_PROVIDER]: 'openrouter',
      [STORAGE_KEYS.AI_MODEL]: 'openrouter/auto:free',
    });
    vi.stubGlobal('localStorage', storage);
  });

  it('shows the masked key (last 4 only), the model Ask AI will use, and no input or Save', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    expect(maskApiKey(STORED)).toBe('sk-or-…cdef');
    expect(screen.getByTestId('saved-key')).toHaveTextContent(savedKeyLine('sk-or-…cdef'));
    expect(screen.getByTestId('saved-key').textContent).not.toContain(STORED);
    expect(screen.getByTestId('saved-model')).toHaveTextContent(modelLine('openrouter/free'));
    expect(screen.queryByLabelText(SETUP_KEY_LABEL)).toBeNull();
    expect(screen.queryByRole('button', { name: SETUP_SAVE })).toBeNull();
  });

  it('Replace reveals the empty masked field and the Save button', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_REPLACE }));
    expect(keyField().value).toBe('');
    expect(keyField().type).toBe('password');
    expect(screen.queryByTestId('saved-key')).toBeNull();
    expect(screen.getByRole('button', { name: SETUP_SAVE })).toBeInTheDocument();
  });

  it('Test with nothing typed validates the STORED key with the resolved model', async () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    clickTest();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(SETUP_TEST_OK));
    expect(testApiKeyMock).toHaveBeenCalledWith(STORED, 'openrouter/free');
  });

  it('after Replace, Test with an empty field still validates the stored key; typing a key tests that one', async () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_REPLACE }));
    clickTest();
    await waitFor(() => expect(testApiKeyMock).toHaveBeenCalledWith(STORED, 'openrouter/free'));
    fireEvent.change(keyField(), { target: { value: 'sk-or-new' } });
    clickTest();
    await waitFor(() => expect(testApiKeyMock).toHaveBeenLastCalledWith('sk-or-new', 'openrouter/free'));
  });

  it('Use recommended model writes the recommended default over the stored model and updates the line', () => {
    render(<QuickAISetupForm onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_USE_RECOMMENDED }));
    expect(storage.dump()[STORAGE_KEYS.AI_MODEL]).toBe(DEFAULT_AI_SETUP.model);
    expect(storage.dump()[STORAGE_KEYS.AI_PROVIDER]).toBe(DEFAULT_AI_SETUP.provider);
    expect(screen.getByTestId('saved-model')).toHaveTextContent(modelLine(ASK_AI_MODEL));
    expect(screen.queryByRole('button', { name: SETUP_USE_RECOMMENDED })).toBeNull(); // already recommended
  });

  it('Replace → paste → Save stores the new key and returns to the saved state with its last 4', () => {
    const onSaved = vi.fn();
    render(<QuickAISetupForm onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: SETUP_REPLACE }));
    fireEvent.change(keyField(), { target: { value: 'sk-or-new-9999' } });
    fireEvent.click(screen.getByRole('button', { name: SETUP_SAVE }));
    expect(storage.dump()[STORAGE_KEYS.OPENROUTER_API_KEY]).toBe('sk-or-new-9999');
    expect(storage.dump()[STORAGE_KEYS.AI_MODEL]).toBe('openrouter/auto:free'); // existing choice kept
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('saved-key')).toHaveTextContent(savedKeyLine('sk-or-…9999'));
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
