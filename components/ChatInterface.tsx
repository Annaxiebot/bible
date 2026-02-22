import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { ChatMessage, AspectRatio, ImageSize } from '../types';
import * as aiService from '../services/aiProvider';
import * as geminiService from '../services/gemini';
import AIProviderSettings from './AIProviderSettings';
import SaveResearchModal from './SaveResearchModal';
import { BIBLE_BOOKS, CHINESE_ABBREV_TO_BOOK_ID } from '../constants';
import { BOOK_ID_TO_CHINESE_NAME } from '../services/bibleBookData';
import { verseDataStorage } from '../services/verseDataStorage';
import { AIResearchEntry } from '../types/verseData';

interface ChatInterfaceProps {
  incomingText?: { text: string; id: number; clearChat?: boolean } | null;
  currentBookId?: string;
  currentChapter?: number;
  onResearchSaved?: () => void;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
  vibeClassName?: string;
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

// Use centralized book data
const CHINESE_BOOK_MAP = CHINESE_ABBREV_TO_BOOK_ID;

// English book name aliases (common variations AI models use)
const ENGLISH_BOOK_ALIASES: { [key: string]: string } = {
  'Psalm': 'Psalms',
  'Song of Solomon': 'Song of Songs',
  'Revelation': 'Revelations',
  'Revelations': 'Revelation',
};

// Create reverse mapping: ID -> English
const BOOK_ID_TO_ENGLISH: { [key: string]: string } = {};
BIBLE_BOOKS.forEach(book => {
  const parts = book.name.split(' ');
  BOOK_ID_TO_ENGLISH[book.id] = parts.slice(1).join(' ');
});

const parseBibleReference = (text: string): BibleRef | null => {
  // First try to parse as Chinese reference with chapter:verse
  const chineseBookNames = Object.keys(CHINESE_BOOK_MAP).sort((a, b) => b.length - a.length).join('|');
  const chinesePattern = new RegExp(`《?(${chineseBookNames})》?\\s*(\\d+)[:：](\\d+)(?:-(\\d+))?`);
  const chineseMatch = text.match(chinesePattern);
  
  if (chineseMatch) {
    const bookName = chineseMatch[1];
    const chapter = parseInt(chineseMatch[2]);
    const verseStart = parseInt(chineseMatch[3]);
    const verseEnd = chineseMatch[4] ? parseInt(chineseMatch[4]) : undefined;
    
    const bookId = CHINESE_BOOK_MAP[bookName];
    if (!bookId) return null;
    
    const verses: number[] = [];
    if (verseEnd) {
      for (let v = verseStart; v <= verseEnd; v++) {
        verses.push(v);
      }
    } else {
      verses.push(verseStart);
    }
    
    return {
      bookId,
      chapter,
      verses
    };
  }
  
  // Try to parse Chinese chapter-only reference (e.g., "希伯来书95章" or "诗篇95篇")
  const chineseChapterPattern = new RegExp(`《?(${chineseBookNames})》?\\s*(\\d+)[章篇]`);
  const chineseChapterMatch = text.match(chineseChapterPattern);
  
  if (chineseChapterMatch) {
    const bookName = chineseChapterMatch[1];
    const chapter = parseInt(chineseChapterMatch[2]);
    
    const bookId = CHINESE_BOOK_MAP[bookName];
    if (!bookId) return null;
    
    return {
      bookId,
      chapter
      // No verses specified - chapter-only reference
    };
  }
  
  // Then try to parse as English reference
  // Extract only English names from BIBLE_BOOKS, plus aliases
  const englishNames = BIBLE_BOOKS.map(b => {
    const parts = b.name.split(' ');
    return parts.slice(1).join(' ');
  });
  const allEnglishNames = [...englishNames, ...Object.keys(ENGLISH_BOOK_ALIASES)];
  const bookPattern = `(${allEnglishNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`;

  // Pattern: "Book chapter:verse" or "Book chapter:verse-verse"
  const refPattern = new RegExp(`${bookPattern}\\s+(\\d+)[:：](\\d+)(?:-(\\d+))?`, 'i');
  const match = text.match(refPattern);

  if (match) {
    let bookName = match[1];
    // Resolve alias to canonical name
    const alias = ENGLISH_BOOK_ALIASES[bookName] || ENGLISH_BOOK_ALIASES[bookName.charAt(0).toUpperCase() + bookName.slice(1)];
    if (alias) bookName = alias;
    const chapter = parseInt(match[2]);
    const verseStart = parseInt(match[3]);
    const verseEnd = match[4] ? parseInt(match[4]) : undefined;

    // Find book by matching English name only
    const book = BIBLE_BOOKS.find(b => {
      const parts = b.name.split(' ');
      const englishName = parts.slice(1).join(' ');
      return englishName.toLowerCase() === bookName.toLowerCase();
    });
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
    // Detect whether the original reference was in Chinese or English
    const chineseBookNames = Object.keys(CHINESE_BOOK_MAP);
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
          // TODO: Add validation for invalid chapter/verse references
          // Bible API returns 404 for non-existent chapters/verses
          // Should show user-friendly error message like "Chapter not found"
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

const processTextWithBibleRefs = (text: string, onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void, currentBookId?: string): React.ReactNode => {
  // Create patterns for both Chinese and English references
  // Escape special regex characters in book names
  const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Sort by length descending so longer names match first (创世记 before 创)
  const chineseBookNames = Object.keys(CHINESE_BOOK_MAP).sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
  // Extract only English names from BIBLE_BOOKS, plus aliases
  const englishNames = BIBLE_BOOKS.map(b => {
    const parts = b.name.split(' ');
    return parts.slice(1).join(' '); // Get everything after the first part (Chinese)
  });
  const allEnglishNames = [...englishNames, ...Object.keys(ENGLISH_BOOK_ALIASES)];
  const englishBookNames = allEnglishNames.map(escapeRegex).join('|');

  // Combined pattern that matches:
  // 1. Chinese with chapter:verse: 书名 章:节 (with optional space) - e.g., "诗篇95:11" or "创2：2"
  // 2. Chinese chapter-only: 书名 章章 (with optional space) - e.g., "希伯来书95章"
  // 3. English: Book chapter:verse (with space) - e.g., "Psalm 95:11"
  // 4. Standalone: chapter:verse (like "2:3") when in context
  // Note: [:：] matches both ASCII and fullwidth colons
  const combinedPattern = new RegExp(
    `《?(${chineseBookNames})》?\\s*\\d+[:：]\\d+(?:-\\d+)?|《?(${chineseBookNames})》?\\s*\\d+[章篇]|(${englishBookNames})\\s+\\d+[:：]\\d+(?:-\\d+)?|(?<!\\d)\\d{1,3}[:：]\\d{1,3}(?:-\\d{1,3})?(?!\\d)`,
    'gi'
  );
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  
  while ((match = combinedPattern.exec(text)) !== null) {
    // Add text before the reference
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    
    // Check if this is a standalone chapter:verse pattern
    const matchedText = match[0];
    const isStandalone = /^\d{1,3}[:：]\d{1,3}(?:-\d{1,3})?$/.test(matchedText);
    
    if (isStandalone && currentBookId) {
      // For standalone patterns, use the current book context
      const currentBook = BIBLE_BOOKS.find(b => b.id === currentBookId);
      if (currentBook) {
        const chineseName = BOOK_ID_TO_CHINESE_NAME[currentBookId];
        const displayRef = `${chineseName}${matchedText}`;
        parts.push(
          <BibleLink key={match.index} onNavigate={onNavigate}>
            {displayRef}
          </BibleLink>
        );
      } else {
        // No book context, just show as plain text
        parts.push(matchedText);
      }
    } else {
      // Add the clickable reference (full book name included)
      parts.push(
        <BibleLink key={match.index} onNavigate={onNavigate}>
          {matchedText}
        </BibleLink>
      );
    }
    
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
  currentBookId?: string;
  onTextSelection?: (selectedText: string, position: { x: number; y: number }) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ m, side, isSpeaking, onSpeak, onStop, onSaveResearch, onNavigate, currentBookId, onTextSelection }) => {
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
        className={`max-w-[95%] rounded-2xl p-4 shadow-sm border transition-all ${
          m.role === 'user' 
            ? 'bg-indigo-600 text-white border-transparent' 
            : 'bg-white text-slate-800 border-slate-200'
        }`}
        onMouseUp={m.role === 'assistant' ? handleMouseUp : undefined}
      >
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
              components={(() => {
                // Shared helper to recursively process children for Bible references
                const processChildren = (nodes: React.ReactNode): React.ReactNode => {
                  if (typeof nodes === 'string') {
                    return processTextWithBibleRefs(nodes, onNavigate, currentBookId);
                  }
                  if (Array.isArray(nodes)) {
                    return nodes.map((node, i) =>
                      <React.Fragment key={i}>{processChildren(node)}</React.Fragment>
                    );
                  }
                  // Recurse into React elements' children
                  if (React.isValidElement(nodes) && nodes.props && (nodes.props as any).children) {
                    return React.cloneElement(nodes, {}, processChildren((nodes.props as any).children));
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
                };
              })()}
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

const ChatInterface: React.FC<ChatInterfaceProps> = ({ incomingText, currentBookId, currentChapter, onResearchSaved, onNavigate, vibeClassName }) => {
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [researchToSave, setResearchToSave] = useState<{ message: ChatMessage; side: 'zh' | 'en' } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [userQuestion, setUserQuestion] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [imageAttachment, setImageAttachment] = useState<{ data: string; mimeType: string } | null>(null);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const webcamVideoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    selectedText: string;
  } | null>(null);
  
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

  const handleTextSelection = (selectedText: string, position: { x: number; y: number }) => {
    setContextMenu({ selectedText, position });
  };

  const handleContextMenuAction = (action: 'search' | 'copy') => {
    if (!contextMenu) return;
    
    switch (action) {
      case 'search':
        // Search for the selected text as a potential Bible reference
        const text = contextMenu.selectedText.trim();
        
        if (onNavigate) {
          // First, try to parse as a complete Bible reference (e.g., "诗篇95:11" or "Psalm 95:11")
          let parsed = parseBibleReference(text);
          
          // If that fails, check if it's a standalone chapter:verse pattern and use current book context
          if (!parsed && currentBookId) {
            const refPattern = /(\d{1,3}:\d{1,3}(?:-\d{1,3})?)/;
            const match = text.match(refPattern);
            if (match) {
              const currentBook = BIBLE_BOOKS.find(b => b.id === currentBookId);
              if (currentBook) {
                const chineseName = BOOK_ID_TO_CHINESE_NAME[currentBookId];
                const fullRef = `${chineseName}${match[1]}`;
                parsed = parseBibleReference(fullRef);
              }
            }
          }
          
          // Navigate if we successfully parsed a reference
          if (parsed) {
            onNavigate(parsed.bookId, parsed.chapter, parsed.verses);
          }
        }
        break;
      case 'copy':
        navigator.clipboard.writeText(contextMenu.selectedText);
        break;
    }
    
    setContextMenu(null);
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

  const compressImage = useCallback((dataUrl: string): Promise<{ data: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          // iOS Safari canvas limit: ~16MP. Scale aggressively for safety.
          const MAX_DIM = 1200;
          const MAX_BYTES = 3.5 * 1024 * 1024;
          let { width, height } = img;

          if (width > MAX_DIM || height > MAX_DIM) {
            const scale = MAX_DIM / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) { reject(new Error('Canvas context failed')); return; }
          ctx.drawImage(img, 0, 0, width, height);

          let quality = 0.8;
          let result = canvas.toDataURL('image/jpeg', quality);
          while (result.length * 0.75 > MAX_BYTES && quality > 0.2) {
            quality -= 0.1;
            result = canvas.toDataURL('image/jpeg', quality);
          }

          // Clean up canvas memory (important for iOS)
          canvas.width = 0;
          canvas.height = 0;

          resolve({ data: result, mimeType: 'image/jpeg' });
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = dataUrl;
    });
  }, []);

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Use createObjectURL for better iOS compatibility (avoids base64 memory issues)
    const objectUrl = URL.createObjectURL(file);
    try {
      const compressed = await compressImage(objectUrl);
      setImageAttachment(compressed);
    } catch (err) {
      console.error('Image processing failed:', err);
      // Fallback: read as data URL directly without compression
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = ev.target?.result as string;
        setImageAttachment({ data, mimeType: file.type || 'image/jpeg' });
      };
      reader.readAsDataURL(file);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
    // Reset input so the same file can be re-selected
    e.target.value = '';
  }, [compressImage]);

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
      console.error('Camera access denied:', err);
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const compressed = await compressImage(dataUrl);
    setImageAttachment(compressed);
    closeWebcam();
  }, [compressImage]);

  const closeWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    setShowWebcam(false);
  }, []);

  const handleSend = async () => {
    if ((!input.trim() && !imageAttachment) || isTyping) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: input || (imageAttachment ? '[Image attached]' : ''),
      timestamp: new Date(),
      ...(imageAttachment ? { type: 'image' as const, mediaUrl: imageAttachment.data } : {}),
    };
    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    const currentImage = imageAttachment;
    setInput('');
    setImageAttachment(null);
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
        fast: !isThinking,
        ...(currentImage ? { image: currentImage } : {}),
      });
      
      // Console logging for debugging AI responses
      console.log('[AI Response]', {
        timestamp: new Date().toISOString(),
        userInput: currentInput,
        responseText: response.text,
        responseLength: response.text?.length || 0,
        hasGroundingMetadata: !!response.candidates?.[0]?.groundingMetadata
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

      // Log detected Bible references in the response
      const colonPattern = /\d{1,3}:\d{1,3}(?:-\d{1,3})?/g;
      const detectedColonRefs = response.text?.match(colonPattern) || [];
      if (detectedColonRefs.length > 0) {
        console.log('[Bible References Detected]', detectedColonRefs);
      }

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error: any) {
      console.error('[AI Response Error]', error);
      const errorDetail = error?.message || error?.status || String(error);
      setMessages(prev => [...prev, { role: 'assistant', content: `连接失败：${errorDetail}\nConnection failed. Please check your API key and try again.`, timestamp: new Date() }]);
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
          <div className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-4 py-2 flex items-center gap-2">
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
              currentBookId={currentBookId}
              onTextSelection={handleTextSelection}
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
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 py-2 flex items-center gap-2">
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
              currentBookId={currentBookId}
              onTextSelection={handleTextSelection}
            />
          ))}
        </div>
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
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="点击上方选择经文，或在此直接输入问题..."
              className="w-full p-3 pr-24 rounded-xl border border-slate-200 bg-slate-50 resize-none min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm shadow-inner transition-all"
              rows={3}
            />
            {/* Off-screen file input for touch devices (iOS Safari + Chrome compatible) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              style={{ position: 'fixed', top: '-10000px', left: '-10000px' }}
            />
            {/* Image attach: on touch devices, button triggers off-screen input. On desktop, show menu with webcam + file picker. */}
            {'ontouchstart' in window || navigator.maxTouchPoints > 0 ? (
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
          {/* Thinking mode toggle */}
          <div className="flex items-center gap-2">
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
            <span className="text-[10px] text-slate-400">
              {isThinking ? 'Sonnet · slower, deeper analysis' : 'Haiku · fast responses'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Webcam capture modal */}
      {showWebcam && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col items-center justify-center">
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

      {/* Context Menu for Text Selection */}
      {contextMenu && (
        <div 
          className="fixed bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1"
          style={{
            left: `${contextMenu.position.x}px`,
            top: `${contextMenu.position.y}px`,
          }}
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
          onClick={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default ChatInterface;
