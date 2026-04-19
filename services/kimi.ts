/**
 * Kimi Moonshot AI Integration
 * Using Moonshot AI's OpenAI-compatible API
 */
import { withRetry } from '../utils/retryUtils';
import { AI_LANGUAGE_DIRECTIVE } from './aiLanguageDirective';

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

const BIBLE_SCHOLAR_SYSTEM_PROMPT = `You are a world-class Bible Scholar and Researcher.

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

BILINGUAL KEYWORDS: In the Chinese section, append the English equivalent in parentheses after key theological terms, proper nouns, and important concepts on first mention — e.g. 圣灵 (Holy Spirit), 圣约 (Covenant), 以弗所书 (Ephesians). This helps the reader anchor Chinese terms to their English counterparts.

Maintain professional scholarship even in brevity.
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.${AI_LANGUAGE_DIRECTIVE}`;

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
