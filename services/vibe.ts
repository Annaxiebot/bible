/**
 * Vibe Coding Service
 *
 * Uses Gemini AI to generate Tailwind CSS classes for app theming
 * based on natural language vibe descriptions.
 */

export interface VibeStyles {
  bible_panel: string;
  chat_panel: string;
  header: string;
  verse_text: string;
  background: string;
}

const EMPTY_STYLES: VibeStyles = {
  bible_panel: '',
  chat_panel: '',
  header: '',
  verse_text: '',
  background: '',
};

export const VIBE_PRESETS = [
  'Golden glow with elegant serifs',
  'Minimalist dark mode with neon accents',
  'Warm parchment paper and vintage feel',
  'Calming ocean breeze with soft rounded corners',
  'Futuristic holographic interface',
  'Cozy coffee shop warmth',
];

let geminiApiKey: string | null = null;

export function initializeVibe(apiKey: string) {
  geminiApiKey = apiKey;
}

export function isVibeInitialized(): boolean {
  return !!geminiApiKey;
}

export async function generateVibeStyles(vibePrompt: string): Promise<VibeStyles> {
  if (!geminiApiKey) throw new Error('Gemini API key not configured');

  const systemPrompt = `Based on the vibe: "${vibePrompt}", provide a JSON object of Tailwind CSS utility classes to style a Bible study app.

The app has these sections:
- "background": The overall app container (e.g. "bg-amber-50")
- "bible_panel": The Bible text reading area (e.g. "bg-white text-slate-900")
- "chat_panel": The AI chat panel (e.g. "bg-slate-50")
- "header": The toolbar/header area (e.g. "bg-amber-100 border-b border-amber-200")
- "verse_text": The Bible verse text styling (e.g. "text-slate-800 font-serif")

Output ONLY valid JSON like:
{"background": "bg-amber-50", "bible_panel": "bg-white", "chat_panel": "bg-amber-50/50", "header": "bg-amber-100 border-b border-amber-200", "verse_text": "text-amber-900 font-serif"}

Use only standard Tailwind CSS classes. Keep it tasteful and readable.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;

  // Extract JSON from response (may be wrapped in ```json blocks)
  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                   text.match(/(\{[\s\S]*?\})/);

  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }

  const parsed = JSON.parse(jsonMatch[1]);
  return {
    background: parsed.background || '',
    bible_panel: parsed.bible_panel || '',
    chat_panel: parsed.chat_panel || '',
    header: parsed.header || '',
    verse_text: parsed.verse_text || '',
  };
}

export function saveVibeStyles(styles: VibeStyles): void {
  localStorage.setItem('bible_vibe_styles', JSON.stringify(styles));
}

export function loadVibeStyles(): VibeStyles {
  try {
    const stored = localStorage.getItem('bible_vibe_styles');
    return stored ? JSON.parse(stored) : EMPTY_STYLES;
  } catch {
    return EMPTY_STYLES;
  }
}

export function clearVibeStyles(): void {
  localStorage.removeItem('bible_vibe_styles');
}

export function getEmptyStyles(): VibeStyles {
  return { ...EMPTY_STYLES };
}
