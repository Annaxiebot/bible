/**
 * useQuickAISetup.ts — state for the one-field OpenRouter key dialog · 设置AI状态
 *
 * Saved state: when a key is already stored (services/openrouter getApiKey)
 * the dialog shows a masked line + the model Ask AI will use instead of an
 * empty field; Replace reveals the field. Test reuses the existing validator
 * (services/openrouter testApiKey) against the typed key, or the STORED key
 * when the field is empty, with the model Ask AI resolves — so a wrong
 * stored model is visible. Save stores the key under the existing storage
 * key and applies the shared defaults (services/aiDefaults). The key never
 * leaves component state except into localStorage — never logged, never in
 * a URL; only its last 4 characters are ever displayed.
 */
import { useState, useCallback } from 'react';
import { testApiKey, getApiKey, ApiKeyTestResult } from '../../services/openrouter';
import { saveOpenRouterKey, applyRecommendedModel, DEFAULT_AI_SETUP } from '../../services/aiDefaults';
import { classifyOpenRouterStatus } from '../../services/openrouterStatus';
import { resolveAskAIModel } from '../studypack/askAI';
import { httpDetail, modelUnavailableLine } from '../studypack/tvHints';
import {
  SETUP_EMPTY_KEY, SETUP_TEST_OK, SETUP_TEST_INVALID, SETUP_TEST_NO_CREDITS, SETUP_TEST_ERROR,
  maskApiKey,
} from './setupStrings';

export type TestStatus =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; message: string }
  | { kind: 'failed'; message: string };

export interface QuickAISetup {
  key: string;
  setKey: (key: string) => void;
  shown: boolean;
  toggleShown: () => void;
  test: TestStatus;
  runTest: () => Promise<void>;
  /** Field-level error (empty key on Save); null when none. */
  error: string | null;
  /** Returns true when the key was stored. */
  save: () => boolean;
  /** "sk-or-…" + last 4 of the stored key; null when nothing is stored. */
  maskedKey: string | null;
  /** True while the saved line replaces the input (a key is stored and Replace was not pressed). */
  showingSaved: boolean;
  startReplace: () => void;
  /** The model Ask AI will send (wire id). */
  model: string;
  /** True when `model` differs from the recommended default (the one-tap switch is offered). */
  recommendedAvailable: boolean;
  useRecommended: () => void;
}

/** Map the validator's result to the bilingual outcome line (status-typed, never a bare boolean). */
export function describeTestResult(result: ApiKeyTestResult, model: string): TestStatus {
  if (result.success) return { kind: 'ok', message: SETUP_TEST_OK };
  const status = result.status;
  if (status === undefined) {
    return { kind: 'failed', message: `${SETUP_TEST_ERROR} · ${result.error ?? ''}`.trim() };
  }
  // testApiKey falls back to "HTTP <status>: <statusText>" when OpenRouter sent no message.
  const apiMessage = (result.error ?? '').replace(new RegExp(`^HTTP ${status}:\\s*`), '');
  const base = {
    'invalid-key': SETUP_TEST_INVALID,
    'no-credits': SETUP_TEST_NO_CREDITS,
    'model-unavailable': modelUnavailableLine(model),
    'http-error': SETUP_TEST_ERROR,
  }[classifyOpenRouterStatus(status)];
  return { kind: 'failed', message: `${base} · ${httpDetail(status, apiMessage)}` };
}

export function useQuickAISetup(): QuickAISetup {
  const [key, setKeyState] = useState('');
  const [shown, setShown] = useState(false);
  const [test, setTest] = useState<TestStatus>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(getApiKey);
  const [replacing, setReplacing] = useState(false);
  const [model, setModel] = useState(resolveAskAIModel);

  const setKey = useCallback((next: string) => {
    setKeyState(next);
    setError(null);
    setTest({ kind: 'idle' });
  }, []);

  const toggleShown = useCallback(() => setShown(s => !s), []);
  const startReplace = useCallback(() => setReplacing(true), []);

  const useRecommended = useCallback(() => {
    applyRecommendedModel();
    setModel(resolveAskAIModel());
    setTest({ kind: 'idle' });
  }, []);

  const runTest = useCallback(async () => {
    const candidate = key.trim() || savedKey;
    if (!candidate) {
      setError(SETUP_EMPTY_KEY);
      return;
    }
    setTest({ kind: 'testing' });
    // testApiKey never throws: failures come back as { success: false, status?, error }.
    setTest(describeTestResult(await testApiKey(candidate, model), model));
  }, [key, savedKey, model]);

  const save = useCallback((): boolean => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError(SETUP_EMPTY_KEY);
      return false;
    }
    saveOpenRouterKey(trimmed);
    setSavedKey(trimmed);
    setKeyState('');
    setReplacing(false);
    setModel(resolveAskAIModel()); // defaults may have just been applied
    return true;
  }, [key]);

  return {
    key, setKey, shown, toggleShown, test, runTest, error, save,
    maskedKey: savedKey ? maskApiKey(savedKey) : null,
    showingSaved: savedKey !== null && !replacing,
    startReplace,
    model,
    recommendedAvailable: model !== DEFAULT_AI_SETUP.model,
    useRecommended,
  };
}
