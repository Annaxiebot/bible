import React, { useState, useEffect, useRef } from 'react';
import { SelectionInfo, MediaAttachment } from '../types';
import { VerseData, PersonalNote, AIResearchEntry } from '../types/verseData';
import { verseDataStorage } from '../services/verseDataStorage';
import { useStorageUpdate } from '../hooks/useStorageUpdate';
import SimpleDrawingCanvas, { SimpleDrawingCanvasHandle } from './SimpleDrawingCanvas';
import LazyMarkdown from './LazyMarkdown';
import { downloadNote, readNoteFile } from '../services/fileSystem';
import * as aiService from '../services/gemini';
import { IMAGE, TIMING } from '../constants/appConfig';
import 'katex/dist/katex.min.css';
import { CHINESE_ABBREV_TO_BOOK_ID, BIBLE_BOOKS } from '../constants';
import { stripHTML } from '../utils/textUtils';

const _allBookNames = Object.keys(CHINESE_ABBREV_TO_BOOK_ID)
  .sort((a, b) => b.length - a.length)
  .map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const _nameGroup = _allBookNames.join('|');
const _namedRefSrc = `(?:${_nameGroup})\\s*\\d+(?:[章篇]|:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)`;
const _bareRefSrc = `(?<!\\d)\\d+:\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*`;
const _combinedRefRe = new RegExp(`${_namedRefSrc}|${_bareRefSrc}`, 'gi');

const _parseVerseList = (s: string): number[] => {
  const v: number[] = [];
  for (const seg of s.split(/[，,]\s*/)) {
    const [a, b] = seg.split('-').map(Number);
    for (let i = a; i <= (b || a); i++) v.push(i);
  }
  return v;
};

const _parseRef = (m: string, fallbackBookId?: string): { bookId: string; chapter: number; verses?: number[] } | null => {
  const vRe = new RegExp(`^(${_nameGroup})\\s*(\\d+):(\\d+(?:-\\d+)?(?:[，,]\\s*\\d+(?:-\\d+)?)*)$`, 'i');
  const cRe = new RegExp(`^(${_nameGroup})\\s*(\\d+)[章篇]$`, 'i');
  let r = m.match(vRe);
  if (r) { const id = CHINESE_ABBREV_TO_BOOK_ID[r[1]]; return id ? { bookId: id, chapter: +r[2], verses: _parseVerseList(r[3]) } : null; }
  r = m.match(cRe);
  if (r) { const id = CHINESE_ABBREV_TO_BOOK_ID[r[1]]; return id ? { bookId: id, chapter: +r[2] } : null; }
  if (fallbackBookId) {
    const br = m.match(/^(\d+):(\d+(?:-\d+)?(?:[，,]\s*\d+(?:-\d+)?)*)$/);
    if (br) return { bookId: fallbackBookId, chapter: +br[1], verses: _parseVerseList(br[2]) };
  }
  return null;
};

const _linkStyle: React.CSSProperties = { color: '#2563eb', backgroundColor: '#eff6ff', textDecoration: 'underline', textUnderlineOffset: '2px', padding: '0 3px', borderRadius: '3px', cursor: 'pointer' };

