import Anthropic from '@anthropic-ai/sdk';
import { STORAGE_KEYS } from '../constants/storageKeys';
import { extractBase64Data } from '../utils/mediaUtils';
import { withRetry } from '../utils/retryUtils';

const CLAUDE_MODEL_THINKING = 'claude-sonnet-4-5';
const CLAUDE_MODEL_FAST = 'claude-haiku-4-5-20251001';
const CLAUDE_MAX_TOKENS_THINKING = 8192;
const CLAUDE_MAX_TOKENS_NORMAL = 4096;

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

    Maintain professional scholarship even in brevity.
    Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.`;

const getClient = () => {
  const apiKey = localStorage.getItem(STORAGE_KEYS.CLAUDE_API_KEY);
  if (!apiKey) {
    throw new Error('Claude API key not found. Please configure your API key in settings.');
  }
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
};

type ClaudeContent = string | Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam>;

function buildMessages(
  prompt: string,
  history: { role: string; content: string }[],
  image?: { data: string; mimeType: string }
): Array<{ role: 'user' | 'assistant'; content: ClaudeContent }> {
  const messages = history
    .filter(h => h.content?.trim())
    .map(h => ({
      role: (h.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: h.content,
    }));

  if (image) {
    const base64Data = extractBase64Data(image.data);
    messages.push({
      role: 'user' as const,
      content: [
        { type: 'image' as const, source: { type: 'base64' as const, media_type: image.mimeType, data: base64Data } },
        { type: 'text' as const, text: prompt || 'What do you see in this image?' },
      ] as Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam>,
    });
  } else {
    messages.push({ role: 'user' as const, content: prompt });
  }

  return messages;
}

/**
 * Text (and optional image) chat with Claude.
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
) => {
  const client = getClient();
  const model = options.thinking ? CLAUDE_MODEL_THINKING : CLAUDE_MODEL_FAST;
  const maxTokens = options.thinking ? CLAUDE_MAX_TOKENS_THINKING : CLAUDE_MAX_TOKENS_NORMAL;
  const messages = buildMessages(prompt, history, options.image);

  const response = await withRetry(() =>
    client.messages.create({ model, max_tokens: maxTokens, system: BIBLE_SCHOLAR_SYSTEM_PROMPT, messages })
  );

  const textContent = response.content
    .filter(block => block.type === 'text')
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('\n');

  return {
    text: textContent,
    candidates: [{
      content: { parts: [{ text: textContent }] },
      groundingMetadata: undefined,
    }],
  };
};
