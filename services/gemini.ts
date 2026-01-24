
import { GoogleGenAI, Modality, Type, GenerateContentResponse, VideoGenerationReferenceImage, VideoGenerationReferenceType } from "@google/genai";

// Audio decoding utilities as per guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Text Chat with Search Grounding & Thinking Mode
 */
export const chatWithAI = async (
  prompt: string,
  history: { role: string; content: string }[],
  options: { thinking?: boolean; fast?: boolean; search?: boolean } = {}
) => {
  const ai = getAI();
  const model = options.thinking ? 'gemini-3-pro-preview' : (options.fast ? 'gemini-flash-lite-latest' : 'gemini-3-flash-preview');
  
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const config: any = {
    systemInstruction: `You are a world-class Bible Scholar and Researcher. 
    
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
    
    If you use Google Search, provide links at the end of EACH language section. 
    Maintain professional scholarship even in brevity.
    Use LaTeX notation for complex theological or linguistic terms if needed, e.g., $\text{Elohim}$.`,
  };

  if (options.search) {
    config.tools = [{ googleSearch: {} }];
  }

  if (options.thinking) {
    config.thinkingConfig = { thinkingBudget: 32768 };
  }

  // Add retry logic with exponential backoff for rate limiting
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await ai.models.generateContent({
        model,
        contents: contents as any,
        config
      });
    } catch (error: any) {
      lastError = error;
      if (error?.status === 429 || error?.message?.includes('429')) {
        // Rate limited - wait with more aggressive exponential backoff
        // Start with 2 seconds, then 5 seconds, then 10 seconds
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

/**
 * Image Generation & Editing
 */
export const generateImage = async (prompt: string, aspectRatio: any, imageSize: any) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio, imageSize }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated");
};

export const editImage = async (base64Image: string, prompt: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(',')[1], mimeType: 'image/png' } },
        { text: prompt }
      ]
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("Editing failed");
};

/**
 * Video Generation (Veo)
 */
export const generateVideo = async (prompt: string, aspectRatio: '16:9' | '9:16', startImage?: string) => {
  const ai = getAI();
  const payload: any = {
    model: 'veo-3.1-fast-generate-preview',
    prompt,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio }
  };

  if (startImage) {
    payload.image = { imageBytes: startImage.split(',')[1], mimeType: 'image/png' };
  }

  let operation = await ai.models.generateVideos(payload);
  while (!operation.done) {
    await new Promise(r => setTimeout(r, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  const res = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
};

/**
 * Text-to-Speech Management
 */
let activeSource: AudioBufferSourceNode | null = null;
let activeContext: AudioContext | null = null;

export const stopSpeech = () => {
  if (activeSource) {
    try { activeSource.stop(); } catch (e) {}
    activeSource = null;
  }
  if (activeContext) {
    try { activeContext.close(); } catch (e) {}
    activeContext = null;
  }
};

export const speak = async (text: string, onEnd?: () => void) => {
  stopSpeech();
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: 'Kore' }
        }
      }
    }
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) return;

  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
  const decodedBytes = decode(base64Audio);
  const audioBuffer = await decodeAudioData(decodedBytes, ctx, 24000, 1);

  activeContext = ctx;
  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(ctx.destination);
  
  activeSource = source;
  source.onended = () => {
    if (activeSource === source) activeSource = null;
    if (onEnd) onEnd();
  };
  
  source.start();
};

/**
 * Multimodal Analysis (Images/Videos)
 */
export const analyzeMedia = async (prompt: string, mediaData: string, mimeType: string) => {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: mediaData.split(',')[1], mimeType } },
        { text: prompt }
      ]
    }
  });
  return response.text;
};
