import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('../aiProvider', () => ({ chatWithAI: vi.fn(), getCurrentProvider: vi.fn(() => 'gemini'), isProviderConfigured: vi.fn(() => true) }));
import { isVibeAvailable, getVibeProviderName, generateVibeStyles, generateVibeCSS, saveVibeStyles, loadVibeStyles, clearVibeStyles, getEmptyStyles, saveVibeChatHistory, loadVibeChatHistory, clearVibeChatHistory, VIBE_PRESETS, VibeStyles, VibeChatMessage } from '../vibe';
import { chatWithAI, getCurrentProvider, isProviderConfigured } from '../aiProvider';

function makeStorage(init: Record<string, string> = {}) {
  const s: Record<string, string> = { ...init };
  return { getItem: vi.fn((k: string) => s[k] ?? null), setItem: vi.fn((k: string, v: string) => { s[k] = v; }), removeItem: vi.fn((k: string) => { delete s[k]; }), clear: vi.fn(), length: 0, key: vi.fn() };
}

describe('vibe service', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); vi.stubGlobal('localStorage', storage); vi.clearAllMocks(); });

  it('isVibeAvailable true when configured', () => { expect(isVibeAvailable()).toBe(true); });
  it('isVibeAvailable false when not', () => { vi.mocked(isProviderConfigured).mockReturnValue(false); expect(isVibeAvailable()).toBe(false); });
  it('getVibeProviderName gemini', () => { vi.mocked(getCurrentProvider).mockReturnValue('gemini'); expect(getVibeProviderName()).toBe('Gemini'); });
  it('getVibeProviderName claude', () => { vi.mocked(getCurrentProvider).mockReturnValue('claude'); expect(getVibeProviderName()).toBe('Claude'); });
  it('has presets', () => { expect(VIBE_PRESETS.length).toBeGreaterThan(0); });
  it('getEmptyStyles', () => { expect(getEmptyStyles()).toEqual({ bible_panel: '', chat_panel: '', header: '', verse_text: '', background: '' }); });
  it('getEmptyStyles returns new object', () => { expect(getEmptyStyles()).not.toBe(getEmptyStyles()); });

  it('saveVibeStyles', () => { const s: VibeStyles = { background: 'bg-amber-50', bible_panel: 'w', chat_panel: 's', header: 'h', verse_text: 'v' }; saveVibeStyles(s); expect(storage.setItem).toHaveBeenCalledWith('bible_vibe_styles', JSON.stringify(s)); });
  it('loadVibeStyles empty', () => { expect(loadVibeStyles()).toEqual(getEmptyStyles()); });
  it('loadVibeStyles corrupted', () => { storage = makeStorage({ bible_vibe_styles: 'bad' }); vi.stubGlobal('localStorage', storage); expect(loadVibeStyles()).toEqual(getEmptyStyles()); });
  it('clearVibeStyles', () => { clearVibeStyles(); expect(storage.removeItem).toHaveBeenCalledWith('bible_vibe_styles'); });

  it('generateVibeStyles parses JSON', async () => { vi.mocked(chatWithAI).mockResolvedValue('{"background":"bg-amber-50","bible_panel":"w","chat_panel":"","header":"","verse_text":"font-serif"}'); const r = await generateVibeStyles('glow'); expect(r.background).toBe('bg-amber-50'); });
  it('generateVibeStyles code block', async () => { vi.mocked(chatWithAI).mockResolvedValue('```json\n{"background":"bg-blue","bible_panel":"","chat_panel":"","header":"","verse_text":""}\n```'); expect((await generateVibeStyles('b')).background).toBe('bg-blue'); });
  it('generateVibeStyles throws', async () => { vi.mocked(chatWithAI).mockResolvedValue('nope'); await expect(generateVibeStyles('x')).rejects.toThrow(); });

  it('generateVibeCSS returns css+explanation', async () => { vi.mocked(chatWithAI).mockResolvedValue('EXPLANATION: Bigger font\nCSS:\n.vibe-app-root .verse-text { font-size: 20px; }'); const r = await generateVibeCSS('bigger'); expect(r.css).toContain('.vibe-app-root'); expect(r.explanation).toContain('font'); });
  it('generateVibeCSS code blocks', async () => { vi.mocked(chatWithAI).mockResolvedValue('EXPLANATION: Dark\nCSS:\n```css\n.root { bg: #000; }\n```'); expect((await generateVibeCSS('dark')).css).toContain('bg'); });
  it('generateVibeCSS passes history', async () => { vi.mocked(chatWithAI).mockResolvedValue('EXPLANATION: t\nCSS:\n.f{}'); await generateVibeCSS('purple', [{ role: 'user', content: 'dark', timestamp: '' }], '.r{}'); expect(chatWithAI).toHaveBeenCalledWith(expect.stringContaining('purple'), expect.arrayContaining([expect.objectContaining({ content: 'dark' })]), { fast: true }); });

  it('saveVibeChatHistory', () => { const m: VibeChatMessage[] = [{ role: 'user', content: 'hi', timestamp: '' }]; saveVibeChatHistory(m); expect(storage.setItem).toHaveBeenCalledWith('bible_vibe_chat_history', JSON.stringify(m)); });
  it('loadVibeChatHistory empty', () => { expect(loadVibeChatHistory()).toEqual([]); });
  it('clearVibeChatHistory', () => { clearVibeChatHistory(); expect(storage.removeItem).toHaveBeenCalledWith('bible_vibe_chat_history'); });
  it('trims to 50', () => { const m = Array.from({ length: 60 }, (_, i) => ({ role: 'user' as const, content: `m${i}`, timestamp: '' })); saveVibeChatHistory(m); const s = JSON.parse((storage.setItem as any).mock.calls[0][1]); expect(s.length).toBe(50); expect(s[0].content).toBe('m10'); });
});
