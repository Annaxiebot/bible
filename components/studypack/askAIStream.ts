/**
 * askAIStream.ts — SSE streaming transport for the Ask-AI overlay · 流式回答
 *
 * Hits the same OpenRouter chat/completions endpoint as services/openrouter.ts
 * (key and URL reused from there) with { stream: true }. Chunks arrive as
 * "data: {json}" lines carrying choices[0].delta.content, ending "data: [DONE]".
 */
import { BIBLE_SCHOLAR_SYSTEM_PROMPT } from '../../services/systemPrompts';
import { StudyPack, Slide } from './packTypes';
import {
  AI_NOT_CONFIGURED_MESSAGE,
  AskAIMessage,
  ASK_AI_MODEL,
  ASK_AI_MAX_TOKENS,
  buildAskAIPrompt,
  stripSplitMarker,
} from './askAI';
import { getApiKey, OPENROUTER_API_URL } from '../../services/openrouter';

interface SSEDeltaEvent {
  choices?: Array<{ delta?: { content?: string } }>;
}

/**
 * Stateful SSE line parser. Feed it raw text chunks in arrival order; it
 * buffers partial lines (a "data: …" line may be split across network
 * chunks), emits each delta's content, and ignores "[DONE]".
 */
export function createSSEParser(onDelta: (text: string) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const rawLine of lines) {
      const line = rawLine.replace(/\r$/, '');
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') continue;
      try {
        const event = JSON.parse(payload) as SSEDeltaEvent;
        const content = event.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        // Silent skip is correct here: SSE streams interleave comments and
        // keep-alive fragments that are not JSON; real transport failures
        // surface via the HTTP status / reader errors, not via these lines.
      }
    }
  };
}

function buildRequestBody(
  pack: StudyPack,
  slide: Slide,
  history: AskAIMessage[],
  question: string
): string {
  return JSON.stringify({
    model: ASK_AI_MODEL,
    stream: true,
    max_tokens: ASK_AI_MAX_TOKENS,
    temperature: 0.7,
    messages: [
      { role: 'system', content: BIBLE_SCHOLAR_SYSTEM_PROMPT },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: buildAskAIPrompt(pack, slide, question) },
    ],
  });
}

/**
 * Ask one question with a streamed answer. `onText` receives the accumulated,
 * [SPLIT]-stripped answer after every delta; the resolved value is the final
 * text. Aborting via `signal` resolves cleanly with whatever has arrived.
 * HTTP and mid-stream errors throw (the overlay surfaces them).
 */
export async function streamStudyAI(
  pack: StudyPack,
  slide: Slide,
  history: AskAIMessage[],
  question: string,
  onText: (accumulated: string) => void,
  signal: AbortSignal
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  }
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Scripture Scholar TV',
    },
    body: buildRequestBody(pack, slide, history, question),
  });
  if (!response.ok) {
    const data: { error?: { message?: string } } = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `OpenRouter API error: ${response.status}`);
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('OpenRouter returned no response body');

  let raw = '';
  const feed = createSSEParser(delta => {
    raw += delta;
    onText(stripSplitMarker(raw));
  });
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      feed(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    // A user-initiated abort (Escape / close) is a clean cancel, not a failure.
    if ((err as Error).name === 'AbortError') return stripSplitMarker(raw);
    throw err;
  }
  return stripSplitMarker(raw);
}
