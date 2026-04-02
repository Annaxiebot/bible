/**
 * Firecrawl Search Integration
 * Using Firecrawl's Search API for web content extraction and search.
 */

import { STORAGE_KEYS } from '../constants/storageKeys';

const FIRECRAWL_API_BASE = 'https://api.firecrawl.dev/v1';

/**
 * Get Firecrawl API key from localStorage
 */
const getApiKey = (): string => {
  const key = localStorage.getItem(STORAGE_KEYS.FIRECRAWL_API_KEY);
  if (!key) {
    throw new Error('Firecrawl API key not configured. Add it in Settings.');
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
 * Search with Firecrawl
 */
export const searchWithFirecrawl = async (
  query: string,
  _options: { thinking?: boolean; fast?: boolean } = {}
): Promise<{ text: string; citations: string[] }> => {
  const apiKey = getApiKey();

  const response = await fetch(`${FIRECRAWL_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: 5,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Firecrawl API error: ${response.status}`
    );
  }

  const data = await response.json();
  const results = data.data || [];
  const citations = results.map((r: { url: string }) => r.url).filter(Boolean);

  // Build summary from results
  const summary = results
    .map((r: { title: string; description: string; markdown: string; url: string }, i: number) => {
      const content = r.markdown || r.description || '';
      // Truncate long markdown to keep it manageable
      const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
      return `**${i + 1}. ${r.title || 'Untitled'}**\n${truncated}`;
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

  const response = await fetch(`${FIRECRAWL_API_BASE}/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      limit: 5,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData?.error || errorData?.message || `Firecrawl API error: ${response.status}`
    );
  }

  const data = await response.json();
  return {
    results: (data.data || []).map((r: any) => ({
      title: r.title || '',
      content: r.markdown || r.description || '',
      url: r.url || '',
    })),
  };
};
