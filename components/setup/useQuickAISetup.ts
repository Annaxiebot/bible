/**
 * useQuickAISetup.ts — state for the one-field OpenRouter key dialog · 设置AI状态
 *
 * Test reuses the existing validator (services/openrouter testApiKey); Save
 * stores the key under the existing storage key and applies the shared
 * defaults (services/aiDefaults). The key never leaves component state
 * except into localStorage — never logged, never in a URL.
 */
import { useState, useCallback } from 'react';
import { testApiKey } from '../../services/openrouter';
import { saveOpenRouterKey } from '../../services/aiDefaults';
import { SETUP_EMPTY_KEY, SETUP_TEST_OK, SETUP_TEST_FAILED } from './setupStrings';

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
}

export function useQuickAISetup(): QuickAISetup {
  const [key, setKeyState] = useState('');
  const [shown, setShown] = useState(false);
  const [test, setTest] = useState<TestStatus>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const setKey = useCallback((next: string) => {
    setKeyState(next);
    setError(null);
    setTest({ kind: 'idle' });
  }, []);

  const toggleShown = useCallback(() => setShown(s => !s), []);

  const runTest = useCallback(async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError(SETUP_EMPTY_KEY);
      return;
    }
    setTest({ kind: 'testing' });
    // testApiKey never throws: failures come back as { success: false, error }.
    const result = await testApiKey(trimmed);
    if (result.success) {
      setTest({ kind: 'ok', message: SETUP_TEST_OK });
    } else {
      setTest({ kind: 'failed', message: `${SETUP_TEST_FAILED} — ${result.error ?? ''}`.trim() });
    }
  }, [key]);

  const save = useCallback((): boolean => {
    if (!key.trim()) {
      setError(SETUP_EMPTY_KEY);
      return false;
    }
    saveOpenRouterKey(key);
    return true;
  }, [key]);

  return { key, setKey, shown, toggleShown, test, runTest, error, save };
}
