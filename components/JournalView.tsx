import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { JournalEntry } from '../services/idbService';
import { journalStorage } from '../services/journalStorage';
import JournalEditor from './JournalEditor';
import SimpleDrawingCanvas, { SimpleDrawingCanvasHandle } from './SimpleDrawingCanvas';
import { compressImage, compressImageFromUrl } from '../services/imageCompressionService';
import { BIBLE_BOOKS } from '../constants';
import { usePaperType } from '../hooks/usePaperType';
import LazyMarkdown from './LazyMarkdown';
import type { PaperType } from '../services/strokeNormalizer';
import { syncService } from '../services/syncService';
import { spiritualMemory } from '../services/spiritualMemory';
import type { SpiritualMemoryItem } from '../services/idbService';
import {
  getPrompt, setPrompt, resetPrompt, DEFAULT_PROMPTS, type JournalPromptConfig,
  getAgentIdentity, setAgentIdentity, resetAgentIdentity,
  suggestTags,
  findRelatedEntries,
  generateWeeklyDigest,
  getTimelineGroups,
  generateReflectionPrompt,
  extendThinking,
  summarizeEntry,
  findRelatedScripture,
  chatAboutEntry,
  extractMemoryItems,
  getMemoryContext,
  generateSpiritualProfile,
  generateProactiveSuggestion,
  streamAI,
  type StreamResult,
  RelatedEntry,
  WeeklyDigest,
  TimelineGroup,
  ScriptureSuggestion,
} from '../services/journalAIService';
import type { SpiritualMemoryItem } from '../services/idbService';

interface JournalViewProps {
  /** Current Bible reading context for linking new entries */
  bookId?: string;
  chapter?: number;
  bookName?: string;
  onNavigate?: (bookId: string, chapter: number) => void;
}

function formatDate(iso: string, includeTime = false): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  if (!includeTime) return date;
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}

