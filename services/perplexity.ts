/**
 * Perplexity AI Integration
 * Using Perplexity's OpenAI-compatible Chat Completions API with web search grounding.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

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

  // Build messages
  const messages: { role: string; content: string }[] = [
    {
      role: 'system',
      content: `You are a world-class Bible Scholar and Researcher with access to web search.

CORE DIRECTIVE: Be extremely concise. Provide a brief overview or summary of the answer only.
Avoid long paragraphs unless specifically asked for a deep dive.

CRITICAL RULE: You must ALWAYS respond in two distinct sections: first Chinese, then English.
You MUST separate these sections with the exact string "[SPLIT]" on its own line.

RESPONSE STRUCTURE:
[Brief Chinese summary and key points]
如果您需要更深入的解析或特定细节，请告知。
[SPLIT]
[Brief English summary and key points]
Please let me know if you would like more in-depth details or a specific deep dive.

Cite relevant sources. Maintain professional scholarship even in brevity.`
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
