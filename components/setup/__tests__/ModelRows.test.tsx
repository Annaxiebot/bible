/**
 * ModelRows.test.tsx — the "模型 Models" block · 模型设置测试
 *
 * Rows render prefilled with the EFFECTIVE value (stored choice, else the
 * constant); typing stores on every change through the aiDefaults writers;
 * emptying a field clears the stored key and blur re-shows the default;
 * Recommended resets one row only and is disabled once the row is at the
 * default. Strings imported (R3); senior type floors as the dialog.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { STORAGE_KEYS } from '../../../constants/storageKeys';
import { ASK_AI_MODEL, PACK_GENERATION_MODEL, ASK_AI_FALLBACK_MODELS } from '../../../services/aiDefaults';
import { SETUP_MODEL_ASK, SETUP_MODEL_PACK, SETUP_MODEL_FALLBACKS, SETUP_MODELS_TITLE, recommendedFor } from '../setupStrings';
import { ModelRows } from '../ModelRows';
import { SETUP_MIN_FONT_PX, SETUP_MIN_TAP_PX } from '../QuickAISetup';

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
const onChanged = vi.fn();
const textStyle = { fontSize: SETUP_MIN_FONT_PX };
const controlStyle = { ...textStyle, minHeight: SETUP_MIN_TAP_PX };

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const reset = (label: string) => screen.getByRole('button', { name: recommendedFor(label) });
const renderRows = () => render(<ModelRows textStyle={textStyle} controlStyle={controlStyle} onChanged={onChanged} />);

beforeEach(() => {
  storage = makeStorage({ [STORAGE_KEYS.AI_PROVIDER]: 'openrouter' });
  vi.stubGlobal('localStorage', storage);
  onChanged.mockReset();
});

describe('ModelRows', () => {
  it('renders the three rows prefilled with the defaults when nothing is stored, Recommended disabled', () => {
    renderRows();
    expect(screen.getByRole('heading', { name: SETUP_MODELS_TITLE })).toBeInTheDocument();
    expect(field(SETUP_MODEL_ASK).value).toBe(ASK_AI_MODEL);
    expect(field(SETUP_MODEL_PACK).value).toBe(PACK_GENERATION_MODEL);
    expect(field(SETUP_MODEL_FALLBACKS).value).toBe(ASK_AI_FALLBACK_MODELS.join(', '));
    for (const label of [SETUP_MODEL_ASK, SETUP_MODEL_PACK, SETUP_MODEL_FALLBACKS]) {
      expect(reset(label)).toBeDisabled();
      expect(field(label).style.fontSize).toBe(`${SETUP_MIN_FONT_PX}px`);
      expect(field(label).style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
      expect(reset(label).style.minHeight).toBe(`${SETUP_MIN_TAP_PX}px`);
    }
  });

  it('prefills stored choices and enables their Recommended reset', () => {
    storage.setItem(STORAGE_KEYS.AI_MODEL, 'openai/gpt-4o-mini');
    storage.setItem(STORAGE_KEYS.AI_PACK_MODEL, 'deepseek/deepseek-chat-v3-0324');
    storage.setItem(STORAGE_KEYS.AI_FALLBACK_MODELS, 'x/one, y/two');
    renderRows();
    expect(field(SETUP_MODEL_ASK).value).toBe('openai/gpt-4o-mini');
    expect(field(SETUP_MODEL_PACK).value).toBe('deepseek/deepseek-chat-v3-0324');
    expect(field(SETUP_MODEL_FALLBACKS).value).toBe('x/one, y/two');
    expect(reset(SETUP_MODEL_ASK)).toBeEnabled();
    expect(reset(SETUP_MODEL_PACK)).toBeEnabled();
    expect(reset(SETUP_MODEL_FALLBACKS)).toBeEnabled();
  });

  it('typing stores each row under its own key on every change and notifies the dialog', () => {
    renderRows();
    fireEvent.change(field(SETUP_MODEL_PACK), { target: { value: 'openai/gpt-5' } });
    expect(storage.dump()[STORAGE_KEYS.AI_PACK_MODEL]).toBe('openai/gpt-5');
    fireEvent.change(field(SETUP_MODEL_FALLBACKS), { target: { value: 'a/b, c/d' } });
    expect(storage.dump()[STORAGE_KEYS.AI_FALLBACK_MODELS]).toBe('a/b, c/d');
    fireEvent.change(field(SETUP_MODEL_ASK), { target: { value: 'openai/gpt-4o-mini' } });
    expect(storage.dump()[STORAGE_KEYS.AI_MODEL]).toBe('openai/gpt-4o-mini');
    expect(storage.dump()[STORAGE_KEYS.AI_PROVIDER]).toBe('openrouter');
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it('emptying a row clears its stored key; blur shows the effective default again', () => {
    storage.setItem(STORAGE_KEYS.AI_PACK_MODEL, 'openai/gpt-5');
    renderRows();
    fireEvent.change(field(SETUP_MODEL_PACK), { target: { value: '   ' } });
    expect(storage.dump()[STORAGE_KEYS.AI_PACK_MODEL]).toBeUndefined();
    fireEvent.blur(field(SETUP_MODEL_PACK));
    expect(field(SETUP_MODEL_PACK).value).toBe(PACK_GENERATION_MODEL);
  });

  it('Recommended resets only its own row to the shipped default', () => {
    storage.setItem(STORAGE_KEYS.AI_PACK_MODEL, 'openai/gpt-5');
    storage.setItem(STORAGE_KEYS.AI_FALLBACK_MODELS, 'a/b');
    renderRows();
    fireEvent.click(reset(SETUP_MODEL_FALLBACKS));
    expect(field(SETUP_MODEL_FALLBACKS).value).toBe(ASK_AI_FALLBACK_MODELS.join(', '));
    expect(storage.dump()[STORAGE_KEYS.AI_FALLBACK_MODELS]).toBe(ASK_AI_FALLBACK_MODELS.join(', '));
    expect(reset(SETUP_MODEL_FALLBACKS)).toBeDisabled();
    expect(storage.dump()[STORAGE_KEYS.AI_PACK_MODEL]).toBe('openai/gpt-5'); // untouched
    expect(field(SETUP_MODEL_PACK).value).toBe('openai/gpt-5');
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it('labels are Chinese first (ADR-0003)', () => {
    for (const s of [SETUP_MODELS_TITLE, SETUP_MODEL_ASK, SETUP_MODEL_PACK, SETUP_MODEL_FALLBACKS, recommendedFor(SETUP_MODEL_PACK)]) {
      expect(s).toMatch(/^[一-鿿]/);
    }
  });
});
