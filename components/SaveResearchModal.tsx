import React, { useState, useEffect } from 'react';
import { BIBLE_BOOKS } from '../constants';
import { verseDataStorage } from '../services/verseDataStorage';
import { Dialog } from './Dialog';

interface SaveResearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  query: string;
  response: string;
  selectedText?: string;
  currentBookId?: string;
  currentChapter?: number;
  imageData?: string; // base64 image data (optional)
  imageMimeType?: string; // e.g., 'image/jpeg', 'image/png'
}

const SaveResearchModal: React.FC<SaveResearchModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  query,
  response,
  selectedText,
  currentBookId,
  currentChapter,
  imageData,
  imageMimeType
}) => {
  const [selectedBook, setSelectedBook] = useState<string>(currentBookId || 'genesis');
  const [selectedChapter, setSelectedChapter] = useState<number>(currentChapter || 1);
  const [selectedVerse, setSelectedVerse] = useState<number>(1);
  const [tags, setTags] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  // Helper function to decode HTML entities and preserve formatting
  const decodeHtmlEntities = (text: string): string => {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
  };

  useEffect(() => {
    if (currentBookId) setSelectedBook(currentBookId);
    if (currentChapter) setSelectedChapter(currentChapter);

    // Try to extract verse number from the query
    if (query) {
      // Look for patterns like "1:7", "Chapter 1:7", "Corinthians 1:7", or "第1章7节"
      const verseMatch = query.match(/\d+[:：](\d+)/);
      if (verseMatch) {
        setSelectedVerse(Number(verseMatch[1]));
      } else {
        // Also try pattern like "第7节" or "verse 7"
        const altMatch = query.match(/(?:第|verse\s+)(\d+)(?:节|\s|$)/i);
        if (altMatch) {
          setSelectedVerse(Number(altMatch[1]));
        }
      }
    }
  }, [currentBookId, currentChapter, query]);

  const handleSave = async () => {
    setIsSaving(true);

    try {
      const tagArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Create MediaAttachment if image data is provided
      let imageAttachment: import('../types/verseData').MediaAttachment | undefined;
      if (imageData && imageMimeType) {
        const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // Extract base64 data (remove data URL prefix if present)
        const base64Data = imageData.includes(',') ? imageData.split(',')[1] : imageData;
        
        // Calculate size
        const sizeInBytes = Math.ceil((base64Data.length * 3) / 4);
        
        imageAttachment = {
          id: imageId,
          type: 'image',
          data: base64Data,
          mimeType: imageMimeType,
          size: sizeInBytes,
          timestamp: Date.now(),
        };
      }

      await verseDataStorage.addAIResearch(
        selectedBook,
        selectedChapter,
        [selectedVerse],
        {
          query: decodeHtmlEntities(query),
          response: decodeHtmlEntities(response),
          selectedText: selectedText ? decodeHtmlEntities(selectedText) : undefined,
          tags: tagArray,
          image: imageAttachment
        }
      );

      // Update reading history to indicate this chapter has AI research
      const { readingHistory } = await import('../services/readingHistory');
      await readingHistory.updateChapterStatus(
        selectedBook,
        selectedChapter,
        undefined,
        true
      );

      // Call success callback if provided
      if (onSuccess) {
        onSuccess();
      }

      onClose();
    } catch (error) {
      // TODO: use error reporting service
      alert('Failed to save research. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const selectedBookData = BIBLE_BOOKS.find(b => b.id === selectedBook);
  const maxChapters = selectedBookData?.chapters || 1;

  const decodedQuery = decodeHtmlEntities(query);
  const decodedResponse = decodeHtmlEntities(response);
  const previewResponse = decodedResponse.length > 200
    ? decodedResponse.substring(0, 200) + '...'
    : decodedResponse;

  const actions = (
    <>
      <button
        className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
        onClick={onClose}
      >
        Cancel
      </button>
      <button
        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        onClick={handleSave}
        disabled={isSaving}
      >
        {isSaving ? 'Saving...' : 'Save Research'}
      </button>
    </>
  );

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Save AI Research to Verse"
      maxWidth="max-w-lg"
      zIndex="z-[10000]"
      actions={actions}
    >
      <div className="space-y-4">
        {/* Research Preview */}
        <div className="bg-slate-50 rounded-lg p-3 space-y-2">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Query:</p>
            <p className="text-sm text-slate-700">{decodedQuery}</p>
          </div>
          {imageData && imageMimeType && (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1">Image:</p>
              <img
                src={`data:${imageMimeType};base64,${imageData}`}
                alt="Research preview"
                className="max-w-full max-h-48 rounded border border-slate-200 object-contain"
              />
            </div>
          )}
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1">Response:</p>
            <p
              className="text-sm text-slate-700 max-h-24 overflow-y-auto"
              style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word', fontFamily: 'system-ui, -apple-system, sans-serif' }}
            >
              {previewResponse}
            </p>
          </div>
        </div>

        {/* Verse Selector */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700">Select Verse Location</h3>

          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-medium text-slate-600 shrink-0">Book:</label>
            <select
              value={selectedBook}
              onChange={(e) => {
                setSelectedBook(e.target.value);
                setSelectedChapter(1);
                setSelectedVerse(1);
              }}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {BIBLE_BOOKS.map(book => (
                <option key={book.id} value={book.id}>
                  {book.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-medium text-slate-600 shrink-0">Chapter:</label>
            <select
              value={selectedChapter}
              onChange={(e) => {
                setSelectedChapter(Number(e.target.value));
                setSelectedVerse(1);
              }}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            >
              {Array.from({ length: maxChapters }, (_, i) => i + 1).map(num => (
                <option key={num} value={num}>
                  Chapter {num}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="w-16 text-xs font-medium text-slate-600 shrink-0">Verse:</label>
            <input
              type="number"
              min="1"
              value={selectedVerse}
              onChange={(e) => setSelectedVerse(Number(e.target.value))}
              className="flex-1 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">
            Tags (optional, comma-separated):
          </label>
          <input
            type="text"
            placeholder="e.g., faith, prophecy, history"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
        </div>
      </div>
    </Dialog>
  );
};

export default SaveResearchModal;
