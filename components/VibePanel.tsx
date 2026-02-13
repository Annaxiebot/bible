import React, { useState } from 'react';
import * as vibe from '../services/vibe';

interface VibePanelProps {
  apiKey?: string;
  provider: 'gemini' | 'claude';
  onClose: () => void;
}

const VibePanel: React.FC<VibePanelProps> = ({ apiKey, provider, onClose }) => {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);

  async function handleCustomize() {
    if (!prompt.trim() || !apiKey) return;

    setLoading(true);
    setResult('');

    try {
      const changes = await vibe.processVibePrompt(prompt);
      vibe.applyVibeChanges(changes);
      vibe.saveVibeCustomizations(changes);

      const summary = changes.map(c => `✓ ${c.description}`).join('\n');
      setResult(summary);
      setHistory(prev => [...prev, prompt]);
      setPrompt('');
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    if (confirm('Reset all customizations? 重置所有自定义设置？This will require a page reload.')) {
      vibe.clearVibeCustomizations();
      setHistory([]);
      setResult('✓ All customizations cleared. Please reload the page to see changes.');
    }
  }

  if (!apiKey) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-8 m-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-slate-800">✨ Vibe Coding</h2>
            <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🔑</div>
            <p className="text-lg text-slate-600 mb-2">Vibe-coding 需要配置 API 密钥</p>
            <p className="text-slate-500">Please configure {provider === 'gemini' ? 'Gemini' : 'Claude'} API key in Settings</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              ✨ Vibe Coding
              <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full">
                {provider === 'gemini' ? 'Gemini' : 'Claude'}
              </span>
            </h2>
            <button onClick={onClose} className="text-2xl text-slate-400 hover:text-slate-600">✕</button>
          </div>
          <p className="text-sm text-slate-500">
            Customize the app with natural language - changes apply instantly!
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="font-bold text-blue-900 mb-2">💡 Example Prompts:</p>
            <ul className="text-blue-800 space-y-1 text-sm">
              <li>• "Make the background a soft dark blue"</li>
              <li>• "Change verse numbers to gold and slightly larger"</li>
              <li>• "Add keyboard shortcut: Press 'b' to bookmark selected verse"</li>
              <li>• "Make the font size 18px"</li>
              <li>• "Add a floating button to jump to top"</li>
              <li>• "Make selected verses have a yellow highlight"</li>
            </ul>
          </div>

          {result && (
            <div className={`p-4 rounded-lg ${result.startsWith('❌') ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
              <pre className="text-sm whitespace-pre-wrap font-sans">{result}</pre>
            </div>
          )}

          {history.length > 0 && (
            <div>
              <h4 className="font-bold text-slate-700 mb-2">Applied Customizations:</h4>
              <div className="space-y-2">
                {history.map((item, i) => (
                  <div key={i} className="p-3 bg-slate-50 rounded-lg text-sm text-slate-600 flex items-start gap-2">
                    <span className="text-green-600 font-bold">{i + 1}.</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-slate-200 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && !loading && handleCustomize()}
              placeholder="Describe what you want... 描述你想要的改变..."
              className="flex-1 px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
              disabled={loading}
            />
            <button
              onClick={handleCustomize}
              disabled={loading || !prompt.trim()}
              className="px-8 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-semibold"
            >
              {loading ? '⏳' : 'Apply'}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition-colors text-sm font-medium"
            >
              Reset All 重置所有
            </button>
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
            >
              Done 完成
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VibePanel;
