import React, { useState } from 'react';
import { VibeStyles, VIBE_PRESETS, generateVibeStyles, saveVibeStyles, clearVibeStyles, getEmptyStyles, getVibeProviderName } from '../services/vibe';

interface VibePanelProps {
  onClose: () => void;
  onApplyStyles: (styles: VibeStyles) => void;
  currentStyles: VibeStyles;
  isApiAvailable: boolean;
}

const VibePanel: React.FC<VibePanelProps> = ({ onClose, onApplyStyles, currentStyles, isApiAvailable }) => {
  const [customPrompt, setCustomPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeVibe, setActiveVibe] = useState<string | null>(null);

  const handleVibeCoding = async (vibePrompt: string) => {
    setIsGenerating(true);
    setError(null);
    setActiveVibe(vibePrompt);
    try {
      const styles = await generateVibeStyles(vibePrompt);
      onApplyStyles(styles);
      saveVibeStyles(styles);
    } catch (err) {
      // TODO: use error reporting service
      setError(err instanceof Error ? err.message : 'Failed to generate vibe');
      setActiveVibe(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleReset = () => {
    clearVibeStyles();
    onApplyStyles(getEmptyStyles());
    setActiveVibe(null);
    setError(null);
  };

  const handleCustomSubmit = () => {
    if (customPrompt.trim() && !isGenerating) {
      handleVibeCoding(customPrompt.trim());
      setCustomPrompt('');
    }
  };

  const hasActiveStyles = Object.values(currentStyles).some(v => v !== '');

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col m-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-2xl font-bold text-slate-800">Vibe Studio</h2>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-slate-500">
            Describe the atmosphere you want, and AI will style the app.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isApiAvailable && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="text-amber-800 font-medium">AI API key required</p>
              <p className="text-amber-600 text-sm mt-1">Configure an API key in AI Research settings to use Vibe Studio</p>
            </div>
          )}

          {/* Preset Vibe Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {VIBE_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => handleVibeCoding(preset)}
                disabled={isGenerating}
                className={`p-5 rounded-xl border text-left transition-all group disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeVibe === preset
                    ? 'border-indigo-300 bg-indigo-50 shadow-md'
                    : 'border-slate-100 bg-white hover:border-indigo-300 hover:shadow-lg'
                }`}
              >
                <p className={`font-medium ${
                  activeVibe === preset ? 'text-indigo-700' : 'text-slate-800 group-hover:text-indigo-600'
                }`}>
                  {preset}
                </p>
                {isGenerating && activeVibe === preset && (
                  <div className="flex items-center gap-2 mt-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-indigo-500">Generating...</span>
                  </div>
                )}
              </button>
            ))}
          </div>

          {/* Custom Vibe Prompt */}
          <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-5">
            <h4 className="font-bold text-indigo-800 mb-3">Custom Vibe Prompt</h4>
            <div className="flex gap-2">
              <input
                type="text"
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(); }}
                placeholder="e.g. A serene mountain morning..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-indigo-200 outline-none focus:ring-2 focus:ring-indigo-400 bg-white text-sm"
                disabled={isGenerating}
              />
              <button
                onClick={handleCustomSubmit}
                disabled={isGenerating || !customPrompt.trim()}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold text-sm"
              >
                {isGenerating && activeVibe === customPrompt ? 'Styling...' : 'Apply'}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Current Vibe Preview */}
          {hasActiveStyles && (
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-bold text-slate-700">Active Vibe</h4>
                <button
                  onClick={handleReset}
                  className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors text-xs font-medium"
                >
                  Reset to Default
                </button>
              </div>
              <div className="space-y-1.5 text-xs font-mono text-slate-500">
                {Object.entries(currentStyles).map(([key, value]) =>
                  value ? (
                    <div key={key} className="flex gap-2">
                      <span className="text-slate-400 w-24">{key}:</span>
                      <span className="text-indigo-600">{value}</span>
                    </div>
                  ) : null
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex gap-2">
          {hasActiveStyles && (
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2.5 bg-slate-200 text-slate-700 rounded-xl hover:bg-slate-300 transition-colors text-sm font-medium"
            >
              Reset All
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-indigo-100 text-indigo-700 rounded-xl hover:bg-indigo-200 transition-colors text-sm font-medium"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default VibePanel;
