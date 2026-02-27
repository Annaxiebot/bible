/**
 * Kimi Moonshot AI Integration
 * Using Moonshot AI's OpenAI-compatible API
 */

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

const KIMI_API_BASE = 'https://api.moonshot.cn/v1';
const KIMI_MODEL = 'moonshot-v1-128k'; // 128K context window

/**
 * Get Kimi API key from environment or localStorage
 */
const getApiKey = (): string => {
  const key = import.meta.env.VITE_KIMI_API_KEY 
    || localStorage.getItem('kimi_api_key') 
    || process.env.KIMI_API_KEY;
  
  if (!key) {
    throw new Error('Kimi API key not configured');
  }
  return key;
};

/**
 * Text Chat with Kimi Moonshot AI
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean; image?: { data: string; mimeType: string } } = {}
) => {
  const apiKey = getApiKey();

  // Build messages array
  const messages: KimiMessage[] = [];
  
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

  // Add current prompt
  // Note: Kimi Moonshot doesn't support image inputs via API yet
  if (options.image) {
    console.warn('Kimi Moonshot API does not support image inputs yet');
  }
  messages.push({
    role: 'user',
    content: prompt
  });

  // Note: Kimi doesn't have native search or thinking mode like Gemini
  // But we can enhance the prompt if search is requested
  if (options.search) {
    messages[0].content += '\n\nIf appropriate, provide references to external sources.';
  }

  // Make API request with retry logic
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${KIMI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: KIMI_MODEL,
          messages,
          temperature: 0.3,
          max_tokens: options.thinking ? 4096 : 2048
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        if (response.status === 429) {
          throw { status: 429, message: errorText };
        }
        throw new Error(`Kimi API error: ${response.status} - ${errorText}`);
      }

      const data: KimiChatResponse = await response.json();
      
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
