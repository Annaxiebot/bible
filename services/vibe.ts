let geminiApiKey: string | null = null;
let claudeApiKey: string | null = null;
let provider: 'gemini' | 'claude' = 'gemini';

export function initializeVibeCoding(apiKey: string, aiProvider: 'gemini' | 'claude' = 'gemini') {
  provider = aiProvider;
  if (aiProvider === 'gemini') {
    geminiApiKey = apiKey;
  } else {
    claudeApiKey = apiKey;
  }
}

export function isVibeInitialized(): boolean {
  return (provider === 'gemini' && !!geminiApiKey) || (provider === 'claude' && !!claudeApiKey);
}

export function getCurrentProvider(): 'gemini' | 'claude' {
  return provider;
}

interface VibeChange {
  type: 'css' | 'behavior' | 'feature';
  description: string;
  code: string;
}

async function processWithGemini(prompt: string): Promise<VibeChange[]> {
  if (!geminiApiKey) throw new Error('Gemini not initialized');

  const systemPrompt = `You are a helpful assistant that helps users customize their Bible study app through natural language.

The user can request changes like:
- Visual changes (colors, fonts, layout)
- Behavioral changes (keyboard shortcuts, gestures)
- Feature additions (new tools, customizations)

When the user makes a request, respond with JSON containing an array of changes:

[
  {
    "type": "css",
    "description": "Change background to dark blue",
    "code": "body { background-color: #1e3a8a; }"
  },
  {
    "type": "behavior",
    "description": "Enable keyboard shortcuts",
    "code": "document.addEventListener('keydown', (e) => { if(e.key === 'b') console.log('bookmark'); })"
  }
]

Only respond with valid JSON. Keep changes minimal and safe.

User request: ${prompt}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: systemPrompt }] }]
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.candidates[0].content.parts[0].text;
  
  const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || 
                   text.match(/(\[[\s\S]*?\])/);
  
  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }
  
  return JSON.parse(jsonMatch[1]);
}

async function processWithClaude(prompt: string): Promise<VibeChange[]> {
  if (!claudeApiKey) throw new Error('Claude not initialized');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: `You are a helpful assistant that helps users customize their Bible study app through natural language.

The user can request changes like:
- Visual changes (colors, fonts, layout)
- Behavioral changes (keyboard shortcuts, gestures)
- Feature additions (new tools, customizations)

When the user makes a request, respond with JSON containing an array of changes:

[
  {
    "type": "css",
    "description": "Change background to dark blue",
    "code": "body { background-color: #1e3a8a; }"
  },
  {
    "type": "behavior",
    "description": "Enable keyboard shortcuts",
    "code": "document.addEventListener('keydown', (e) => { if(e.key === 'b') console.log('bookmark'); })"
  }
]

Only respond with valid JSON. Keep changes minimal and safe.

User request: ${prompt}`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.content[0].text;
  
  const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/) || 
                   text.match(/(\[[\s\S]*?\])/);
  
  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }
  
  return JSON.parse(jsonMatch[1]);
}

export async function processVibePrompt(prompt: string): Promise<VibeChange[]> {
  try {
    if (provider === 'gemini') {
      return await processWithGemini(prompt);
    } else {
      return await processWithClaude(prompt);
    }
  } catch (error) {
    console.error('Vibe-coding error:', error);
    throw new Error('Failed to process customization request');
  }
}

export function applyVibeChanges(changes: VibeChange[]): void {
  changes.forEach(change => {
    if (change.type === 'css') {
      applyCSSChange(change.code);
    } else if (change.type === 'behavior') {
      applyBehaviorChange(change.code);
    }
  });
}

function applyCSSChange(css: string): void {
  const styleId = 'vibe-custom-styles';
  let styleEl = document.getElementById(styleId) as HTMLStyleElement;
  
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  
  styleEl.textContent += '\n' + css;
}

function applyBehaviorChange(code: string): void {
  try {
    const script = document.createElement('script');
    script.textContent = `(function() { try { ${code} } catch(e) { console.error('Vibe code error:', e); } })();`;
    document.body.appendChild(script);
  } catch (error) {
    console.error('Failed to apply behavior change:', error);
  }
}

export function saveVibeCustomizations(changes: VibeChange[]): void {
  const existing = loadVibeCustomizations();
  const updated = [...existing, ...changes];
  localStorage.setItem('bible_vibe_customizations', JSON.stringify(updated));
}

export function loadVibeCustomizations(): VibeChange[] {
  try {
    const stored = localStorage.getItem('bible_vibe_customizations');
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function clearVibeCustomizations(): void {
  localStorage.removeItem('bible_vibe_customizations');
  
  const styleEl = document.getElementById('vibe-custom-styles');
  if (styleEl) {
    styleEl.remove();
  }
}

export function applySavedCustomizations(): void {
  const saved = loadVibeCustomizations();
  if (saved.length > 0) {
    applyVibeChanges(saved);
  }
}
