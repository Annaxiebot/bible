/**
 * Exa Search Integration
 * Using Exa's Search API for neural web search with content extraction.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const EXA_API_BASE = 'https://api.exa.ai';

/**
 * Get Exa API key from localStorage
 */
const getApiKey = (): string => {
  const key = localStorage.getItem(STORAGE_KEYS.EXA_API_KEY);
  if (!key) {
    throw new Error('Exa API key not configured. Add it in Settings.');
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
 * Search with Exa
 */
export const searchWithExa = async (
  query: string,
  _options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; citations: string[] }> => {
  const apiKey = getApiKey();

  const response = await fetch(`${EXA_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: 5,
      contents: {
        text: { maxCharacters: 1000 },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Exa API error: ${response.status}`
    );
  }

  const data = await response.json();
  const results = data.results || [];
  const citations = results.map((r: { url: string }) => r.url).filter(Boolean);

  // Build summary from results with attributions
  const summary = results
    .map((r: { title: string; text: string; author: string; url: string }, i: number) => {
      const content = r.text || '';
      const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
      const attribution = r.author ? ` (by ${r.author})` : '';
      return `**${i + 1}. ${r.title || 'Untitled'}${attribution}**\n${truncated}`;
    })
    .join('\n\n');

  const text = formatCitations(summary || 'No results found.', citations);

  return { text, citations };
};

/**
 * Get raw search results for AI synthesis
 */
export const getRawResults = async (
  query: string,
): Promise<{ results: Array<{ title: string; content: string; url: string }> }> => {
  const apiKey = getApiKey();

  const response = await fetch(`${EXA_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({
      query,
      type: 'auto',
      numResults: 5,
      contents: {
        text: { maxCharacters: 1000 },
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Exa API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    results: (data.results || []).map((r: any) => ({
      title: r.title || '',
      content: r.text || '',
      url: r.url || '',
    })),
  };
};
