import { NoteData } from '../types';
import { getChineseName, getBookIndex, BIBLE_BOOKS } from './bibleBookData';
import { verseDataStorage } from './verseDataStorage';
import { annotationStorage } from './annotationStorage';
import { bibleStorage } from './bibleStorage';
import { PRINT, TIMING, DRAWING } from '../constants/appConfig';
import { resizeBase64Image, isNonEmptyDrawing, migratePathDataToBase64 } from './simpleCanvasRenderer';
import type { VerseData, AIResearchEntry } from '../types/verseData';

export interface PrintableNote {
  id: string;
  bookName: string;
  chapter: number;
  verse?: number;
  content: NoteData;
}

export const formatNotesForPrint = (notes: Record<string, string>): PrintableNote[] => {
  const printableNotes: PrintableNote[] = [];

  Object.entries(notes).forEach(([id, content]) => {
    const parts = id.split(':');
    const bookId = parts[0];
    const chapter = parseInt(parts[1]);
    const verse = parts[2] ? parseInt(parts[2]) : undefined;

    try {
      const noteData: NoteData = content ? JSON.parse(content) : { text: '', drawing: '' };
      printableNotes.push({
        id,
        bookName: getChineseName(bookId),
        chapter,
        verse,
        content: noteData
      });
    } catch (e) {
      printableNotes.push({
        id,
        bookName: getChineseName(bookId),
        chapter,
        verse,
        content: { text: content, drawing: '' }
      });
    }
  });

  return printableNotes.sort((a, b) => {
    const aIdx = getBookIndex(a.id.split(':')[0]);
    const bIdx = getBookIndex(b.id.split(':')[0]);
    if (aIdx !== bIdx) return aIdx - bIdx;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    if (!a.verse) return -1;
    if (!b.verse) return 1;
    return a.verse - b.verse;
  });
};

