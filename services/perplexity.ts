/**
 * Perplexity AI Integration
 * Using Perplexity's OpenAI-compatible Chat Completions API with web search grounding.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from './systemPrompts';

const PERPLEXITY_API_BASE = 'https://api.perplexity.ai';
const DEFAULT_MODEL = 'sonar'; // Fast web-grounded model
const THOROUGH_MODEL = 'sonar-pro'; // More thorough web-grounded model

interface PerplexityChatResponse {
  id: string;
  model: string;
  object: string;
  created: number;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  citations?: string[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Get Perplexity API key from localStorage
 */
const getApiKey = (): string => {
  const key = localStorage.getItem(STORAGE_KEYS.PERPLEXITY_API_KEY);
  if (!key) {
    throw new Error('Perplexity API key not configured. Add it in Settings.');
  }
  return key;
};

/**
 * Format citations as markdown references appended to the response text
 */
const formatCitations = (text: string, citations: string[]): string => {
  if (!citations || citations.length === 0) return text;

  let citationSection = '\n\n---\n**Sources / 参考来源:**\n';
  citations.forEach((url, i) => {
    // Extract domain for display
    let domain = url;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch { /* keep original */ }
    citationSection += `${i + 1}. [${domain}](${url})\n`;
  });

  return text + citationSection;
};

/**
 * Chat with Perplexity AI (web-grounded responses)
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string }; model?: string } = {}
): Promise<{ text: string; citations?: string[] }> => {
  const apiKey = getApiKey();

  // Use provided model or pick based on options
  const model = options.model || (options.thinking ? THOROUGH_MODEL : DEFAULT_MODEL);

  // Build messages — Perplexity is web-grounded, so remind the model to cite.
  const messages: { role: string; content: string }[] = [
    {
      role: 'system',
      content: `${BIBLE_SCHOLAR_SYSTEM_PROMPT}

You have access to web search. Cite relevant sources inline.`,
    },
    ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: prompt },
  ];

  const response = await fetch(`${PERPLEXITY_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      max_tokens: options.thinking ? 4096 : 2048,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error?.message || `Perplexity API error: ${response.status}`
    );
  }

  const data: PerplexityChatResponse = await response.json();
  const text = data.choices?.[0]?.message?.content || '';
  const citations = data.citations || [];

  return {
    text: formatCitations(text, citations),
    citations,
  };
};
