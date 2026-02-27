import { verseDataStorage } from '../verseDataStorage';
import { VerseData } from '../../types/verseData';
import { BIBLE_BOOKS } from '../../constants';
import { BibleNotesExport } from './exportTypes';
import { stripHTML } from '../../utils/textUtils';

export function calculateMetadata(data: VerseData[]) {
  const booksSet = new Set<string>();
  let totalNotes = 0;
  let totalResearch = 0;

  for (const item of data) {
    booksSet.add(item.bookId);
    if (item.personalNote) totalNotes++;
    totalResearch += item.aiResearch.length;
  }

  return { totalNotes, totalResearch, booksIncluded: Array.from(booksSet) };
}

export function groupByBook(data: VerseData[]): Record<string, VerseData[]> {
  const grouped: Record<string, VerseData[]> = {};
  for (const item of data) {
    if (!grouped[item.bookId]) grouped[item.bookId] = [];
    grouped[item.bookId].push(item);
  }
  return grouped;
}

function sortVerses(verses: VerseData[]): VerseData[] {
  return [...verses].sort((a, b) => {
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verses[0] - b.verses[0];
  });
}

export async function exportToJSON(deviceId: string): Promise<string> {
  const allData = await verseDataStorage.getAllData();
  const metadata = calculateMetadata(allData);

  const dataObject: { [key: string]: VerseData } = {};
  allData.forEach(item => { dataObject[item.id] = item; });

  const exportData: BibleNotesExport = {
    version: '1.0',
    exportDate: new Date().toISOString(),
    deviceId,
    metadata,
    data: dataObject,
  };

  return JSON.stringify(exportData, null, 2);
}

function htmlToMarkdown(html: string): string {
  const withNewlines = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '\n')
    .replace(/<\/p>/gi, '\n');
  return stripHTML(withNewlines)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export async function exportToMarkdown(): Promise<string> {
  const allData = await verseDataStorage.getAllData();
  let markdown = '# Bible Notes Export\n\n';
  markdown += `**Export Date:** ${new Date().toLocaleDateString()}\n\n---\n\n`;

  const groupedByBook = groupByBook(allData);

  for (const [bookId, verses] of Object.entries(groupedByBook)) {
    const book = BIBLE_BOOKS.find(b => b.id === bookId);
    if (!book) continue;

    markdown += `## ${book.name}\n\n`;
    for (const verse of sortVerses(verses)) {
      markdown += `### ${book.name} ${verse.chapter}:${verse.verses.join('-')}\n\n`;
      if (verse.personalNote) {
        markdown += `**Personal Note:**\n${htmlToMarkdown(verse.personalNote.text)}\n\n`;
      }
      if (verse.aiResearch.length > 0) {
        markdown += '**AI Research:**\n\n';
        for (const research of verse.aiResearch) {
          markdown += `- **Q:** ${research.query}\n  **A:** ${research.response}\n\n`;
          if (research.tags?.length) {
            markdown += `  _Tags: ${research.tags.join(', ')}_\n\n`;
          }
        }
      }
      markdown += '---\n\n';
    }
  }

  return markdown;
}

export async function exportToHTML(): Promise<string> {
  const allData = await verseDataStorage.getAllData();
  const groupedByBook = groupByBook(allData);

  const header = buildHTMLHeader();
  let body = '';

  for (const [bookId, verses] of Object.entries(groupedByBook)) {
    const book = BIBLE_BOOKS.find(b => b.id === bookId);
    if (!book) continue;

    body += `<h2>${book.name}</h2>\n`;
    for (const verse of sortVerses(verses)) {
      body += formatVerseHTML(verse, book.name, escapeHtml);
    }
  }

  return `${header}${body}</body></html>`;
}

function buildHTMLHeader(): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bible Notes Export</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; } h2 { color: #4f46e5; margin-top: 30px; } h3 { color: #666; }
    .note { background: #f8f8f8; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .research { background: #e0e7ff; padding: 15px; border-radius: 8px; margin: 10px 0; }
    .tags { color: #666; font-size: 0.9em; font-style: italic; }
    .timestamp { color: #999; font-size: 0.85em; }
  </style>
</head>
<body>
  <h1>Bible Notes Export</h1>
  <p class="timestamp">Export Date: ${new Date().toLocaleDateString()}</p>
`;
}

function formatVerseHTML(
  verse: VerseData,
  bookName: string,
  escape: (text: string) => string,
): string {
  let html = `<h3>${bookName} ${verse.chapter}:${verse.verses.join('-')}</h3>\n`;

  if (verse.personalNote) {
    html += `<div class="note"><strong>Personal Note:</strong><br>\n${verse.personalNote.text}\n</div>\n`;
  }

  if (verse.aiResearch.length > 0) {
    html += '<div class="research"><strong>AI Research:</strong>\n<ul>\n';
    for (const research of verse.aiResearch) {
      html += `<li><strong>Q:</strong> ${escape(research.query)}<br>\n`;
      html += `<strong>A:</strong> ${escape(research.response)}`;
      if (research.tags?.length) {
        html += `<br><span class="tags">Tags: ${research.tags.join(', ')}</span>`;
      }
      html += '\n</li>\n';
    }
    html += '</ul>\n</div>\n';
  }

  return html;
}
