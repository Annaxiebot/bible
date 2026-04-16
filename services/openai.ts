/**
 * OpenAI ChatGPT Integration
 * Using OpenAI's Chat Completions API
 */

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const OPENAI_API_BASE = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o'; // GPT-4o with vision support
const FAST_MODEL = 'gpt-4o-mini'; // Faster, cheaper model

/**
 * Get OpenAI API key from environment or localStorage
 */
const getApiKey = (): string => {
  const key = import.meta.env.VITE_OPENAI_API_KEY
    || localStorage.getItem('openai_api_key')
    || process.env.OPENAI_API_KEY;

  if (!key) {
    throw new Error('OpenAI API key not configured');
  }
  return key;
};

/**
 * Text Chat with OpenAI ChatGPT
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
) => {
  const apiKey = getApiKey();

  // Select model based on options
  const model = options.fast ? FAST_MODEL : DEFAULT_MODEL;

  // Build messages array
  const messages: OpenAIMessage[] = [];

  // System instruction
  messages.push({
    role: 'system',
    content: `You are a world-class Bible Scholar and Researcher.

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
Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\\text{Elohim}$.`
  });

  // Add conversation history
  for (const msg of history) {
    messages.push({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    });
  }

  // Add current prompt with optional image
  if (options.image) {
    // GPT-4o supports vision
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: options.image.data } }
      ]
    });
  } else {
    messages.push({
      role: 'user',
      content: prompt
    });
  }

  // Note: OpenAI doesn't have native web search like Gemini
  // But we can add a note to the system message if search is requested
  if (options.search) {
    messages[0].content += '\n\nIf appropriate, cite relevant sources and provide references.';
  }

  // Make API request with retry logic
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${OPENAI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: options.thinking ? 4096 : 2048
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw { status: 429, message: errorText };
        }
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data: OpenAIChatResponse = await response.json();

      // Convert to format compatible with Gemini response
      return {
        text: data.choices[0]?.message?.content || '',
        candidates: [{
          content: {
            parts: [{ text: data.choices[0]?.message?.content || '' }]
          }
        }]
      };
    } catch (error: any) {
      lastError = error;
      if (error?.status === 429 || error?.message?.includes('429')) {
        // Rate limited - exponential backoff
        const baseWaitTime = attempt === 0 ? 2000 : attempt === 1 ? 5000 : 10000;
        await new Promise(resolve => setTimeout(resolve, baseWaitTime));
      } else {
        // Non-rate limit error, throw immediately
        throw error;
      }
    }
  }
  throw lastError;
};
