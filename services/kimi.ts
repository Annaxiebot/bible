/**
 * Kimi Moonshot AI Integration
 * Using Moonshot AI's OpenAI-compatible API
 */
import { withRetry } from '../utils/retryUtils';
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from './systemPrompts';

interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface KimiChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const KIMI_API_BASE = 'https://api.moonshot.cn/v1';
const KIMI_MODEL = 'moonshot-v1-128k';
const KIMI_TEMPERATURE = 0.3;
const KIMI_MAX_TOKENS_THINKING = 4096;
const KIMI_MAX_TOKENS_NORMAL = 2048;

const getApiKey = (): string => {
  const key = import.meta.env.VITE_KIMI_API_KEY
    || localStorage.getItem('kimi_api_key')
    || process.env.KIMI_API_KEY;
  if (!key) throw new Error('Kimi API key not configured');
  return key;
};

function buildMessages(
  prompt: string,
  history: { role: string; content: string }[],
  options: { search?: boolean; image?: { data: string; mimeType: string } }
): KimiMessage[] {
  const systemContent = options.search
    ? `${BIBLE_SCHOLAR_SYSTEM_PROMPT}\n\nIf appropriate, provide references to external sources.`
    : BIBLE_SCHOLAR_SYSTEM_PROMPT;

  const messages: KimiMessage[] = [{ role: 'system', content: systemContent }];

  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    });
  }

  // Kimi does not support image inputs; image is intentionally ignored here
  messages.push({ role: 'user', content: prompt });
  return messages;
}

async function callKimiAPI(
  apiKey: string,
  messages: KimiMessage[],
  maxTokens: number
): Promise<KimiChatResponse> {
  const response = await fetch(`${KIMI_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: KIMI_MODEL,
      messages,
      temperature: KIMI_TEMPERATURE,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const err = new Error(`Kimi API error: ${response.status} - ${errorText}`) as Error & { status: number };
    err.status = response.status;
    throw err;
  }

  return response.json() as Promise<KimiChatResponse>;
}

/**
 * Text chat with Kimi Moonshot AI.
 * Note: image inputs are not supported by the Kimi API and will be silently ignored.
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
) => {
  const apiKey = getApiKey();
  const messages = buildMessages(prompt, history, options);
  const maxTokens = options.thinking ? KIMI_MAX_TOKENS_THINKING : KIMI_MAX_TOKENS_NORMAL;

  const data = await withRetry(() => callKimiAPI(apiKey, messages, maxTokens));
  const text = data.choices[0]?.message?.content ?? '';

  return {
    text,
    candidates: [{ content: { parts: [{ text }] } }],
  };
};
