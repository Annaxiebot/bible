import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChatMessage, AspectRatio, ImageSize } from '../types';
import * as aiService from '../services/aiProvider';
import * as geminiService from '../services/gemini';
import AIProviderSettings from './AIProviderSettings';
import SaveResearchModal from './SaveResearchModal';
import { BIBLE_BOOKS } from '../constants';
import { verseDataStorage } from '../services/verseDataStorage';
import { AIResearchEntry } from '../types/verseData';

interface ChatInterfaceProps {
  incomingText?: { text: string; id: number; clearChat?: boolean } | null;
  currentBookId?: string;
  currentChapter?: number;
  onResearchSaved?: () => void;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

const parseMessage = (content: string, role: string) => {
  if (role === 'assistant') {
    const parts = content.split('[SPLIT]');
    if (parts.length >= 2) {
      return {
        zh: parts[0]?.trim() || '',
        en: parts[1]?.trim() || ''
      };
    }
    return { zh: content, en: 'Analysis in progress...' };
  }

  if (content.includes('中文:') && content.includes('English:')) {
    const zhMatch = content.match(/中文:([\s\S]*?)English:/);
    const enMatch = content.match(/English:([\s\S]*)$/);
    const prefixMatch = content.match(/^([\s\S]*?)\n\n\[/);
    const suffixMatch = content.match(/\]\n中文:[\s\S]*?\n\n([\s\S]*)$/);

    const prefix = prefixMatch ? prefixMatch[1].trim() : "";
    const suffix = suffixMatch ? suffixMatch[1].trim() : "";

    return {
      zh: (prefix ? prefix + '\n\n' : '') + (zhMatch ? zhMatch[1].trim() : content) + (suffix ? '\n\n' + suffix : ''),
      en: (enMatch ? enMatch[1].trim() : content)
    };
  }

  return { zh: content, en: content };
};

// Bible reference detection and linking
interface BibleRef {
  bookId: string;
  chapter: number;
  verses?: number[];
}

const parseBibleReference = (text: string): BibleRef | null => {
  // Build a regex pattern that matches book names from BIBLE_BOOKS
  const bookNames = BIBLE_BOOKS.map(b => b.name).join('|');
  const bookPattern = `(${bookNames})`;
  
  // Pattern: "Book chapter:verse" or "Book chapter:verse-verse"
  const refPattern = new RegExp(`${bookPattern}\\s+(\\d+):(\\d+)(?:-(\\d+))?`, 'i');
  const match = text.match(refPattern);
  
  if (match) {
    const bookName = match[1];
    const chapter = parseInt(match[2]);
    const verseStart = parseInt(match[3]);
    const verseEnd = match[4] ? parseInt(match[4]) : undefined;
    
    const book = BIBLE_BOOKS.find(b => b.name.toLowerCase() === bookName.toLowerCase());
    if (!book) return null;
    
    const verses: number[] = [];
    if (verseEnd) {
      for (let v = verseStart; v <= verseEnd; v++) {
        verses.push(v);
      }
    } else {
      verses.push(verseStart);
    }
    
    return {
      bookId: book.id,
      chapter,
      verses
    };
  }
  
  return null;
};

interface BibleLinkProps {
  children: string;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

const BibleLink: React.FC<BibleLinkProps> = ({ children, onNavigate }) => {
  const ref = parseBibleReference(children);
  
  if (ref && onNavigate) {
    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(ref.bookId, ref.chapter, ref.verses);
        }}
        className="text-yellow-200 hover:text-white underline decoration-yellow-300 hover:decoration-white transition-colors cursor-pointer font-medium"
        title={`跳转到 Go to ${children}`}
      >
        {children}
      </a>
    );
  }
  
  return <>{children}</>;
};

