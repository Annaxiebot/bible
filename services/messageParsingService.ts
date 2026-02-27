/**
 * Message parsing service.
 *
 * Pure functions for parsing AI responses and detecting Bible references
 * within rendered text.  Re-exports the core parsers from chatBibleReferences
 * and adds the React-node text-processing helper used by the chat UI.
 */

import React from 'react';
import { BIBLE_BOOKS, CHINESE_ABBREV_TO_BOOK_ID } from '../constants';
import { BOOK_ID_TO_CHINESE_NAME } from './bibleBookData';
import {
  BibleRef,
  BOOK_ID_TO_ENGLISH,
  parseBibleReference,
  parseMessage,
} from './chatBibleReferences';

// Re-export for consumers that previously imported directly from ChatInterface
export type { BibleRef };
export { parseBibleReference, parseMessage, BOOK_ID_TO_ENGLISH };

const CHINESE_BOOK_MAP = CHINESE_ABBREV_TO_BOOK_ID;

const ENGLISH_BOOK_ALIASES: Record<string, string> = {
  'Psalm': 'Psalms',
  'Song of Solomon': 'Song of Songs',
  'Revelation': 'Revelations',
  'Revelations': 'Revelation',
};

/**
 * Escapes special regex metacharacters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the combined regex pattern that matches Bible references in both
 * Chinese and English within free text.
 */
function buildBibleRefPattern(): RegExp {
  const chineseBookNames = Object.keys(CHINESE_BOOK_MAP)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|');

  const englishNames = BIBLE_BOOKS.map(b => b.name.split(' ').slice(1).join(' '));
  const allEnglishNames = [...englishNames, ...Object.keys(ENGLISH_BOOK_ALIASES)];
  const englishBookNames = allEnglishNames.map(escapeRegex).join('|');

  return new RegExp(
    `《?(${chineseBookNames})》?\\s*\\d+[:：]\\d+(?:-\\d+)?` +
    `|《?(${chineseBookNames})》?\\s*\\d+[章篇]` +
    `|(${englishBookNames})\\s+\\d+[:：]\\d+(?:-\\d+)?` +
    `|(?<!\\d)\\d{1,3}[:：]\\d{1,3}(?:-\\d{1,3})?(?!\\d)`,
    'gi',
  );
}

/**
 * Processes a plain-text string, splitting it into an array of React nodes
 * where detected Bible references are replaced with clickable `BibleLink`
 * elements produced by the supplied factory function.
 *
 * Keeping this function in the service layer (rather than the component)
 * requires the caller to provide the link factory — this keeps the service
 * free of React component imports while still being testable.
 *
 * @param text           - Input plain text.
 * @param currentBookId  - Optional current book ID used to resolve standalone
 *                         chapter:verse references (e.g. "3:16").
 * @param makeBibleLink  - Factory that wraps a matched reference string in a
 *                         React node (typically a clickable anchor or span).
 * @returns An array of React nodes (strings + link elements).
 */
export function processTextWithBibleRefs(
  text: string,
  currentBookId: string | undefined,
  makeBibleLink: (matchedText: string, key: number) => React.ReactNode,
): React.ReactNode {
  if (typeof text !== 'string') return text;

  const combinedPattern = buildBibleRefPattern();
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = combinedPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const matchedText = match[0];
    const isStandalone = /^\d{1,3}[:：]\d{1,3}(?:-\d{1,3})?$/.test(matchedText);

    if (isStandalone && currentBookId) {
      const currentBook = BIBLE_BOOKS.find(b => b.id === currentBookId);
      if (currentBook) {
        const chineseName = BOOK_ID_TO_CHINESE_NAME[currentBookId];
        const displayRef = `${chineseName}${matchedText}`;
        parts.push(makeBibleLink(displayRef, match.index));
      } else {
        parts.push(matchedText);
      }
    } else {
      parts.push(makeBibleLink(matchedText, match.index));
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? React.createElement(React.Fragment, null, ...parts) : text;
}
