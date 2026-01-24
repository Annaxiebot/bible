
import { NoteData } from '../types';

/**
 * Downloads a single note as a JSON file.
 */
export const downloadNote = (fileName: string, data: NoteData) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName.replace(/:/g, '_')}.bible-note`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Reads a .bible-note (JSON) file from a user-provided File object.
 */
export const readNoteFile = (file: File): Promise<NoteData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (typeof json.text === 'string' && typeof json.drawing === 'string') {
          resolve(json as NoteData);
        } else {
          reject(new Error("文件格式不正确"));
        }
      } catch (err) {
        reject(new Error("无法解析 JSON 文件"));
      }
    };
    reader.onerror = () => reject(new Error("文件读取失败"));
    reader.readAsText(file);
  });
};

/**
 * Downloads the entire library of notes as a single file.
 */
export const exportAllNotes = (notes: Record<string, string>) => {
  const data = {
    type: 'BIBLE_SCHOLAR_LIBRARY',
    version: 1,
    exportedAt: new Date().toISOString(),
    notes: notes
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bible_Notes_Library_${new Date().toISOString().split('T')[0]}.bible-library`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Reads a .bible-library file.
 */
export const readLibraryFile = (file: File): Promise<Record<string, string>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.type === 'BIBLE_SCHOLAR_LIBRARY' && json.notes) {
          resolve(json.notes);
        } else {
          reject(new Error("不是有效的笔记库文件"));
        }
      } catch (err) {
        reject(new Error("无法解析库文件"));
      }
    };
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsText(file);
  });
};
