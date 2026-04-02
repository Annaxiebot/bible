/**
 * Brave Search Integration
 * Using Brave's Web Search API for privacy-focused web search.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const BRAVE_API_BASE = 'https://api.search.brave.com/res/v1/web/search';

/**
 * Get Brave API key from localStorage
 */
const getApiKey = (): string => {
  const key = localStorage.getItem(STORAGE_KEYS.BRAVE_API_KEY);
  if (!key) {
    throw new Error('Brave Search API key not configured. Add it in Settings.');
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
 * Search with Brave
 */
export const searchWithBrave = async (
  query: string,
  _options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; citations: string[] }> => {
  const apiKey = getApiKey();

  const params = new URLSearchParams({ q: query, count: '5' });
  const response = await fetch(`${BRAVE_API_BASE}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Brave Search API error: ${response.status}`
    );
  }

  const data = await response.json();
  const results = data.web?.results || [];
  const citations = results.map((r: { url: string }) => r.url).filter(Boolean);

  // Build summary from results
  const summary = results
    .map((r: { title: string; description: string; url: string }, i: number) => {
      return `**${i + 1}. ${r.title || 'Untitled'}**\n${r.description || ''}`;
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

  const params = new URLSearchParams({ q: query, count: '5' });
  const response = await fetch(`${BRAVE_API_BASE}?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Brave Search API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    results: (data.web?.results || []).map((r: any) => ({
      title: r.title || '',
      content: r.description || '',
      url: r.url || '',
    })),
  };
};