const processTextWithBibleRefs = (text: string, onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void): React.ReactNode => {
  const bookNames = BIBLE_BOOKS.map(b => b.name).join('|');
  const refPattern = new RegExp(`(${bookNames})\\s+\\d+:\\d+(?:-\\d+)?`, 'gi');
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = refPattern.exec(text)) !== null) {
    // Add text before the reference
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Add the clickable reference
    parts.push(
      <BibleLink key={match.index} onNavigate={onNavigate}>
        {match[0]}
      </BibleLink>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? <>{parts}</> : text;
};

interface MessageBubbleProps {
  m: ChatMessage;
  side: 'zh' | 'en';
  isSpeaking: boolean;
  onSpeak: (content: string) => void;
  onStop: () => void;
  onSaveResearch?: (message: ChatMessage, side: 'zh' | 'en') => void;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ m, side, isSpeaking, onSpeak, onStop, onSaveResearch, onNavigate }) => {
  const { zh, en } = parseMessage(m.content, m.role);
  const content = side === 'zh' ? zh : en;

  if (!content || content === 'Analysis in progress...') {
    if (m.role === 'assistant') {
       return (
         <div className="flex justify-start opacity-40 italic text-xs p-4">
           {side === 'zh' ? '正在整理中文解读...' : 'Synthesizing English commentary...'}
         </div>
       );
    }
  }

  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div className={`max-w-[95%] rounded-2xl p-4 shadow-sm border transition-all ${
        m.role === 'user' 
          ? 'bg-indigo-600 text-white border-transparent' 
          : 'bg-white text-slate-800 border-slate-200'
      }`}>
        <div className="flex justify-between items-start gap-2">
          <div className={`flex-1 overflow-hidden prose prose-sm sm:prose-base ${m.role === 'user' ? 'prose-invert text-white' : 'prose-slate'}`}>
            <ReactMarkdown 
              remarkPlugins={[remarkMath]} 
              rehypePlugins={[
                [rehypeKatex, { 
                  throwOnError: false,
                  strict: 'ignore',
                  errorColor: '#cc0000',
                  trust: (context) => {
                    if (/[\u0590-\u05FF]/.test(context.command)) {
                      return false;
                    }
                    return true;
                  },
                  output: 'html',
                  fleqn: false,
                  displayMode: false,
                  macros: {}
                }]
              ]}
              components={{
                // Custom text renderer to handle Bible references
                p: ({ children }) => {
                  const processChildren = (nodes: React.ReactNode): React.ReactNode => {
                    if (typeof nodes === 'string') {
                      return processTextWithBibleRefs(nodes, onNavigate);
                    }
                    if (Array.isArray(nodes)) {
                      return nodes.map((node, i) => 
                        <React.Fragment key={i}>{processChildren(node)}</React.Fragment>
                      );
                    }
                    return nodes;
                  };
                  
                  return <p>{processChildren(children)}</p>;
                }
              }}
            >
              {content}
            </ReactMarkdown>
          </div>
          {m.role === 'assistant' && (
            <div className="flex gap-2 mt-1">
              <button 
                onClick={() => isSpeaking ? onStop() : onSpeak(content)} 
                className={`shrink-0 transition-colors p-1 rounded-full ${isSpeaking ? 'bg-red-50 text-red-500' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`} 
                title={isSpeaking ? (side === 'zh' ? "停止播放" : "Stop") : (side === 'zh' ? "朗读" : "Read aloud")}
              >
                {isSpeaking ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                )}
              </button>
              {onSaveResearch && (
                <button
                  onClick={() => onSaveResearch(m, side)}
                  className="shrink-0 transition-colors p-1 rounded-full text-green-500 hover:text-green-600 hover:bg-green-50"
                  title={side === 'zh' ? "保存到经文笔记" : "Save to verse"}
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        
        {m.mediaUrl && <div className="mt-2 group relative">
          {m.type === 'video' ? (
            <video src={m.mediaUrl} controls className="rounded-lg max-h-64 w-full object-contain border bg-slate-50 shadow-inner" />
          ) : (
            <img src={m.mediaUrl} className="rounded-lg max-h-64 w-full object-contain border bg-slate-50 shadow-inner" />
          )}
        </div>}

        {m.references && m.references.length > 0 && side === 'zh' && (
          <div className="mt-3 pt-3 border-t border-slate-100">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">学术来源</p>
            <div className="flex flex-wrap gap-1">
              {m.references.slice(0, 4).map((r, i) => (
                <a key={i} href={r.uri} target="_blank" rel="noopener noreferrer" className="bg-slate-50 px-2 py-0.5 rounded border border-slate-100 text-[10px] text-indigo-600 truncate max-w-[140px] hover:bg-indigo-50 hover:border-indigo-100 transition-all">
                  {r.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ incomingText, currentBookId, currentChapter, onResearchSaved, onNavigate }) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [researchToSave, setResearchToSave] = useState<{ message: ChatMessage; side: 'zh' | 'en' } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showStudio, setShowStudio] = useState(false);
  const [vSplitOffset, setVSplitOffset] = useState(100); // Default to 100% - show only conversation, hide English panel
  const [isResizing, setIsResizing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<{zh?: number | null, en?: number | null}>({});
  const [studioConfig, setStudioConfig] = useState<{ aspect: AspectRatio; size: ImageSize; type: 'image' | 'video' }>({
    aspect: '1:1',
    size: '1K',
    type: 'image'
  });
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(aiService.getCurrentProvider());
  
  const containerRef = useRef<HTMLDivElement>(null);
  const zhScrollRef = useRef<HTMLDivElement>(null);
  const enScrollRef = useRef<HTMLDivElement>(null);
  const lastPayloadId = useRef<number>(-1);

  // Sync incoming verses while preserving the user's manual question
  useEffect(() => {
    if (incomingText && incomingText.id !== lastPayloadId.current) {
      lastPayloadId.current = incomingText.id;
      
      // Clear chat history if requested
      if (incomingText.clearChat) {
        setMessages([]);
      }
      
      const verseText = incomingText.text.trim();
      if (!verseText) {
        setInput(userQuestion);
      } else {
        // If clearChat is true (from context menu), don't add suffix
        if (incomingText.clearChat) {
          setInput(verseText);
        } else {
          const suffix = userQuestion.trim() ? `\n\n我的额外问题是：\n${userQuestion}` : "";
          setInput(`${verseText}${suffix}`);
        }
      }
    }
  }, [incomingText, userQuestion]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    
    // Attempt to extract the "Manual Question" part if verses are present
    const verseEndIndex = val.lastIndexOf("WEB:");
    if (verseEndIndex !== -1) {
      const remaining = val.substring(verseEndIndex);
      const suffixMatch = remaining.match(/WEB:[\s\S]*?\n\n我的额外问题是：\n([\s\S]*)$/);
      if (suffixMatch) {
        setUserQuestion(suffixMatch[1]);
      } else {
        setUserQuestion(val);
      }
    } else {
      setUserQuestion(val);
    }
  };

  const handleSpeak = (content: string, index: number, side: 'zh' | 'en') => {
    setSpeakingMsgIndex(prev => ({ ...prev, [side]: index }));
    // TTS is Gemini-only for now
    geminiService.speak(content, () => setSpeakingMsgIndex(prev => ({ ...prev, [side]: null })));
  };

  const handleStop = (side: 'zh' | 'en') => {
    geminiService.stopSpeech();
    setSpeakingMsgIndex(prev => ({ ...prev, [side]: null }));
  };

  const syncScroll = (source: 'zh' | 'en') => {
    const src = source === 'zh' ? zhScrollRef.current : enScrollRef.current;
    const dest = source === 'zh' ? enScrollRef.current : zhScrollRef.current;
    if (src && dest) {
      dest.scrollTop = src.scrollTop;
    }
  };

  useEffect(() => {
    // Small delay to ensure DOM is updated
    const scrollTimeout = setTimeout(() => {
      if (zhScrollRef.current) {
        zhScrollRef.current.scrollTo({ top: zhScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
      if (enScrollRef.current) {
        enScrollRef.current.scrollTo({ top: enScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100);
    return () => clearTimeout(scrollTimeout);
  }, [messages, isTyping]);

  const handleSend = async () => {
    if (!input.trim() || isTyping) return;

    const userMessage: ChatMessage = { role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setUserQuestion(''); // Reset manual part after sending
    setIsTyping(true);
    
    // Immediate scroll to bottom after sending message
    setTimeout(() => {
      if (zhScrollRef.current) {
        zhScrollRef.current.scrollTo({ top: zhScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
      if (enScrollRef.current) {
        enScrollRef.current.scrollTo({ top: enScrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 50);

    try {
      const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const response = await aiService.chatWithAI(currentInput, history, { 
        thinking: isThinking, 
        search: true,
        fast: !isThinking 
      });
      
      const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      const references = Array.isArray(groundingChunks) 
        ? groundingChunks.map((chunk: any) => ({ title: chunk.web?.title || '参考资料', uri: chunk.web?.uri || '' })).filter((c: any) => c.uri)
        : undefined;

      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.text || "我无法生成回应。",
        timestamp: new Date(),
        references: references
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "连接失败，请重试。", timestamp: new Date() }]);
    } finally {
      setIsTyping(false);
    }
  };

  const startMediaGen = async () => {
    if (!input.trim()) return;
    setIsTyping(true);
    setShowStudio(false);
    try {
      if (studioConfig.type === 'image') {
        const url = await geminiService.generateImage(input, studioConfig.aspect, studioConfig.size);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `生成的图像：${input}\n[SPLIT]\nGenerated Image: ${input}`, 
          mediaUrl: url, 
          type: 'image', 
          timestamp: new Date() 
        }]);
      } else {
        const url = await geminiService.generateVideo(input, studioConfig.aspect as any);
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `生成的视频：${input}\n[SPLIT]\nGenerated Video: ${input}`, 
          mediaUrl: url, 
          type: 'video', 
          timestamp: new Date() 
        }]);
      }
      setInput('');
      setUserQuestion('');
    } catch (err) { console.error(err); } finally { setIsTyping(false); }
  };

  const startResizing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => setIsResizing(false), []);
  
  const onSaveResearch = (message: ChatMessage, side: 'zh' | 'en') => {
    setResearchToSave({ message, side });
    setShowSaveModal(true);
  };
  
  const handleSaveResearch = async (bookId: string, chapter: number, verses: number[], tags: string[]) => {
    if (!researchToSave) return;
    
    const { message, side } = researchToSave;
    const parsed = parseMessage(message.content, message.role);
    const content = side === 'zh' ? parsed.zh : parsed.en;
    
    // Extract the query from the original message if it's a response
    const messageIndex = messages.findIndex(m => m === message);
    const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
    const query = userMessage?.role === 'user' ? userMessage.content : 'AI Research';
    
    const research: AIResearchEntry = {
      id: Date.now().toString(),
      query,
      response: content,
      timestamp: Date.now(),
      tags
    };
    
    await verseDataStorage.addAIResearch(bookId, chapter, verses, research);

    setShowSaveModal(false);
    setResearchToSave(null);

    // Trigger research update callback to refresh the notebook view
    if (onResearchSaved) {
      onResearchSaved();
    }
  };

  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      const percentage = ((clientX - rect.left) / rect.width) * 100;
      if (percentage >= 0 && percentage <= 100) setVSplitOffset(percentage);
    }
  }, [isResizing]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
      window.addEventListener('touchmove', resize);
      window.addEventListener('touchend', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className="h-full flex flex-col relative bg-slate-50" ref={containerRef}>
      {/* AI Provider Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-semibold text-slate-700">
            AI Provider: <span className="text-indigo-600">{currentProvider === 'claude' ? 'Claude' : 'Gemini'}</span>
          </span>
        </div>
        <button
          onClick={() => setShowProviderSettings(true)}
          className="text-xs px-3 py-1 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Chinese Side */}
        <div 
          ref={zhScrollRef} 
          onScroll={() => syncScroll('zh')}
          className="overflow-y-auto p-4 space-y-6 border-r border-slate-200 bg-white"
          style={{ 
            flexGrow: vSplitOffset >= 100 ? 1 : 0,
            flexShrink: vSplitOffset >= 100 ? 1 : 0,
            flexBasis: vSplitOffset >= 100 ? 'calc(100% - 20px)' : vSplitOffset <= 0 ? '0%' : `calc(${vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset <= 0 ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 sticky top-0 bg-white/90 backdrop-blur-md z-10 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            中文解读 (Scholar Research)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble 
              key={idx} 
              m={m} 
              side="zh" 
              isSpeaking={speakingMsgIndex.zh === idx} 
              onSpeak={(c) => handleSpeak(c, idx, 'zh')}
              onStop={() => handleStop('zh')}
              onSaveResearch={onSaveResearch}
              onNavigate={onNavigate}
            />
          ))}
          {isTyping && (
            <div className="flex justify-start">
               <div className="animate-pulse bg-slate-100 h-20 w-3/4 rounded-2xl border border-slate-200"></div>
            </div>
          )}
        </div>

        {/* Vertical Splitter */}
        <div 
          className={`relative h-full flex items-center justify-center select-none z-30 transition-all group hover:bg-blue-50 flex-shrink-0`}
          style={{ 
            width: '20px',
            marginLeft: '0',
            marginRight: '0',
            touchAction: 'none',
            WebkitTouchCallout: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none'
          }}
        >
          {/* Visible divider bar */}
          <div 
            className={`absolute h-full ${isResizing ? 'w-2 bg-indigo-500' : 'w-1 bg-slate-200 group-hover:bg-indigo-400 group-hover:w-2'} transition-all`}
            style={{
              boxShadow: isResizing ? '2px 0 4px rgba(99, 102, 241, 0.3), -2px 0 4px rgba(99, 102, 241, 0.3)' : '1px 0 2px rgba(0, 0, 0, 0.05)'
            }}
          />
          
          <div 
            onMouseDown={startResizing}
            onTouchStart={startResizing}
            className="absolute w-full h-full cursor-col-resize"
          />
          
          {/* Arrow buttons and drag indicator */}
          <div 
            className="relative flex flex-col gap-1 bg-white/95 py-1.5 px-1 rounded-full shadow-lg border border-slate-300 hover:border-blue-300 z-40 cursor-col-resize transition-colors" 
            style={{ width: '20px' }}
          >
            {/* Left arrow - toggle between middle (50%) and maximize English (0%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on right side (>50%), go to middle (50%)
                // If at middle or left side (<=50%), maximize English (0%)
                setVSplitOffset(vSplitOffset > 50 ? 50 : 0);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset > 50 ? "Center divider" : "Maximize English"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            
            {/* Drag indicator */}
            <div 
              onMouseDown={startResizing}
              onTouchStart={startResizing}
              className="flex flex-row gap-0.5 px-1 justify-center cursor-col-resize" 
              style={{ width: '14px' }}
            >
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
              <div className="w-0.5 h-4 bg-slate-300 pointer-events-none"></div>
            </div>
            
            {/* Right arrow - toggle between middle (50%) and maximize Chinese (100%) */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                // If on left side (<50%), go to middle (50%)
                // If at middle or right side (>=50%), maximize Chinese (100%)
                setVSplitOffset(vSplitOffset < 50 ? 50 : 100);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset < 50 ? "Center divider" : "Maximize Chinese"}
              style={{ height: '14px', width: '14px' }}
            >
              <svg className="w-3 h-3 text-slate-500 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* English Side */}
        <div 
          ref={enScrollRef} 
          onScroll={() => syncScroll('en')}
          className="overflow-y-auto p-4 space-y-6 bg-slate-50/50"
          style={{ 
            flexGrow: vSplitOffset <= 0 ? 1 : 0,
            flexShrink: vSplitOffset <= 0 ? 1 : 0,
            flexBasis: vSplitOffset <= 0 ? 'calc(100% - 20px)' : vSplitOffset >= 100 ? '0%' : `calc(${100 - vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset >= 100 ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 sticky top-0 bg-slate-50/90 backdrop-blur-md z-10 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
            English Commentary (Academic)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble 
              key={idx} 
              m={m} 
              side="en" 
              isSpeaking={speakingMsgIndex.en === idx} 
              onSpeak={(c) => handleSpeak(c, idx, 'en')}
              onStop={() => handleStop('en')}
              onSaveResearch={onSaveResearch}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>

      {/* Input area - relative position needed for z-index to work */}
      <div className="p-4 bg-white border-t border-slate-200 z-10 shadow-lg relative flex-shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col gap-2">
          <div className="relative">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="点击上方选择经文，或在此直接输入问题..."
              className="w-full p-3 pr-14 rounded-xl border border-slate-200 bg-slate-50 resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-inner transition-all"
              rows={3}
            />
            <button onClick={handleSend} disabled={!input.trim() || isTyping} className="absolute right-2 bottom-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-md disabled:bg-slate-300 transition-all active:scale-95">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
        </div>
      </div>
      
      {showSaveModal && researchToSave && (() => {
        const parsed = parseMessage(researchToSave.message.content, researchToSave.message.role);
        const content = researchToSave.side === 'zh' ? parsed.zh : parsed.en;
        const messageIndex = messages.findIndex(m => m === researchToSave.message);
        const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
        const query = userMessage?.role === 'user' ? userMessage.content : 'AI Research';
        
        return (
          <SaveResearchModal
            isOpen={showSaveModal}
            onClose={() => {
              setShowSaveModal(false);
              setResearchToSave(null);
            }}
            onSuccess={onResearchSaved}
            query={query}
            response={content}
            selectedText=""
            currentBookId={currentBookId}
            currentChapter={currentChapter}
          />
        );
      })()}

      <AIProviderSettings
        isOpen={showProviderSettings}
        onClose={() => {
          setShowProviderSettings(false);
          setCurrentProvider(aiService.getCurrentProvider());
        }}
      />
    </div>
  );
};

export default ChatInterface;
