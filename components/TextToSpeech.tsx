import React, { useState, useEffect, useRef } from 'react';

interface TextToSpeechProps {
  text: string;
  language?: 'zh-CN' | 'en-US' | 'auto';
  onPlayStateChange?: (isPlaying: boolean) => void;
}

const TextToSpeech: React.FC<TextToSpeechProps> = ({
  text,
  language = 'auto',
  onPlayStateChange
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1.0);
  const [pitch, setPitch] = useState(1.0);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load available voices
  useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      setVoices(availableVoices);

      // Auto-select appropriate voice based on language
      if (language === 'zh-CN') {
        const chineseVoice = availableVoices.find(v => v.lang.startsWith('zh'));
        setSelectedVoice(chineseVoice || availableVoices[0]);
      } else if (language === 'en-US') {
        const englishVoice = availableVoices.find(v => v.lang.startsWith('en'));
        setSelectedVoice(englishVoice || availableVoices[0]);
      } else {
        // Auto-detect: check if text has Chinese characters
        const hasChinese = /[\u4e00-\u9fff]/.test(text);
        const voice = hasChinese
          ? availableVoices.find(v => v.lang.startsWith('zh'))
          : availableVoices.find(v => v.lang.startsWith('en'));
        setSelectedVoice(voice || availableVoices[0]);
      }
    };

    loadVoices();

    // Chrome loads voices asynchronously
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [language, text]);

  const speak = () => {
    if (!text) return;

    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;

    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onstart = () => {
      setIsPlaying(true);
      setIsPaused(false);
      onPlayStateChange?.(true);
    };

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
      onPlayStateChange?.(false);
    };

    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setIsPlaying(false);
      setIsPaused(false);
      onPlayStateChange?.(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const pause = () => {
    window.speechSynthesis.pause();
    setIsPaused(true);
    onPlayStateChange?.(false);
  };

  const resume = () => {
    window.speechSynthesis.resume();
    setIsPaused(false);
    onPlayStateChange?.(true);
  };

  const stop = () => {
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    onPlayStateChange?.(false);
  };

  const handlePlayPause = () => {
    if (!isPlaying) {
      speak();
    } else if (isPaused) {
      resume();
    } else {
      pause();
    }
  };

  return (
    <div className="tts-controls">
      <div className="flex items-center gap-2">
        <button
          onClick={handlePlayPause}
          className="tts-btn play-pause"
          title={!isPlaying ? 'Play' : isPaused ? 'Resume' : 'Pause'}
          disabled={!text}
        >
          {!isPlaying ? '▶️' : isPaused ? '▶️' : '⏸️'}
        </button>

        {isPlaying && (
          <button
            onClick={stop}
            className="tts-btn stop"
            title="Stop"
          >
            ⏹️
          </button>
        )}

        <select
          value={selectedVoice?.name || ''}
          onChange={(e) => {
            const voice = voices.find(v => v.name === e.target.value);
            setSelectedVoice(voice || null);
          }}
          className="tts-select"
          disabled={isPlaying}
        >
          <option value="">Select Voice</option>
          {voices.map((voice) => (
            <option key={voice.name} value={voice.name}>
              {voice.name} ({voice.lang})
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <label className="text-xs text-slate-600">Speed:</label>
          <input
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={rate}
            onChange={(e) => setRate(parseFloat(e.target.value))}
            className="tts-slider"
            disabled={isPlaying}
            title={`${rate}x`}
          />
          <span className="text-xs text-slate-600 w-8">{rate}x</span>
        </div>
      </div>

      <style>{`
        .tts-controls {
          padding: 8px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
        }

        .tts-btn {
          padding: 6px 12px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 16px;
          transition: all 0.2s;
        }

        .tts-btn:hover:not(:disabled) {
          background: #f0f0f0;
          transform: scale(1.05);
        }

        .tts-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tts-btn.play-pause {
          background: #4CAF50;
          color: white;
          border-color: #4CAF50;
        }

        .tts-btn.play-pause:hover:not(:disabled) {
          background: #45a049;
        }

        .tts-btn.stop {
          background: #f44336;
          color: white;
          border-color: #f44336;
        }

        .tts-btn.stop:hover {
          background: #da190b;
        }

        .tts-select {
          padding: 6px 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 12px;
          background: white;
          cursor: pointer;
          max-width: 200px;
        }

        .tts-select:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .tts-slider {
          width: 80px;
          height: 4px;
          border-radius: 2px;
          outline: none;
          -webkit-appearance: none;
          background: #ddd;
        }

        .tts-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #4CAF50;
          cursor: pointer;
        }

        .tts-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: #4CAF50;
          cursor: pointer;
          border: none;
        }

        .tts-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default TextToSpeech;
