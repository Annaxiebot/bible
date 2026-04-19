import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import LazyMarkdown from './LazyMarkdown';
import { IMAGE, TIMING, LAYOUT } from '../constants/appConfig';
import { ChatMessage, AspectRatio, ImageSize } from '../types';
import * as aiService from '../services/aiProvider';
import * as geminiService from '../services/gemini';
import AIProviderSettings from './AIProviderSettings';
import SaveResearchModal from './SaveResearchModal';
import { BIBLE_BOOKS, CHINESE_ABBREV_TO_BOOK_ID } from '../constants';
import { BOOK_ID_TO_CHINESE_NAME } from '../services/bibleBookData';
import { verseDataStorage } from '../services/verseDataStorage';
import { backgroundBibleDownload } from '../services/backgroundBibleDownload';
import { autoSaveResearchService } from '../services/autoSaveResearchService';
import { ToastContainer, useToast } from './Toast';
import { compressImage, compressImageFromUrl } from '../services/imageCompressionService';
import {
  parseMessage,
  parseBibleReference,
  processTextWithBibleRefs,
  BOOK_ID_TO_ENGLISH,
} from '../services/messageParsingService';
import { loadThreadMessages, saveThreadMessages, findChapterThread, getOrCreateChapterThread, createThread, deleteThread } from '../services/chatHistoryStorage';
import ChatThreadList from './ChatThreadList';

interface GroundingChunk {
  web?: {
    title?: string;
    uri?: string;
  };
}

interface ChatInterfaceProps {
  incomingText?: { text: string; id: number; clearChat?: boolean } | null;
  currentBookId?: string;
  currentChapter?: number;
  currentVerses?: number[];
  onResearchSaved?: () => void;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
  onSearchReference?: (query: string) => void;
  vibeClassName?: string;
}

// Bible reference detection and linking

