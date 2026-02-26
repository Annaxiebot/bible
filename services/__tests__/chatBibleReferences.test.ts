import { describe, it, expect } from 'vitest';
import { parseBibleReference, parseMessage } from '../chatBibleReferences';

describe('parseBibleReference', () => {
  it('parses English book:chapter:verse reference', () => {
    const ref = parseBibleReference('Genesis 1:1');
    expect(ref).not.toBeNull();
    expect(ref!.bookId).toBe('GEN');
    expect(ref!.chapter).toBe(1);
    expect(ref!.verses).toEqual([1]);
  });

  it('parses English verse range', () => {
    const ref = parseBibleReference('Genesis 1:1-3');
    expect(ref).not.toBeNull();
    expect(ref!.verses).toEqual([1, 2, 3]);
  });

  it('parses Psalms reference', () => {
    const ref = parseBibleReference('Psalms 23:1');
    expect(ref).not.toBeNull();
    expect(ref!.bookId).toBe('PSA');
    expect(ref!.chapter).toBe(23);
  });

  it('handles Psalm alias (singular)', () => {
    const ref = parseBibleReference('Psalm 23:1');
    expect(ref).not.toBeNull();
    expect(ref!.bookId).toBe('PSA');
  });

  it('returns null for non-reference text', () => {
    expect(parseBibleReference('hello world')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseBibleReference('')).toBeNull();
  });
});

describe('parseMessage', () => {
  it('splits assistant messages on [SPLIT]', () => {
    const result = parseMessage('中文内容[SPLIT]English content', 'assistant');
    expect(result.zh).toBe('中文内容');
    expect(result.en).toBe('English content');
  });

  it('returns content as zh for assistant without split', () => {
    const result = parseMessage('Some response', 'assistant');
    expect(result.zh).toBe('Some response');
    expect(result.en).toBe('Analysis in progress...');
  });

  it('parses user messages with 中文/English markers', () => {
    const result = parseMessage('中文:你好\nEnglish:hello', 'user');
    expect(result.zh).toBe('你好');
    expect(result.en).toBe('hello');
  });

  it('returns same content for both sides when no markers', () => {
    const result = parseMessage('plain text', 'user');
    expect(result.zh).toBe('plain text');
    expect(result.en).toBe('plain text');
  });
});
