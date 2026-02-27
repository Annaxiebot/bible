/**
 * Vibe Coding Service
 *
 * Uses the configured AI provider (Gemini or Claude) from AI Research settings
 * to generate Tailwind CSS classes for app theming based on natural language.
 */

import { chatWithAI, getCurrentProvider, isProviderConfigured } from './aiProvider';
import { STORAGE_KEYS } from '../constants/storageKeys';

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

export function isVibeAvailable(): boolean {
  const provider = getCurrentProvider();
  return isProviderConfigured(provider);
}

export function getVibeProviderName(): string {
  const provider = getCurrentProvider();
  return provider === 'claude' ? 'Claude' : 'Gemini';
}

export async function generateVibeStyles(vibePrompt: string): Promise<VibeStyles> {
  const prompt = `Based on the vibe: "${vibePrompt}", provide a JSON object of Tailwind CSS utility classes to style a Bible study app.

The app has these sections:
- "background": The overall app container (e.g. "bg-amber-50")
- "bible_panel": The Bible text reading area (e.g. "bg-white text-slate-900")
- "chat_panel": The AI chat panel (e.g. "bg-slate-50")
- "header": The toolbar/header area (e.g. "bg-amber-100 border-b border-amber-200")
- "verse_text": The Bible verse text styling (e.g. "text-slate-800 font-serif")

Output ONLY valid JSON like:
{"background": "bg-amber-50", "bible_panel": "bg-white", "chat_panel": "bg-amber-50/50", "header": "bg-amber-100 border-b border-amber-200", "verse_text": "text-amber-900 font-serif"}

Use only standard Tailwind CSS classes. Keep it tasteful and readable. Output ONLY the JSON, nothing else.`;

  const result = await chatWithAI(prompt, [], { fast: true });

  // Extract the response text
  const text = typeof result === 'string' ? result : (result as any)?.text || (result as any)?.content || JSON.stringify(result);

  // Extract JSON from response (may be wrapped in ```json blocks or have extra text)
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
  localStorage.setItem(STORAGE_KEYS.VIBE_STYLES, JSON.stringify(styles));
}

export function loadVibeStyles(): VibeStyles {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.VIBE_STYLES);
    return stored ? JSON.parse(stored) : EMPTY_STYLES;
  } catch {
    return EMPTY_STYLES;
  }
}

export function clearVibeStyles(): void {
  localStorage.removeItem(STORAGE_KEYS.VIBE_STYLES);
}

export function getEmptyStyles(): VibeStyles {
  return { ...EMPTY_STYLES };
}
