import React, { useState, useEffect } from 'react';
import * as aiProvider from '../services/aiProvider';
import { autoSaveResearchService } from '../services/autoSaveResearchService';
import { STORAGE_KEYS } from '../constants/storageKeys';

interface AIProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ isOpen, onClose }) => {
  const [currentProvider, setCurrentProvider] = useState<aiProvider.AIProvider>(aiProvider.getCurrentProvider());
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [kimiApiKey, setKimiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showKimiKey, setShowKimiKey] = useState(false);
  const [autoSaveResearch, setAutoSaveResearch] = useState(() => autoSaveResearchService.isAutoSaveEnabled());

  useEffect(() => {
    setGeminiApiKey(localStorage.getItem(STORAGE_KEYS.GEMINI_API_KEY) || '');
    setClaudeApiKey(localStorage.getItem(STORAGE_KEYS.CLAUDE_API_KEY) || '');
    setOpenaiApiKey(localStorage.getItem(STORAGE_KEYS.OPENAI_API_KEY) || '');
    setKimiApiKey(localStorage.getItem(STORAGE_KEYS.KIMI_API_KEY) || '');
    setAutoSaveResearch(autoSaveResearchService.isAutoSaveEnabled());
  }, [isOpen]);

  const handleSave = () => {
    aiProvider.setProvider(currentProvider);

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

    autoSaveResearchService.setAutoSaveEnabled(autoSaveResearch);

    onClose();

    // Reload page to apply changes
    window.location.reload();
  };

  const providers = aiProvider.getAvailableProviders();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">AI Provider Settings</h2>
              <p className="text-indigo-100 text-sm mt-1">Configure your AI research provider</p>
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
                            Models: {provider.models.map(m => m.replace(/-/g, ' ')).join(', ')}
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

          {/* API Keys Section */}
          <div className="space-y-4 border-t pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">API Keys</h3>
            
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
                    <strong>Gemini</strong>: Google's AI with native search grounding support<br />
                    <span className="text-blue-600">Get API key: </span>
                    <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                      Google AI Studio
                    </a>
                  </li>
                  <li>
                    <strong>Claude</strong>: Anthropic's AI with extended thinking capabilities<br />
                    <span className="text-blue-600">Get API key: </span>
                    <a href="https://console.anthropic.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                      Anthropic Console
                    </a>
                  </li>
                  <li>
                    <strong>ChatGPT</strong>: OpenAI's GPT-4o with vision and fast responses<br />
                    <span className="text-blue-600">Get API key: </span>
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                      OpenAI Platform
                    </a>
                  </li>
                  <li>
                    <strong>Kimi</strong>: Moonshot AI (月之暗面) with 128K context window<br />
                    <span className="text-blue-600">Get API key: </span>
                    <a href="https://platform.moonshot.cn/" target="_blank" rel="noopener noreferrer" className="underline hover:text-blue-900">
                      Moonshot Platform
                    </a>
                  </li>
                  <li className="pt-1 border-t border-blue-200 mt-2">
                    • All providers maintain the same bilingual format (Chinese + English)<br />
                    • You can switch providers at any time in settings<br />
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