/** Reverse-geocode lat/lng to a human-readable location name */
async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=1`, {
      headers: { 'User-Agent': 'BibleStudyApp/1.0' },
    });
    const data = await resp.json();
    const addr = data.address || {};
    // Build detailed location: road/neighbourhood, city, state
    const street = addr.road || addr.pedestrian || addr.neighbourhood || addr.suburb || '';
    const area = addr.city || addr.town || addr.village || addr.county || '';
    const state = addr.state || addr.country || '';
    const parts = [street, area, state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : data.display_name?.split(',').slice(0, 3).join(',').trim() || '';
  } catch {
    return '';
  }
}

/** Simple markdown to HTML for saving AI content to notes */
function mdToHtml(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 style="margin:8px 0 4px;font-size:15px;font-weight:600">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="margin:10px 0 4px;font-size:16px;font-weight:600">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="margin:12px 0 6px;font-size:18px;font-weight:700">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<div style="padding-left:16px">• $1</div>')
    .replace(/^\d+\. (.+)$/gm, (_, content, offset, str) => {
      const lines = str.slice(0, offset).split('\n');
      const num = lines.filter((l: string) => /^\d+\./.test(l)).length + 1;
      return `<div style="padding-left:16px">${num}. ${content}</div>`;
    })
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + '...';
}

const JournalView: React.FC<JournalViewProps> = ({
  bookId,
  chapter,
  bookName,
  onNavigate,
}) => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const selectedEntry = entries.find((e) => e.id === selectedId) ?? null;

  // ── AI Intelligence state ──────────────────────────────────────────
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const [isLoadingTags, setIsLoadingTags] = useState(false);
  const [relatedEntries, setRelatedEntries] = useState<RelatedEntry[]>([]);
  const [isLoadingRelated, setIsLoadingRelated] = useState(false);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigest | null>(null);
  const [isLoadingDigest, setIsLoadingDigest] = useState(false);
  const [showDigest, setShowDigest] = useState(false);
  const [listView, setListView] = useState<'list' | 'timeline'>('list');
  const [timelineGroups, setTimelineGroups] = useState<TimelineGroup[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<string | null>(null);
  const tagSuggestTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Phase 3: Reflection Partner state ─────────────────────────────
  const [reflectionPrompt, setReflectionPrompt] = useState<string | null>(null);
  const [isLoadingReflection, setIsLoadingReflection] = useState(false);
  const [extendResult, setExtendResult] = useState<string | null>(null);
  const [isLoadingExtend, setIsLoadingExtend] = useState(false);
  const [summaryResult, setSummaryResult] = useState<string | null>(null);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [scriptureSuggestions, setScriptureSuggestions] = useState<ScriptureSuggestion[]>([]);
  const [savedCards, setSavedCards] = useState<Record<string, boolean>>({});
  const [aiMeta, setAiMeta] = useState<Record<string, StreamResult>>({});
  const [isLoadingScripture, setIsLoadingScripture] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'assistant'; text: string; meta?: StreamResult }[]>([]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);

  // ── Phase 4: Personal Agent state ─────────────────────────────────
  const [showProfile, setShowProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<'profile' | 'memory' | 'settings'>('profile');
  const [profileText, setProfileText] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [memoryItems, setMemoryItems] = useState<SpiritualMemoryItem[]>([]);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const [proactiveSuggestion, setProactiveSuggestion] = useState<string | null>(null);
  const [isLoadingProactive, setIsLoadingProactive] = useState(false);
  const memorySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load entries
  const loadEntries = useCallback(async () => {
    const data = searchQuery.trim()
      ? await journalStorage.searchEntries(searchQuery)
      : await journalStorage.getAllEntries();
    setEntries(data);
  }, [searchQuery]);

  useEffect(() => {
    loadEntries();
    // Re-read from IDB when another device syncs journal data
    const onSynced = () => loadEntries();
    window.addEventListener('journal-synced', onSynced);
    return () => window.removeEventListener('journal-synced', onSynced);
  }, [loadEntries]);

  // Manual sync: flush pending saves, pull from server, reload entries + editor
  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      await flushPendingSave();
      if (syncService.canSync()) {
        await syncService.syncJournal();
      }
      // Reload entries from IndexedDB (now updated by sync)
      const data = await journalStorage.getAllEntries();
      setEntries(data);
      // Update the editor content if the selected entry was updated
      if (selectedId && editorRef.current) {
        const updated = data.find(e => e.id === selectedId);
        if (updated) {
          editorRef.current.innerHTML = updated.content;
        }
      }
    } catch (err) {
      console.warn('[Journal] Sync failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  // Create new entry with auto-location
  const handleNew = async () => {
    try {
      setSearchQuery(''); // Clear search so new entry is visible
      const verseRef =
        bookId && chapter && bookName ? `${bookName} ${chapter}` : undefined;
      const entry = await journalStorage.createEntry({
        bookId,
        chapter,
        verseRef,
      });
      const allEntries = await journalStorage.getAllEntries();
      setEntries(allEntries);
      setSelectedId(entry.id);
      if (isMobile) setMobileShowEditor(true);

      // Auto-capture location (non-blocking)
      if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const { latitude, longitude } = pos.coords;
            const locationName = await reverseGeocode(latitude, longitude);
            await journalStorage.updateEntry(entry.id, { latitude, longitude, locationName });
            // Update local state
            setEntries(prev => prev.map(e =>
              e.id === entry.id ? { ...e, latitude, longitude, locationName } : e
            ));
          },
          () => { /* silently skip if denied */ },
          { timeout: 10000, enableHighAccuracy: false }
        );
      }
    } catch (err) {
      console.error('[Journal] Failed to create entry:', err);
    }
  };

  // Delete entry
  const handleDelete = async (id: string) => {
    await journalStorage.deleteEntry(id);
    if (selectedId === id) setSelectedId(null);
    setShowDeleteConfirm(null);
    await loadEntries();
  };

  // Auto-save with debounce
  const handleEditorChange = useCallback(
    (html: string, plainText: string) => {
      if (!selectedId) return;
      // Derive title from first line of plain text
      const firstLine = plainText.split('\n').find((l) => l.trim()) || '';
      const title = truncate(firstLine, 80);

      // Update local state immediately for responsive UI
      setEntries((prev) =>
        prev.map((e) =>
          e.id === selectedId
            ? { ...e, content: html, plainText, title, updatedAt: new Date().toISOString() }
            : e
        )
      );

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        await journalStorage.updateEntry(selectedId, {
          content: html,
          plainText,
          title,
        });
      }, 3000);
    },
    [selectedId]
  );

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (tagSuggestTimerRef.current) clearTimeout(tagSuggestTimerRef.current);
      if (memorySaveTimerRef.current) clearTimeout(memorySaveTimerRef.current);
    };
  }, []);

  // ── Auto-tagging: debounce 5s after last edit ──────────────────────
  useEffect(() => {
    if (!selectedEntry || !selectedEntry.plainText || selectedEntry.plainText.trim().length < 20) {
      setSuggestedTags([]);
      return;
    }
    if (tagSuggestTimerRef.current) clearTimeout(tagSuggestTimerRef.current);
    tagSuggestTimerRef.current = setTimeout(async () => {
      setIsLoadingTags(true);
      try {
        const tags = await suggestTags(selectedEntry);
        // Filter out tags already on the entry
        const newTags = tags.filter(t => !selectedEntry.tags.includes(t));
        setSuggestedTags(newTags);
      } catch {
        setSuggestedTags([]);
      } finally {
        setIsLoadingTags(false);
      }
    }, 5000);
    return () => {
      if (tagSuggestTimerRef.current) clearTimeout(tagSuggestTimerRef.current);
    };
  }, [selectedEntry?.plainText, selectedEntry?.id]);

  // ── Related entries: load when selecting an entry ──────────────────
  useEffect(() => {
    if (!selectedEntry) {
      setRelatedEntries([]);
      return;
    }
    let cancelled = false;
    setIsLoadingRelated(true);
    findRelatedEntries(selectedEntry).then(results => {
      if (!cancelled) {
        setRelatedEntries(results);
        setIsLoadingRelated(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setRelatedEntries([]);
        setIsLoadingRelated(false);
      }
    });
    return () => { cancelled = true; };
  }, [selectedId]);

  // Clear suggested tags when switching entries
  useEffect(() => {
    setSuggestedTags([]);
  }, [selectedId]);

  // Accept a suggested tag
  const acceptTag = async (tag: string) => {
    if (!selectedEntry) return;
    const newTags = [...selectedEntry.tags, tag];
    await journalStorage.updateEntry(selectedEntry.id, { tags: newTags });
    setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, tags: newTags } : e));
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  };

  // Dismiss a suggested tag
  const dismissTag = (tag: string) => {
    setSuggestedTags(prev => prev.filter(t => t !== tag));
  };

  // Remove an existing tag
  const removeTag = async (tag: string) => {
    if (!selectedEntry) return;
    const newTags = selectedEntry.tags.filter(t => t !== tag);
    await journalStorage.updateEntry(selectedEntry.id, { tags: newTags });
    setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, tags: newTags } : e));
  };

  // ── Weekly digest ─────────────────────────────────────────────────
  const handleWeeklyDigest = async () => {
    setIsLoadingDigest(true);
    setShowDigest(true);
    try {
      const digest = await generateWeeklyDigest(true);
      setWeeklyDigest(digest);
    } catch {
      setWeeklyDigest(null);
    } finally {
      setIsLoadingDigest(false);
    }
  };

  // ── Phase 3: AI handlers ───────────────────────────────────────────

  const handleReflect = async () => {
    setIsLoadingReflection(true);
    setReflectionPrompt('');
    try {
      const recentEntries = entries.slice(0, 3);
      const recentContext = recentEntries.map(e => e.plainText.slice(0, 300)).join('\n---\n');
      let prompt = 'Generate a thoughtful, personal spiritual reflection prompt for the user. Be warm, gentle, and thought-provoking. One paragraph.';
      if (selectedEntry?.plainText) prompt += `\n\nTheir current journal entry:\n${selectedEntry.plainText.slice(0, 500)}`;
      if (bookName && chapter) prompt += `\n\nCurrently reading: ${bookName} ${chapter}`;
      if (recentContext) prompt += `\n\nRecent journal themes:\n${recentContext}`;
      const meta = await streamAI(prompt, (chunk) => {
        setReflectionPrompt(prev => (prev || '') + chunk);
      });
      setAiMeta(prev => ({ ...prev, reflect: meta }));
    } catch {
      setReflectionPrompt(null);
    } finally {
      setIsLoadingReflection(false);
    }
  };

  const handleExtend = async () => {
    if (!selectedEntry) return;
    setIsLoadingExtend(true);
    setExtendResult('');
    try {
      const selection = window.getSelection();
      const selectedText = selection && selection.toString().trim()
        ? selection.toString().trim()
        : selectedEntry.plainText || '';
      if (!selectedText) { setIsLoadingExtend(false); return; }
      let prompt = `The user wrote this spiritual reflection. Gently extend their thinking — what deeper meaning might this have? How does it connect to broader spiritual themes? Keep the same tone and language. Write 2-3 short paragraphs.\n\nUser's writing:\n${selectedText.slice(0, 2000)}`;
      if (bookName && chapter) prompt += `\n\nThey are currently reading: ${bookName} ${chapter}`;
      const meta = await streamAI(prompt, (chunk) => {
        setExtendResult(prev => (prev || '') + chunk);
      });
      setAiMeta(prev => ({ ...prev, extend: meta }));
    } catch {
      setExtendResult(null);
    } finally {
      setIsLoadingExtend(false);
    }
  };

  const handleSummarize = async () => {
    if (!selectedEntry?.plainText) return;
    setIsLoadingSummary(true);
    setSummaryResult('');
    try {
      const prompt = `Summarize this journal entry into 2-3 key insights or takeaways. Use bullet points (markdown). Be concise — each point should be 1 sentence. Capture the spiritual/emotional essence.\n\nJournal entry:\n${selectedEntry.plainText.slice(0, 3000)}`;
      const meta = await streamAI(prompt, (chunk) => {
        setSummaryResult(prev => (prev || '') + chunk);
      });
      setAiMeta(prev => ({ ...prev, summary: meta }));
    } catch {
      setSummaryResult(null);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const handleFindScripture = async () => {
    if (!selectedEntry?.plainText) return;
    setIsLoadingScripture(true);
    setScriptureSuggestions([]);
    try {
      const { results, meta } = await findRelatedScripture(selectedEntry.plainText);
      setAiMeta(prev => ({ ...prev, scripture: meta }));
      if (results.length === 0) {
        setScriptureSuggestions([{ reference: '', reason: 'No scripture suggestions found. Try adding more detail to your entry.' }]);
      } else {
        setScriptureSuggestions(results);
      }
    } catch (err) {
      console.warn('[Scripture] Failed:', err);
      setScriptureSuggestions([{ reference: '', reason: 'Could not find scripture. Please try again.' }]);
    } finally {
      setIsLoadingScripture(false);
    }
  };

  const handleChatSend = async () => {
    if (!chatInput.trim() || isLoadingChat) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: question }]);
    setChatMessages(prev => [...prev, { role: 'assistant', text: '' }]);
    setIsLoadingChat(true);
    try {
      const recentEntries = entries.slice(0, 3);
      const recentContext = recentEntries.map(e => e.plainText.slice(0, 300)).join('\n---\n');
      let prompt = `The user is asking about their journal entry. Answer helpfully based on the context.\n\nQuestion: ${question}\n\nJournal entry:\n${(selectedEntry?.plainText || '').slice(0, 2000)}`;
      if (recentContext) prompt += `\n\nRecent entries:\n${recentContext}`;
      const meta = await streamAI(prompt, (chunk) => {
        setChatMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, text: (last.text || '') + chunk };
          }
          return updated;
        });
      });
      // Attach model/race metadata to the assistant message
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant') {
          updated[updated.length - 1] = { ...last, meta };
        }
        return updated;
      });
    } catch {
      setChatMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.role === 'assistant' && !last.text) {
          updated[updated.length - 1] = { ...last, text: 'Sorry, something went wrong.' };
        }
        return updated;
      });
    } finally {
      setIsLoadingChat(false);
    }
  };

  // ── Phase 4: Personal Agent handlers ──────────────────────────────

  // Background memory extraction after save
  useEffect(() => {
    if (!selectedEntry?.plainText || selectedEntry.plainText.trim().length < 30) return;
    if (memorySaveTimerRef.current) clearTimeout(memorySaveTimerRef.current);
    memorySaveTimerRef.current = setTimeout(() => {
      extractMemoryItems(selectedEntry.plainText, selectedEntry.id).catch(() => {});
    }, 10000); // 10s after last edit
    return () => {
      if (memorySaveTimerRef.current) clearTimeout(memorySaveTimerRef.current);
    };
  }, [selectedEntry?.plainText, selectedEntry?.id]);

  const handleShowProfile = async () => {
    setShowProfile(true);
    setProfileTab('profile');
    setIsLoadingProfile(true);
    // Load memory items immediately
    spiritualMemory.getAllItems().then(setMemoryItems).catch(() => {});
    try {
      const items = await getMemoryContext();
      const profile = await generateSpiritualProfile(items);
      setProfileText(profile);
    } catch {
      setProfileText('Could not generate profile at this time.');
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    await spiritualMemory.deleteItem(id);
    setMemoryItems(prev => prev.filter(m => m.id !== id));
  };

  const handleSaveMemoryEdit = async (id: string) => {
    await spiritualMemory.updateItem(id, { content: editingMemoryText });
    setMemoryItems(prev => prev.map(m => m.id === id ? { ...m, content: editingMemoryText, updatedAt: new Date().toISOString() } : m));
    setEditingMemoryId(null);
  };

  // Proactive suggestion when no entry is selected (delayed to avoid spamming AI on load)
  useEffect(() => {
    if (selectedId) {
      setProactiveSuggestion(null);
      return;
    }
    // Don't fire on initial load — wait 3s after entries are loaded and no entry is selected
    if (entries.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoadingProactive(true);
      (async () => {
        try {
          const memItems = await getMemoryContext();
          const lastEntry = entries.length > 0 ? entries[0] : null;
          const suggestion = await generateProactiveSuggestion(
            memItems,
            lastEntry,
            { bookId, chapter, bookName }
          );
          if (!cancelled && suggestion) {
            setProactiveSuggestion(suggestion);
          }
        } catch {
          // silent — don't show errors for proactive features
        } finally {
          if (!cancelled) setIsLoadingProactive(false);
      }
      })();
    }, 3000); // 3s delay to avoid firing on initial page load
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selectedId, entries.length]);

  // Clear AI results when switching entries
  useEffect(() => {
    setReflectionPrompt(null);
    setExtendResult(null);
    setSummaryResult(null);
    setScriptureSuggestions([]);
    setSavedCards({});
    setShowChat(false);
    setChatMessages([]);
    setChatInput('');
  }, [selectedId]);

  // ── Timeline ──────────────────────────────────────────────────────
  useEffect(() => {
    if (listView === 'timeline') {
      getTimelineGroups().then(setTimelineGroups).catch(() => setTimelineGroups([]));
    }
  }, [listView, entries]);

  const filteredEntries = useMemo(() => {
    if (!timelineFilter) return entries;
    return entries.filter(e => e.createdAt.startsWith(timelineFilter));
  }, [entries, timelineFilter]);

  // ---------------------------------------------------------------
  // Mobile: show list OR editor, not both
  // ---------------------------------------------------------------
  const [mobileShowEditor, setMobileShowEditor] = useState(false);

  // Flush any pending auto-save before switching notes
  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
      // Save the current entry's state from the editor
      if (selectedId && editorRef.current) {
        const html = editorRef.current.innerHTML;
        const plainText = editorRef.current.innerText || '';
        const firstLine = plainText.split('\n').find((l) => l.trim()) || '';
        const title = truncate(firstLine, 80);
        await journalStorage.updateEntry(selectedId, { content: html, plainText, title });
        window.dispatchEvent(new Event('journal-updated-now'));
      }
    }
  }, [selectedId]);

  const selectEntry = async (id: string) => {
    await flushPendingSave();
    setSelectedId(id);
    if (isMobile) setMobileShowEditor(true);
  };

  const mobileBack = () => {
    setMobileShowEditor(false);
  };

  // ---------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------

  const listContent = (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Search + New + Digest */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          borderBottom: '1px solid #f3f4f6',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px 8px' }}>
          <div style={{ position: 'relative', flex: 1 }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search journal..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 32px',
                border: '1px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                background: '#f9fafb',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <svg
              style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
          </div>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            title="Sync journal"
            style={{
              background: isSyncing ? '#e5e7eb' : '#f3f4f6',
              color: '#6b7280',
              border: 'none',
              borderRadius: 8,
              width: 34,
              height: 34,
              fontSize: 16,
              cursor: isSyncing ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              animation: isSyncing ? 'spin 1s linear infinite' : 'none',
            }}
          >
            {'\u21BB'}
          </button>
          <button
            onClick={handleNew}
            title="New entry"
            style={{
              background: '#4f46e5',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              width: 34,
              height: 34,
              fontSize: 20,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            +
          </button>
        </div>
        {/* View toggle + Weekly Digest */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 16px 8px' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
            <button
              onClick={() => { setListView('list'); setTimelineFilter(null); }}
              style={{
                fontSize: 12, padding: '3px 10px', border: 'none', cursor: 'pointer',
                background: listView === 'list' ? '#4f46e5' : 'transparent',
                color: listView === 'list' ? '#fff' : '#6b7280',
                fontWeight: listView === 'list' ? 600 : 400,
              }}
            >
              List
            </button>
            <button
              onClick={() => setListView('timeline')}
              style={{
                fontSize: 12, padding: '3px 10px', border: 'none', cursor: 'pointer',
                background: listView === 'timeline' ? '#4f46e5' : 'transparent',
                color: listView === 'timeline' ? '#fff' : '#6b7280',
                fontWeight: listView === 'timeline' ? 600 : 400,
              }}
            >
              Timeline
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button
            onClick={handleWeeklyDigest}
            title="Weekly Digest"
            style={{
              fontSize: 12, padding: '3px 10px', borderRadius: 6,
              border: '1px solid #e5e7eb', cursor: 'pointer',
              background: showDigest ? '#eef2ff' : '#fff',
              color: '#4f46e5', fontWeight: 500,
            }}
          >
            {isLoadingDigest ? '...' : 'Weekly Digest'}
          </button>
        </div>
      </div>

      {/* Weekly Digest panel */}
      {showDigest && (
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', background: '#fafbff', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#4f46e5' }}>Weekly Digest</span>
            <button
              onClick={() => setShowDigest(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 2 }}
            >
              ✕
            </button>
          </div>
          {isLoadingDigest ? (
            <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Generating digest...</div>
          ) : weeklyDigest ? (
            <div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>
                {weeklyDigest.entryCount} {weeklyDigest.entryCount === 1 ? 'entry' : 'entries'} this week
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {weeklyDigest.summary}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#9ca3af' }}>No entries in the past 7 days.</div>
          )}
        </div>
      )}

      {/* Entry list / Timeline */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* Timeline view */}
        {listView === 'timeline' && (
          <div style={{ padding: '8px 16px' }}>
            {timelineGroups.length === 0 ? (
              <div style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 24 }}>No entries yet</div>
            ) : (
              <div style={{ position: 'relative', paddingLeft: 24 }}>
                {/* Vertical timeline line */}
                <div style={{ position: 'absolute', left: 8, top: 4, bottom: 4, width: 2, background: '#e5e7eb', borderRadius: 1 }} />
                {timelineGroups.map(group => (
                  <div key={group.date} style={{ marginBottom: 16, position: 'relative' }}>
                    {/* Timeline dot */}
                    <div style={{
                      position: 'absolute', left: -20, top: 4,
                      width: 10, height: 10, borderRadius: '50%',
                      background: timelineFilter === group.date ? '#4f46e5' : '#9ca3af',
                      border: '2px solid #fff',
                      boxShadow: '0 0 0 1px #e5e7eb',
                    }} />
                    {/* Date label */}
                    <button
                      onClick={() => {
                        setTimelineFilter(timelineFilter === group.date ? null : group.date);
                        setListView('list');
                      }}
                      style={{
                        display: 'block', background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: 13, fontWeight: 600, color: '#374151', padding: 0, marginBottom: 4,
                        textAlign: 'left',
                      }}
                    >
                      {group.label}
                    </button>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>
                      {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                    </div>
                    {/* Entry previews */}
                    {group.entries.slice(0, 3).map(entry => (
                      <div
                        key={entry.id}
                        onClick={() => selectEntry(entry.id)}
                        style={{
                          fontSize: 12, color: '#6b7280', padding: '3px 0', cursor: 'pointer',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {entry.title || 'Untitled'}
                      </div>
                    ))}
                    {group.entries.length > 3 && (
                      <div style={{ fontSize: 11, color: '#9ca3af' }}>+{group.entries.length - 3} more</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* List view */}
        {listView === 'list' && filteredEntries.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#9ca3af',
              padding: 32,
              textAlign: 'center',
            }}
          >
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: 12, color: '#d1d5db' }}>
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17.5 2.5a2.121 2.121 0 013 3L12 14l-4 1 1-4 8.5-8.5z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>No journal entries yet</p>
            <p style={{ margin: '4px 0 0', fontSize: 13 }}>
              Tap + to start writing your reflections
            </p>
          </div>
        ) : listView === 'list' ? (
          filteredEntries.map((entry) => (
            <div
              key={entry.id}
              onClick={() => selectEntry(entry.id)}
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid #f3f4f6',
                cursor: 'pointer',
                background: entry.id === selectedId ? '#eef2ff' : '#fff',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: '#1f2937',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {entry.title || 'Untitled'}
                  </div>
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
                    {formatDate(entry.createdAt, true)}
                    {entry.updatedAt !== entry.createdAt && (
                      <span style={{ color: '#c4b5fd' }}> · edited {formatDate(entry.updatedAt, true)}</span>
                    )}
                  </div>
                  {entry.locationName && (
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span>📍</span>{entry.locationName}
                    </div>
                  )}
                  {entry.verseRef && (
                    <div
                      style={{
                        fontSize: 11,
                        color: '#6366f1',
                        marginTop: 3,
                        display: 'inline-block',
                        background: '#eef2ff',
                        padding: '1px 6px',
                        borderRadius: 4,
                      }}
                    >
                      {entry.verseRef}
                    </div>
                  )}
                  {entry.plainText && (
                    <div
                      style={{
                        fontSize: 13,
                        color: '#6b7280',
                        marginTop: 4,
                        lineHeight: 1.4,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {truncate(entry.plainText, 120)}
                    </div>
                  )}
                </div>
                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(entry.id);
                  }}
                  title="Delete"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#d1d5db',
                    cursor: 'pointer',
                    padding: 4,
                    marginLeft: 4,
                    flexShrink: 0,
                    borderRadius: 4,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
              {/* Delete confirmation */}
              {showDeleteConfirm === entry.id && (
                <div
                  style={{
                    display: 'flex',
                    gap: 8,
                    marginTop: 8,
                    padding: '8px 0 0',
                    borderTop: '1px solid #fee2e2',
                  }}
                >
                  <span style={{ fontSize: 12, color: '#ef4444', flex: 1 }}>Delete this entry?</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(entry.id);
                    }}
                    style={{
                      fontSize: 12,
                      color: '#fff',
                      background: '#ef4444',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Delete
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(null);
                    }}
                    style={{
                      fontSize: 12,
                      color: '#6b7280',
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: 4,
                      padding: '2px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))
        ) : null}
        {/* Timeline filter indicator */}
        {listView === 'list' && timelineFilter && (
          <div style={{ padding: '6px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              Showing entries from {new Date(timelineFilter + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <button
              onClick={() => setTimelineFilter(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 2 }}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // Drawing state
  type NoteMode = 'text' | 'draw' | 'overlay';
  const [noteMode, setNoteMode] = useState<NoteMode>('text');
  const [drawingData, setDrawingData] = useState('');
  const [drawingTool, setDrawingTool] = useState<'pen' | 'marker' | 'highlighter' | 'eraser'>('pen');
  const [drawingColor, setDrawingColor] = useState('#000000');
  const [drawingSize, setDrawingSize] = useState(3);
  const canvasRef = useRef<SimpleDrawingCanvasHandle>(null);
  const { paperType, setPaperType } = usePaperType();
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const webcamStreamRef = useRef<MediaStream | null>(null);
  const [showWebcam, setShowWebcam] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const [isWritingMode, setIsWritingMode] = useState(false);

  // Detect mobile/tablet (same logic as ChatInterface)
  const isTouchDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && /Macintosh/i.test(navigator.userAgent));

  const DRAW_COLORS = ['#000000', '#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'];

  // Load drawing data when entry changes
  useEffect(() => {
    if (selectedEntry) {
      setDrawingData((selectedEntry as any).drawing || '');
    }
  }, [selectedId]);

  // Save drawing data
  const handleDrawingChange = useCallback((data: string) => {
    setDrawingData(data);
    if (!selectedId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await journalStorage.updateEntry(selectedId, { drawing: data } as any);
    }, 2000);
  }, [selectedId]);

  // File/photo selection (works on all browsers)
  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      insertImageIntoEditor(`data:${compressed.mimeType};base64,${compressed.base64}`);
    } catch {
      const reader = new FileReader();
      reader.onload = (ev) => { if (ev.target?.result) insertImageIntoEditor(ev.target.result as string); };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  }, []);

  // Webcam — open stream first, then show UI (desktop only)
  const openWebcam = useCallback(async () => {
    setShowImageMenu(false);
    setShowWebcam(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      webcamStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      setShowWebcam(false);
    }
  }, []);

  const closeWebcam = useCallback(() => {
    if (webcamStreamRef.current) {
      webcamStreamRef.current.getTracks().forEach(t => t.stop());
      webcamStreamRef.current = null;
    }
    setShowWebcam(false);
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')!.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    try {
      const compressed = await compressImageFromUrl(dataUrl);
      insertImageIntoEditor(`data:${compressed.mimeType};base64,${compressed.base64}`);
    } catch {
      insertImageIntoEditor(dataUrl);
    }
    closeWebcam();
  }, []);

  const insertImageIntoEditor = (dataUrl: string) => {
    if (editorRef.current) {
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      img.style.margin = '8px 0';
      editorRef.current.appendChild(img);
      // Trigger change
      const html = editorRef.current.innerHTML;
      const text = editorRef.current.innerText;
      handleEditorChange(html, text);
    }
  };

  const execCommand = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value);
    if (editorRef.current) {
      handleEditorChange(editorRef.current.innerHTML, editorRef.current.innerText);
    }
  };

  const handleContentEditableInput = () => {
    if (editorRef.current) {
      handleEditorChange(editorRef.current.innerHTML, editorRef.current.innerText);
    }
  };

  // Sync editor content when switching entries
  useEffect(() => {
    if (editorRef.current && selectedEntry && (noteMode === 'text' || noteMode === 'overlay')) {
      if (editorRef.current.innerHTML !== selectedEntry.content) {
        editorRef.current.innerHTML = selectedEntry.content || '';
      }
    }
  }, [selectedId, noteMode]);

  const editorContent = selectedEntry ? (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        {isMobile && (
          <button onClick={mobileBack} style={{ background: 'none', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center', fontSize: 14 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
            Back
          </button>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#9ca3af' }}>
            Created {formatDate(selectedEntry.createdAt, true)}
            {selectedEntry.updatedAt !== selectedEntry.createdAt && (
              <span> · Modified {formatDate(selectedEntry.updatedAt, true)}</span>
            )}
          </div>
          {selectedEntry.locationName && (
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
              <span>📍</span>{selectedEntry.locationName}
              {selectedEntry.latitude != null && (
                <button onClick={() => setShowMap(v => !v)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: showMap ? '#6366f1' : '#d1d5db', fontSize: 10, padding: '0 3px' }}
                  title={showMap ? 'Hide map' : 'Show map'}>
                  {showMap ? '🗺️' : '🗺️'}
                </button>
              )}
              <button onClick={async () => {
                await journalStorage.updateEntry(selectedEntry.id, { latitude: undefined, longitude: undefined, locationName: undefined });
                setEntries(prev => prev.map(e => e.id === selectedEntry.id ? { ...e, latitude: undefined, longitude: undefined, locationName: undefined } : e));
                setShowMap(false);
              }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 10, padding: '0 2px' }} title="Remove location">✕</button>
            </div>
          )}
          {selectedEntry.verseRef && (
            <div onClick={() => { if (onNavigate && selectedEntry.bookId && selectedEntry.chapter) onNavigate(selectedEntry.bookId, selectedEntry.chapter); }}
              style={{ fontSize: 12, color: '#6366f1', cursor: selectedEntry.bookId ? 'pointer' : 'default', marginTop: 2 }}>
              {selectedEntry.verseRef}
            </div>
          )}
        </div>
      </div>

      {/* Map embed — toggle with map button next to location */}
      {showMap && selectedEntry.latitude != null && selectedEntry.longitude != null && (
        <div style={{ padding: '0 16px 8px', flexShrink: 0, position: 'relative' }}>
          <iframe
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${selectedEntry.longitude - 0.02},${selectedEntry.latitude - 0.01},${selectedEntry.longitude + 0.02},${selectedEntry.latitude + 0.01}&layer=mapnik&marker=${selectedEntry.latitude},${selectedEntry.longitude}`}
            width="100%"
            height="120"
            style={{ border: 0, borderRadius: 8 }}
            loading="lazy"
            title="Entry location"
          />
          <a
            href={`https://www.google.com/maps?q=${selectedEntry.latitude},${selectedEntry.longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ position: 'absolute', bottom: 12, right: 24, fontSize: 10, color: '#6366f1', background: 'rgba(255,255,255,0.9)', padding: '1px 6px', borderRadius: 4, textDecoration: 'none' }}
          >
            Open in Google Maps
          </a>
        </div>
      )}

      {/* Webcam overlay (desktop only) */}
      {showWebcam && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', maxHeight: '60vh', borderRadius: 8, marginBottom: 12, background: '#000' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={capturePhoto} style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}>Capture</button>
            <button onClick={closeWebcam} style={{ background: '#6b7280', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', cursor: 'pointer', fontSize: 14 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Off-screen file input (iOS Safari + Chrome compatible) */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ position: 'fixed', top: '-10000px', left: '-10000px' }} />

      {/* Mode selector */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa' }}>
        {(['text', 'draw', 'overlay'] as NoteMode[]).map(m => (
          <button key={m} onClick={() => setNoteMode(m)}
            style={{ fontSize: 13, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: noteMode === m ? '#4f46e5' : '#f3f4f6', color: noteMode === m ? '#fff' : '#6b7280', fontWeight: noteMode === m ? 600 : 400 }}>
            {m === 'text' ? '📝 Text' : m === 'draw' ? '✏️ Draw' : '🔀 Both'}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        {/* Camera/photo button — mobile: OS file picker, desktop: menu with webcam + file */}
        {isTouchDevice ? (
          <button onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: '#f3f4f6', color: '#6b7280' }}
            title="Take photo / choose image">📷</button>
        ) : (
          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowImageMenu(!showImageMenu)}
              style={{ fontSize: 13, padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: showImageMenu ? '#e0e7ff' : '#f3f4f6', color: '#6b7280' }}
              title="Add photo">📷</button>
            {showImageMenu && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setShowImageMenu(false)} />
                <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: 4, background: '#fff', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', border: '1px solid #e5e7eb', padding: '4px 0', width: 150, zIndex: 50 }}>
                  <button onClick={openWebcam}
                    style={{ width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📸 Take Photo
                  </button>
                  <label style={{ width: '100%', padding: '8px 12px', textAlign: 'left', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    🖼️ Choose Photo
                    <input type="file" accept="image/*" onChange={(e) => { setShowImageMenu(false); handleImageSelect(e); }} style={{ display: 'none' }} />
                  </label>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── AI Toolbar (Phase 3 + 4) ──────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, padding: '4px 12px', borderBottom: '1px solid #f3f4f6',
        flexShrink: 0, background: '#f8f7ff', alignItems: 'center', flexWrap: 'wrap',
      }}>
        <button
          onClick={handleReflect}
          disabled={isLoadingReflection}
          title="Reflect"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: reflectionPrompt ? '#e0e7ff' : '#f3f4f6', color: '#6b7280',
            opacity: isLoadingReflection ? 0.6 : 1,
          }}
        >
          {isLoadingReflection ? '...' : '\uD83D\uDCAD Reflect'}
        </button>
        <button
          onClick={handleExtend}
          disabled={isLoadingExtend || !selectedEntry?.plainText}
          title="Extend thinking (select text or extends full entry)"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: extendResult ? '#e0e7ff' : '#f3f4f6', color: '#6b7280',
            opacity: isLoadingExtend ? 0.6 : 1,
          }}
        >
          {isLoadingExtend ? '...' : '\uD83D\uDD2D Extend'}
        </button>
        <button
          onClick={handleSummarize}
          disabled={isLoadingSummary || !selectedEntry?.plainText}
          title="Summarize"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: summaryResult ? '#e0e7ff' : '#f3f4f6', color: '#6b7280',
            opacity: isLoadingSummary ? 0.6 : 1,
          }}
        >
          {isLoadingSummary ? '...' : '\uD83D\uDCCB Summarize'}
        </button>
        <button
          onClick={handleFindScripture}
          disabled={isLoadingScripture || !selectedEntry?.plainText}
          title="Find Scripture"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: scriptureSuggestions.length > 0 ? '#e0e7ff' : '#f3f4f6', color: '#6b7280',
            opacity: isLoadingScripture ? 0.6 : 1,
          }}
        >
          {isLoadingScripture ? '...' : '\uD83D\uDCD6 Scripture'}
        </button>
        <button
          onClick={() => setShowChat(!showChat)}
          title="Chat about this entry"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: showChat ? '#e0e7ff' : '#f3f4f6', color: '#6b7280',
          }}
        >
          {'\uD83D\uDCAC Chat'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          onClick={handleShowProfile}
          title="My Spiritual Profile"
          style={{
            fontSize: 13, padding: '3px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: showProfile ? '#e0e7ff' : '#f3f4f6', color: '#6366f1', fontWeight: 500,
          }}
        >
          {'\uD83D\uDC64 Profile'}
        </button>
      </div>

      {/* ── AI Result Cards (Phase 3) ──────────────────────────────── */}

      {/* Reflection prompt card */}
      {(reflectionPrompt || isLoadingReflection) && (
        <div style={{
          margin: '8px 12px', padding: '12px 16px', borderRadius: 10,
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          border: '1px solid #ddd6fe',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{'\uD83D\uDCAD'} Reflection Prompt</span>
              {aiMeta.reflect && (
                <div style={{ fontSize: 10, color: '#8b5cf6', marginTop: 2 }}>
                  {aiMeta.reflect.model} · {new Date(aiMeta.reflect.timestamp).toLocaleString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {reflectionPrompt && !isLoadingReflection && (
                <button onClick={async () => {
                  if (!selectedId || !reflectionPrompt) return;
                  const htmlContent = mdToHtml(reflectionPrompt);
                  const metaLine = aiMeta.reflect ? `<div style="font-size:10px;color:#8b5cf6;margin-top:2px">${aiMeta.reflect.model || ''} · ${new Date(aiMeta.reflect.timestamp).toLocaleString()}</div>` : '';
                  const card = `<div style="margin:16px 0;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:1px solid #ddd6fe"><div style="font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:2px">💭 Reflection Prompt</div>${metaLine}<div style="font-size:14px;color:#374151;line-height:1.6;font-style:italic;margin-top:6px">${htmlContent}</div></div>`;
                  const newContent = (selectedEntry?.content || '') + card;
                  await journalStorage.updateEntry(selectedId, { content: newContent });
                  window.dispatchEvent(new Event('journal-updated-now'));
                  setEntries(prev => prev.map(e => e.id === selectedId ? { ...e, content: newContent } : e));
                  if (editorRef.current) editorRef.current.innerHTML = newContent;
                  setReflectionPrompt(null);
                }} style={{ background: 'none', border: '1px solid #c4b5fd', borderRadius: 4, cursor: 'pointer', color: '#7c3aed', fontSize: 11, padding: '2px 8px' }}>
                  📌 Save to note
                </button>
              )}
              <button onClick={() => setReflectionPrompt(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a78bfa', fontSize: 14, padding: 2 }}>
                {'\u2715'}
              </button>
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6, fontStyle: 'italic' }}>
            <LazyMarkdown>{reflectionPrompt || ''}</LazyMarkdown>
            {isLoadingReflection && !reflectionPrompt && (
              <span style={{ fontSize: 13, color: '#8b5cf6' }}>Reflecting...</span>
            )}
          </div>
        </div>
      )}

      {/* Proactive suggestion (when no entry selected) */}
      {!selectedEntry && proactiveSuggestion && (
        <div style={{
          margin: '8px 12px', padding: '12px 16px', borderRadius: 10,
          background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
          border: '1px solid #fde68a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#ca8a04' }}>{'\u2728'} For Today</span>
            <button onClick={() => setProactiveSuggestion(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d4a017', fontSize: 14, padding: 2 }}>
              {'\u2715'}
            </button>
          </div>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}><LazyMarkdown>{proactiveSuggestion || ''}</LazyMarkdown></div>
        </div>
      )}

      {/* Spiritual Profile & Memory modal */}
      {showProfile && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setShowProfile(false)}>
          <div style={{
            background: '#fff', borderRadius: 12, maxWidth: 540, width: '100%', maxHeight: '80vh',
            display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 0' }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#1f2937' }}>{'\uD83D\uDC64'} Personal Agent</span>
              <button onClick={() => setShowProfile(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: 2 }}>
                {'\u2715'}
              </button>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, padding: '12px 20px 0', borderBottom: '1px solid #e5e7eb' }}>
              {(['profile', 'memory', 'settings'] as const).map(tab => (
                <button key={tab} onClick={() => { setProfileTab(tab); if (tab === 'memory') spiritualMemory.getAllItems().then(setMemoryItems); }}
                  style={{
                    padding: '6px 16px', fontSize: 13, fontWeight: profileTab === tab ? 600 : 400, border: 'none', cursor: 'pointer',
                    background: 'none', color: profileTab === tab ? '#4f46e5' : '#6b7280',
                    borderBottom: profileTab === tab ? '2px solid #4f46e5' : '2px solid transparent', marginBottom: -1,
                  }}>
                  {tab === 'profile' ? 'Profile' : tab === 'memory' ? `Memory (${memoryItems.length})` : 'Settings'}
                </button>
              ))}
            </div>
            {/* Content */}
            <div style={{ overflow: 'auto', padding: '16px 20px 20px', flex: 1 }}>
              {profileTab === 'profile' ? (
                isLoadingProfile ? (
                  <div style={{ fontSize: 14, color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>Generating your spiritual profile...</div>
                ) : (
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7 }}>
                    <LazyMarkdown>{profileText || ''}</LazyMarkdown>
                  </div>
                )
              ) : profileTab === 'settings' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Agent Identity */}
                  <div style={{ padding: '10px 12px', background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#0369a1' }}>Agent Identity</span>
                      {(getAgentIdentity().name || getAgentIdentity().personality) && (
                        <button onClick={() => { resetAgentIdentity(); setProfileTab('profile'); setTimeout(() => setProfileTab('settings'), 0); }}
                          style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                          Reset
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
                      <label style={{ fontSize: 11, color: '#6b7280', width: 40, paddingTop: 4 }}>Name</label>
                      <input defaultValue={getAgentIdentity().name} placeholder="e.g. Grace, Sophia"
                        onBlur={e => setAgentIdentity({ name: e.target.value })}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <label style={{ fontSize: 11, color: '#6b7280', width: 40, paddingTop: 4 }}>Style</label>
                      <textarea defaultValue={getAgentIdentity().personality} placeholder="e.g. You are warm, encouraging, and speak with gentle wisdom. You reference scripture naturally."
                        onBlur={e => setAgentIdentity({ personality: e.target.value })}
                        rows={2}
                        style={{ flex: 1, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12, fontFamily: 'inherit', resize: 'vertical' }} />
                    </div>
                  </div>
                  {/* AI Prompts */}
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI Prompts</div>
                  {(Object.keys(DEFAULT_PROMPTS) as Array<keyof JournalPromptConfig>).map(key => {
                    const labels: Record<keyof JournalPromptConfig, string> = {
                      tag: 'Auto-Tag', digest: 'Weekly Digest', reflection: 'Reflect',
                      extend: 'Extend', summarize: 'Summarize', scripture: 'Scripture',
                      memory: 'Memory Extraction', profile: 'Profile', proactive: 'Proactive Suggestion', chat: 'Chat',
                    };
                    const current = getPrompt(key);
                    const isDefault = current === DEFAULT_PROMPTS[key];
                    return (
                      <div key={key}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{labels[key]}</label>
                          {!isDefault && (
                            <button onClick={() => { resetPrompt(key); setProfileTab('profile'); setTimeout(() => setProfileTab('settings'), 0); }}
                              style={{ fontSize: 10, color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                              Reset to default
                            </button>
                          )}
                        </div>
                        <textarea
                          defaultValue={current}
                          onBlur={e => { if (e.target.value !== DEFAULT_PROMPTS[key]) setPrompt(key, e.target.value); else resetPrompt(key); }}
                          rows={3}
                          style={{
                            width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6,
                            fontSize: 12, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5,
                            background: isDefault ? '#fff' : '#fef3c7',
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {memoryItems.length === 0 ? (
                    <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 16 }}>
                      No memories yet. Keep journaling and your agent will learn about you.
                    </div>
                  ) : (
                    (['theme', 'prayer', 'growth', 'question'] as const).map(category => {
                      const items = memoryItems.filter(m => m.category === category);
                      if (items.length === 0) return null;
                      const labels: Record<string, string> = { theme: 'Themes', prayer: 'Prayers', growth: 'Growth', question: 'Questions' };
                      const colors: Record<string, string> = { theme: '#7c3aed', prayer: '#2563eb', growth: '#16a34a', question: '#d97706' };
                      return (
                        <div key={category}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: colors[category], textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                            {labels[category]} ({items.length})
                          </div>
                          {items.map(item => (
                            <div key={item.id} style={{
                              display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderRadius: 6,
                              background: '#f9fafb', marginBottom: 4, fontSize: 13, color: '#374151',
                            }}>
                              {editingMemoryId === item.id ? (
                                <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                                  <input value={editingMemoryText} onChange={e => setEditingMemoryText(e.target.value)}
                                    style={{ flex: 1, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13 }}
                                    onKeyDown={e => { if (e.key === 'Enter') handleSaveMemoryEdit(item.id); if (e.key === 'Escape') setEditingMemoryId(null); }}
                                    autoFocus />
                                  <button onClick={() => handleSaveMemoryEdit(item.id)}
                                    style={{ background: '#4f46e5', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>Save</button>
                                  <button onClick={() => setEditingMemoryId(null)}
                                    style={{ background: '#f3f4f6', border: 'none', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
                                </div>
                              ) : (
                                <>
                                  <span style={{ flex: 1 }}>{item.content}</span>
                                  <button onClick={() => { setEditingMemoryId(item.id); setEditingMemoryText(item.content); }}
                                    title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 2 }}>
                                    {'\u270E'}
                                  </button>
                                  <button onClick={() => handleDeleteMemory(item.id)}
                                    title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 12, padding: 2 }}>
                                    {'\u2715'}
                                  </button>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Rich text toolbar — text/overlay modes */}
      {(noteMode === 'text' || noteMode === 'overlay') && (
        <div style={{ display: 'flex', gap: 2, padding: '4px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => execCommand('bold')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, fontWeight: 700 }} title="Bold">B</button>
          <button onClick={() => execCommand('italic')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, fontStyle: 'italic' }} title="Italic">I</button>
          <button onClick={() => execCommand('underline')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14, textDecoration: 'underline' }} title="Underline">U</button>
          <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 4px' }} />
          <button onClick={() => execCommand('formatBlock', 'h2')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 13, fontWeight: 600 }} title="Heading">H</button>
          <button onClick={() => execCommand('formatBlock', 'blockquote')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14 }} title="Quote">❝</button>
          <button onClick={() => execCommand('insertUnorderedList')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, fontSize: 14 }} title="List">≡</button>
        </div>
      )}

      {/* Drawing palette — draw/overlay modes */}
      {(noteMode === 'draw' || noteMode === 'overlay') && (
        <div style={{ display: 'flex', gap: 4, padding: '4px 12px', borderBottom: '1px solid #f3f4f6', flexShrink: 0, background: '#fafafa', alignItems: 'center', flexWrap: 'wrap' }}>
          {(['pen', 'marker', 'highlighter', 'eraser'] as const).map(t => (
            <button key={t} onClick={() => { setDrawingTool(t); canvasRef.current?.setTool(t); }}
              style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: drawingTool === t ? (t === 'eraser' ? '#fee2e2' : '#e0e7ff') : 'transparent' }}
              title={t}>
              {t === 'pen' ? '✏️' : t === 'marker' ? '🖊️' : t === 'highlighter' ? '🖍️' : '🧹'}
            </button>
          ))}
          <button onClick={() => canvasRef.current?.undo()} style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Undo">↩️</button>
          <button onClick={() => canvasRef.current?.clear()} style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent' }} title="Clear">🗑️</button>
          <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
          {(['plain', 'grid', 'ruled'] as PaperType[]).map(t => (
            <button key={t} onClick={() => { setPaperType(t); canvasRef.current?.setPaperType(t); }}
              style={{ fontSize: 13, padding: '3px 6px', borderRadius: 4, border: 'none', cursor: 'pointer',
                background: paperType === t ? '#e0e7ff' : 'transparent' }}
              title={t === 'plain' ? 'Plain' : t === 'grid' ? 'Grid' : 'College Ruled'}>
              {t === 'plain' ? '📄' : t === 'grid' ? '📐' : '📝'}
            </button>
          ))}
          <span style={{ width: 1, height: 16, background: '#e5e7eb', margin: '0 2px' }} />
          {DRAW_COLORS.map(color => (
            <button key={color} onClick={() => { setDrawingColor(color); canvasRef.current?.setColor(color); }}
              style={{ width: 18, height: 18, borderRadius: '50%', backgroundColor: color, border: drawingColor === color ? '2px solid #4f46e5' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
              title={color} />
          ))}
          <input type="range" min="1" max="20" value={drawingSize}
            onChange={(e) => { const s = Number(e.target.value); setDrawingSize(s); canvasRef.current?.setSize(s); }}
            style={{ width: 50, marginLeft: 4 }} />
        </div>
      )}

      {/* Editor / Canvas area */}
      <div style={{ flex: 1, overflow: 'auto', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', minHeight: noteMode === 'text' ? 'auto' : '400px' }}>
          {noteMode === 'text' && (
            <div ref={editorRef} contentEditable onInput={handleContentEditableInput}
              data-placeholder="Write your thoughts, reflections, prayers..."
              style={{ minHeight: '200px', padding: '16px 20px', outline: 'none', fontSize: 16, lineHeight: 1.7, color: '#1f2937', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }} />
          )}

          {noteMode === 'draw' && (
            <div style={{ position: 'relative', minHeight: '400px', height: '100%', background: '#f8f8f8' }}>
              <SimpleDrawingCanvas key={`draw-${selectedId}`} ref={canvasRef} onChange={handleDrawingChange} initialData={drawingData} overlayMode={false} isWritingMode={true} paperType={paperType} />
            </div>
          )}

          {noteMode === 'overlay' && (
            <div style={{ position: 'relative', minHeight: '400px', height: '100%' }}>
              <div ref={editorRef} contentEditable={!isWritingMode} onInput={handleContentEditableInput}
                data-placeholder="Write and draw..."
                style={{ minHeight: '100%', padding: '16px 20px', outline: 'none', fontSize: 16, lineHeight: 1.7, color: '#1f2937', pointerEvents: isWritingMode ? 'none' : 'auto' }} />
              <div style={{ position: 'absolute', inset: 0, zIndex: 10, pointerEvents: isWritingMode ? 'auto' : 'none' }}>
                <SimpleDrawingCanvas key={`overlay-${selectedId}`} ref={canvasRef} onChange={handleDrawingChange} initialData={drawingData} overlayMode={true} isWritingMode={isWritingMode} paperType={paperType} />
              </div>
              <div style={{ position: 'absolute', bottom: 8, right: 8, zIndex: 20 }}>
                <button onClick={() => setIsWritingMode(!isWritingMode)}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: isWritingMode ? '#e0e7ff' : '#f3f4f6', color: isWritingMode ? '#4f46e5' : '#6b7280' }}>
                  {isWritingMode ? '✏️ Drawing' : '📝 Typing'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── AI Result Cards below editor (Phase 3) ──────────── */}

        {/* Extend result */}
        {(extendResult || isLoadingExtend) && (
          <div style={{
            margin: '0 12px 8px', padding: '12px 16px', borderRadius: 10,
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '1px solid #bbf7d0', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#16a34a' }}>{'\uD83D\uDD2D'} Extended Thinking</span>
                {aiMeta.extend && (
                  <div style={{ fontSize: 10, color: '#4ade80', marginTop: 2 }}>
                    {aiMeta.extend.model} · {new Date(aiMeta.extend.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {extendResult && !isLoadingExtend && (
                  <button onClick={async () => {
                    if (!selectedId || !extendResult) return;
                    const htmlContent = mdToHtml(extendResult);
                    const metaLine = aiMeta.extend ? `<div style="font-size:10px;color:#4ade80;margin-top:2px">${aiMeta.extend.model || ''} · ${new Date(aiMeta.extend.timestamp).toLocaleString()}</div>` : '';
                    const card = `<div style="margin:16px 0;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:1px solid #bbf7d0"><div style="font-size:12px;font-weight:600;color:#16a34a;margin-bottom:2px">🔭 Extended Thinking</div>${metaLine}<div style="font-size:14px;color:#374151;line-height:1.6;margin-top:6px">${htmlContent}</div></div>`;
                    const newContent = (selectedEntry?.content || '') + card;
                    await journalStorage.updateEntry(selectedId, { content: newContent });
                    window.dispatchEvent(new Event('journal-updated-now'));
                    setEntries(prev => prev.map(e => e.id === selectedId ? { ...e, content: newContent } : e));
                    if (editorRef.current) editorRef.current.innerHTML = newContent;
                    setExtendResult(null); // Dismiss card — content is now in the editor
                  }} style={{ background: 'none', border: '1px solid #86efac', borderRadius: 4, cursor: 'pointer', color: '#16a34a', fontSize: 11, padding: '2px 8px' }}>
                    📌 Save to note
                  </button>
                )}
                <button onClick={() => setExtendResult(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#86efac', fontSize: 14, padding: 2 }}>
                  {'\u2715'}
                </button>
              </div>
            </div>
            {isLoadingExtend ? (
              <div style={{ fontSize: 13, color: '#22c55e' }}>Extending your thoughts...</div>
            ) : (
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                <LazyMarkdown>{extendResult || ''}</LazyMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Summary result */}
        {(summaryResult || isLoadingSummary) && (
          <div style={{
            margin: '0 12px 8px', padding: '12px 16px', borderRadius: 10,
            background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)',
            border: '1px solid #fde68a', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#ca8a04' }}>{'\uD83D\uDCCB'} Summary</span>
                {aiMeta.summary && (
                  <div style={{ fontSize: 10, color: '#d97706', marginTop: 2 }}>
                    {aiMeta.summary.model} · {new Date(aiMeta.summary.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {summaryResult && !isLoadingSummary && (
                  <button onClick={async () => {
                    if (!selectedId || !summaryResult) return;
                    const htmlContent = mdToHtml(summaryResult);
                    const metaLine = aiMeta.summary ? `<div style="font-size:10px;color:#d97706;margin-top:2px">${aiMeta.summary.model || ''} · ${new Date(aiMeta.summary.timestamp).toLocaleString()}</div>` : '';
                    const card = `<div style="margin:16px 0;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#fefce8 0%,#fef9c3 100%);border:1px solid #fde68a"><div style="font-size:12px;font-weight:600;color:#ca8a04;margin-bottom:2px">📋 Summary</div>${metaLine}<div style="font-size:14px;color:#374151;line-height:1.6;margin-top:6px">${htmlContent}</div></div>`;
                    const newContent = (selectedEntry?.content || '') + card;
                    await journalStorage.updateEntry(selectedId, { content: newContent });
                    window.dispatchEvent(new Event('journal-updated-now'));
                    setEntries(prev => prev.map(e => e.id === selectedId ? { ...e, content: newContent } : e));
                    if (editorRef.current) editorRef.current.innerHTML = newContent;
                    setSummaryResult(null);
                  }} style={{ background: 'none', border: '1px solid #fcd34d', borderRadius: 4, cursor: 'pointer', color: '#ca8a04', fontSize: 11, padding: '2px 8px' }}>
                    📌 Save to note
                  </button>
                )}
                <button onClick={() => setSummaryResult(null)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fcd34d', fontSize: 14, padding: 2 }}>
                  {'\u2715'}
                </button>
              </div>
            </div>
            {isLoadingSummary ? (
              <div style={{ fontSize: 13, color: '#ca8a04' }}>Summarizing...</div>
            ) : (
              <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                <LazyMarkdown>{summaryResult || ''}</LazyMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Scripture suggestions */}
        {(scriptureSuggestions.length > 0 || isLoadingScripture) && (
          <div style={{
            margin: '0 12px 8px', padding: '12px 16px', borderRadius: 10,
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            border: '1px solid #bfdbfe', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#2563eb' }}>{'\uD83D\uDCD6'} Related Scripture</span>
                {aiMeta.scripture && (
                  <div style={{ fontSize: 10, color: '#3b82f6', marginTop: 2 }}>
                    {aiMeta.scripture.model} · {new Date(aiMeta.scripture.timestamp).toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {scriptureSuggestions.length > 0 && (
                  <button onClick={async () => {
                    if (!selectedId) return;
                    const refs = scriptureSuggestions.map(s => {
                      // Build a search URL for the verse reference
                      const searchUrl = `https://www.biblegateway.com/passage/?search=${encodeURIComponent(s.reference)}&version=CUVS`;
                      return `<div style="margin:4px 0;padding:6px 10px;border-radius:6px;background:rgba(255,255,255,0.6);border:1px solid #dbeafe"><a href="${searchUrl}" target="_blank" rel="noopener noreferrer" style="font-size:13px;font-weight:600;color:#2563eb;text-decoration:underline;cursor:pointer">${s.reference}</a><div style="font-size:12px;color:#6b7280;margin-top:2px">${s.reason}</div></div>`;
                    }).join('');
                    const metaLine = aiMeta.scripture ? `<div style="font-size:10px;color:#3b82f6;margin-top:2px">${aiMeta.scripture.model || ''} · ${new Date(aiMeta.scripture.timestamp).toLocaleString()}</div>` : '';
                    const card = `<div style="margin:16px 0;padding:12px 16px;border-radius:10px;background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:1px solid #bfdbfe"><div style="font-size:12px;font-weight:600;color:#2563eb;margin-bottom:2px">📖 Related Scripture</div>${metaLine}<div style="margin-top:6px">${refs}</div></div>`;
                    const newContent = (selectedEntry?.content || '') + card;
                    await journalStorage.updateEntry(selectedId, { content: newContent });
                    window.dispatchEvent(new Event('journal-updated-now'));
                    setEntries(prev => prev.map(e => e.id === selectedId ? { ...e, content: newContent } : e));
                    if (editorRef.current) editorRef.current.innerHTML = newContent;
                    setScriptureSuggestions([]);
                  }} style={{ background: 'none', border: '1px solid #93c5fd', borderRadius: 4, cursor: 'pointer', color: '#2563eb', fontSize: 11, padding: '2px 8px' }}>
                    📌 Save to note
                  </button>
                )}
                <button onClick={() => setScriptureSuggestions([])}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#93c5fd', fontSize: 14, padding: 2 }}>
                  {'\u2715'}
                </button>
              </div>
            </div>
            {isLoadingScripture ? (
              <div style={{ fontSize: 13, color: '#3b82f6' }}>Finding relevant verses...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scriptureSuggestions.map((s, i) => (
                  <div key={i} style={{
                    padding: '6px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.6)',
                    cursor: 'pointer', border: '1px solid #dbeafe',
                  }} onClick={() => {
                    if (onNavigate) {
                      // Parse reference like "Genesis 2:2-3" or "Hebrews 4:9-10"
                      const match = s.reference.match(/^(\d?\s*[A-Za-z]+)\s+(\d+)/);
                      if (match) {
                        const bookName = match[1].trim();
                        const chapter = parseInt(match[2]);
                        // Look up book ID from BIBLE_BOOKS
                        const book = BIBLE_BOOKS.find((b: any) =>
                          b.name.toLowerCase().includes(bookName.toLowerCase()) ||
                          bookName.toLowerCase().includes(b.name.split(' ').pop()?.toLowerCase() || '')
                        );
                        if (book) {
                          onNavigate(book.id, chapter);
                        }
                      }
                    }
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#2563eb', textDecoration: 'underline' }}>{s.reference}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{s.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chat panel */}
        {showChat && (
          <div style={{
            margin: '0 12px 8px', padding: '12px 16px', borderRadius: 10,
            background: '#f9fafb', border: '1px solid #e5e7eb', flexShrink: 0,
            maxHeight: 300, display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>{'\uD83D\uDCAC'} Chat about this entry</span>
              <button onClick={() => { setShowChat(false); setChatMessages([]); setChatInput(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 2 }}>
                {'\u2715'}
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {chatMessages.length === 0 && (
                <div style={{ fontSize: 13, color: '#9ca3af', fontStyle: 'italic' }}>
                  Ask a question about your entry...
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 13, lineHeight: 1.5,
                  background: msg.role === 'user' ? '#eef2ff' : '#fff',
                  color: '#374151', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '85%', border: msg.role === 'assistant' ? '1px solid #e5e7eb' : 'none',
                }}>
                  {msg.role === 'assistant' ? <LazyMarkdown>{msg.text}</LazyMarkdown> : msg.text}
                  {msg.role === 'assistant' && msg.meta?.model && (
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>
                      {msg.meta.racePool && msg.meta.racePool.length > 0 && (
                        <span title={msg.meta.racePool.map((r: any) => `${r.model} (${r.provider})`).join(', ')} style={{ background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 4px', marginRight: 4, fontSize: 9, fontWeight: 600 }}>
                          race {msg.meta.racePool.length}
                        </span>
                      )}
                      {msg.meta.model}
                    </div>
                  )}
                </div>
              ))}
              {isLoadingChat && (
                <div style={{ fontSize: 12, color: '#9ca3af' }}>Thinking...</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSend(); } }}
                placeholder="Ask about your entry..."
                style={{
                  flex: 1, padding: '6px 10px', border: '1px solid #e5e7eb', borderRadius: 6,
                  fontSize: 13, outline: 'none', fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || isLoadingChat}
                style={{
                  padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 500,
                  opacity: !chatInput.trim() || isLoadingChat ? 0.5 : 1,
                }}
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* ── Tags ────────────────────────────────────────────────── */}
        {selectedEntry && (selectedEntry.tags.length > 0 || suggestedTags.length > 0 || isLoadingTags) && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            {/* Existing tags */}
            {selectedEntry.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: suggestedTags.length > 0 ? 6 : 0 }}>
                {selectedEntry.tags.map(tag => (
                  <span key={tag} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontSize: 12, padding: '2px 8px', borderRadius: 12,
                    background: '#eef2ff', color: '#4f46e5',
                  }}>
                    {tag}
                    <button onClick={() => removeTag(tag)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a5b4fc', fontSize: 11, padding: 0, lineHeight: 1 }}>
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
            {/* Suggested tags */}
            {isLoadingTags && suggestedTags.length === 0 && (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Analyzing for tags...</div>
            )}
            {suggestedTags.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 4 }}>Suggested tags:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {suggestedTags.map(tag => (
                    <span key={tag} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 3,
                      fontSize: 12, padding: '2px 8px', borderRadius: 12,
                      background: '#f3f4f6', color: '#6b7280', border: '1px dashed #d1d5db',
                    }}>
                      {tag}
                      <button onClick={() => acceptTag(tag)} title="Accept"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#22c55e', fontSize: 13, padding: 0, lineHeight: 1 }}>
                        +
                      </button>
                      <button onClick={() => dismissTag(tag)} title="Dismiss"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', fontSize: 11, padding: 0, lineHeight: 1 }}>
                        x
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Related entries ─────────────────────────────────────── */}
        {selectedEntry && (relatedEntries.length > 0 || isLoadingRelated) && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid #f3f4f6', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Related Entries</div>
            {isLoadingRelated ? (
              <div style={{ fontSize: 12, color: '#9ca3af' }}>Finding related entries...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {relatedEntries.map(related => (
                  <div
                    key={related.id}
                    onClick={() => selectEntry(related.id)}
                    style={{
                      padding: '6px 10px', borderRadius: 6, background: '#f9fafb',
                      cursor: 'pointer', border: '1px solid #f3f4f6',
                      transition: 'background 0.15s',
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = '#eef2ff')}
                    onMouseOut={e => (e.currentTarget.style.background = '#f9fafb')}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>
                      {related.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                      {new Date(related.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>
                      {related.snippet}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#d1d5db', fontSize: 15, padding: 32 }}>
      <div>Select an entry or create a new one</div>
      {/* Proactive suggestion card */}
      {proactiveSuggestion && (
        <div style={{
          marginTop: 20, padding: '14px 18px', borderRadius: 10, maxWidth: 400,
          background: 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)',
          border: '1px solid #ddd6fe', textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', marginBottom: 6 }}>{'\u2728'} Suggestion for today</div>
          <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}><LazyMarkdown>{proactiveSuggestion || ''}</LazyMarkdown></div>
        </div>
      )}
      {isLoadingProactive && (
        <div style={{ marginTop: 16, fontSize: 13, color: '#9ca3af' }}>Loading suggestion...</div>
      )}
    </div>
  );

  // Mobile layout: show list or editor
  if (isMobile) {
    return (
      <div style={{ height: '100%', background: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        {mobileShowEditor && selectedEntry ? editorContent : listContent}
      </div>
    );
  }

  // Desktop layout: side-by-side
  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        background: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          width: 280,
          minWidth: 220,
          borderRight: '1px solid #f3f4f6',
          flexShrink: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {listContent}
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>{editorContent}</div>
    </div>
  );
};

export default JournalView;