export const generatePrintHTML = (notes: PrintableNote[]): string => {
  const currentDate = new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>圣经研读笔记 - ${currentDate}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 2cm;
      }
      .no-print {
        display: none !important;
      }
      .page-break {
        page-break-after: always;
      }
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
      line-height: 1.8;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    
    h1 {
      text-align: center;
      color: #2c3e50;
      border-bottom: 3px solid #3498db;
      padding-bottom: 15px;
      margin-bottom: 30px;
    }
    
    .print-info {
      text-align: center;
      color: #7f8c8d;
      margin-bottom: 40px;
      font-size: 14px;
    }
    
    .note-entry {
      margin-bottom: 35px;
      padding: 20px;
      background: #f8f9fa;
      border-left: 4px solid #3498db;
      border-radius: 5px;
    }
    
    .note-header {
      font-weight: bold;
      color: #2c3e50;
      font-size: 18px;
      margin-bottom: 15px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    
    .note-reference {
      color: #3498db;
    }
    
    .note-timestamp {
      font-size: 12px;
      color: #95a5a6;
      font-weight: normal;
    }
    
    .note-content {
      padding-left: 20px;
      color: #2c3e50;
    }
    
    .note-content blockquote {
      border-left: 3px solid #95a5a6;
      padding-left: 15px;
      margin: 15px 0;
      color: #555;
      font-style: italic;
    }
    
    .note-drawing {
      margin-top: 15px;
      text-align: center;
    }
    
    .note-drawing img {
      max-width: 100%;
      height: auto;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 10px;
      background: white;
    }
    
    .empty-note {
      color: #95a5a6;
      font-style: italic;
    }
    
    .print-button {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 10px 20px;
      background: #3498db;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      z-index: 1000;
    }
    
    .print-button:hover {
      background: #2980b9;
    }
    
    .toc {
      margin-bottom: 40px;
      padding: 20px;
      background: #ecf0f1;
      border-radius: 5px;
    }
    
    .toc h2 {
      color: #2c3e50;
      margin-bottom: 15px;
      font-size: 20px;
    }
    
    .toc-item {
      margin: 5px 0;
      color: #34495e;
    }
    
    .note-content h1, .note-content h2, .note-content h3 {
      color: #2c3e50;
      margin-top: 20px;
      margin-bottom: 10px;
    }
    
    .note-content ul, .note-content ol {
      padding-left: 30px;
      margin: 10px 0;
    }
    
    .note-content li {
      margin: 5px 0;
    }
    
    .statistics {
      margin: 30px 0;
      padding: 20px;
      background: #e8f4f8;
      border-radius: 5px;
      text-align: center;
    }
    
    .statistics h3 {
      color: #2c3e50;
      margin-bottom: 10px;
    }
    
    .stat-item {
      display: inline-block;
      margin: 0 20px;
      color: #34495e;
    }
    
    .stat-number {
      font-size: 24px;
      font-weight: bold;
      color: #3498db;
    }
  </style>
</head>
<body>
  <button class="print-button no-print" onclick="window.print()">🖨️ 打印笔记</button>
  
  <h1>📖 圣经研读笔记</h1>
  
  <div class="print-info">
    <div>打印日期：${currentDate}</div>
    <div>共 ${notes.length} 条笔记</div>
  </div>
`;

  // Add table of contents
  if (notes.length > PRINT.TOC_MIN_NOTES) {
    html += `
  <div class="toc no-print">
    <h2>目录</h2>`;
    
    let currentBook = '';
    notes.forEach(note => {
      if (note.bookName !== currentBook) {
        currentBook = note.bookName;
        html += `<div class="toc-item"><strong>${currentBook}</strong></div>`;
      }
    });
    
    html += `</div>`;
  }
  
  // Add statistics
  const bookCount = new Set(notes.map(n => n.bookName)).size;
  const notesWithDrawings = notes.filter(n => n.content.drawing && n.content.drawing.length > PRINT.DRAWING_MIN_LENGTH).length;
  
  html += `
  <div class="statistics no-print">
    <h3>笔记统计</h3>
    <span class="stat-item">
      <span class="stat-number">${bookCount}</span> 卷书
    </span>
    <span class="stat-item">
      <span class="stat-number">${notes.length}</span> 条笔记
    </span>
    ${notesWithDrawings > 0 ? `<span class="stat-item">
      <span class="stat-number">${notesWithDrawings}</span> 幅图画
    </span>` : ''}
  </div>`;
  
  // Add notes
  let currentBookForNotes = '';
  notes.forEach((note, index) => {
    // Add page break between books for better printing
    if (note.bookName !== currentBookForNotes && index > 0) {
      html += '<div class="page-break"></div>';
      currentBookForNotes = note.bookName;
    } else if (currentBookForNotes === '') {
      currentBookForNotes = note.bookName;
    }
    
    const reference = note.verse 
      ? `${note.bookName} ${note.chapter}:${note.verse}`
      : `${note.bookName} ${note.chapter}章`;
    
    html += `
  <div class="note-entry">
    <div class="note-header">
      <span class="note-reference">📌 ${reference}</span>
      ${note.content.timestamp ? `<span class="note-timestamp">${new Date(note.content.timestamp).toLocaleString('zh-CN')}</span>` : ''}
    </div>
    <div class="note-content">`;
    
    if (note.content.text && note.content.text.trim()) {
      // Process the HTML content
      let processedText = note.content.text;
      // Ensure proper formatting for printing
      processedText = processedText.replace(/<br\s*\/?>/gi, '<br/>');
      processedText = processedText.replace(/\n/g, '<br/>');
      
      html += processedText;
    } else {
      html += '<span class="empty-note">（无文字笔记）</span>';
    }
    
    if (note.content.drawing && note.content.drawing.length > PRINT.DRAWING_MIN_LENGTH) {
      html += `
      <div class="note-drawing">
        <img src="${note.content.drawing}" alt="手绘图" />
      </div>`;
    }
    
    html += `
    </div>
  </div>`;
  });
  
  html += `
  <div class="print-info" style="margin-top: 60px; border-top: 1px solid #ddd; padding-top: 20px;">
    <div>✨ 愿主的话语成为我们脚前的灯，路上的光 ✨</div>
    <div style="margin-top: 10px; font-size: 12px;">圣经研读智能助手 - The Bible App</div>
  </div>
  
</body>
</html>`;
  
  return html;
};

export const printNotes = (notes: Record<string, string>) => {
  const printableNotes = formatNotesForPrint(notes);
  const printHTML = generatePrintHTML(printableNotes);

  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHTML);
    printWindow.document.close();
    printWindow.onload = () => setTimeout(() => printWindow.print(), TIMING.PRINT_WINDOW_DELAY_MS);
  }
};

// =====================================================
// Lightweight Markdown → HTML for print output
// =====================================================

function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities first (but preserve existing tags if any)
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Code blocks (``` ... ```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) =>
    `<pre style="background:#f4f4f4;padding:10px;border-radius:4px;overflow-x:auto;font-size:12px;"><code>${code.trim()}</code></pre>`
  );

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f0f0f0;padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>');

  // Headers (process line by line to avoid mid-line matches)
  html = html.replace(/^#### (.+)$/gm, '<h4 style="margin:12px 0 6px;color:#2c3e50;">$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3 style="margin:14px 0 8px;color:#2c3e50;">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 style="margin:16px 0 8px;color:#2c3e50;">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 style="margin:18px 0 10px;color:#2c3e50;">$1</h1>');

  // Bold + italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Unordered lists: convert consecutive "- " or "* " lines into <ul>
  html = html.replace(/^([ \t]*[-*] .+(?:\n[ \t]*[-*] .+)*)/gm, (block) => {
    const items = block.split('\n').map(line => {
      const indent = line.match(/^([ \t]*)/)?.[1].length || 0;
      const text = line.replace(/^[ \t]*[-*] /, '');
      return `<li style="margin-left:${indent > 0 ? '20px' : '0'}">${text}</li>`;
    }).join('');
    return `<ul style="padding-left:20px;margin:6px 0;">${items}</ul>`;
  });

  // Ordered lists: convert consecutive "1. " lines into <ol>
  html = html.replace(/^(\d+\. .+(?:\n\d+\. .+)*)/gm, (block) => {
    const items = block.split('\n').map(line => {
      const text = line.replace(/^\d+\. /, '');
      return `<li>${text}</li>`;
    }).join('');
    return `<ol style="padding-left:20px;margin:6px 0;">${items}</ol>`;
  });

  // Blockquotes
  html = html.replace(/^&gt; (.+)$/gm, '<blockquote style="border-left:3px solid #ccc;padding-left:12px;color:#555;margin:8px 0;">$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid #ddd;margin:12px 0;">');

  // Line breaks: convert remaining newlines (but not inside block elements)
  html = html.replace(/\n/g, '<br/>');

  // Clean up double <br/> after block elements
  html = html.replace(/(<\/(?:h[1-4]|ul|ol|pre|blockquote|hr)>)<br\/>/g, '$1');
  html = html.replace(/<br\/>(<(?:h[1-4]|ul|ol|pre|blockquote|hr))/g, '$1');

  return html;
}

// =====================================================
// NEW: Comprehensive Print (all data types)
// =====================================================

export interface PrintableSection {
  reference: string;
  bookId: string;
  chapter: number;
  verses?: number[];
  verseText?: string;
  personalNote?: string;
  noteTimestamp?: number;
  drawings?: string[];       // data URLs from canvasRenderer
  aiResearch?: Array<{ query: string; response: string; timestamp: number }>;
  /** Full chapter text with annotation overlay for annotated chapters */
  annotationPage?: {
    chapterVerses: Array<{ verse: number; text: string }>;
    annotationImage: string; // transparent PNG data URL
    canvasWidth: number;
    canvasHeight: number;
    fontSize: number;
    extraHeight: number;
  };
}

export interface PrintOptions {
  includeVerseText?: boolean;
  includeAI?: boolean;
  includeDrawings?: boolean;
  dateFrom?: number;
  dateTo?: number;
  bookId?: string;
  chapterFrom?: number;
  chapterTo?: number;
}

/** Gather all printable data from storage */
export async function gatherPrintData(options?: PrintOptions): Promise<PrintableSection[]> {
  const {
    includeVerseText = true,
    includeAI = true,
    includeDrawings = true,
    dateFrom,
    dateTo,
    bookId: filterBookId,
    chapterFrom,
    chapterTo,
  } = options || {};
  const sections: PrintableSection[] = [];

  // Get all verse data (notes + AI research)
  const allVerseData = await verseDataStorage.getAllData();

  for (const vd of allVerseData) {
    // Book/chapter filter
    if (filterBookId && vd.bookId !== filterBookId) continue;
    if (filterBookId && chapterFrom && vd.chapter < chapterFrom) continue;
    if (filterBookId && chapterTo && vd.chapter > chapterTo) continue;

    // Check if note passes date filter (skip auto-generated annotation placeholder)
    const noteTs = vd.personalNote?.updatedAt || vd.personalNote?.createdAt;
    const noteInRange = noteTs && (!dateFrom || noteTs >= dateFrom) && (!dateTo || noteTs <= dateTo);
    const isPlaceholder = vd.personalNote?.text?.trim() === '[Has handwritten annotations]';
    const hasNote = vd.personalNote?.text?.trim() && !isPlaceholder && (!dateFrom && !dateTo ? true : noteInRange);

    // Filter AI research entries by date
    let aiEntries = includeAI && vd.aiResearch ? vd.aiResearch : [];
    if ((dateFrom || dateTo) && aiEntries.length > 0) {
      aiEntries = aiEntries.filter(r =>
        (!dateFrom || r.timestamp >= dateFrom) && (!dateTo || r.timestamp <= dateTo)
      );
    }
    const hasAI = aiEntries.length > 0;

    if (!hasNote && !hasAI) continue;

    const chineseName = getChineseName(vd.bookId);
    const verseStr = vd.verses?.length ? vd.verses.join(',') : '';
    const reference = verseStr ? `${chineseName} ${vd.chapter}:${verseStr}` : `${chineseName} ${vd.chapter}章`;

    let verseText: string | undefined;
    if (includeVerseText && vd.verses?.length) {
      try {
        const cuvData = await bibleStorage.getChapter(vd.bookId, vd.chapter, 'cuv');
        if (cuvData?.verses) {
          verseText = vd.verses
            .map(v => cuvData.verses.find((cv: any) => cv.verse === v)?.text)
            .filter(Boolean)
            .join(' ');
        }
      } catch { /* verse text unavailable */ }
    }

    const section: PrintableSection = {
      reference,
      bookId: vd.bookId,
      chapter: vd.chapter,
      verses: vd.verses,
      verseText,
      personalNote: hasNote ? vd.personalNote!.text : undefined,
      noteTimestamp: hasNote ? noteTs : undefined,
      aiResearch: hasAI ? aiEntries.map(r => ({ query: r.query, response: r.response, timestamp: r.timestamp })) : undefined,
    };

    // Include notebook drawing if present
    if (includeDrawings && vd.personalNote?.drawing) {
      try {
        // Migrate old path data or use base64 data directly
        const base64Data = migratePathDataToBase64(vd.personalNote.drawing);
        if (isNonEmptyDrawing(base64Data)) {
          const resizedImage = await resizeBase64Image(base64Data, PRINT.DRAWING_RENDER_WIDTH, PRINT.DRAWING_RENDER_HEIGHT);
          section.drawings = [resizedImage];
        }
      } catch { /* invalid drawing data */ }
    }

    sections.push(section);
  }

  // Add inline annotations as full Bible page with overlay
  // Use getAnnotationsForBook to find all annotations (including panel-specific ones)
  if (includeDrawings) {
    const booksToScan = filterBookId ? BIBLE_BOOKS.filter(b => b.id === filterBookId) : BIBLE_BOOKS;
    for (const book of booksToScan) {
      try {
        const allAnnotations = await annotationStorage.getAnnotationsForBook(book.id);
        if (allAnnotations.length === 0) continue;

        // Group by chapter (merge chinese/english panels into one)
        const byChapter = new Map<number, typeof allAnnotations>();
        for (const ann of allAnnotations) {
          // Apply chapter range filter
          if (filterBookId && chapterFrom && ann.chapter < chapterFrom) continue;
          if (filterBookId && chapterTo && ann.chapter > chapterTo) continue;

          if (!byChapter.has(ann.chapter)) byChapter.set(ann.chapter, []);
          byChapter.get(ann.chapter)!.push(ann);
        }

        for (const [ch, annotations] of byChapter) {
          // Pick the annotation with the most data (or first one)
          const ann = annotations.reduce((best, curr) =>
            (curr.canvasData.length > best.canvasData.length) ? curr : best
          );

          try {
            // Migrate old path data or use base64 data directly
            const base64Data = migratePathDataToBase64(ann.canvasData);
            if (!isNonEmptyDrawing(base64Data)) continue;

            const w = ann.canvasWidth || 800;
            const extraH = ann.canvasHeight || 0;  // stored canvasHeight = extra expanded area
            const fs = ann.fontSize || 18;

            // Fetch the chapter text for the Bible page
            let chapterVerses: Array<{ verse: number; text: string }> = [];
            try {
              const cuvData = await bibleStorage.getChapter(book.id, ch, 'cuv');
              if (cuvData?.verses) {
                chapterVerses = cuvData.verses.map((v: any) => ({ verse: v.verse, text: v.text }));
              }
            } catch { /* text unavailable */ }

            // Resize annotation image for printing
            const renderH = DRAWING.PRINT_RENDER_HEIGHT; // tall enough to cover any chapter
            const annotationImage = await resizeBase64Image(base64Data, w, renderH);

            // Find existing section or create new one
            let existing = sections.find(s => s.bookId === book.id && s.chapter === ch && !s.verses?.length);
            if (!existing) {
              existing = {
                reference: `${getChineseName(book.id)} ${ch}章`,
                bookId: book.id,
                chapter: ch,
              };
              sections.push(existing);
            }
            existing.annotationPage = {
              chapterVerses,
              annotationImage,
              canvasWidth: w,
              canvasHeight: renderH,
              fontSize: fs,
              extraHeight: extraH,
            };
          } catch { /* skip invalid annotation data */ }
        }
      } catch { /* skip book */ }
    }
  }

  // Sort by book order, chapter, verse
  sections.sort((a, b) => {
    const aIdx = getBookIndex(a.bookId);
    const bIdx = getBookIndex(b.bookId);
    if (aIdx !== bIdx) return aIdx - bIdx;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    const aVerse = a.verses?.[0] ?? 0;
    const bVerse = b.verses?.[0] ?? 0;
    return aVerse - bVerse;
  });

  return sections;
}

/** Generate HTML for comprehensive print */
export function generateStudyPrintHTML(sections: PrintableSection[]): string {
  const currentDate = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
  const noteCount = sections.filter(s => s.personalNote).length;
  const aiCount = sections.reduce((sum, s) => sum + (s.aiResearch?.length || 0), 0);
  const drawingCount = sections.reduce((sum, s) => sum + (s.drawings?.length || 0), 0);
  const bookCount = new Set(sections.map(s => s.bookId)).size;

  let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>圣经研读笔记 - ${currentDate}</title>
<style>
* { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
@media print {
  @page { size: A4; margin: 1.5cm; }
  .no-print { display: none !important; }
  .page-break { page-break-after: always; }
  body { padding: 0; }
  .section { break-inside: avoid; }
  .annot-page { break-before: page; break-inside: auto; }
}
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; line-height: 1.8; color: #222; max-width: 800px; margin: 0 auto; padding: 20px; }
h1 { text-align: center; color: #1a1a2e; border-bottom: 3px solid #3498db; padding-bottom: 15px; font-size: 24px; }
.info { text-align: center; color: #666; margin-bottom: 30px; font-size: 14px; }
.section { margin-bottom: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #3498db; border-radius: 5px; }
.ref { font-weight: bold; color: #2563eb; font-size: 16px; margin-bottom: 8px; }
.verse-text { color: #333; font-style: italic; margin-bottom: 10px; padding: 8px; background-color: #e8e8ff; border-radius: 4px; font-size: 14px; border: 1px solid #c8c8e8; }
.note-text { color: #1a1a1a; margin-bottom: 10px; }
.ai-block { margin: 10px 0; padding: 10px; background-color: #e8f0ff; border-radius: 4px; border: 1px solid #c8d8f0; }
.ai-q { font-weight: bold; color: #1a1a2e; font-size: 13px; display: flex; justify-content: space-between; align-items: baseline; }
.ai-ts { font-weight: normal; font-size: 11px; color: #777; white-space: nowrap; margin-left: 8px; }
.note-ts { font-size: 11px; color: #777; margin-bottom: 4px; }
.ai-a { color: #222; font-size: 13px; margin-top: 4px; }
.ai-a h1, .ai-a h2, .ai-a h3, .ai-a h4 { font-size: 14px; color: #1a1a2e; margin: 10px 0 6px; }
.ai-a ul, .ai-a ol { margin: 4px 0; padding-left: 20px; }
.ai-a li { margin: 2px 0; }
.ai-a pre { font-size: 12px; background-color: #f0f0f0; padding: 8px; border-radius: 4px; }
.ai-a strong { color: #1a1a2e; }
.ai-a blockquote { border-left: 3px solid #aaa; padding-left: 10px; color: #444; margin: 8px 0; }
.drawing img { max-width: 100%; border: 1px solid #ddd; border-radius: 4px; margin: 8px 0; }
.stats { margin: 20px 0; padding: 15px; background-color: #e8f4f8; border-radius: 5px; text-align: center; }
.stat { display: inline-block; margin: 0 15px; } .stat-n { font-size: 22px; font-weight: bold; color: #2563eb; }
.print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background-color: #3498db; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; z-index: 1000; }
.print-btn:hover { background-color: #2980b9; }
.annot-page { margin-bottom: 30px; border: 1px solid #ccc; border-radius: 5px; overflow: hidden; }
.annot-header { padding: 12px 15px; background-color: #f0f4ff; border-bottom: 1px solid #ddd; font-weight: bold; color: #2563eb; font-size: 16px; }
.annot-container { position: relative; overflow: hidden; margin: 0 auto; max-width: 100%; transform-origin: top left; }
.annot-text { position: relative; z-index: 0; color: #3A3028; }
.annot-text .v { padding: 4px; display: inline; }
.annot-text .vn { font-weight: bold; color: #8B7355; font-size: 0.75em; vertical-align: super; margin-right: 3px; }
.annot-overlay { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 1; }
.annot-overlay img { display: block; }
.annot-extra { height: 0; } /* extra expanded space placeholder */
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print</button>
<h1>圣经研读笔记</h1>
<div class="info">${currentDate} | ${sections.length} sections</div>
<div class="stats no-print">
  <span class="stat"><span class="stat-n">${bookCount}</span> books</span>
  <span class="stat"><span class="stat-n">${noteCount}</span> notes</span>
  ${aiCount > 0 ? `<span class="stat"><span class="stat-n">${aiCount}</span> AI research</span>` : ''}
  ${drawingCount > 0 ? `<span class="stat"><span class="stat-n">${drawingCount}</span> drawings</span>` : ''}
</div>`;

  let currentBook = '';
  sections.forEach((s, i) => {
    if (s.bookId !== currentBook && i > 0) {
      html += '<div class="page-break"></div>';
    }
    currentBook = s.bookId;

    // Annotated chapter: render as Bible page with drawing overlay
    if (s.annotationPage) {
      const ap = s.annotationPage;
      const containerW = ap.canvasWidth;
      const fs = ap.fontSize;

      html += `<div class="annot-page">`;
      html += `<div class="annot-header">${s.reference}</div>`;
      // Container matches the exact width and font size used when annotation was drawn
      html += `<div class="annot-container" style="width:${containerW}px; font-size:${fs}px; line-height:1.625;">`;

      // Bible text layer
      html += `<div class="annot-text">`;
      if (ap.chapterVerses.length > 0) {
        ap.chapterVerses.forEach(v => {
          html += `<span class="v"><span class="vn">${v.verse}</span>${v.text}</span>`;
        });
      } else {
        html += `<div style="color:#999;font-style:italic;padding:15px;">Bible text not available offline for this chapter.</div>`;
      }
      // Extra expanded area that was part of the canvas
      if (ap.extraHeight > 0) {
        html += `<div class="annot-extra" style="height:${ap.extraHeight}px;"></div>`;
      }
      html += `</div>`;

      // Annotation overlay — exact pixel width matches the container for alignment
      html += `<div class="annot-overlay"><img src="${ap.annotationImage}" style="width:${containerW}px;" alt="annotations" /></div>`;
      html += `</div></div>`;

      // Still render any non-annotation content (personal notes, AI research) below
      const hasOtherContent = s.personalNote || s.aiResearch;
      if (hasOtherContent) {
        html += `<div class="section" style="margin-top:10px;">`;
        if (s.personalNote) {
          if (s.noteTimestamp) {
            html += `<div class="note-ts">${new Date(s.noteTimestamp).toLocaleString('zh-CN')}</div>`;
          }
          html += `<div class="note-text">${markdownToHtml(s.personalNote)}</div>`;
        }
        if (s.aiResearch) {
          s.aiResearch.forEach(r => {
            const tsStr = r.timestamp ? `<span class="ai-ts">${new Date(r.timestamp).toLocaleString('zh-CN')}</span>` : '';
            html += `<div class="ai-block"><div class="ai-q"><span>Q: ${r.query}</span>${tsStr}</div><div class="ai-a">${markdownToHtml(r.response)}</div></div>`;
          });
        }
        html += `</div>`;
      }
    } else {
      // Regular section (no annotation overlay)
      html += `<div class="section"><div class="ref">${s.reference}</div>`;

      if (s.verseText) {
        html += `<div class="verse-text">${s.verseText}</div>`;
      }
      if (s.personalNote) {
        if (s.noteTimestamp) {
          html += `<div class="note-ts">${new Date(s.noteTimestamp).toLocaleString('zh-CN')}</div>`;
        }
        html += `<div class="note-text">${markdownToHtml(s.personalNote)}</div>`;
      }
      if (s.drawings) {
        html += '<div class="drawing">';
        s.drawings.forEach(d => { html += `<img src="${d}" alt="drawing" />`; });
        html += '</div>';
      }
      if (s.aiResearch) {
        s.aiResearch.forEach(r => {
          const tsStr = r.timestamp ? `<span class="ai-ts">${new Date(r.timestamp).toLocaleString('zh-CN')}</span>` : '';
          html += `<div class="ai-block"><div class="ai-q"><span>Q: ${r.query}</span>${tsStr}</div><div class="ai-a">${markdownToHtml(r.response)}</div></div>`;
        });
      }

      html += '</div>';
    }
  });

  html += `<div class="info" style="margin-top:40px;border-top:1px solid #ddd;padding-top:15px;">愿主的话语成为我们脚前的灯，路上的光</div>
<script>
// Scale annotation containers to fit print page width while preserving text/drawing alignment
document.querySelectorAll('.annot-container').forEach(function(el) {
  var naturalW = el.scrollWidth;
  var parentW = el.parentElement.clientWidth;
  if (naturalW > parentW) {
    var scale = parentW / naturalW;
    el.style.transform = 'scale(' + scale + ')';
    el.style.transformOrigin = 'top left';
    el.style.width = naturalW + 'px';
    // Adjust parent height to match scaled content
    el.parentElement.style.height = (el.scrollHeight * scale) + 'px';
    el.parentElement.style.overflow = 'hidden';
  }
});
</script>
</body></html>`;
  return html;
}

/** Print all study notes (new comprehensive version) */
export async function printStudyNotes(options?: PrintOptions) {
  const sections = await gatherPrintData(options);
  if (sections.length === 0) {
    alert('No notes or research to print.');
    return;
  }
  const html = generateStudyPrintHTML(sections);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.onload = () => setTimeout(() => printWindow.print(), TIMING.PRINT_WINDOW_DELAY_MS);
  }
}