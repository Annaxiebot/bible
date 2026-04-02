/**
 * Tavily Search Integration
 * Using Tavily's Search API for web search with AI-generated answers.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const TAVILY_API_BASE = 'https://api.tavily.com';

/**
 * Get Tavily API key from localStorage
 */
const getApiKey = (): string => {
  const key = localStorage.getItem(STORAGE_KEYS.TAVILY_API_KEY);
  if (!key) {
    throw new Error('Tavily API key not configured. Add it in Settings.');
  }
  return key;
};

/**
 * Format citations as markdown references
 */
const formatCitations = (text: string, citations: string[]): string => {
  if (!citations || citations.length === 0) return text;

  let citationSection = '\n\n---\n**Sources / 参考来源:**\n';
  citations.forEach((url, i) => {
    let domain = url;
    try {
      domain = new URL(url).hostname.replace('www.', '');
    } catch { /* keep original */ }
    citationSection += `${i + 1}. [${domain}](${url})\n`;
  });

  return text + citationSection;
};

/**
 * Search with Tavily
 */
export const searchWithTavily = async (
  query: string,
  _options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; citations: string[] }> => {
  const apiKey = getApiKey();

  const response = await fetch(`${TAVILY_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Tavily API error: ${response.status}`
    );
  }

  const data = await response.json();
  const answer = data.answer || '';
  const results = data.results || [];
  const citations = results.map((r: { url: string }) => r.url).filter(Boolean);

  // Build context from results for AI synthesis
  const resultContext = results
    .map((r: { title: string; content: string; url: string }, i: number) =>
      `[${i + 1}] ${r.title}\n${r.content}\nSource: ${r.url}`)
    .join('\n\n');

  const text = answer
    ? formatCitations(answer, citations)
    : formatCitations(resultContext || 'No results found.', citations);

  return { text, citations };
};

/**
 * Get raw search results for AI synthesis
 */
export const getRawResults = async (
  query: string,
): Promise<{ results: Array<{ title: string; content: string; url: string }>; answer?: string }> => {
  const apiKey = getApiKey();

  const response = await fetch(`${TAVILY_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Tavily API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      content: r.content || '',
      url: r.url || '',
    })),
    answer: data.answer,
  };
};