const _processText = (
  text: string,
  onNav?: (bookId: string, chapter: number, verses?: number[]) => void,
  curBookId?: string
): React.ReactNode => {
  if (!onNav || typeof text !== 'string') return text;
  const re = new RegExp(_combinedRefRe.source, 'gi');
  const parts: React.ReactNode[] = [];
  let last = 0, mt;
  while ((mt = re.exec(text)) !== null) {
    if (mt.index > last) parts.push(text.slice(last, mt.index));
    const ref = _parseRef(mt[0], curBookId);
    if (ref) {
      const txt = mt[0];
      parts.push(<a key={`r${mt.index}`} style={_linkStyle} onClick={(e) => { e.preventDefault(); onNav(ref.bookId, ref.chapter, ref.verses); }}>{txt}</a>);
    } else parts.push(mt[0]);
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : <>{parts}</>;
};

const _pc = (nodes: React.ReactNode, onNav?: (bookId: string, chapter: number, verses?: number[]) => void, curBookId?: string): React.ReactNode => {
  if (typeof nodes === 'string') return _processText(nodes, onNav, curBookId);
  if (typeof nodes === 'number') return _processText(String(nodes), onNav, curBookId);
  if (nodes == null || typeof nodes === 'boolean') return nodes;
  if (React.isValidElement(nodes)) return nodes;
  const arr = React.Children.toArray(nodes);
  if (arr.length > 0) return arr.map((n, i) => <React.Fragment key={i}>{_pc(n, onNav, curBookId)}</React.Fragment>);
  return nodes;
};

interface EnhancedNotebookProps {
  selection: SelectionInfo | null;
  onSaveNote: (id: string, content: string, skipTrigger?: boolean) => void;
  initialContent: string;
  initialTab?: TabType;
  researchUpdateTrigger?: number;
  onNavigate?: (bookId: string, chapter: number, verses?: number[]) => void;
}

type TabType = 'research' | 'notes' | 'all';
type DrawingTool = 'pen' | 'marker' | 'highlighter' | 'eraser';
type NoteMode = 'text' | 'draw' | 'overlay';

const DRAW_COLORS = ['#000000', '#007AFF', '#FF3B30', '#34C759', '#FFCC00'];

const EnhancedNotebook: React.FC<EnhancedNotebookProps> = ({
  selection,
  onSaveNote,
  initialContent,
  initialTab = 'research',
  researchUpdateTrigger: _researchUpdateTrigger = 0,
  onNavigate
}) => {
  const storageTick = useStorageUpdate();
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [verseData, setVerseData] = useState<VerseData | null>(null);
  const [personalNote, setPersonalNote] = useState<string>('');
  const [isSaved, setIsSaved] = useState(true);
  const [mode, setMode] = useState<NoteMode>('text');
  const [drawingData, setDrawingData] = useState<string>('');

  // Drawing tool state (from Notebook.tsx)
  const [drawingTool, setDrawingTool] = useState<DrawingTool>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(2);
  const [isWritingMode, setIsWritingMode] = useState(true);

  // Text-to-speech state (from Notebook.tsx)
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Camera/media state (from Notebook.tsx)
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const editorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const autoSaveTimer = useRef<number | null>(null);
  const previousSelectionIdRef = useRef<string | null>(null);
  const lastActivityTime = useRef<number>(Date.now());
  const hasInsertedTimestamp = useRef(false);
  // True while the user is actively typing — prevents storageTick from resetting innerHTML
  const isEditingRef = useRef(false);
  const editingTimeoutRef = useRef<number | null>(null);

  // File / media input refs (from Notebook.tsx)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);

  // Update active tab when initialTab prop changes
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (!selection) return;

    // Only reload data when switching to a different verse, not on every initialContent change
    if (previousSelectionIdRef.current !== selection.id) {
      previousSelectionIdRef.current = selection.id;
      // Reset tracking when switching to new verse
      lastActivityTime.current = Date.now();
      hasInsertedTimestamp.current = false;
      isEditingRef.current = false;
      if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
      loadVerseData();
    }
  }, [selection?.id]);

  // Reload data whenever any verseDataStorage write occurs.
  // Skip the editor innerHTML reset while the user is actively typing to avoid
  // cursor jumps caused by the auto-save cycle.
  useEffect(() => {
    if (selection) loadVerseData();
  }, [storageTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Populate editor when switching to the notes tab (editor may not have
  // existed in the DOM when loadVerseData originally ran)
  useEffect(() => {
    if (activeTab === 'notes' && editorRef.current && personalNote) {
      // Only populate if editor is empty to avoid resetting cursor position
      if (!editorRef.current.innerHTML.trim()) {
        editorRef.current.innerHTML = personalNote;
      }
    }
  }, [activeTab]);

  // Cleanup webcam on unmount (from Notebook.tsx)
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

  const loadVerseData = async () => {
    if (!selection) return;

    // Reset save state when loading new verse
    setIsSaved(true);

    const parts = selection.id.split(':');

    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];

      const data = await verseDataStorage.getVerseData(bookId, chapter, verses);
      setVerseData(data);

      if (data?.personalNote) {
        setPersonalNote(data.personalNote.text);
        setDrawingData(data.personalNote.drawing || '');
        // Only reset the editor DOM when the user is NOT actively typing.
        // During typing the auto-save fires which triggers storageTick, and
        // overwriting innerHTML here would jump the cursor to the start.
        if (editorRef.current && !isEditingRef.current) {
          editorRef.current.innerHTML = data.personalNote.text;
        }
        // If note has content, don't insert timestamp
        if (data.personalNote.text && data.personalNote.text.trim()) {
          hasInsertedTimestamp.current = true;
        }
      } else if (initialContent) {
        setPersonalNote(initialContent);
        if (editorRef.current && !isEditingRef.current) {
          editorRef.current.innerHTML = initialContent;
        }
        // If has initial content, don't insert timestamp
        if (initialContent.trim()) {
          hasInsertedTimestamp.current = true;
        }
      } else {
        // Clear the editor when switching to a verse without notes
        setPersonalNote('');
        setDrawingData('');
        if (editorRef.current && !isEditingRef.current) {
          editorRef.current.innerHTML = '';
        }
        // Allow timestamp insertion for empty notes
        hasInsertedTimestamp.current = false;
      }
    }
  };

  const handleSaveNote = async (isAutoSave = false) => {
    if (!selection) {
      alert('Please select a verse first before saving a note');
      return;
    }

    const parts = selection.id.split(':');
    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];

      const noteText = editorRef.current?.innerHTML || '';

      if (noteText.trim() || drawingData) {
        const note: PersonalNote = {
          text: noteText,
          drawing: drawingData,
          createdAt: verseData?.personalNote?.createdAt || Date.now(),
          updatedAt: Date.now()
        };

        await verseDataStorage.savePersonalNote(bookId, chapter, verses, note);

        // Call the legacy save handler for backward compatibility
        // Skip trigger update during auto-save to prevent view refresh
        onSaveNote(selection.id, noteText, isAutoSave);

        // Update verseData state without reloading (to preserve cursor position)
        setVerseData(prev => prev ? { ...prev, personalNote: note } : null);
      } else {
        await verseDataStorage.deletePersonalNote(bookId, chapter, verses);
        onSaveNote(selection.id, '', isAutoSave);

        // Update verseData state without reloading
        setVerseData(prev => prev ? { ...prev, personalNote: undefined } : null);
      }

      setIsSaved(true);
      // Don't reload data here - it resets cursor position
    }
  };

  const insertTimestamp = () => {
    if (!editorRef.current || !selection) return;

    const now = new Date();
    const timeStr = now.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const dateStr = now.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    // Create timestamp element
    const timestampSpan = document.createElement('span');
    timestampSpan.contentEditable = 'false';
    timestampSpan.style.fontSize = '14px';
    timestampSpan.style.color = '#94a3b8';
    timestampSpan.style.fontWeight = 'normal';
    timestampSpan.style.userSelect = 'none';
    timestampSpan.textContent = `[${dateStr} ${timeStr}]`;

    // Create a text node with a space after the timestamp
    const spaceNode = document.createTextNode(' ');

    // Save current selection/cursor position
    const windowSelection = window.getSelection();
    let savedRange: Range | null = null;
    let cursorOffset = 0;
    let cursorContainer: Node | null = null;

    if (windowSelection && windowSelection.rangeCount > 0) {
      savedRange = windowSelection.getRangeAt(0).cloneRange();
      cursorOffset = savedRange.startOffset;
      cursorContainer = savedRange.startContainer;
    }

    // Insert timestamp at the very beginning of the editor content
    const firstChild = editorRef.current.firstChild;
    if (firstChild) {
      // Insert before the first child
      editorRef.current.insertBefore(spaceNode, firstChild);
      editorRef.current.insertBefore(timestampSpan, spaceNode);
    } else {
      // No content yet, just append
      editorRef.current.appendChild(timestampSpan);
      editorRef.current.appendChild(spaceNode);
    }

    // Defer cursor restoration to the next animation frame.
    // iOS Safari resets the selection synchronously when a contenteditable="false"
    // element is inserted, so we must restore AFTER the browser has settled.
    const capturedContainer = cursorContainer;
    const capturedOffset = cursorOffset;
    requestAnimationFrame(() => {
      const sel = window.getSelection();
      if (!sel || !editorRef.current) return;
      try {
        if (capturedContainer && capturedContainer.isConnected) {
          const r = document.createRange();
          r.setStart(capturedContainer, capturedOffset);
          r.setEnd(capturedContainer, capturedOffset);
          sel.removeAllRanges();
          sel.addRange(r);
        } else {
          // Fallback: place cursor at end of editor content
          const r = document.createRange();
          r.selectNodeContents(editorRef.current);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        }
      } catch (_e) {
        // Last-resort fallback: end of editor
        try {
          const r = document.createRange();
          r.selectNodeContents(editorRef.current);
          r.collapse(false);
          sel.removeAllRanges();
          sel.addRange(r);
        } catch (_) { /* ignore */ }
      }
    });

    hasInsertedTimestamp.current = true;
  };

  const handleContentChange = () => {
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivityTime.current;

    // Get current text content from the editor directly
    const currentHTML = editorRef.current?.innerHTML || '';
    const currentText = stripHTML(currentHTML).trim();

    // Check if content already starts with a timestamp pattern [YYYY年MM月DD日 HH:MM]
    const hasTimestampAtStart = /^\[\d{4}年\d{1,2}月\d{1,2}日\s+\d{1,2}:\d{2}\]/.test(currentText);

    // Insert timestamp when:
    // 1. Starting a new note (empty note, first input)
    // 2. After 2+ minutes of idle time
    if (timeSinceLastActivity > 2 * 60 * 1000) {
      // Reset the flag when idle time has passed, but only if no timestamp exists
      if (!hasTimestampAtStart) {
        hasInsertedTimestamp.current = false;
      }
    }

    // Check if we should insert timestamp
    // Only insert if: no timestamp has been inserted yet, text is not empty, and no timestamp exists at start
    const shouldInsertTimestamp = !hasInsertedTimestamp.current && currentText.length > 0 && !hasTimestampAtStart;

    if (shouldInsertTimestamp) {
      insertTimestamp();
    }

    // Update last activity time
    lastActivityTime.current = now;

    // Mark as editing so storageTick-triggered loadVerseData won't reset innerHTML
    isEditingRef.current = true;
    if (editingTimeoutRef.current) clearTimeout(editingTimeoutRef.current);
    editingTimeoutRef.current = window.setTimeout(() => {
      isEditingRef.current = false;
    }, 10000); // 10s after last keystroke, allow a fresh reload if needed

    setIsSaved(false);

    // Clear existing timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    // Set new timer for auto-save
    autoSaveTimer.current = window.setTimeout(() => {
      handleSaveNote(true); // Pass true to indicate this is an auto-save
    }, 2000);
  };

  const handleDeleteResearch = async (researchId: string) => {
    if (!selection || !verseData) return;

    const parts = selection.id.split(':');
    if (parts.length >= 3) {
      const bookId = parts[0];
      const chapter = parseInt(parts[1]);
      const verses = [parseInt(parts[2])];

      await verseDataStorage.deleteAIResearch(bookId, chapter, verses, researchId);
      loadVerseData();
    }
  };

  // Rich text formatting (from Notebook.tsx)
  const execCommand = (command: string, value: string = '') => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    handleContentChange();
  };

  // Text-to-speech (from Notebook.tsx)
  const handleSpeak = () => {
    const text = editorRef.current?.innerText || '';
    if (!text.trim()) return;
    setIsSpeaking(true);
    aiService.speak(text, () => setIsSpeaking(false));
  };

  const handleStopSpeak = () => {
    aiService.stopSpeech();
    setIsSpeaking(false);
  };

  // Export note (from Notebook.tsx)
  const handleExport = () => {
    if (!selection) return;
    const currentHtml = editorRef.current?.innerHTML || '';
    const dataToSave = { text: currentHtml, drawing: drawingData, media: [], version: 1 };
    downloadNote(`VerseNote_${selection.id}`, dataToSave);
  };

  // Import note (from Notebook.tsx)
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selection) return;

    try {
      const importedData = await readNoteFile(file);
      if (editorRef.current) editorRef.current.innerHTML = importedData.text;
      setDrawingData(importedData.drawing || '');
      setIsSaved(false);
      handleSaveNote(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to import note');
    } finally {
      e.target.value = '';
    }
  };

  // Camera capture from file input (mobile) — from Notebook.tsx
  const handleCameraCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selection) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target?.result as string;
        if (editorRef.current && mode === 'text') {
          const img = `<img src="${imageData}" alt="${file.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;
          document.execCommand('insertHTML', false, img);
          handleContentChange();
        }
      };
      reader.readAsDataURL(file);
    } catch (_err) {
      // silently handle
    } finally {
      e.target.value = '';
    }
  };

  // Open webcam for desktop (from Notebook.tsx)
  const openWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      setCameraStream(stream);
      setIsCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, TIMING.SCROLL_RETRY_MS);
    } catch (_err) {
      alert('Unable to access camera. Please check your camera permissions.');
    }
  };

  // Capture photo from webcam (from Notebook.tsx)
  const captureWebcamPhoto = () => {
    if (!videoRef.current || !cameraCanvasRef.current || !selection) return;

    const video = videoRef.current;
    const canvas = cameraCanvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = canvas.toDataURL('image/jpeg');

    if (editorRef.current && mode === 'text') {
      const img = `<img src="${imageData}" alt="Webcam photo" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;
      document.execCommand('insertHTML', false, img);
      handleContentChange();
    }

    closeWebcam();
  };

  const closeWebcam = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setIsCameraOpen(false);
  };

  // Handle media upload (images, videos, audio, docs) — from Notebook.tsx
  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !selection) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          const fileData = event.target?.result as string;
          const mediaType = file.type.startsWith('image/') ? 'image' :
                           file.type.startsWith('video/') ? 'video' :
                           file.type.startsWith('audio/') ? 'audio' : 'file';

          if (editorRef.current && mode === 'text') {
            let element = '';
            if (mediaType === 'image') {
              element = `<img src="${fileData}" alt="${file.name}" style="max-width: 100%; height: auto; margin: 10px 0; border-radius: 8px;" />`;
            } else if (mediaType === 'video') {
              element = `<video controls style="max-width: 100%; margin: 10px 0; border-radius: 8px;"><source src="${fileData}" type="${file.type}">Your browser does not support video.</video>`;
            } else if (mediaType === 'audio') {
              element = `<audio controls style="width: 100%; margin: 10px 0;"><source src="${fileData}" type="${file.type}">Your browser does not support audio.</audio>`;
            } else {
              element = `<div style="padding: 10px; margin: 10px 0; background: #f5f5f5; border-radius: 8px; display: flex; align-items: center; gap: 10px;"><span>${file.name}</span></div>`;
            }
            document.execCommand('insertHTML', false, element);
            handleContentChange();
          }
        };
        reader.readAsDataURL(file);
      } catch (_err) {
        // silently handle
      }
    }

    e.target.value = '';
  };

  // Preprocess text to handle Greek/Hebrew wrapped in unnecessary LaTeX
  const preprocessResearchText = (text: string): string => {
    let processed = text;

    // Replace $\text{...}$ with just the content when it contains Greek/Hebrew/special characters
    processed = processed.replace(/\$\\text\{([^}]+)\}\$/g, (match, content) => {
      // Greek: U+0370-U+03FF, U+1F00-U+1FFF; Hebrew: U+0590-U+05FF
      if (/[\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF]/.test(content)) {
        return content;
      }
      return match;
    });

    // Italicize transliterations properly
    processed = processed.replace(/\*([a-zA-Z]+)\*/g, '_$1_');

    return processed;
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit'
      });
    } else if (days < 7) {
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });
    }
  };

  const renderMarkdownComponents = () => {
    const b = selection?.id?.split(':')[0];
    return {
      p: ({ children }: { children?: React.ReactNode }) => <p style={{ marginBottom: '0.5em' }}>{_pc(children, onNavigate, b)}</p>,
      li: ({ children }: { children?: React.ReactNode }) => <li>{_pc(children, onNavigate, b)}</li>,
      strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{_pc(children, onNavigate, b)}</strong>,
      code: ({ inline, className, children }: { inline?: boolean; className?: string; children?: React.ReactNode }) => {
        const match = /language-(\w+)/.exec(className || '');
        const isMath = match && match[1] === 'math';
        if (isMath || inline === false) {
          return (
            <pre style={{ backgroundColor: '#f5f5f5', padding: '8px', borderRadius: '4px', overflowX: 'auto' }}>
              <code>{children}</code>
            </pre>
          );
        }
        return (
          <code style={{ backgroundColor: '#f0f0f0', padding: '1px 4px', borderRadius: '3px', fontFamily: 'monospace', fontSize: '0.9em' }}>
            {children}
          </code>
        );
      }
    };
  };

  const renderNotesTab = () => {
    const getCleanVerseText = (text: string) => {
      if (!text) return '';
      return text.replace(/^\[.*?\]\s*/, '');
    };

    return (
    <div className="notes-tab">
      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".bible-note,.json" className="hidden" />
      {isMobile ? (
        <input type="file" ref={cameraInputRef} onChange={handleCameraCapture} accept="image/*" capture className="hidden" />
      ) : (
        <input type="file" ref={cameraInputRef} onChange={handleCameraCapture} accept="image/*" className="hidden" />
      )}
      <input type="file" ref={mediaInputRef} onChange={handleMediaUpload} accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt" multiple className="hidden" />

      {/* Webcam overlay for desktop */}
      {isCameraOpen && !isMobile && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '8px', padding: '16px', maxWidth: '600px', width: '90%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <strong>Take Photo</strong>
              <button onClick={closeWebcam} className="toolbar-btn">X</button>
            </div>
            <video ref={videoRef} autoPlay playsInline style={{ width: '100%', borderRadius: '8px', marginBottom: '12px', maxHeight: '400px' }} />
            <canvas ref={cameraCanvasRef} className="hidden" />
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button onClick={captureWebcamPhoto} className="toolbar-btn" style={{ background: '#4f46e5', color: 'white' }}>Capture</button>
              <button onClick={closeWebcam} className="toolbar-btn">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {selection?.selectedRawText && (
        <div className="verse-quote-block">
          <div className="verse-quote-header">
            {selection.bookName} {selection.chapter}:{selection.verseNums.join('-')}
          </div>
          <div className="verse-quote-text">
            {getCleanVerseText(selection.selectedRawText)}
          </div>
        </div>
      )}

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        {(['text', 'draw', 'overlay'] as NoteMode[]).map(m => (
          <button key={m} onClick={() => setMode(m)} className="toolbar-btn" style={mode === m ? { background: '#4f46e5', color: 'white' } : {}}>
            {m === 'text' ? '📝 Text' : m === 'draw' ? '✏️ Draw' : '🔀 Overlay'}
          </button>
        ))}
      </div>

      {/* Rich text toolbar — only in text/overlay mode */}
      {(mode === 'text' || mode === 'overlay') && (
        <div className="rich-toolbar">
          <button onClick={() => execCommand('bold')} className="toolbar-btn" title="Bold"><strong>B</strong></button>
          <button onClick={() => execCommand('italic')} className="toolbar-btn" title="Italic"><em>I</em></button>
          <button onClick={() => execCommand('underline')} className="toolbar-btn" title="Underline"><u>U</u></button>
          <span className="toolbar-sep" />
          <button onClick={() => execCommand('formatBlock', 'blockquote')} className="toolbar-btn" title="Quote">❝</button>
          <button onClick={() => execCommand('insertUnorderedList')} className="toolbar-btn" title="List">≡</button>
          <span className="toolbar-sep" />
          <button
            onClick={() => { if (isMobile && cameraInputRef.current) { cameraInputRef.current.click(); } else { openWebcam(); } }}
            className="toolbar-btn" title="Take photo"
          >📷</button>
          <button onClick={() => mediaInputRef.current?.click()} className="toolbar-btn" title="Attach file">📎</button>
          <button onClick={handleImportClick} className="toolbar-btn" title="Import note">⬆</button>
          <button onClick={handleExport} className="toolbar-btn" title="Export note">⬇</button>
          <span className="toolbar-sep" />
          <button
            onClick={isSpeaking ? handleStopSpeak : handleSpeak}
            className="toolbar-btn"
            style={isSpeaking ? { background: '#fee2e2', color: '#ef4444' } : {}}
            title={isSpeaking ? 'Stop' : 'Read aloud'}
          >
            {isSpeaking ? '⏹' : '🔊'}
          </button>
        </div>
      )}

      {/* Editor / canvas area */}
      {mode === 'text' && (
        <div
          ref={editorRef}
          className="note-editor"
          contentEditable
          onInput={handleContentChange}
          data-placeholder="Write your notes here..."
          style={{ minHeight: '200px', padding: '12px', outline: 'none', fontSize: '14px', lineHeight: '1.6' }}
        />
      )}

      {mode === 'draw' && (
        <div style={{ position: 'relative', minHeight: '300px', background: '#f8f8f8', borderRadius: '8px', overflow: 'hidden' }}>
          <SimpleDrawingCanvas
            ref={canvasRef}
            onChange={(data) => {
              setDrawingData(data);
              setIsSaved(false);
              if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
              autoSaveTimer.current = window.setTimeout(() => handleSaveNote(true), 2000);
            }}
            initialData={drawingData}
            overlayMode={false}
            isWritingMode={isWritingMode}
          />
          {/* Drawing palette */}
          <div className="draw-palette">
            {(['pen', 'marker', 'highlighter', 'eraser'] as DrawingTool[]).map(t => (
              <button
                key={t}
                onClick={() => { setDrawingTool(t); canvasRef.current?.setTool(t); }}
                className="toolbar-btn"
                style={drawingTool === t ? { background: t === 'eraser' ? '#fee2e2' : '#e0e7ff' } : {}}
                title={t}
              >
                {t === 'pen' ? '✏️' : t === 'marker' ? '🖊️' : t === 'highlighter' ? '🖍️' : '🧹'}
              </button>
            ))}
            <button onClick={() => canvasRef.current?.undo()} className="toolbar-btn" title="Undo">↩️</button>
            <button onClick={() => canvasRef.current?.clear()} className="toolbar-btn" title="Clear">🗑️</button>
            <span className="toolbar-sep" />
            {DRAW_COLORS.map(color => (
              <button
                key={color}
                onClick={() => { setDrawingColor(color); canvasRef.current?.setColor(color); }}
                style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: color, border: drawingColor === color ? '2px solid #4f46e5' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                title={color}
              />
            ))}
            <input
              type="range" min="1" max="20" value={drawingSize}
              onChange={(e) => { const s = Number(e.target.value); setDrawingSize(s); canvasRef.current?.setSize(s); }}
              style={{ width: '60px', marginLeft: '4px' }}
            />
          </div>
        </div>
      )}

      {mode === 'overlay' && (
        <div style={{ position: 'relative', minHeight: '300px' }}>
          <div
            ref={editorRef}
            className="note-editor"
            contentEditable={isWritingMode ? undefined : undefined}
            onInput={handleContentChange}
            data-placeholder="Write your notes here..."
            style={{ minHeight: '300px', padding: '12px', outline: 'none', fontSize: '14px', lineHeight: '1.6', pointerEvents: isWritingMode ? 'none' : 'auto' }}
          />
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: isWritingMode ? 'auto' : 'none' }}>
            <SimpleDrawingCanvas
              ref={canvasRef}
              onChange={(data) => {
                setDrawingData(data);
                setIsSaved(false);
                if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
                autoSaveTimer.current = window.setTimeout(() => handleSaveNote(true), 2000);
              }}
              initialData={drawingData}
              overlayMode={true}
              isWritingMode={isWritingMode}
            />
          </div>
          <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 20 }}>
            <button
              onClick={() => setIsWritingMode(!isWritingMode)}
              className="toolbar-btn"
              style={isWritingMode ? { background: '#e0e7ff', color: '#4f46e5' } : {}}
            >
              {isWritingMode ? '✏️ Draw' : '👆 Navigate'}
            </button>
          </div>
        </div>
      )}

      <div className="note-toolbar">
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => handleSaveNote(false)}
            className="toolbar-btn"
            style={{ background: '#4CAF50', color: 'white' }}
          >
            Save
          </button>

          {(personalNote || drawingData) && (
            <button
              onClick={() => {
                if (confirm('Are you sure you want to delete this note?')) {
                  if (editorRef.current) {
                    editorRef.current.innerHTML = '';
                  }
                  setDrawingData('');
                  handleSaveNote(false);
                }
              }}
              className="toolbar-btn"
              style={{ background: '#ef4444', color: 'white' }}
            >
              Delete
            </button>
          )}
        </div>

        {!isSaved && (
          <span className="save-indicator">Auto-saving...</span>
        )}
      </div>
    </div>
    );
  };

  const renderResearchTab = () => {
    const mdComponents = renderMarkdownComponents();
    return (
    <div className="research-tab">
      {verseData?.aiResearch && verseData.aiResearch.length > 0 ? (
        <div className="research-list">
          {verseData.aiResearch.map((research) => (
            <div key={research.id} className="research-entry">
              <div className="research-header">
                <div className="research-query">
                  <strong>Q:</strong> {research.query}
                </div>
                <div className="research-actions">
                  <span className="timestamp">{formatTimestamp(research.timestamp)}</span>
                  <button
                    onClick={() => handleDeleteResearch(research.id)}
                    className="delete-btn"
                    title="Delete research"
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {research.image && (
                <div className="research-image">
                  <img
                    src={`data:${research.image.mimeType};base64,${research.image.data}`}
                    alt={research.image.caption || 'Research image'}
                    className="research-img"
                    onClick={() => {
                      // Open image in new window/tab for full view
                      const imgWindow = window.open('');
                      if (imgWindow) {
                        imgWindow.document.write(`
                          <html>
                            <head>
                              <title>${research.query}</title>
                              <style>
                                body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                              </style>
                            </head>
                            <body>
                              <img src="data:${research.image.mimeType};base64,${research.image.data}" alt="${research.query}" />
                            </body>
                          </html>
                        `);
                      }
                    }}
                    title="Click to view full size"
                  />
                  {research.image.caption && (
                    <div className="image-caption">{research.image.caption}</div>
                  )}
                </div>
              )}

              <div className="research-response">
                <LazyMarkdown components={mdComponents}>
                  {preprocessResearchText(research.response)}
                </LazyMarkdown>
              </div>

              {research.tags && research.tags.length > 0 && (
                <div className="research-tags">
                  {research.tags.map((tag, idx) => (
                    <span key={idx} className="tag">#{tag}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p>No AI research yet</p>
          <p className="hint">Select text and choose "Research with AI" to add research</p>
        </div>
      )}
    </div>
    );
  };

  const renderAllTab = () => {
    const mdComponents = renderMarkdownComponents();
    const allItems: Array<{
      type: 'note' | 'research';
      timestamp: number;
      content: PersonalNote | AIResearchEntry;
    }> = [];

    if (verseData?.personalNote) {
      allItems.push({
        type: 'note',
        timestamp: verseData.personalNote.updatedAt,
        content: verseData.personalNote
      });
    }

    if (verseData?.aiResearch) {
      verseData.aiResearch.forEach(research => {
        allItems.push({
          type: 'research',
          timestamp: research.timestamp,
          content: research
        });
      });
    }

    // Sort by timestamp, newest first
    allItems.sort((a, b) => b.timestamp - a.timestamp);

    return (
      <div className="all-tab">
        {allItems.length > 0 ? (
          <div className="timeline">
            {allItems.map((item, idx) => (
              <div key={idx} className={`timeline-item ${item.type}`}>
                <div className="timeline-marker">
                  {item.type === 'note' ? '📝' : '🤖'}
                </div>

                <div className="timeline-content">
                  <div className="timeline-header">
                    <span className="timeline-type">
                      {item.type === 'note' ? 'Personal Note' : 'AI Research'}
                    </span>
                    <span className="timeline-time">
                      {formatTimestamp(item.timestamp)}
                    </span>
                  </div>

                  {item.type === 'note' ? (
                    <div
                      className="note-preview"
                      dangerouslySetInnerHTML={{ __html: (item.content as PersonalNote).text }}
                    />
                  ) : (
                    <div className="research-preview">
                      {(item.content as AIResearchEntry).image && (
                        <div className="research-image">
                          <img
                            src={`data:${(item.content as AIResearchEntry).image!.mimeType};base64,${(item.content as AIResearchEntry).image!.data}`}
                            alt={(item.content as AIResearchEntry).image!.caption || 'Research image'}
                            className="research-img"
                            onClick={() => {
                              const img = (item.content as AIResearchEntry).image!;
                              const imgWindow = window.open('');
                              if (imgWindow) {
                                imgWindow.document.write(`
                                  <html>
                                    <head>
                                      <title>${(item.content as AIResearchEntry).query}</title>
                                      <style>
                                        body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #000; }
                                        img { max-width: 100%; max-height: 100vh; object-fit: contain; }
                                      </style>
                                    </head>
                                    <body>
                                      <img src="data:${img.mimeType};base64,${img.data}" alt="${(item.content as AIResearchEntry).query}" />
                                    </body>
                                  </html>
                                `);
                              }
                            }}
                            title="Click to view full size"
                          />
                        </div>
                      )}
                      <div className="research-q">Q: {(item.content as AIResearchEntry).query}</div>
                      <div className="research-a">
                        <LazyMarkdown components={mdComponents}>
                          {preprocessResearchText((item.content as AIResearchEntry).response)}
                        </LazyMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No content yet</p>
          </div>
        )}
      </div>
    );
  };

  if (!selection) {
    return (
      <div className="notebook-empty">
        <p>Select a verse to add notes</p>
      </div>
    );
  }

  return (
    <div className="enhanced-notebook">
      <div className="notebook-header">
        <h3>{selection.bookName} {selection.chapter}:{selection.verseNums.join('-')}</h3>

        <div className="tab-selector">
          <button
            className={`tab ${activeTab === 'research' ? 'active' : ''}`}
            onClick={() => { setActiveTab('research'); }}
          >
            🤖 AI Research {verseData?.aiResearch?.length ? `(${verseData.aiResearch.length})` : ''}
          </button>
          <button
            className={`tab ${activeTab === 'notes' ? 'active' : ''}`}
            onClick={() => { setActiveTab('notes'); }}
          >
            📝 My Notes
          </button>
          <button
            className={`tab ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveTab('all'); }}
          >
            📚 All
          </button>
        </div>
      </div>

      <div className="notebook-content">
        {activeTab === 'notes' && renderNotesTab()}
        {activeTab === 'research' && renderResearchTab()}
        {activeTab === 'all' && renderAllTab()}
      </div>

      <style>{`
        .enhanced-notebook {
          height: 100%;
          display: flex;
          flex-direction: column;
          background: white;
        }

        .notebook-header {
          padding: 12px;
          border-bottom: 1px solid #e0e0e0;
          background: #f8f8f8;
        }

        .notebook-header h3 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #333;
        }

        .tab-selector {
          display: flex;
          gap: 8px;
        }

        .tab {
          padding: 6px 12px;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .tab:hover {
          background: #f0f0f0;
        }

        .tab.active {
          background: #4f46e5;
          color: white;
          border-color: #4f46e5;
        }

        .notebook-content {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
        }

        .verse-quote-block {
          padding: 12px;
          background: #f8f9fa;
          border-left: 4px solid #6366f1;
          border-radius: 4px;
          margin-bottom: 16px;
        }

        .verse-quote-header {
          font-size: 13px;
          font-weight: 600;
          color: #4f46e5;
          margin-bottom: 8px;
        }

        .verse-quote-text {
          font-size: 14px;
          font-style: italic;
          color: #475569;
          line-height: 1.6;
        }

        .rich-toolbar {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 6px 0;
          border-bottom: 1px solid #e0e0e0;
          margin-bottom: 8px;
          align-items: center;
        }

        .toolbar-sep {
          width: 1px;
          height: 20px;
          background: #d1d5db;
          margin: 0 2px;
        }

        .draw-palette {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          padding: 8px;
          background: white;
          border-top: 1px solid #e0e0e0;
          align-items: center;
        }

        .note-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          border-top: 1px solid #e0e0e0;
          margin-top: 12px;
        }

        .toolbar-btn {
          padding: 4px 10px;
          background: #f0f0f0;
          border: 1px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          cursor: pointer;
        }

        .toolbar-btn:hover {
          background: #e0e0e0;
        }

        .save-indicator {
          font-size: 12px;
          color: #666;
          font-style: italic;
        }

        .research-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .research-entry {
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .research-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 8px;
        }

        .research-query {
          flex: 1;
          font-size: 13px;
          color: #333;
        }

        .research-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .timestamp {
          font-size: 11px;
          color: #999;
        }

        .delete-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          opacity: 0.6;
          transition: opacity 0.2s;
        }

        .delete-btn:hover {
          opacity: 1;
        }

        .research-response {
          font-size: 13px;
          line-height: 1.6;
          color: #555;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', 'Noto Sans Hebrew', 'Noto Sans Arabic', system-ui, sans-serif;
        }

        .research-image {
          margin-bottom: 12px;
          border-radius: 8px;
          overflow: hidden;
          background: #fff;
          border: 1px solid #e0e0e0;
        }

        .research-img {
          width: 100%;
          max-height: 400px;
          object-fit: contain;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .research-img:hover {
          transform: scale(1.02);
        }

        .image-caption {
          padding: 8px;
          font-size: 12px;
          color: #666;
          background: #f8f8f8;
          border-top: 1px solid #e0e0e0;
        }

        .research-response p {
          margin: 0 0 0.5em 0;
        }

        .research-response p:last-child {
          margin-bottom: 0;
        }

        .research-response ul, .research-response ol {
          margin: 0.5em 0;
          padding-left: 1.5em;
        }

        .research-response li {
          margin: 0.25em 0;
        }

        /* KaTeX math styling */
        .research-response .katex,
        .research-a .katex {
          font-size: 1em;
        }

        .research-response .katex-display,
        .research-a .katex-display {
          margin: 0.5em 0;
        }

        .research-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 8px;
        }

        .tag {
          padding: 2px 8px;
          background: #e0e7ff;
          color: #4f46e5;
          border-radius: 12px;
          font-size: 11px;
        }

        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }

        .empty-state .hint {
          font-size: 12px;
          margin-top: 8px;
        }

        .timeline {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .timeline-item {
          display: flex;
          gap: 12px;
        }

        .timeline-marker {
          font-size: 20px;
          flex-shrink: 0;
        }

        .timeline-content {
          flex: 1;
          padding: 12px;
          background: #f8f8f8;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
        }

        .timeline-header {
          display: flex;
          justify-content: space-between;
          margin-bottom: 8px;
        }

        .timeline-type {
          font-size: 12px;
          font-weight: 600;
          color: #666;
        }

        .timeline-time {
          font-size: 11px;
          color: #999;
        }

        .note-preview, .research-preview {
          font-size: 13px;
          line-height: 1.6;
          color: #333;
        }

        .research-q {
          font-weight: 500;
          margin-bottom: 4px;
        }

        .research-a {
          color: #555;
        }

        .research-a p {
          margin: 0 0 0.5em 0;
        }

        .research-a p:last-child {
          margin-bottom: 0;
        }

        .notebook-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: #999;
          font-size: 14px;
        }

        .hidden {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default EnhancedNotebook;