interface BibleLinkProps {
  children: string;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

const BibleLink: React.FC<BibleLinkProps> = ({ children, onNavigate }) => {
  if (typeof children !== 'string') return <>{children}</>;
  const ref = parseBibleReference(children);
  
  if (ref && onNavigate) {
    // Detect whether the original reference was in Chinese or English
    const chineseBookNames = Object.keys(CHINESE_ABBREV_TO_BOOK_ID);
    const isChinese = chineseBookNames.some(name => children.includes(name));
    
    // Get book names
    const chineseName = BOOK_ID_TO_CHINESE_NAME[ref.bookId];
    const englishName = BOOK_ID_TO_ENGLISH[ref.bookId];
    
    // Extract chapter and verse info
    const refMatch = children.match(/(\d+)[:：](\d+)(?:-(\d+))?/);
    const chapterMatch = children.match(/(\d+)[章篇]/);

    let chapterVerse = '';
    if (refMatch) {
      // Normalize fullwidth colon to ASCII for display
      chapterVerse = refMatch[0].replace('：', ':');
    } else if (chapterMatch) {
      chapterVerse = `${chapterMatch[1]}${chapterMatch[0].slice(-1)}`;
    } else if (ref.chapter) {
      chapterVerse = `${ref.chapter}`;
    }
    
    // Format bilingual display
    const displayText = isChinese
      ? `${chineseName} ${englishName} ${chapterVerse}`
      : `${englishName} ${chineseName} ${chapterVerse}`;
    
    return (
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onNavigate(ref.bookId, ref.chapter, ref.verses);
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 mx-0.5 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-md text-indigo-700 hover:from-indigo-100 hover:to-purple-100 hover:border-indigo-300 hover:text-indigo-900 transition-all cursor-pointer font-medium text-sm shadow-sm hover:shadow-md"
        title={`跳转到 Go to ${displayText}`}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="whitespace-nowrap">{displayText}</span>
      </a>
    );
  }
  
  return <>{children}</>;
};


interface MessageBubbleProps {
  m: ChatMessage;
  side: 'zh' | 'en';
  isSpeaking: boolean;
  onSpeak: (content: string) => void;
  onStop: () => void;
  onSaveResearch?: (message: ChatMessage, side: 'zh' | 'en') => void;
  isSaved?: boolean;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
  currentBookId?: string;
  onTextSelection?: (selectedText: string, position: { x: number; y: number }) => void;
  onQuote?: (text: string) => void;
  onDelete?: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = React.memo(({ m, side, isSpeaking, onSpeak, onStop, onSaveResearch, isSaved, onNavigate, currentBookId, onTextSelection, onQuote, onDelete }) => {
  const { zh, en } = parseMessage(m.content, m.role);
  const content = side === 'zh' ? zh : en;
  const [copied, setCopied] = useState(false);

  if (!content || content === 'Analysis in progress...') {
    if (m.role === 'assistant') {
       return (
         <div className="flex justify-start opacity-40 italic text-xs p-4">
           {side === 'zh' ? '正在整理中文解读...' : 'Synthesizing English commentary...'}
         </div>
       );
    }
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    if (selectedText && selectedText.length > 0 && onTextSelection) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();
      if (rect) {
        onTextSelection(selectedText, {
          x: rect.left + window.scrollX,
          y: rect.bottom + window.scrollY
        });
      }
    }
  };

  return (
    <div className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
      <div
        className={`max-w-[95%] rounded-2xl p-4 shadow-sm border transition-all select-text ${
          m.role === 'user'
            ? 'bg-indigo-600 text-white border-transparent'
            : 'bg-white text-slate-800 border-slate-200'
        }`}
        style={{ WebkitUserSelect: 'text', userSelect: 'text' }}
        onMouseUp={handleMouseUp}
      >
        <div>
          <div className={`overflow-hidden prose prose-sm sm:prose-base ${m.role === 'user' ? 'prose-invert text-white' : 'prose-slate'}`}>
            <LazyMarkdown 
              katexOptions={{ 
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
              }}
              components={(() => {
                // Factory for BibleLink elements — passed to the parsing service
                const makeBibleLink = (matchedText: string, key: number): React.ReactNode => (
                  <BibleLink key={key} onNavigate={onNavigate}>{matchedText}</BibleLink>
                );
                // Shared helper to recursively process children for Bible references
                const processChildren = (nodes: React.ReactNode): React.ReactNode => {
                  if (typeof nodes === 'string') {
                    return processTextWithBibleRefs(nodes, currentBookId, makeBibleLink);
                  }
                  if (typeof nodes === 'number') {
                    return processTextWithBibleRefs(String(nodes), currentBookId, makeBibleLink);
                  }
                  if (nodes == null || typeof nodes === 'boolean') return nodes;
                  if (Array.isArray(nodes)) {
                    return nodes.map((node, i) =>
                      <React.Fragment key={i}>{processChildren(node)}</React.Fragment>
                    );
                  }
                  // Don't recurse into elements that already have click handlers or are BibleLink/anchor elements
                  if (React.isValidElement(nodes)) {
                    // React.ReactElement.props is typed as {} — cast needed to inspect runtime shape
                    const props = nodes.props as React.HTMLAttributes<HTMLElement> & { children?: React.ReactNode };
                    if (props?.onClick || (nodes.type === 'a') || nodes.type === BibleLink) return nodes;
                    if (props?.children) {
                      return React.cloneElement(nodes, {}, processChildren(props.children));
                    }
                  }
                  return nodes;
                };
                return {
                  p: ({ children }) => <p>{processChildren(children)}</p>,
                  li: ({ children }) => <li>{processChildren(children)}</li>,
                  h2: ({ children }) => <h2>{processChildren(children)}</h2>,
                  h3: ({ children }) => <h3>{processChildren(children)}</h3>,
                  h4: ({ children }) => <h4>{processChildren(children)}</h4>,
                  strong: ({ children }) => <strong>{processChildren(children)}</strong>,
                  em: ({ children }) => <em>{processChildren(children)}</em>,
                  td: ({ children }) => <td>{processChildren(children)}</td>,
                  th: ({ children }) => <th>{processChildren(children)}</th>,
                };
              })()}
            >
              {content}
            </LazyMarkdown>
          </div>
          <div className="flex justify-end gap-1 mt-1">
            {/* Quote button -- available on all messages */}
            {onQuote && (
              <button
                onClick={() => onQuote(content)}
                className={`shrink-0 transition-colors p-1 rounded-full ${
                  m.role === 'user'
                    ? 'text-indigo-200 hover:text-white hover:bg-indigo-500'
                    : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                }`}
                title={side === 'zh' ? '\u5f15\u7528\u6b64\u6d88\u606f' : 'Quote this message'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </button>
            )}
            {/* Copy button -- available on all messages */}
            <button
              onClick={() => {
                navigator.clipboard.writeText(content).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
              className={`shrink-0 transition-colors p-1 rounded-full ${
                copied
                  ? (m.role === 'user' ? 'text-green-300 bg-indigo-500' : 'text-green-500 bg-green-50')
                  : m.role === 'user'
                    ? 'text-indigo-200 hover:text-white hover:bg-indigo-500'
                    : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
              }`}
              title={copied ? (side === 'zh' ? '已复制' : 'Copied!') : (side === 'zh' ? '复制' : 'Copy')}
            >
              {copied ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
            {onDelete && (
              <button
                onClick={onDelete}
                className={`shrink-0 transition-colors p-1 rounded-full ${
                  m.role === 'user'
                    ? 'text-indigo-200 hover:text-red-300 hover:bg-indigo-500'
                    : 'text-slate-400 hover:text-red-500 hover:bg-red-50'
                }`}
                title={side === 'zh' ? '删除此对话' : 'Delete this exchange'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {m.role === 'assistant' && (
              <>
                <button
                  onClick={() => isSpeaking ? onStop() : onSpeak(content)}
                  className={`shrink-0 transition-colors p-1 rounded-full ${isSpeaking ? 'bg-red-50 text-red-500' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                  title={isSpeaking ? (side === 'zh' ? "\u505c\u6b62\u64ad\u653e" : "Stop") : (side === 'zh' ? "\u6717\u8bfb" : "Read aloud")}
                >
                  {isSpeaking ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
                {onSaveResearch && (
                  <button
                    onClick={() => !isSaved && onSaveResearch(m, side)}
                    disabled={isSaved}
                    className={`shrink-0 transition-colors p-1 rounded-full ${
                      isSaved
                        ? 'text-green-600 bg-green-100 cursor-default'
                        : 'text-green-500 hover:text-green-600 hover:bg-green-50'
                    }`}
                    title={isSaved
                      ? (side === 'zh' ? "\u5df2\u4fdd\u5b58" : "Already saved")
                      : (side === 'zh' ? "\u4fdd\u5b58\u5230\u7ecf\u6587\u7b14\u8bb0" : "Save to research notes")}
                  >
                    {isSaved ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>
                      </svg>
                    )}
                  </button>
                )}
              </>
            )}
          </div>
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
        {m.role === 'assistant' && (m.model || m.responseTime) && (
          <div className="mt-2 pt-1.5 border-t border-slate-100 text-[10px] text-slate-400 text-right">
            <div className="flex items-center justify-end gap-2">
              {m.responseTime && (
                <span>{m.responseTime < 1000 ? `${m.responseTime}ms` : `${(m.responseTime / 1000).toFixed(1)}s`}</span>
              )}
              {m.model && <span>{m.model}</span>}
              {m.racePool && (
                <span className="relative group cursor-help">
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-[9px] font-medium">
                    race {m.racePool.length}
                  </span>
                  <div className="absolute bottom-full right-0 mb-1 hidden group-hover:block z-50 w-72 p-2 bg-slate-800 text-white rounded-lg shadow-lg text-[10px] text-left">
                    <div className="font-semibold mb-1">Raced {m.racePool.length} models:</div>
                    {m.racePool
                      .sort((a, b) => (a.responseMs ?? 99999) - (b.responseMs ?? 99999))
                      .map((r, i) => {
                        const isWinner = r.model === m.model || (m.model && r.model.includes(m.model));
                        const timeStr = r.responseMs != null
                          ? r.responseMs < 1000 ? `${r.responseMs}ms` : `${(r.responseMs / 1000).toFixed(1)}s`
                          : r.status === 'error' ? 'failed' : r.status === 'low_quality' ? 'low quality' : '...';
                        return (
                          <div key={i} className={`py-0.5 flex justify-between ${isWinner ? 'text-green-400 font-semibold' : r.status === 'error' ? 'text-red-400' : 'text-slate-300'}`}>
                            <span>{isWinner ? '★ ' : '  '}{r.provider}/{r.model}</span>
                            <span className="ml-2 tabular-nums">{timeStr}</span>
                          </div>
                        );
                      })}
                    <div className="mt-1 pt-1 border-t border-slate-600 text-slate-400">
                      ★ = winner (fastest quality response)
                    </div>
                  </div>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

const ChatInterface: React.FC<ChatInterfaceProps> = ({ incomingText, currentBookId, currentChapter, currentVerses, onResearchSaved, onNavigate, onSearchReference, vibeClassName }) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [researchToSave, setResearchToSave] = useState<{ message: ChatMessage; side: 'zh' | 'en' } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savedMessageTimestamps, setSavedMessageTimestamps] = useState<Set<number>>(new Set());
  const [input, setInput] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [webSearchProvider, setWebSearchProvider] = useState<string>(() => {
    return localStorage.getItem('webSearchProvider') || 'off';
  });
  const webSearchEnabled = webSearchProvider !== 'off';

  // Toast notifications
  const toast = useToast();
  const [imageAttachment, setImageAttachment] = useState<{ data: string; mimeType: string } | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showStudio, setShowStudio] = useState(false);
  const [vSplitOffset, setVSplitOffset] = useState<number>(LAYOUT.DEFAULT_SPLIT_OFFSET); // Default to 100% - show only conversation, hide English panel
  const [isResizing, setIsResizing] = useState(false);
  const [speakingMsgIndex, setSpeakingMsgIndex] = useState<{zh?: number | null, en?: number | null}>({});
  const [studioConfig, setStudioConfig] = useState<{ aspect: AspectRatio; size: ImageSize; type: 'image' | 'video' }>({
    aspect: '1:1',
    size: '1K',
    type: 'image'
  });
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const [currentProvider, setCurrentProvider] = useState(aiService.getCurrentProvider());
  const [activeProviderLabel, setActiveProviderLabel] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    selectedText: string;
  } | null>(null);
  const savedSelectionRange = useRef<Range | null>(null);
  const [quotedText, setQuotedText] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const switchingThreadRef = useRef(false);
  const [showThreadList, setShowThreadList] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const zhScrollRef = useRef<HTMLDivElement>(null);
  const enScrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastPayloadId = useRef<number>(-1);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Memoize computed values to prevent unnecessary recalculations
  const hasMessages = useMemo(() => messages.length > 0, [messages]);
  
  const lastMessage = useMemo(() => {
    return messages[messages.length - 1];
  }, [messages]);
  
  const isWaitingForResponse = useMemo(() => {
    return isTyping || isThinking;
  }, [isTyping, isThinking]);
  
  // Memoize callbacks to prevent unnecessary re-renders
  const handleProviderChange = useCallback((provider: aiService.AIProvider) => {
    setCurrentProvider(provider);
    aiService.setProvider(provider);
  }, []);

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

  const handleTextSelection = (selectedText: string, position: { x: number; y: number }) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      savedSelectionRange.current = selection.getRangeAt(0).cloneRange();
    }
    setContextMenu({ selectedText, position });
  };

  // Restore text selection after context menu renders
  useEffect(() => {
    if (contextMenu && savedSelectionRange.current) {
      const range = savedSelectionRange.current;
      // Double rAF ensures we restore after React commit AND browser paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const selection = window.getSelection();
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
        });
      });
    }
  }, [contextMenu]);

  const handleContextMenuAction = (action: 'search' | 'copy') => {
    if (!contextMenu) return;
    
    switch (action) {
      case 'search':
        if (onSearchReference) {
          onSearchReference(contextMenu.selectedText.trim());
        }
        break;
      case 'copy':
        navigator.clipboard.writeText(contextMenu.selectedText);
        break;
    }
    
    savedSelectionRange.current = null;
    setContextMenu(null);
  };

  const checkScrollPosition = useCallback(() => {
    const el = zhScrollRef.current || enScrollRef.current;
    if (el) {
      const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 200);
    }
  }, []);

  const scrollToBottom = useCallback(() => {
    if (zhScrollRef.current) {
      zhScrollRef.current.scrollTo({ top: zhScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
    if (enScrollRef.current) {
      enScrollRef.current.scrollTo({ top: enScrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, []);

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
    }, TIMING.SCROLL_RETRY_MS);
    return () => clearTimeout(scrollTimeout);
  }, [messages, isTyping]);

  // Cleanup: abort any in-flight requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // --- Chat persistence: save whenever messages change ---
  const lastSavedRef = useRef<string>('');

  // Key format must match the one computed in the save effect below; mismatches
  // cause spurious saves that bump lastModified and reorder the thread list.
  const makeSavedKey = (msgs: ChatMessage[]): string => {
    const lastTs = msgs.length > 0 ? msgs[msgs.length - 1].timestamp ?? 0 : 0;
    return `${msgs.length}-${lastTs}`;
  };

  // --- Chat persistence: load/create thread when chapter changes ---
  useEffect(() => {
    if (!currentBookId || currentChapter == null) return;
    let cancelled = false;
    switchingThreadRef.current = true;
    findChapterThread(currentBookId, currentChapter).then(async thread => {
      if (cancelled) return;
      if (thread) {
        // Existing thread found — load its messages
        const saved = await loadThreadMessages(thread.id);
        if (cancelled) return;
        lastSavedRef.current = makeSavedKey(saved);
        setActiveThreadId(thread.id);
        setMessages(saved);
      } else {
        // No thread for this chapter — just clear the chat (don't create one yet)
        lastSavedRef.current = makeSavedKey([]);
        setActiveThreadId(null);
        setMessages([]);
      }
      switchingThreadRef.current = false;
    });
    // Re-read from IDB when another device syncs chat data
    const onSynced = () => {
      if (!cancelled && activeThreadId) {
        loadThreadMessages(activeThreadId).then(saved => {
          if (!cancelled) setMessages(saved);
        });
      }
    };
    window.addEventListener('chatHistory-synced', onSynced);
    return () => { cancelled = true; switchingThreadRef.current = false; window.removeEventListener('chatHistory-synced', onSynced); };
  }, [currentBookId, currentChapter]); // Don't include activeThreadId — causes race when selecting threads

  useEffect(() => {
    if (!activeThreadId || switchingThreadRef.current) return;
    const lastTs = messages.length > 0 ? messages[messages.length - 1].timestamp ?? 0 : 0;
    const key = `${messages.length}-${lastTs}`;
    if (key === lastSavedRef.current) return;
    // Debounce save to avoid race conditions on mobile thread switching
    const timeout = setTimeout(() => {
      if (switchingThreadRef.current) return;
      lastSavedRef.current = key;
      saveThreadMessages(activeThreadId, messages);
    }, 100);
    return () => clearTimeout(timeout);
  }, [messages, activeThreadId]);

  // --- Quote handler ---
  const handleQuote = useCallback((text: string) => {
    const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
    setQuotedText(truncated);
  }, []);

  // --- Clear chat handler ---
  const handleClearChat = useCallback(async () => {
    setMessages([]);
    setQuotedText(null);
    if (activeThreadId) {
      await saveThreadMessages(activeThreadId, []);
    }
  }, [activeThreadId]);

  // --- Delete a message pair (user + assistant) ---
  const handleDeleteMessagePair = useCallback((idx: number) => {
    setMessages(prev => {
      const msg = prev[idx];
      if (!msg) return prev;

      let startIdx: number;
      let endIdx: number;

      if (msg.role === 'user') {
        startIdx = idx;
        endIdx = (idx + 1 < prev.length && prev[idx + 1].role === 'assistant') ? idx + 2 : idx + 1;
      } else {
        startIdx = (idx - 1 >= 0 && prev[idx - 1].role === 'user') ? idx - 1 : idx;
        endIdx = idx + 1;
      }

      return [...prev.slice(0, startIdx), ...prev.slice(endIdx)];
    });
  }, []);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImage(file);
      setImageAttachment({ data: `data:${compressed.mimeType};base64,${compressed.base64}`, mimeType: compressed.mimeType });
    } catch (err) {
      // Fallback: read as data URL directly without compression
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setImageAttachment({ data, mimeType: file.type || 'image/jpeg' });
      };
      reader.readAsDataURL(file);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, []);

  const openWebcam = useCallback(async () => {
    setShowImageMenu(false);
    setShowWebcam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      webcamStreamRef.current = stream;
      if (webcamVideoRef.current) {
        webcamVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      // silently handle — camera denied
      setShowWebcam(false);
    }
  }, []);

  const captureWebcam = useCallback(async () => {
    const video = webcamVideoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', IMAGE.THUMBNAIL_QUALITY);
    const compressed = await compressImageFromUrl(dataUrl);
    setImageAttachment({ data: `data:${compressed.mimeType};base64,${compressed.base64}`, mimeType: compressed.mimeType });
    closeWebcam();
  }, []);

  const closeWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    setShowWebcam(false);
  }, []);

  const handleSend = async () => {
    if ((!input.trim() && !imageAttachment) || isTyping) return;

    // Create thread on first message if none exists
    if (!activeThreadId && currentBookId && currentChapter != null) {
      const thread = await getOrCreateChapterThread(currentBookId, currentChapter);
      setActiveThreadId(thread.id);
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Prepend quoted text to message content if present
    const quotePrefix = quotedText ? '> ' + quotedText + '\n\n' : '';
    const messageContent = quotePrefix + (input || (imageAttachment ? '[Image attached]' : ''));

    const userMessage: ChatMessage = {
      role: 'user',
      content: messageContent,
      timestamp: new Date(),
      ...(imageAttachment ? { type: 'image' as const, mediaUrl: imageAttachment.data } : {}),
    };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = quotePrefix + input;
    const currentImage = imageAttachment;
    setInput('');
    setImageAttachment(null);
    setQuotedText(null);
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
    }, TIMING.SHORT_DELAY_MS);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    let assistantMessage: ChatMessage | null = null;
    try {
      // Pause background Bible download while AI is active
      backgroundBibleDownload.notifyApiActivity();

      const history = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
      const requestStartTime = Date.now();
      // Web search mode — streaming: search results fetched, then AI synthesis streams
      if (webSearchEnabled) {
        let streamedText = '';
        let searchModel: string | undefined;
        let searchProvider: string | undefined;

        // Add placeholder
        const placeholderMsg: ChatMessage = { role: 'assistant', content: '🔍 Searching...', timestamp: new Date() };
        setMessages(prev => [...prev, placeholderMsg]);

        await aiService.streamWebSearch(
          currentInput,
          webSearchProvider as aiService.WebSearchProvider,
          history,
          { thinking: isThinking, fast: !isThinking },
          // onChunk
          (chunk: string) => {
            streamedText += chunk;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: streamedText };
              }
              return updated;
            });
          },
          // onDone
          (model?: string, provider?: string) => {
            searchModel = model;
            searchProvider = provider;
          },
          // onError
          (error: Error) => { throw error; },
        );

        const providerLabel = searchProvider || webSearchProvider;
        assistantMessage = {
          role: 'assistant',
          content: streamedText || "我无法生成回应。",
          model: `${providerLabel} · web search`,
          timestamp: new Date(),
          responseTime: Date.now() - requestStartTime,
        };
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = assistantMessage!;
          return updated;
        });
        localStorage.setItem('lastUsedModel', searchModel || webSearchProvider);
        setActiveProviderLabel(`${providerLabel} · web search`);
        setIsTyping(false);
        abortControllerRef.current = null;
      } else {

      // Try streaming for faster perceived response (both single and race mode, no image)
      const canStream = !currentImage && aiService.streamViaEdgeFunction && localStorage.getItem('useServerAI') !== 'false';

      if (canStream) {
        // Streaming path — user sees tokens as they arrive
        let streamedText = '';
        let streamModel: string | undefined;
        let streamProvider: string | undefined;
        let racePool: any;

        // Add placeholder assistant message
        const placeholderMsg: ChatMessage = { role: 'assistant', content: '', timestamp: new Date() };
        setMessages(prev => [...prev, placeholderMsg]);

        await aiService.streamViaEdgeFunction(
          currentInput,
          history,
          { thinking: isThinking, search: true, fast: !isThinking },
          // onChunk
          (chunk: string) => {
            streamedText += chunk;
            setMessages(prev => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last?.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: streamedText };
              }
              return updated;
            });
          },
          // onDone
          (model?: string, provider?: string, pool?: any[]) => {
            streamModel = model;
            streamProvider = provider;
            if (pool) racePool = pool;
          },
          // onError — fall through to non-streaming
          (error: Error) => { throw error; },
        );

        if (streamProvider) {
          setActiveProviderLabel(streamModel ? `${streamProvider} · ${streamModel}` : streamProvider);
        }

        assistantMessage = {
          role: 'assistant',
          content: streamedText || "我无法生成回应。",
          model: streamModel,
          timestamp: new Date(),
          responseTime: Date.now() - requestStartTime,
          racePool,
        };

        // Replace placeholder with final message
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = assistantMessage!;
          return updated;
        });

        if (streamModel) localStorage.setItem('lastUsedModel', streamModel);

      } else {
        // Non-streaming path (image attached, or server AI off)
        const response = await aiService.chatWithAI(currentInput, history, {
          thinking: isThinking,
          search: true,
          fast: !isThinking,
          ...(currentImage ? { image: currentImage } : {}),
        });

        // Extract response text and model info
        const responseObj = typeof response === 'string' ? null : response;
        const responseText = typeof response === 'string' ? response : (response.text || "我无法生成回应。");
        const modelUsed = responseObj?.model;
        const providerUsed = responseObj && 'provider' in responseObj ? (responseObj as any).provider : null;

        // Update header if provider changed (e.g. fallback)
        if (providerUsed) {
          setActiveProviderLabel(modelUsed ? `${providerUsed} · ${modelUsed}` : providerUsed);
        } else if (modelUsed) {
          setActiveProviderLabel(null);
        }
        const isGeminiResponse = responseObj && 'candidates' in responseObj;
        const groundingChunks = isGeminiResponse ? ((responseObj as any).candidates?.[0] as any)?.groundingMetadata?.groundingChunks : undefined;
        const references = Array.isArray(groundingChunks)
          ? (groundingChunks as GroundingChunk[]).map((chunk) => ({ title: chunk.web?.title || '参考资料', uri: chunk.web?.uri || '' })).filter((c) => c.uri)
          : undefined;

        const racePool = responseObj && 'racePool' in responseObj ? (responseObj as any).racePool : undefined;

        assistantMessage = {
          role: 'assistant',
          content: responseText,
          model: modelUsed,
          timestamp: new Date(),
          responseTime: Date.now() - requestStartTime,
          racePool,
          references: references
        };

        setMessages(prev => [...prev, assistantMessage!]);

        if (modelUsed) localStorage.setItem('lastUsedModel', modelUsed);
      }
      } // end else (non-webSearch)
    } catch (error: any) {
      // Don't show error message if request was aborted intentionally
      if (error?.name !== 'AbortError') {
        const errorDetail = error?.message || error?.status || String(error);
        setMessages(prev => {
          // Remove placeholder if it exists
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) {
            return [...prev.slice(0, -1), { role: 'assistant' as const, content: `连接失败：${errorDetail}\nConnection failed. Please check your API key and try again.`, timestamp: new Date() }];
          }
          return [...prev, { role: 'assistant' as const, content: `连接失败：${errorDetail}\nConnection failed. Please check your API key and try again.`, timestamp: new Date() }];
        });
        return;
      }
    } finally {
      setIsTyping(false);
      abortControllerRef.current = null;
    }

    // Auto-save research using new service
    if (assistantMessage && autoSaveResearchService.isAutoSaveEnabled()) {
      try {
        // Add default question if image was uploaded without text
        const finalQuery = currentInput.trim() || (currentImage ? 'Describe the attached picture' : '');
        
        const result = await autoSaveResearchService.saveAIResearch({
          message: assistantMessage,
          query: finalQuery,
          bookId: currentBookId,
          chapter: currentChapter,
          verses: currentVerses,
          aiProvider: currentProvider,
          aiModel: aiService.getCurrentModel() ?? undefined,
          imageData: currentImage?.data,
          imageMimeType: currentImage?.mimeType,
        });

        if (result.success) {
          // Mark message as saved
          setSavedMessageTimestamps(prev => new Set([...prev, assistantMessage.timestamp.getTime()]));
          
          // Show success toast
          toast.showSuccess(
            `AI research saved (${result.savedCount} ${result.savedCount === 1 ? 'note' : 'notes'})`,
            TIMING.TOAST_SUCCESS_MS
          );
          
          // Notify parent component
          if (onResearchSaved) {
            onResearchSaved();
          }
        } else if (result.error && !result.error.includes('already been saved')) {
          // Show error toast only if it's not a duplicate
          toast.showError(`Failed to save research: ${result.error}`, 4000);
        }
      } catch (error) {
        // TODO: use error reporting service
        toast.showError('Failed to auto-save research', TIMING.TOAST_ERROR_MS);
      }
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
        const url = await geminiService.generateVideo(input, studioConfig.aspect as '16:9' | '9:16');
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
    } catch (err) { /* silently handle */ } finally { setIsTyping(false); }
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

  const saveResearchEntry = async (message: ChatMessage, side: 'zh' | 'en', bookId: string, chapter: number, verses: number[], tags: string[], queryOverride?: string) => {
    const parsed = parseMessage(message.content, message.role);
    const content = side === 'zh' ? parsed.zh : parsed.en;
    let query: string;
    if (queryOverride) {
      query = queryOverride;
    } else {
      const messageIndex = messages.findIndex(m => m === message);
      const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
      query = userMessage?.role === 'user' ? userMessage.content : 'AI Research';
    }

    await verseDataStorage.addAIResearch(bookId, chapter, verses, { query, response: content, tags });
    setSavedMessageTimestamps(prev => new Set([...prev, message.timestamp.getTime()]));
    if (onResearchSaved) onResearchSaved();
  };

  const handleSaveResearch = async (bookId: string, chapter: number, verses: number[], tags: string[]) => {
    if (!researchToSave) return;
    await saveResearchEntry(researchToSave.message, researchToSave.side, bookId, chapter, verses, tags);
    setShowSaveModal(false);
    setResearchToSave(null);
  };

  const resizeRafRef = useRef(0);
  const resize = useCallback((e: MouseEvent | TouchEvent) => {
    if (isResizing && containerRef.current) {
      const clientX = 'clientX' in e ? e.clientX : e.touches[0]?.clientX || 0;
      // Throttle to one update per animation frame to prevent layout thrashing
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const percentage = ((clientX - rect.left) / rect.width) * 100;
        if (percentage >= 0 && percentage <= 100) setVSplitOffset(percentage);
      });
    }
  }, [isResizing]);

  useEffect(() => {
    if (!isResizing) return;
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    window.addEventListener('touchmove', resize);
    window.addEventListener('touchend', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
      window.removeEventListener('touchmove', resize);
      window.removeEventListener('touchend', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

  return (
    <div className={`h-full flex flex-col relative bg-slate-50 ${vibeClassName || ''}`} ref={containerRef}>
      {/* AI Provider Header */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-b border-indigo-100 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-semibold text-slate-700">
            AI Provider: <span className="text-indigo-600">
              {activeProviderLabel
                ? activeProviderLabel
                : currentProvider === 'claude' ? 'Claude' :
                  currentProvider === 'openai' ? 'ChatGPT' :
                  currentProvider === 'kimi' ? 'Kimi' :
                  currentProvider === 'openrouter' ? `OpenRouter · ${aiService.getCurrentModel() ?? 'Llama 3.3 70B'}` :
                  'Gemini'}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThreadList(v => !v)}
            className={`text-xs px-3 py-1 bg-white border rounded-lg transition-colors flex items-center gap-1.5 ${
              showThreadList ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-200 hover:bg-slate-50 text-slate-600'
            }`}
            title="Chat history"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            History
          </button>
          {hasMessages && (
            <button
              onClick={handleClearChat}
              className="text-xs px-3 py-1 bg-white border border-red-200 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 transition-colors flex items-center gap-1.5"
              title="Clear chat history"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clear
            </button>
          )}
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
      </div>

      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Thread list sidebar */}
        {showThreadList && (
          <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white overflow-hidden">
            <ChatThreadList
              activeThreadId={activeThreadId}
              onSelectThread={async (threadId) => {
                if (threadId === activeThreadId) return;
                switchingThreadRef.current = true;
                try {
                  const saved = await loadThreadMessages(threadId);
                  lastSavedRef.current = makeSavedKey(saved);
                  setActiveThreadId(threadId);
                  setMessages(saved);
                } catch (e) {
                  console.error('[ChatInterface] Failed to load thread:', e);
                  setActiveThreadId(threadId);
                  setMessages([]);
                } finally {
                  // Delay clearing the flag so the save useEffect skips this render cycle
                  requestAnimationFrame(() => {
                    switchingThreadRef.current = false;
                  });
                }
              }}
              onNewThread={(thread) => {
                lastSavedRef.current = JSON.stringify([]);
                setActiveThreadId(thread.id);
                setMessages([]);
              }}
              bookId={currentBookId}
              chapter={currentChapter}
            />
          </div>
        )}

        {/* Chinese Side */}
        <div 
          ref={zhScrollRef}
          onScroll={() => { syncScroll('zh'); checkScrollPosition(); }}
          className="overflow-y-auto p-4 space-y-6 border-r border-slate-200 bg-white"
          style={{
            flexGrow: vSplitOffset >= LAYOUT.DEFAULT_SPLIT_OFFSET ? 1 : 0,
            flexShrink: vSplitOffset >= LAYOUT.DEFAULT_SPLIT_OFFSET ? 1 : 0,
            flexBasis: vSplitOffset >= LAYOUT.DEFAULT_SPLIT_OFFSET ? 'calc(100% - 20px)' : vSplitOffset <= LAYOUT.ENGLISH_FULL_SPLIT_OFFSET ? '0%' : `calc(${vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset <= LAYOUT.ENGLISH_FULL_SPLIT_OFFSET ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
            中文解读 (Scholar Research)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble
              key={`${activeThreadId}-${idx}-${m.timestamp.getTime()}`}
              m={m}
              side="zh"
              isSpeaking={speakingMsgIndex.zh === idx}
              onSpeak={(c) => handleSpeak(c, idx, 'zh')}
              onStop={() => handleStop('zh')}
              onSaveResearch={onSaveResearch}
              isSaved={savedMessageTimestamps.has(m.timestamp.getTime())}
              onNavigate={onNavigate}
              currentBookId={currentBookId}
              onTextSelection={handleTextSelection}
              onQuote={handleQuote}
              onDelete={() => handleDeleteMessagePair(idx)}
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
                setVSplitOffset(vSplitOffset > LAYOUT.CENTRE_SPLIT_OFFSET ? LAYOUT.CENTRE_SPLIT_OFFSET : LAYOUT.ENGLISH_FULL_SPLIT_OFFSET);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset > LAYOUT.CENTRE_SPLIT_OFFSET ? "Center divider" : "Maximize English"}
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
                setVSplitOffset(vSplitOffset < LAYOUT.CENTRE_SPLIT_OFFSET ? LAYOUT.CENTRE_SPLIT_OFFSET : LAYOUT.DEFAULT_SPLIT_OFFSET);
              }}
              className="p-px hover:bg-slate-200 rounded transition-colors flex items-center justify-center group"
              title={vSplitOffset < LAYOUT.CENTRE_SPLIT_OFFSET ? "Center divider" : "Maximize Chinese"}
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
          onScroll={() => { syncScroll('en'); checkScrollPosition(); }}
          className="overflow-y-auto p-4 space-y-6 bg-slate-50/50"
          style={{
            flexGrow: vSplitOffset <= LAYOUT.ENGLISH_FULL_SPLIT_OFFSET ? 1 : 0,
            flexShrink: vSplitOffset <= LAYOUT.ENGLISH_FULL_SPLIT_OFFSET ? 1 : 0,
            flexBasis: vSplitOffset <= LAYOUT.ENGLISH_FULL_SPLIT_OFFSET ? 'calc(100% - 20px)' : vSplitOffset >= LAYOUT.DEFAULT_SPLIT_OFFSET ? '0%' : `calc(${100 - vSplitOffset}% - 10px)`,
            minWidth: 0,
            display: vSplitOffset >= LAYOUT.DEFAULT_SPLIT_OFFSET ? 'none' : 'block'
          }}
        >
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 py-2 flex items-center gap-2">
            <span className="w-2 h-2 bg-slate-300 rounded-full"></span>
            English Commentary (Academic)
          </div>
          {messages.map((m, idx) => (
            <MessageBubble
              key={`${activeThreadId}-${idx}-${m.timestamp.getTime()}`}
              m={m}
              side="en"
              isSpeaking={speakingMsgIndex.en === idx}
              onSpeak={(c) => handleSpeak(c, idx, 'en')}
              onStop={() => handleStop('en')}
              onSaveResearch={onSaveResearch}
              isSaved={savedMessageTimestamps.has(m.timestamp.getTime())}
              onNavigate={onNavigate}
              currentBookId={currentBookId}
              onTextSelection={handleTextSelection}
              onQuote={handleQuote}
              onDelete={() => handleDeleteMessagePair(idx)}
            />
          ))}
        </div>

        {/* Scroll to bottom button */}
        {showScrollToBottom && messages.length > 0 && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 bg-white/90 backdrop-blur-sm border border-slate-300 shadow-lg rounded-full p-2 hover:bg-indigo-50 hover:border-indigo-300 transition-all"
            title="Scroll to latest"
          >
            <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          </button>
        )}
      </div>

      {/* Input area - relative position needed for z-index to work */}
      <div className="p-4 bg-white border-t border-slate-200 z-10 shadow-lg relative flex-shrink-0">
        <div className="max-w-5xl mx-auto flex flex-col gap-2">
          <div className="relative">
            {/* Image preview */}
            {imageAttachment && (
              <div className="mb-2 relative inline-block">
                <img src={imageAttachment.data} alt="Attachment" className="h-20 rounded-lg border border-slate-200 object-cover" />
                <button
                  onClick={() => setImageAttachment(null)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs shadow-md hover:bg-red-600"
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            )}
            <div className={`rounded-xl border bg-slate-50 shadow-inner transition-all ${quotedText ? 'border-indigo-300 ring-2 ring-indigo-500/20' : 'border-slate-200'} focus-within:ring-2 focus-within:ring-indigo-500`}>
              {/* Quoted text inside input box */}
              {quotedText && (
                <div className="flex items-start gap-2 border-b border-slate-200 px-3 pt-2 pb-1.5">
                  <div className="flex-1 text-xs text-slate-600 italic line-clamp-2 overflow-hidden border-l-3 border-indigo-400 pl-2">
                    <span className="font-semibold text-indigo-500 mr-1">Quote:</span>
                    {quotedText}
                  </div>
                  <button
                    onClick={() => setQuotedText(null)}
                    className="shrink-0 w-5 h-5 text-slate-400 hover:text-red-500 transition-colors flex items-center justify-center"
                    title="Remove quote"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
              <textarea
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="点击上方选择经文，或在此直接输入问题..."
                className="w-full p-3 pr-24 bg-transparent resize-none min-h-[80px] focus:outline-none text-sm"
                rows={3}
              />
            </div>
            {/* Off-screen file input for touch devices (iOS Safari + Chrome compatible) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ position: 'fixed', top: '-10000px', left: '-10000px' }}
            />
            {/* Image attach: on mobile, button triggers off-screen input (OS handles camera). On desktop/laptop, show menu with webcam + file picker. */}
            {/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent)) ? (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isTyping}
                className={`absolute right-14 bottom-2 p-2.5 rounded-xl transition-all active:scale-95 ${
                  isTyping ? 'opacity-30' : 'text-slate-400 hover:text-indigo-600'
                }`}
                title="Attach image 附加图片"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            ) : (
              <div className="absolute right-14 bottom-2">
                <button
                  onClick={() => setShowImageMenu(!showImageMenu)}
                  disabled={isTyping}
                  className={`p-2.5 rounded-xl transition-all active:scale-95 ${
                    isTyping ? 'opacity-30' : 'text-slate-400 hover:text-indigo-600'
                  }`}
                  title="Attach image 附加图片"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </button>
                {showImageMenu && (
                  <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowImageMenu(false)} />
                  <div className="absolute bottom-12 right-0 bg-white rounded-xl shadow-xl border border-slate-200 py-1 w-40 z-50">
                    <button
                      onClick={openWebcam}
                      className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-indigo-50 flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Take Photo
                    </button>
                    <label className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-indigo-50 flex items-center gap-2 cursor-pointer">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Choose Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => { setShowImageMenu(false); handleImageSelect(e); }}
                        className="hidden"
                      />
                    </label>
                  </div>
                  </>
                )}
              </div>
            )}
            {/* Send button */}
            <button onClick={handleSend} disabled={(!input.trim() && !imageAttachment) || isTyping} className="absolute right-2 bottom-2 p-2.5 bg-indigo-600 text-white rounded-xl shadow-md disabled:bg-slate-300 transition-all active:scale-95">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            </button>
          </div>
          {/* Thinking mode & Web Search toggles */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsThinking(!isThinking)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                isThinking
                  ? 'bg-indigo-100 text-indigo-700 border border-indigo-300'
                  : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {isThinking ? '深度思考 On' : '深度思考 Off'}
            </button>
            <div className="flex items-center gap-1.5">
              <svg className={`w-3.5 h-3.5 ${webSearchEnabled ? 'text-emerald-600' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <select
                value={webSearchProvider}
                onChange={(e) => {
                  const val = e.target.value;
                  setWebSearchProvider(val);
                  localStorage.setItem('webSearchProvider', val);
                }}
                className={`text-xs font-medium rounded-lg px-2 py-1 border transition-all appearance-none cursor-pointer ${
                  webSearchEnabled
                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                    : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                }`}
                title="Select web search provider"
              >
                <option value="off">联网搜索 Off</option>
                {aiService.isWebSearchProviderConfigured('perplexity') && <option value="perplexity">Perplexity</option>}
                {aiService.isWebSearchProviderConfigured('tavily') && <option value="tavily">Tavily</option>}
                {aiService.isWebSearchProviderConfigured('firecrawl') && <option value="firecrawl">Firecrawl</option>}
                {aiService.isWebSearchProviderConfigured('exa') && <option value="exa">Exa</option>}
                {aiService.isWebSearchProviderConfigured('brave') && <option value="brave">Brave</option>}
              </select>
            </div>
            <span className="text-[10px] text-slate-400">
              {webSearchEnabled
                ? `${webSearchProvider.charAt(0).toUpperCase() + webSearchProvider.slice(1)} · web search with citations`
                : isThinking ? 'Sonnet · slower, deeper analysis' : 'Haiku · fast responses'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Webcam capture modal */}
      {showWebcam && (
        <div className="fixed inset-0 bg-black/70 z-[80] flex flex-col items-center justify-center">
          <div className="bg-black rounded-2xl overflow-hidden shadow-2xl max-w-lg w-full mx-4">
            <video
              ref={webcamVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video object-cover"
            />
            <div className="flex items-center justify-center gap-6 p-4 bg-slate-900">
              <button
                onClick={closeWebcam}
                className="w-12 h-12 rounded-full bg-slate-700 text-white flex items-center justify-center hover:bg-slate-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={captureWebcam}
                className="w-16 h-16 rounded-full bg-white border-4 border-slate-300 hover:border-indigo-400 transition-colors flex items-center justify-center"
              >
                <div className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 transition-colors" />
              </button>
              <div className="w-12" /> {/* Spacer for centering */}
            </div>
          </div>
        </div>
      )}


      {showSaveModal && researchToSave && (() => {
        const parsed = parseMessage(researchToSave.message.content, researchToSave.message.role);
        const content = researchToSave.side === 'zh' ? parsed.zh : parsed.en;
        const messageIndex = messages.findIndex(m => m === researchToSave.message);
        const userMessage = messageIndex > 0 ? messages[messageIndex - 1] : null;
        const query = userMessage?.role === 'user' ? userMessage.content : 'AI Research';
        
        // Extract image from user message if present
        const imageUrl = userMessage?.type === 'image' ? userMessage.mediaUrl : undefined;
        let imageData: string | undefined;
        let imageMimeType: string | undefined;
        
        if (imageUrl) {
          // Extract base64 data and mime type from data URL
          const match = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            imageMimeType = match[1];
            imageData = match[2];
          }
        }
        
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
            imageData={imageData}
            imageMimeType={imageMimeType}
          />
        );
      })()}

      <AIProviderSettings
        isOpen={showProviderSettings}
        onClose={() => {
          setShowProviderSettings(false);
          setCurrentProvider(aiService.getCurrentProvider());
          setActiveProviderLabel(null);
        }}
      />

      {/* Context Menu for Text Selection */}
      {contextMenu && (
        <div
          className="fixed bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1"
          style={{
            left: `${contextMenu.position.x}px`,
            top: `${contextMenu.position.y}px`,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => handleContextMenuAction('search')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            搜索经文 Search Reference
          </button>
          <button
            onClick={() => handleContextMenuAction('copy')}
            className="w-full px-4 py-2 text-left text-sm hover:bg-indigo-50 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            复制 Copy
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full px-4 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 transition-colors"
          >
            取消 Cancel
          </button>
        </div>
      )}

      {/* Click outside to close context menu */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-40"
          onMouseDown={(e) => {
            e.preventDefault();
            savedSelectionRange.current = null;
            setContextMenu(null);
          }}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer
        messages={toast.messages}
        onDismiss={toast.dismissToast}
        position="top-right"
      />
    </div>
  );
};

export default ChatInterface;
