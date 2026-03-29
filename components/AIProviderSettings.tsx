import React, { useState, useEffect } from 'react';
import * as aiProvider from '../services/aiProvider';
import {
  DEFAULT_FREE_MODEL,
  FREE_MODELS,
  PREMIUM_MODELS,
  FREE_ROUTER_MODEL,
  fetchAvailableModels,
  clearModelCache,
  autoDetectBestFreeModel,
  OpenRouterModelInfo,
  AutoDetectProgress,
} from '../services/openrouter';
import { autoSaveResearchService } from '../services/autoSaveResearchService';
import { STORAGE_KEYS } from '../constants/storageKeys';

// Provider → localStorage key mapping + UI metadata
const ALL_KEY_CONFIGS: Record<string, string> = {
  openrouter: STORAGE_KEYS.OPENROUTER_API_KEY,
  gemini: STORAGE_KEYS.GEMINI_API_KEY,
  claude: STORAGE_KEYS.CLAUDE_API_KEY,
  openai: STORAGE_KEYS.OPENAI_API_KEY,
  kimi: STORAGE_KEYS.KIMI_API_KEY,
  nvidia: STORAGE_KEYS.NVIDIA_API_KEY,
  deepseek: STORAGE_KEYS.DEEPSEEK_API_KEY,
  groq: STORAGE_KEYS.GROQ_API_KEY,
  dashscope: STORAGE_KEYS.DASHSCOPE_API_KEY,
  minimax: STORAGE_KEYS.MINIMAX_API_KEY,
  zhipu: STORAGE_KEYS.ZHIPU_API_KEY,
  zai: STORAGE_KEYS.ZAI_API_KEY,
  r9s: STORAGE_KEYS.R9S_API_KEY,
  moonshot: STORAGE_KEYS.MOONSHOT_API_KEY,
};

const KEY_UI: Record<string, { label: string; placeholder: string; helpUrl: string; helpText: string }> = {
  openrouter: { label: 'OpenRouter API Key', placeholder: 'Enter your OpenRouter API key', helpUrl: 'https://openrouter.ai/keys', helpText: 'OpenRouter (Free $5 credits + free models)' },
  gemini: { label: 'Google Gemini API Key', placeholder: 'Enter your Gemini API key', helpUrl: 'https://aistudio.google.com/app/apikey', helpText: 'Google AI Studio' },
  claude: { label: 'Anthropic Claude API Key', placeholder: 'Enter your Claude API key', helpUrl: 'https://console.anthropic.com/', helpText: 'Anthropic Console' },
  openai: { label: 'OpenAI ChatGPT API Key', placeholder: 'Enter your OpenAI API key', helpUrl: 'https://platform.openai.com/api-keys', helpText: 'OpenAI Platform' },
  kimi: { label: 'Kimi Moonshot API Key', placeholder: 'Enter your Kimi API key', helpUrl: 'https://platform.moonshot.cn/', helpText: 'Moonshot Platform' },
  nvidia: { label: 'NVIDIA API Key', placeholder: 'Enter your NVIDIA NIM API key', helpUrl: 'https://build.nvidia.com/', helpText: 'NVIDIA Build' },
  deepseek: { label: 'DeepSeek API Key', placeholder: 'Enter your DeepSeek API key', helpUrl: 'https://platform.deepseek.com/', helpText: 'DeepSeek Platform' },
  groq: { label: 'Groq API Key', placeholder: 'Enter your Groq API key', helpUrl: 'https://console.groq.com/keys', helpText: 'Groq Console' },
  dashscope: { label: 'DashScope / Qwen API Key', placeholder: 'Enter your DashScope API key', helpUrl: 'https://dashscope.console.aliyun.com/', helpText: 'Alibaba DashScope' },
  minimax: { label: 'MiniMax API Key', placeholder: 'Enter your MiniMax API key', helpUrl: 'https://platform.minimaxi.com/', helpText: 'MiniMax Platform' },
  zhipu: { label: 'Zhipu GLM API Key', placeholder: 'Enter your Zhipu API key', helpUrl: 'https://open.bigmodel.cn/', helpText: 'Zhipu Open Platform' },
  zai: { label: 'Z.AI API Key', placeholder: 'Enter your Z.AI API key', helpUrl: 'https://z.ai/', helpText: 'Z.AI' },
  r9s: { label: 'R9S.AI API Key', placeholder: 'Enter your R9S API key', helpUrl: 'https://r9s.ai/', helpText: 'R9S.AI' },
  moonshot: { label: 'Moonshot v2 API Key', placeholder: 'Enter your Moonshot API key', helpUrl: 'https://platform.moonshot.ai/', helpText: 'Moonshot AI Platform' },
};

