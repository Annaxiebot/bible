
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';

// Audio decoding/encoding utilities as per guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

const VoiceSession: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const [isActive, setIsActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const isMutedRef = useRef(false);

  // Sync ref with state for use in the onaudioprocess callback
  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const startSession = async () => {
    // Create new GoogleGenAI instance for each session
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    sessionPromiseRef.current = ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-12-2025',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
        systemInstruction: "You are a friendly Bible scholar. Have a natural conversation. Use your knowledge of the CUV bible."
      },
      callbacks: {
        onopen: () => {
          setIsActive(true);
          const source = inputAudioContext.createMediaStreamSource(stream);
          const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
          scriptProcessor.onaudioprocess = (e) => {
            // Check mute state from ref to avoid stale closures
            if (isMutedRef.current) return;

            const inputData = e.inputBuffer.getChannelData(0);
            const int16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
            
            const pcmData = new Uint8Array(int16.buffer);
            // CRITICAL: Solely rely on sessionPromise resolves to send data
            sessionPromiseRef.current?.then((session) => {
              session.sendRealtimeInput({
                media: { data: encode(pcmData), mimeType: 'audio/pcm;rate=16000' }
              });
            });
          };
          source.connect(scriptProcessor);
          scriptProcessor.connect(inputAudioContext.destination);
        },
        onmessage: async (msg: LiveServerMessage) => {
          const audioData = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
          if (audioData && outputAudioContextRef.current) {
            const ctx = outputAudioContextRef.current;
            const decodedBytes = decode(audioData);
            const audioBuffer = await decodeAudioData(decodedBytes, ctx, 24000, 1);
            
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.addEventListener('ended', () => {
              sourcesRef.current.delete(source);
            });
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += audioBuffer.duration;
            sourcesRef.current.add(source);
          }

          if (msg.serverContent?.interrupted) {
            for (const source of sourcesRef.current) {
              try { source.stop(); } catch(e) {}
            }
            sourcesRef.current.clear();
            nextStartTimeRef.current = 0;
          }
        },
        onclose: () => setIsActive(false),
        onerror: (e) => {
          console.error('Live error:', e);
          setIsActive(false);
        }
      }
    });
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  useEffect(() => {
    if (!isOpen && sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => {
        try { session.close(); } catch(e) {}
      });
      setIsActive(false);
      setIsMuted(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-indigo-900/90 backdrop-blur-lg z-[100] flex flex-col items-center justify-center p-6 text-white text-center">
      <div className="mb-12 relative">
        <div className={`w-32 h-32 rounded-full flex items-center justify-center transition-all duration-500 ${isActive ? (isMuted ? 'bg-red-500/20' : 'bg-white/20 scale-110 shadow-[0_0_50px_rgba(255,255,255,0.3)]') : 'bg-white/10'}`}>
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${isMuted ? 'bg-red-500 text-white' : 'bg-white text-indigo-600'} ${isActive && !isMuted ? 'animate-pulse' : ''}`}>
             {isMuted ? (
               <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.17l5.98 6zm3.97 8.58l-1.41-1.41L3.27 4.07 1.86 5.48l3.66 3.66C5.19 9.8 5 10.38 5 11h2c0-.31.05-.61.12-.9l3.12 3.12c-.39.43-.84.79-1.24 1.08V17h2v-2.08c.31-.05.61-.12.9-.22l5.88 5.88 1.41-1.41zM12 14c-1.66 0-3-1.34-3-3V9.17L14.83 15c-.29.13-.59.22-.83.33V17h-2v-2.08c-.52-.08-1.01-.24-1.46-.46L12 14z"/></svg>
             ) : (
               <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
             )}
          </div>
        </div>
        {isMuted && isActive && (
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-red-500 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg">
            静音中
          </div>
        )}
      </div>
      
      <h2 className="text-3xl font-bold mb-4">开启语音对话</h2>
      <p className="max-w-md text-indigo-100 mb-8 leading-relaxed">现在您可以直接用声音向学者 AI 提问。它能实时倾听并以流畅的人声与您交流。建议使用耳机以获得最佳效果。</p>
      
      {!isActive ? (
        <button onClick={startSession} className="px-12 py-4 bg-white text-indigo-600 rounded-full font-bold text-lg hover:bg-indigo-50 shadow-xl transition-all">开启连接</button>
      ) : (
        <div className="flex flex-col items-center gap-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleMute} 
              className={`p-4 rounded-full transition-all border-2 shadow-lg flex items-center justify-center ${isMuted ? 'bg-red-500 border-red-400 text-white' : 'bg-white/10 border-white/20 text-white hover:bg-white/20'}`}
              title={isMuted ? "取消静音" : "静音"}
            >
               {isMuted ? (
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z M1 1l22 22" /></svg>
               ) : (
                 <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
               )}
            </button>
            <div className="text-sm font-bold tracking-widest text-indigo-300 animate-pulse">
              {isMuted ? '麦克风已关闭' : '学者正在倾听...'}
            </div>
          </div>
          <button onClick={onClose} className="px-8 py-3 border-2 border-white/20 rounded-full hover:bg-white/10 transition-colors text-sm font-medium">结束会话</button>
        </div>
      )}
      
      <button onClick={onClose} className="absolute top-8 right-8 text-white/60 hover:text-white transition-colors">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
};

export default VoiceSession;
