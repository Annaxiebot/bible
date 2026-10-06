import { describe, it, expect, vi, beforeEach } from 'vitest';
// Vibe goes through the personal app's one AI path (services/studyAI → aiTransport, role 'study').
vi.mock('../studyAI', () => ({ chatStudyAI: vi.fn() }));
vi.mock('../aiTransport', () => ({ isAIAvailable: vi.fn(() => true) }));
import { isVibeAvailable, generateVibeStyles, generateVibeCSS, saveVibeStyles, loadVibeStyles, clearVibeStyles, getEmptyStyles, saveVibeChatHistory, loadVibeChatHistory, clearVibeChatHistory, VIBE_PRESETS, VibeStyles, VibeChatMessage } from '../vibe';
import { chatStudyAI } from '../studyAI';
import { isAIAvailable } from '../aiTransport';
const reply = (text: string) => vi.mocked(chatStudyAI).mockResolvedValue({ text, model: 'google/gemini-2.5-flash' });

function makeStorage(init: Record<string, string> = {}) {
  const s: Record<string, string> = { ...init };
  return { getItem: vi.fn((k: string) => s[k] ?? null), setItem: vi.fn((k: string, v: string) => { s[k] = v; }), removeItem: vi.fn((k: string) => { delete s[k]; }), clear: vi.fn(), length: 0, key: vi.fn() };
}

describe('vibe service', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); vi.stubGlobal('localStorage', storage); vi.clearAllMocks(); });

  it('isVibeAvailable true with an own key or a signed-in user', () => { vi.mocked(isAIAvailable).mockReturnValue(true); expect(isVibeAvailable()).toBe(true); });
  it('isVibeAvailable false when neither (sign-in needed)', () => { vi.mocked(isAIAvailable).mockReturnValue(false); expect(isVibeAvailable()).toBe(false); });
  it('has presets', () => { expect(VIBE_PRESETS.length).toBeGreaterThan(0); });
  it('getEmptyStyles', () => { expect(getEmptyStyles()).toEqual({ bible_panel: '', chat_panel: '', header: '', verse_text: '', background: '' }); });
  it('getEmptyStyles returns new object', () => { expect(getEmptyStyles()).not.toBe(getEmptyStyles()); });

  it('saveVibeStyles', () => { const s: VibeStyles = { background: 'bg-amber-50', bible_panel: 'w', chat_panel: 's', header: 'h', verse_text: 'v' }; saveVibeStyles(s); expect(storage.setItem).toHaveBeenCalledWith('bible_vibe_styles', JSON.stringify(s)); });
  it('loadVibeStyles empty', () => { expect(loadVibeStyles()).toEqual(getEmptyStyles()); });
  it('loadVibeStyles corrupted', () => { storage = makeStorage({ bible_vibe_styles: 'bad' }); vi.stubGlobal('localStorage', storage); expect(loadVibeStyles()).toEqual(getEmptyStyles()); });
  it('clearVibeStyles', () => { clearVibeStyles(); expect(storage.removeItem).toHaveBeenCalledWith('bible_vibe_styles'); });

  it('generateVibeStyles parses JSON', async () => { reply('{"background":"bg-amber-50","bible_panel":"w","chat_panel":"","header":"","verse_text":"font-serif"}'); const r = await generateVibeStyles('glow'); expect(r.background).toBe('bg-amber-50'); });
  it('generateVibeStyles code block', async () => { reply('```json\n{"background":"bg-blue","bible_panel":"","chat_panel":"","header":"","verse_text":""}\n```'); expect((await generateVibeStyles('b')).background).toBe('bg-blue'); });
  it('generateVibeStyles throws', async () => { reply('nope'); await expect(generateVibeStyles('x')).rejects.toThrow(); });

  it('generateVibeCSS returns css+explanation', async () => { reply('EXPLANATION: Bigger font\nCSS:\n.vibe-app-root .verse-text { font-size: 20px; }'); const r = await generateVibeCSS('bigger'); expect(r.css).toContain('.vibe-app-root'); expect(r.explanation).toContain('font'); });
  it('generateVibeCSS code blocks', async () => { reply('EXPLANATION: Dark\nCSS:\n```css\n.root { bg: #000; }\n```'); expect((await generateVibeCSS('dark')).css).toContain('bg'); });
  it('generateVibeCSS passes history', async () => { reply('EXPLANATION: t\nCSS:\n.f{}'); await generateVibeCSS('purple', [{ role: 'user', content: 'dark', timestamp: '' }], '.r{}'); expect(chatStudyAI).toHaveBeenCalledWith(expect.stringContaining('purple'), expect.arrayContaining([expect.objectContaining({ content: 'dark' })])); });

  it('saveVibeChatHistory', () => { const m: VibeChatMessage[] = [{ role: 'user', content: 'hi', timestamp: '' }]; saveVibeChatHistory(m); expect(storage.setItem).toHaveBeenCalledWith('bible_vibe_chat_history', JSON.stringify(m)); });
  it('loadVibeChatHistory empty', () => { expect(loadVibeChatHistory()).toEqual([]); });
  it('clearVibeChatHistory', () => { clearVibeChatHistory(); expect(storage.removeItem).toHaveBeenCalledWith('bible_vibe_chat_history'); });
  it('trims to 50', () => { const m = Array.from({ length: 60 }, (_, i) => ({ role: 'user' as const, content: `m${i}`, timestamp: '' })); saveVibeChatHistory(m); const s = JSON.parse((storage.setItem as any).mock.calls[0][1]); expect(s.length).toBe(50); expect(s[0].content).toBe('m10'); });
});
