import React, { useState, useEffect } from 'react';
import * as aiProvider from '../services/aiProvider';
import { googleDrive } from '../services/googleDrive';
import { googleDriveSyncService } from '../services/googleDriveSyncService';

interface AIProviderSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const AIProviderSettings: React.FC<AIProviderSettingsProps> = ({ isOpen, onClose }) => {
  const [currentProvider, setCurrentProvider] = useState<aiProvider.AIProvider>(aiProvider.getCurrentProvider());
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [claudeApiKey, setClaudeApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showClaudeKey, setShowClaudeKey] = useState(false);
  const [autoSaveResearch, setAutoSaveResearch] = useState(false);

  // Google Drive state
  const [driveState, setDriveState] = useState(googleDrive.getState());
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<number | null>(null);

  useEffect(() => {
    setGeminiApiKey(localStorage.getItem('gemini_api_key') || '');
    setClaudeApiKey(localStorage.getItem('claude_api_key') || '');
    setAutoSaveResearch(localStorage.getItem('auto_save_research') === 'true');

    // Subscribe to Google Drive state changes
    const unsubscribe = googleDrive.subscribe((state) => {
      setDriveState(state);
    });

    // Load last sync time
    googleDrive.getLastSyncTime().then(setLastSyncTime).catch(() => {});

    return unsubscribe;
  }, [isOpen]);

  const handleSave = () => {
    aiProvider.setProvider(currentProvider);

    if (geminiApiKey.trim()) {
      localStorage.setItem('gemini_api_key', geminiApiKey.trim());
    } else {
      localStorage.removeItem('gemini_api_key');
    }

    if (claudeApiKey.trim()) {
      localStorage.setItem('claude_api_key', claudeApiKey.trim());
    } else {
      localStorage.removeItem('claude_api_key');
    }

    localStorage.setItem('auto_save_research', String(autoSaveResearch));

    onClose();

    // Reload page to apply changes
    window.location.reload();
  };

  // Google Drive handlers
  const handleGoogleSignIn = async () => {
    try {
      await googleDrive.signIn();
    } catch {
      alert('Failed to sign in to Google. Please try again.');
    }
  };

  const handleGoogleSignOut = async () => {
    if (confirm('Are you sure you want to sign out? Your data will remain in Google Drive.')) {
      try {
        await googleDrive.signOut();
      } catch {
        // Sign-out failure is non-fatal
      }
    }
  };

  const handleManualSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      await googleDriveSyncService.syncAll();
      const newLastSyncTime = await googleDrive.getLastSyncTime();
      setLastSyncTime(newLastSyncTime);
      alert('Sync completed successfully!');
    } catch {
      alert('Sync failed. Please try again.');
    } finally {
      setIsSyncing(false);
    }
  };

  const formatSyncTime = (timestamp: number | null): string => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hr ago`;

    return date.toLocaleString();
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

          {/* Google Drive Sync Section */}
          <div className="mt-6 border-t pt-6">
            <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
              <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L4.5 7.5v9L12 22l7.5-5.5v-9L12 2zm0 2.18l5.5 4.09v6.46L12 19.82l-5.5-4.09V8.27L12 4.18z"/>
              </svg>
              Cloud Sync with Google Drive
            </h3>

            {driveState.isSignedIn ? (
              <div className="space-y-4">
                {/* Error banner */}
                {driveState.lastError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                    <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                    <p className="text-xs text-red-700">Sync error: {driveState.lastError}</p>
                  </div>
                )}

                {/* Signed In State */}
                <div className={`p-4 rounded-xl border ${driveState.lastError ? 'bg-amber-50 border-amber-200' : 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${driveState.lastError ? 'bg-amber-100' : 'bg-green-100'}`}>
                        {driveState.lastError ? (
                          <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800">
                          {driveState.lastError ? 'Sync Error' : 'Synced with Google Drive'}
                        </p>
                        <p className="text-sm text-slate-600">{driveState.userEmail || 'Signed in'}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Last sync: {formatSyncTime(lastSyncTime)}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleManualSync}
                        disabled={isSyncing}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          isSyncing
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isSyncing ? (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Syncing...
                          </span>
                        ) : (
                          'Sync Now'
                        )}
                      </button>
                      <button
                        onClick={handleGoogleSignOut}
                        className="px-3 py-1.5 text-xs font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                </div>

                {/* Sync Info */}
                <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg">
                  <p className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                    </svg>
                    Your data is automatically backed up to Google Drive
                  </p>
                  <p className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    You own 100% of your data in your own Google Drive
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Sign In Prompt */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-600 mb-3">
                    Sync your notes, bookmarks, and annotations across all your devices. Your data stays in your own Google Drive.
                  </p>
                  <button
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-slate-300 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 transition-all font-semibold text-slate-700 group"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className="group-hover:text-indigo-700">Sign in with Google to Sync</span>
                  </button>
                </div>

                {/* Benefits */}
                <div className="text-xs text-slate-600 space-y-1.5 bg-indigo-50 p-3 rounded-lg border border-indigo-100">
                  <p className="font-semibold text-indigo-900 mb-2">Why use Google Drive sync?</p>
                  <p className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Automatic backup of all your Bible study notes</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Sync across all your devices (phone, tablet, computer)</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Your data stays private in your own Google Drive</span>
                  </p>
                  <p className="flex items-start gap-2">
                    <svg className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Works offline - syncs when you're back online</span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <div className="text-sm text-blue-800">
                <p className="font-semibold mb-1">About AI Providers</p>
                <ul className="space-y-1 text-xs">
                  <li>• <strong>Gemini</strong>: Google's AI with native search grounding support</li>
                  <li>• <strong>Claude</strong>: Anthropic's AI with extended thinking capabilities</li>
                  <li>• Both providers maintain the same bilingual format (Chinese + English)</li>
                  <li>• You can switch providers at any time in settings</li>
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
