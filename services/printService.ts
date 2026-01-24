import { NoteData } from '../types';

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
    // Parse the ID (e.g., "GEN:1:5" or "GEN:1")
    const parts = id.split(':');
    const bookId = parts[0];
    const chapter = parseInt(parts[1]);
    const verse = parts[2] ? parseInt(parts[2]) : undefined;
    
    // Get book name from ID
    const bookNames: Record<string, string> = {
      'GEN': '创世记',
      'EXO': '出埃及记',
      'LEV': '利未记',
      'NUM': '民数记',
      'DEU': '申命记',
      'JOS': '约书亚记',
      'JDG': '士师记',
      'RUT': '路得记',
      '1SA': '撒母耳记上',
      '2SA': '撒母耳记下',
      '1KI': '列王纪上',
      '2KI': '列王纪下',
      '1CH': '历代志上',
      '2CH': '历代志下',
      'EZR': '以斯拉记',
      'NEH': '尼希米记',
      'EST': '以斯帖记',
      'JOB': '约伯记',
      'PSA': '诗篇',
      'PRO': '箴言',
      'ECC': '传道书',
      'SON': '雅歌',
      'ISA': '以赛亚书',
      'JER': '耶利米书',
      'LAM': '耶利米哀歌',
      'EZE': '以西结书',
      'DAN': '但以理书',
      'HOS': '何西阿书',
      'JOE': '约珥书',
      'AMO': '阿摩司书',
      'OBA': '俄巴底亚书',
      'JON': '约拿书',
      'MIC': '弥迦书',
      'NAH': '那鸿书',
      'HAB': '哈巴谷书',
      'ZEP': '西番雅书',
      'HAG': '哈该书',
      'ZEC': '撒迦利亚书',
      'MAL': '玛拉基书',
      'MAT': '马太福音',
      'MAR': '马可福音',
      'LUK': '路加福音',
      'JOH': '约翰福音',
      'ACT': '使徒行传',
      'ROM': '罗马书',
      '1CO': '哥林多前书',
      '2CO': '哥林多后书',
      'GAL': '加拉太书',
      'EPH': '以弗所书',
      'PHI': '腓立比书',
      'COL': '歌罗西书',
      '1TH': '帖撒罗尼迦前书',
      '2TH': '帖撒罗尼迦后书',
      '1TI': '提摩太前书',
      '2TI': '提摩太后书',
      'TIT': '提多书',
      'PHM': '腓利门书',
      'HEB': '希伯来书',
      'JAM': '雅各书',
      '1PE': '彼得前书',
      '2PE': '彼得后书',
      '1JO': '约翰一书',
      '2JO': '约翰二书',
      '3JO': '约翰三书',
      'JUD': '犹大书',
      'REV': '启示录'
    };
    
    try {
      const noteData: NoteData = content ? JSON.parse(content) : { text: '', drawing: '' };
      
      printableNotes.push({
        id,
        bookName: bookNames[bookId] || bookId,
        chapter,
        verse,
        content: noteData
      });
    } catch (e) {
      // Handle plain text notes (backward compatibility)
      printableNotes.push({
        id,
        bookName: bookNames[bookId] || bookId,
        chapter,
        verse,
        content: { text: content, drawing: '' }
      });
    }
  });
  
  // Sort by book order, chapter, and verse
  return printableNotes.sort((a, b) => {
    const bookOrder = Object.keys(bookNames);
    const aBookIndex = bookOrder.indexOf(a.id.split(':')[0]);
    const bBookIndex = bookOrder.indexOf(b.id.split(':')[0]);
    
    if (aBookIndex !== bBookIndex) return aBookIndex - bBookIndex;
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
  if (notes.length > 5) {
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
  const notesWithDrawings = notes.filter(n => n.content.drawing && n.content.drawing.length > 200).length;
  
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
    
    if (note.content.drawing && note.content.drawing.length > 200) {
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
  
  // Open print window
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printHTML);
    printWindow.document.close();
    
    // Wait for images to load before printing
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 500);
    };
  }
};