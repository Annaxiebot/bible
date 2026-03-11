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

interface AIProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ isOpen, onClose }) => {
  const [currentProvider, setCurrentProvider] = useState<aiProvider.AIProvider>(aiProvider.getCurrentProvider());
  const [selectedModel, setSelectedModel] = useState<string>(aiProvider.getCurrentModel() || '');
  const [useFreeRouter, setUseFreeRouter] = useState<boolean>(() => {
    const stored = localStorage.getItem('useFreeRouter');
    return stored !== null ? stored === 'true' : true; // Default to true for free router
  });
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [kimiApiKey, setKimiApiKey] = useState('');
  const [openrouterApiKey, setOpenrouterApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showKimiKey, setShowKimiKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);
  const [autoSaveResearch, setAutoSaveResearch] = useState(() => autoSaveResearchService.isAutoSaveEnabled());
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string; model?: string }>>({});
  const [dynamicFreeModels, setDynamicFreeModels] = useState<OpenRouterModelInfo[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [verifiedModels, setVerifiedModels] = useState<Array<{ modelId: string; modelName: string }> | null>(null);
  const [autoDetecting, setAutoDetecting] = useState(false);
  const [detectProgress, setDetectProgress] = useState<AutoDetectProgress[]>([]);

  useEffect(() => {
    setGeminiApiKey(localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
    setClaudeApiKey(localStorage.getItem(STORAGE_KEYS.CLAUDE_API_KEY) || '');
    setOpenaiApiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
    setKimiApiKey(localStorage.getItem(STORAGE_KEYS.KIMI_API_KEY) || '');
    setOpenrouterApiKey(localStorage.getItem(STORAGE_KEYS.OPENROUTER_API_KEY) || '');
    setAutoSaveResearch(autoSaveResearchService.isAutoSaveEnabled());
    setSelectedModel(aiProvider.getCurrentModel() || '');
    setUseFreeRouter(localStorage.getItem('useFreeRouter') !== null ? localStorage.getItem('useFreeRouter') === 'true' : true);
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

  const handleTestKey = async (provider: aiProvider.AIProvider, apiKey: string) => {
    if (!apiKey.trim()) {
      setTestResults(prev => ({ ...prev, [provider]: { success: false, error: 'API key is empty' } }));
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

    // Save free router preference
    localStorage.setItem('useFreeRouter', useFreeRouter.toString());

    if (geminiApiKey.trim()) {
      localStorage.setItem(STORAGE_KEYS.GEMINI_API_KEY, geminiApiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.GEMINI_API_KEY);
    }

    if (claudeApiKey.trim()) {
      localStorage.setItem(STORAGE_KEYS.CLAUDE_API_KEY, claudeApiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.CLAUDE_API_KEY);
    }

    if (openaiApiKey.trim()) {
      localStorage.setItem(STORAGE_KEYS.OPENAI_API_KEY, openaiApiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.OPENAI_API_KEY);
    }

    if (kimiApiKey.trim()) {
      localStorage.setItem(STORAGE_KEYS.KIMI_API_KEY, kimiApiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.KIMI_API_KEY);
    }

    if (openrouterApiKey.trim()) {
      localStorage.setItem(STORAGE_KEYS.OPENROUTER_API_KEY, openrouterApiKey.trim());
    } else {
      localStorage.removeItem(STORAGE_KEYS.OPENROUTER_API_KEY);
    }

    autoSaveResearchService.setAutoSaveEnabled(autoSaveResearch);

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
          {/* Provider Selection */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-3">
              Select AI Provider
            </label>
            <div className="space-y-3">
              {providers.map((provider) => {
                const isConfigured = aiProvider.isProviderConfigured(provider.id);
                const isSelected = currentProvider === provider.id;
                
                return (
                  <div
                    key={provider.id}
                    onClick={() => setCurrentProvider(provider.id)}
                    className={`p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-slate-200 bg-white hover:border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12">
                              <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-800">{provider.name}</div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {provider.models.length} models available
                          </div>
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-1 rounded-full ${
                        isConfigured
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}>
                        {isConfigured ? '✓ Configured' : 'Not configured'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Model Selection */}
          {currentProviderInfo && currentProviderInfo.models.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-semibold text-slate-700">
                  Select Model for {currentProviderInfo.name}
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
                        Loading…
                      </>
                    ) : '↺ Refresh'}
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
                    <optgroup label={verifiedModels ? `— Verified Working Free Models (${verifiedModels.length}) —` : '— Free Models —'}>
                      {verifiedModels
                        ? verifiedModels.map(m => (
                            <option key={m.modelId} value={m.modelId}>{m.modelName}</option>
                          ))
                        : (dynamicFreeModels ?? FREE_MODELS).map(m => (
                            <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
                          ))
                      }
                    </optgroup>
                    <optgroup label="— Premium (requires credits) —">
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

              <p className="text-xs text-slate-500 mt-2">
                {currentProvider === 'openrouter'
                  ? verifiedModels
                    ? `Showing ${verifiedModels.length} verified working free model${verifiedModels.length !== 1 ? 's' : ''}. Click "Test & Auto-Select" to refresh.`
                    : 'Click "Test & Auto-Select" below to find and filter to working free models.'
                  : 'Different models have different capabilities and speed. Choose based on your needs.'}
              </p>

              {/* Free Router Toggle - OpenRouter only */}
              {currentProvider === 'openrouter' && (
                <div className="mt-4 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-slate-800 text-sm">✨ Use Free Router</div>
                        <div className="text-xs text-slate-500">
                          Auto-selects the best available free model (no manual testing needed)
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUseFreeRouter(v => !v)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                        useFreeRouter ? 'bg-blue-600' : 'bg-slate-200'
                      }`}
                      role="switch"
                      aria-checked={useFreeRouter}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                          useFreeRouter ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  {useFreeRouter && (
                    <p className="text-xs text-blue-700 mt-2">
                      🎯 OpenRouter will automatically pick the best free model for your request. 
                      No more guessing which model works!
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* API Keys Section */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">API Keys</h3>
            
            {/* OpenRouter API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                OpenRouter API Key
              </label>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showOpenrouterKey ? 'text' : 'password'}
                      value={openrouterApiKey}
                      onChange={(e) => setOpenrouterApiKey(e.target.value)}
                      placeholder="Enter your OpenRouter API key"
                      className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showOpenrouterKey ? (
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
                    onClick={() => handleTestKey('openrouter', openrouterApiKey)}
                    disabled={autoDetecting || !openrouterApiKey.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                  >
                    {autoDetecting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Testing...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Test &amp; Auto-Select
                      </>
                    )}
                  </button>
                </div>

                {/* Auto-detect progress */}
                {detectProgress.length > 0 && (
                  <div className="text-xs border border-slate-200 rounded p-2 space-y-1 bg-slate-50">
                    {autoDetecting && <p className="text-slate-500 font-medium">Testing free models in priority order…</p>}
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
                        {p.status === 'testing' && <span className="text-slate-400">testing…</span>}
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

                {testResults.openrouter && detectProgress.length === 0 && (
                  <div className={`text-xs p-2 rounded ${
                    testResults.openrouter.success
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {testResults.openrouter.success
                      ? `✓ API key works! Tested with: ${testResults.openrouter.model}`
                      : `✗ Error: ${testResults.openrouter.error}`}
                  </div>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from{' '}
                <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  OpenRouter (Free $5 credits + free models)
                </a>
              </p>
            </div>

            {/* Gemini API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Google Gemini API Key
              </label>
              <div className="relative">
                <input
                  type={showGeminiKey ? 'text' : 'password'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="Enter your Gemini API key"
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showGeminiKey ? (
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
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from{' '}
                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Google AI Studio
                </a>
              </p>
            </div>

            {/* Claude API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Anthropic Claude API Key
              </label>
              <div className="relative">
                <input
                  type={showClaudeKey ? 'text' : 'password'}
                  value={claudeApiKey}
                  onChange={(e) => setClaudeApiKey(e.target.value)}
                  placeholder="Enter your Claude API key"
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowClaudeKey(!showClaudeKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showClaudeKey ? (
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
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from{' '}
                <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Anthropic Console
                </a>
              </p>
            </div>

            {/* OpenAI API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                OpenAI ChatGPT API Key
              </label>
              <div className="relative">
                <input
                  type={showOpenaiKey ? 'text' : 'password'}
                  value={openaiApiKey}
                  onChange={(e) => setOpenaiApiKey(e.target.value)}
                  placeholder="Enter your OpenAI API key"
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showOpenaiKey ? (
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
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from{' '}
                <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  OpenAI Platform
                </a>
              </p>
            </div>

            {/* Kimi API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-2">
                Kimi Moonshot API Key (月之暗面)
              </label>
              <div className="relative">
                <input
                  type={showKimiKey ? 'text' : 'password'}
                  value={kimiApiKey}
                  onChange={(e) => setKimiApiKey(e.target.value)}
                  placeholder="Enter your Kimi API key (optional)"
                  className="w-full px-4 py-2 pr-12 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                />
                <button
                  type="button"
                  onClick={() => setShowKimiKey(!showKimiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showKimiKey ? (
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
              <p className="text-xs text-slate-500 mt-1">
                Get your API key from{' '}
                <a href="https://platform.moonshot.cn/" target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                  Moonshot Platform
                </a>
                {' '}(Optional - default key provided)
              </p>
            </div>
          </div>

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
                    • You can switch providers and models at any time<br />
                    • API keys are stored locally in your browser
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
