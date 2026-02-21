import Anthropic from '@anthropic-ai/sdk';

const getClient = () => {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || localStorage.getItem('claude_api_key');
  if (!apiKey) {
    throw new Error('Claude API key not found. Please set VITE_ANTHROPIC_API_KEY or configure in settings.');
  }
  return new Anthropic({ 
    apiKey,
    dangerouslyAllowBrowser: true 
  });
};

/**
 * Text Chat with Claude
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean } = {}
) => {
  const client = getClient();
  
  // Map to Claude model names
  // Use haiku for fast/default, sonnet for thinking mode
  const model = options.thinking
    ? 'claude-sonnet-4-5'
    : options.fast
      ? 'claude-haiku-4-5-20251001'
      : 'claude-haiku-4-5-20251001';
  
  // Convert history to Claude message format
  const messages = history.map(h => ({
    role: h.role === 'user' ? 'user' as const : 'assistant' as const,
    content: h.content
  }));
  
  // Add current prompt
  messages.push({
    role: 'user' as const,
    content: prompt
  });
  
  const systemPrompt = `You are a world-class Bible Scholar and Researcher. 
    
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
  
  // Add retry logic with exponential backoff for rate limiting
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await client.messages.create({
        model,
        max_tokens: options.thinking ? 8192 : 4096,
        system: systemPrompt,
        messages
      });
      
      // Extract text content from response
      const textContent = response.content
        .filter(block => block.type === 'text')
        .map(block => block.type === 'text' ? block.text : '')
        .join('\n');
      
      // Return in a format compatible with Gemini response structure
      return {
        text: textContent,
        candidates: [{
          content: {
            parts: [{ text: textContent }]
          },
          groundingMetadata: undefined // Claude doesn't have native search grounding
        }]
      };
    } catch (error: any) {
      lastError = error;
      if (error?.status === 429 || error?.message?.includes('429')) {
        // Rate limited - wait with exponential backoff
        const baseWaitTime = attempt === 0 ? 2000 : attempt === 1 ? 5000 : 10000;
        console.log(`Rate limited (attempt ${attempt + 1}/3), waiting ${baseWaitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, baseWaitTime));
      } else {
        // Non-rate limit error, throw immediately
        throw error;
      }
    }
  }
  throw lastError;
};