interface AIProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ isOpen, onClose }) => {
  const [currentProvider, setCurrentProvider] = useState<aiProvider.AIProvider>(aiProvider.getCurrentProvider());
  const [selectedModel, setSelectedModel] = useState<string>(aiProvider.getCurrentModel() || '');
  const [lastUsedModel, setLastUsedModel] = useState<string | null>(() => localStorage.getItem('lastUsedModel'));
  const [useFreeRouter, setUseFreeRouter] = useState<boolean>(() => {
    const stored = localStorage.getItem('useFreeRouter');
    return stored !== null ? stored === 'true' : true; // Default to true for free router
  });
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [autoSaveResearch, setAutoSaveResearch] = useState(() => autoSaveResearchService.isAutoSaveEnabled());
  const [useServerAI, setUseServerAI] = useState(() => localStorage.getItem('useServerAI') !== 'false');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string; model?: string }>>({});
  const [dynamicFreeModels, setDynamicFreeModels] = useState<OpenRouterModelInfo[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [verifiedModels, setVerifiedModels] = useState<Array<{ modelId: string; modelName: string }> | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<AutoDetectProgress[]>([]);

  useEffect(() => {
    import('../services/supabase').then(({ authManager, isSupabaseConfigured }) => {
      setIsLoggedIn(isSupabaseConfigured() && authManager.getState().isAuthenticated);
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    // Load all API keys from localStorage
    const keys: Record<string, string> = {};
    for (const [, storageKey] of Object.entries(ALL_KEY_CONFIGS)) {
      keys[storageKey] = localStorage.getItem(storageKey) || '';
    }
    setApiKeys(keys);
    setAutoSaveResearch(autoSaveResearchService.isAutoSaveEnabled());
    setSelectedModel(aiProvider.getCurrentModel() || '');
    setUseFreeRouter(localStorage.getItem('useFreeRouter') !== null ? localStorage.getItem('useFreeRouter') === 'true' : true);
    setUseServerAI(localStorage.getItem('useServerAI') !== 'false');
    setLastUsedModel(localStorage.getItem('lastUsedModel'));
  }, [isOpen]);

  // Fetch live OpenRouter free models when OpenRouter is selected
  useEffect(() => {
    if (currentProvider !== 'openrouter' || !isOpen) return;
    loadOpenRouterModels();
  }, [currentProvider, isOpen]);

  const loadOpenRouterModels = async (forceRefresh = false) => {
    if (forceRefresh) clearModelCache();
    setModelsLoading(true);
    setModelsError(null);
    try {
      const all = await fetchAvailableModels();
      setDynamicFreeModels(all.filter(m => m.isFree));
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : 'Failed to load models');
      setDynamicFreeModels(null);
    } finally {
      setModelsLoading(false);
    }
  };

  const testViaEdgeFunction = async (provider: aiProvider.AIProvider, apiKey: string) => {
    // Save key to Supabase first so Edge Function can read it
    const { supabase, authManager } = await import('../services/supabase');
    if (!supabase) throw new Error('Supabase not configured');
    const userId = authManager.getUserId();
    if (!userId) throw new Error('Not logged in');

    // Refresh session to ensure token is valid
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error('No session — try signing out and back in');

    // Push current settings + this key to user_settings
    const settings: Record<string, string> = {};
    const syncKeys = [STORAGE_KEYS.AI_PROVIDER, STORAGE_KEYS.AI_MODEL, ...Object.values(ALL_KEY_CONFIGS)];
    for (const key of syncKeys) { const v = localStorage.getItem(key); if (v) settings[key] = v; }
    // Override with the key being tested
    const storageKey = ALL_KEY_CONFIGS[provider];
    if (storageKey) settings[storageKey] = apiKey;
    settings[STORAGE_KEYS.AI_PROVIDER] = provider;

    await Promise.resolve(supabase.from('user_settings').upsert(
      { user_id: userId, settings, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    ));

    // Call Edge Function with a simple test prompt
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': supabaseKey,
      },
      body: JSON.stringify({
        prompt: 'Say "OK" in one word.',
        history: [],
        options: { model: selectedModel || undefined },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Server error: ${response.status}`);
    return { success: true, model: data.model };
  };

  const handleTestKey = async (provider: aiProvider.AIProvider, apiKey: string) => {
    if (!apiKey.trim()) {
      setTestResults(prev => ({ ...prev, [provider]: { success: false, error: 'API key is empty' } }));
      return;
    }

    // Test via Edge Function when server-side AI is enabled and logged in
    if (useServerAI && isLoggedIn && provider !== 'openrouter') {
      setTestingKey(provider);
      try {
        const result = await testViaEdgeFunction(provider, apiKey);
        setTestResults(prev => ({ ...prev, [provider]: result }));
      } catch (error) {
        setTestResults(prev => ({
          ...prev,
          [provider]: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }));
      } finally {
        setTestingKey(null);
      }
      return;
    }

    if (provider === 'openrouter') {
      // For OpenRouter: test all free models, filter to working ones, auto-select best
      setAutoDetecting(true);
      setDetectProgress([]);
      setVerifiedModels(null);
      setTestResults(prev => ({ ...prev, openrouter: undefined as unknown as { success: boolean } }));
      try {
        const { working, best } = await autoDetectBestFreeModel(apiKey, (progress) => {
          setDetectProgress(prev => {
            const existing = prev.findIndex(p => p.modelId === progress.modelId);
            if (existing >= 0) {
              const next = [...prev];
              next[existing] = progress;
              return next;
            }
            return [...prev, progress];
          });
        });
        setVerifiedModels(working);
        if (best) {
          setSelectedModel(best.modelId);
          setTestResults(prev => ({ ...prev, openrouter: { success: true, model: best.modelId } }));
        } else {
          setTestResults(prev => ({ ...prev, openrouter: { success: false, error: 'No working free models found' } }));
        }
      } catch (error) {
        setTestResults(prev => ({
          ...prev,
          openrouter: { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
        }));
      } finally {
        setAutoDetecting(false);
      }
      return;
    }

    setTestingKey(provider);
    try {
      const result = await aiProvider.testApiKey(provider, apiKey);
      setTestResults(prev => ({ ...prev, [provider]: result }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }));
    } finally {
      setTestingKey(null);
    }
  };

  const handleSave = () => {
    aiProvider.setProvider(currentProvider);

    if (selectedModel) {
      aiProvider.setModel(selectedModel as aiProvider.AIModel);
    }

    // Save preferences
    localStorage.setItem('useFreeRouter', useFreeRouter.toString());
    localStorage.setItem('useServerAI', useServerAI.toString());

    // Save all API keys to localStorage
    for (const [, storageKey] of Object.entries(ALL_KEY_CONFIGS)) {
      const val = apiKeys[storageKey]?.trim();
      if (val) {
        localStorage.setItem(storageKey, val);
      } else {
        localStorage.removeItem(storageKey);
      }
    }

    autoSaveResearchService.setAutoSaveEnabled(autoSaveResearch);

    // Sync settings to Supabase if logged in
    import('../services/supabase').then(({ supabase, authManager, canSync }) => {
      if (supabase && canSync()) {
        const userId = authManager.getUserId();
        if (userId) {
          const settings: Record<string, string> = {};
          const syncKeys = [
            STORAGE_KEYS.AI_PROVIDER, STORAGE_KEYS.AI_MODEL,
            STORAGE_KEYS.AUTO_SAVE_RESEARCH, 'useFreeRouter', 'useServerAI',
            ...Object.values(ALL_KEY_CONFIGS),
          ];
          for (const key of syncKeys) {
            const val = localStorage.getItem(key);
            if (val) settings[key] = val;
          }
          Promise.resolve(supabase.from('user_settings').upsert(
            { user_id: userId, settings, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          )).catch(() => {});
        }
      }
    }).catch(() => {});

    onClose();
  };

  const providers = aiProvider.getAvailableProviders();
  const currentProviderInfo = providers.find(p => p.id === currentProvider);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">AI Provider Settings</h2>
              <p className="text-indigo-100 text-sm mt-1">Configure your AI research provider and model</p>
              {lastUsedModel && (
                <p className="text-indigo-200 text-xs mt-2 flex items-center gap-1">
                  <span className="opacity-70">Last used:</span>
                  <span className="font-mono bg-white/10 px-2 py-0.5 rounded">{lastUsedModel}</span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 180px)' }}>
          {/* Provider Selection - Dropdown */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              Select AI Provider
            </label>
            <select
              value={currentProvider}
              onChange={(e) => setCurrentProvider(e.target.value as aiProvider.AIProvider)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm font-medium"
            >
              {providers.map((provider) => {
                const isConfigured = aiProvider.isProviderConfigured(provider.id);
                return (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} ({provider.models.length} models){isConfigured ? ' - Configured' : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {/* API Key for selected provider */}
          <div className="mb-6">
            {(() => {
              const storageKey = ALL_KEY_CONFIGS[currentProvider];
              const ui = KEY_UI[currentProvider];
              if (!storageKey || !ui) return null;
              const value = apiKeys[storageKey] || '';
              const isShown = showKey[currentProvider] || false;
              const isTesting = currentProvider === 'openrouter' ? autoDetecting : testingKey === currentProvider;
              return (
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-2">{ui.label}</label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={isShown ? 'text' : 'password'}
                        value={value}
                        onChange={(e) => setApiKeys(prev => ({ ...prev, [storageKey]: e.target.value }))}
                        placeholder={ui.placeholder}
                        className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey(prev => ({ ...prev, [currentProvider]: !isShown }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {isShown ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTestKey(currentProvider, value)}
                      disabled={isTesting || !value.trim()}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                    >
                      {isTesting ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                          </svg>
                          Testing...
                        </>
                      ) : (
                        'Test'
                      )}
                    </button>
                  </div>
                  {/* Test result */}
                  {testResults[currentProvider] && (
                    <div className={`text-xs p-2 rounded mt-2 ${
                      testResults[currentProvider].success
                        ? 'bg-green-50 text-green-700 border border-green-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}>
                      {testResults[currentProvider].success
                        ? `✓ API key works!${testResults[currentProvider].model ? ` Tested with: ${testResults[currentProvider].model}` : ''}`
                        : `✗ Error: ${testResults[currentProvider].error}`}
                    </div>
                  )}
                  {/* Auto-detect progress (OpenRouter only) */}
                  {currentProvider === 'openrouter' && detectProgress.length > 0 && (
                    <div className="text-xs border border-slate-200 rounded p-2 space-y-1 bg-slate-50 mt-2">
                      {autoDetecting && <p className="text-slate-500 font-medium">Testing free models in priority order...</p>}
                      {detectProgress.map(p => (
                        <div key={p.modelId} className="flex items-center gap-2">
                          {p.status === 'testing' && (
                            <svg className="animate-spin h-3 w-3 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                          )}
                          {p.status === 'success' && <span className="text-green-600 flex-shrink-0">✓</span>}
                          {p.status === 'failed' && <span className="text-red-500 flex-shrink-0">✗</span>}
                          <span className={p.status === 'failed' ? 'text-slate-400' : 'text-slate-700'}>{p.modelName}</span>
                          {p.status === 'testing' && <span className="text-slate-400">testing...</span>}
                          {p.status === 'failed' && <span className="text-slate-400">unavailable</span>}
                          {p.status === 'success' && <span className="text-green-600">works!</span>}
                        </div>
                      ))}
                      {!autoDetecting && verifiedModels !== null && (
                        <p className="pt-1 border-t border-slate-200 text-slate-600 font-medium">
                          {verifiedModels.length > 0
                            ? `Auto-selected: ${verifiedModels[0]?.modelName ?? ''} (${verifiedModels.length} working model${verifiedModels.length !== 1 ? 's' : ''} found)`
                            : 'No working free models found. Check your API key or try again later.'}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Get your API key from{' '}
                    <a href={ui.helpUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                      {ui.helpText}
                    </a>
                  </p>
                </div>
              );
            })()}
          </div>

          {/* Model Selection */}
          {currentProviderInfo && currentProviderInfo.models.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-700">
                  Select Model
                </label>
                {currentProvider === 'openrouter' && (
                  <button
                    type="button"
                    onClick={() => loadOpenRouterModels(true)}
                    disabled={modelsLoading}
                    className="text-xs text-indigo-600 hover:underline disabled:opacity-50 flex items-center gap-1"
                  >
                    {modelsLoading ? (
                      <>
                        <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Loading...
                      </>
                    ) : 'Refresh'}
                  </button>
                )}
              </div>

              {currentProvider === 'openrouter' && modelsError && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-2">
                  Could not load live model list: {modelsError}. Showing cached list.
                </div>
              )}

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm"
              >
                <option value="">
                  {currentProvider === 'openrouter'
                    ? `Default: ${FREE_MODELS.find(m => m.id === DEFAULT_FREE_MODEL)?.name ?? DEFAULT_FREE_MODEL}`
                    : 'Use provider default'}
                </option>

                {currentProvider === 'openrouter' ? (
                  <>
                    <optgroup label="Auto">
                      <option value="openrouter/auto:free">Auto (free models only)</option>
                      <option value="openrouter/auto">Auto (any model, may use credits)</option>
                    </optgroup>
                    <optgroup label={verifiedModels ? `Verified Working Free Models (${verifiedModels.length})` : 'Free Models'}>
                      {verifiedModels
                        ? verifiedModels.map(m => (
                            <option key={m.modelId} value={m.modelId}>{m.modelName}</option>
                          ))
                        : (dynamicFreeModels ?? FREE_MODELS).map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                          ))
                      }
                    </optgroup>
                    <optgroup label="Premium (requires credits)">
                      {PREMIUM_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  currentProviderInfo.models.map((model) => {
                    const modelId = model.split(' (')[0];
                    return <option key={modelId} value={modelId}>{model}</option>;
                  })
                )}
              </select>
            </div>
          )}

          {/* Server-side AI toggle - only show when logged in */}
          {isLoggedIn && (
            <div className="mt-6 border-t pt-6">
              <h3 className="text-sm font-semibold text-slate-700 mb-3">AI Routing</h3>
              <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
                <div>
                  <div className="font-medium text-slate-800 text-sm">Use server-side AI</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    Route AI calls through cloud proxy. Avoids CORS issues (e.g. Claude) and keeps API keys server-side.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setUseServerAI(v => !v)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                    useServerAI ? 'bg-indigo-600' : 'bg-slate-200'
                  }`}
                  role="switch"
                  aria-checked={useServerAI}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      useServerAI ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              {useServerAI && (
                <div className="mt-2 text-xs text-indigo-600 px-1">
                  AI calls will go through your Supabase cloud proxy. API keys are read from your synced settings.
                </div>
              )}
              {!useServerAI && (
                <div className="mt-2 text-xs text-slate-500 px-1">
                  AI calls will go directly from this browser. API keys must be configured locally.
                </div>
              )}
            </div>
          )}

          {/* Research Behavior */}
          <div className="mt-6 border-t pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Research Behavior</h3>
            <div className="flex items-center justify-between p-4 border border-slate-200 rounded-xl">
              <div>
                <div className="font-medium text-slate-800 text-sm">Auto-save AI research notes</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Automatically save each AI response to the current chapter's research notes
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAutoSaveResearch(v => !v)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                  autoSaveResearch ? 'bg-indigo-600' : 'bg-slate-200'
                }`}
                role="switch"
                aria-checked={autoSaveResearch}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                    autoSaveResearch ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-2">About AI Providers</p>
                <ul className="space-y-2 text-xs">
                  <li>
                    <strong>OpenRouter</strong>: Unified gateway to 100+ models with free tiers<br />
                    <span className="text-blue-600">Free models: </span>Llama 3.3 70B, Mistral Small 3.1, Gemma 3 27B, DeepSeek, etc.
                  </li>
                  <li>
                    <strong>Direct providers</strong> (Gemini, Claude, OpenAI, Kimi) connect directly to their APIs<br />
                    <span className="text-blue-600">Use when: </span>You want provider-specific features or already have API keys
                  </li>
                  <li className="pt-1 border-t border-blue-200 mt-2">
                    • All providers maintain the same bilingual format (Chinese + English)<br />
                    • You can switch providers and models at any time
                  </li>
                  <li className="pt-1 border-t border-blue-200 mt-2">
                    <strong>Not signed in:</strong> Settings saved to this browser only<br />
                    <strong>Signed in:</strong> Settings synced to cloud — sign in on another device and AI works automatically
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-slate-50 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold shadow-md"
          >
            Save & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default AIProviderSettings;
