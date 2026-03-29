/**
 * Tests for ai-chat edge function race mode logic.
 *
 * These tests verify the vision model filtering, diversification algorithm,
 * and image data URL handling that runs inside the edge function.
 */
import { describe, it, expect } from 'vitest';

// ── Inline copies of the constants & logic under test ────────────────────
// (The edge function runs in Deno so we replicate the relevant pieces here.)

const VISION_MODELS = new Set([
  "openrouter/auto",
  "claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6",
  "gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-flash-lite-latest",
  "gpt-4o", "gpt-4o-mini",
  "qwen3.5-max", "qwen3.5-plus",
  "glm-5", "glm-4-plus",
  "nvidia/llama-3.1-nemotron-ultra-253b-v1",
]);

const ALL_MODELS: Record<string, string[]> = {
  openrouter: ["openrouter/auto"],
  claude: ["claude-haiku-4-5", "claude-sonnet-4-6", "claude-opus-4-6"],
  gemini: ["gemini-3-flash-preview", "gemini-3-pro-preview", "gemini-flash-lite-latest"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  nvidia: ["nvidia/llama-3.1-nemotron-ultra-253b-v1", "nvidia/llama-3.3-nemotron-super-49b-v1", "meta/llama-3.1-8b-instruct"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
};

// ── Helper: build candidates (mirrors edge function logic) ───────────────

function buildCandidates(
  configuredProviders: Record<string, string>, // providerName → apiKey
  hasImage: boolean,
) {
  const candidates: { name: string; apiKey: string; model: string }[] = [];
  for (const [prov, apiKey] of Object.entries(configuredProviders)) {
    const models = ALL_MODELS[prov] || [];
    for (const m of models) {
      if (hasImage && !VISION_MODELS.has(m)) continue;
      candidates.push({ name: prov, apiKey, model: m });
    }
  }
  return candidates;
}

// ── Helper: diversify (mirrors edge function logic) ──────────────────────

function diversify(
  eligible: { name: string; apiKey: string; model: string }[],
) {
  const diversified: typeof eligible = [];
  const providerPicked = new Map<string, number>();
  const uniqueProviders = new Set(eligible.map(c => c.name)).size;
  const maxPerProvider = uniqueProviders >= 3 ? 2 : 5;

  // Round 1: one per provider
  for (const c of eligible) {
    if (!providerPicked.has(c.name)) {
      diversified.push(c);
      providerPicked.set(c.name, 1);
      if (diversified.length >= 5) break;
    }
  }
  // Round 2+: fill remaining
  if (diversified.length < 5) {
    for (const c of eligible) {
      const count = providerPicked.get(c.name) || 0;
      if (count < maxPerProvider && !diversified.includes(c)) {
        diversified.push(c);
        providerPicked.set(c.name, count + 1);
        if (diversified.length >= 5) break;
      }
    }
  }
  return diversified;
}

// ── Helper: strip data URL prefix (mirrors edge function fix) ────────────

function stripDataUrlPrefix(data: string): string {
  return data.includes(",") ? data.split(",")[1] : data;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Race mode: vision model filtering', () => {
  it('filters out non-vision models when image is attached', () => {
    const candidates = buildCandidates({ nvidia: 'key1' }, true);
    // NVIDIA has 3 models but only nemotron-ultra supports vision
    expect(candidates).toHaveLength(1);
    expect(candidates[0].model).toBe('nvidia/llama-3.1-nemotron-ultra-253b-v1');
  });

  it('keeps all models when no image is attached', () => {
    const candidates = buildCandidates({ nvidia: 'key1' }, false);
    expect(candidates).toHaveLength(3);
  });

  it('keeps all Gemini models for image requests (all support vision)', () => {
    const candidates = buildCandidates({ gemini: 'key1' }, true);
    expect(candidates).toHaveLength(3);
  });

  it('filters all DeepSeek models for image requests (none support vision)', () => {
    const candidates = buildCandidates({ deepseek: 'key1' }, true);
    expect(candidates).toHaveLength(0);
  });

  it('filters all Groq models for image requests (none support vision)', () => {
    const candidates = buildCandidates({ groq: 'key1' }, true);
    expect(candidates).toHaveLength(0);
  });
});

describe('Race mode: diversification', () => {
  it('allows 3+ models from same provider when only 1 provider configured', () => {
    const candidates = buildCandidates({ gemini: 'key1' }, false);
    const result = diversify(candidates);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });

  it('allows 3 Gemini vision models for image race with single provider', () => {
    const candidates = buildCandidates({ gemini: 'key1' }, true);
    const result = diversify(candidates);
    expect(result).toHaveLength(3);
    expect(result.every(c => c.name === 'gemini')).toBe(true);
  });

  it('caps at 2 per provider when 3+ providers available', () => {
    const candidates = buildCandidates(
      { gemini: 'k1', claude: 'k2', openai: 'k3' },
      false,
    );
    const result = diversify(candidates);
    const geminiCount = result.filter(c => c.name === 'gemini').length;
    const claudeCount = result.filter(c => c.name === 'claude').length;
    expect(geminiCount).toBeLessThanOrEqual(2);
    expect(claudeCount).toBeLessThanOrEqual(2);
  });

  it('picks at most 5 total candidates', () => {
    const candidates = buildCandidates(
      { gemini: 'k1', claude: 'k2', openai: 'k3', nvidia: 'k4' },
      false,
    );
    const result = diversify(candidates);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it('returns >= 3 with 2 providers having vision models for image race', () => {
    const candidates = buildCandidates(
      { gemini: 'k1', openai: 'k2' },
      true,
    );
    // Gemini: 3 vision models, OpenAI: 2 vision models → 5 candidates
    const result = diversify(candidates);
    expect(result.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Image data URL handling', () => {
  it('strips data URL prefix from full data URL', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(stripDataUrlPrefix(dataUrl)).toBe('/9j/4AAQSkZJRg==');
  });

  it('returns raw base64 unchanged', () => {
    const raw = '/9j/4AAQSkZJRg==';
    expect(stripDataUrlPrefix(raw)).toBe('/9j/4AAQSkZJRg==');
  });

  it('does not create double prefix when constructing image_url', () => {
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    const rawBase64 = stripDataUrlPrefix(dataUrl);
    const mimeType = 'image/jpeg';
    const result = `data:${mimeType};base64,${rawBase64}`;
    expect(result).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
    // Must NOT contain double prefix
    expect(result).not.toContain('base64,data:');
  });
});
