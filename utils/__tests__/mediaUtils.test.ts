import { describe, it, expect } from 'vitest';
import { extractBase64Data, createMediaAttachment } from '../mediaUtils';

describe('extractBase64Data', () => {
  it('strips data URL prefix', () => {
    const input = 'data:image/png;base64,abc123==';
    expect(extractBase64Data(input)).toBe('abc123==');
  });

  it('returns string unchanged when no comma is present', () => {
    expect(extractBase64Data('abc123==')).toBe('abc123==');
  });

  it('handles jpeg data URLs', () => {
    expect(extractBase64Data('data:image/jpeg;base64,xyz')).toBe('xyz');
  });
});

describe('createMediaAttachment', () => {
  it('creates a valid attachment from a data URL', () => {
    const attachment = createMediaAttachment('data:image/png;base64,abc', 'image/png');
    expect(attachment.type).toBe('image');
    expect(attachment.mimeType).toBe('image/png');
    expect(attachment.data).toBe('abc');
    expect(attachment.id).toMatch(/^img_\d+_\w+$/);
    expect(attachment.size).toBeGreaterThan(0);
    expect(attachment.timestamp).toBeGreaterThan(0);
  });

  it('creates a valid attachment from raw base64', () => {
    const attachment = createMediaAttachment('abc123==', 'image/jpeg');
    expect(attachment.data).toBe('abc123==');
    expect(attachment.mimeType).toBe('image/jpeg');
  });

  it('generates unique IDs for different calls', () => {
    const a = createMediaAttachment('data:image/png;base64,abc', 'image/png');
    const b = createMediaAttachment('data:image/png;base64,abc', 'image/png');
    expect(a.id).not.toBe(b.id);
  });

  it('calculates a non-zero size', () => {
    const attachment = createMediaAttachment('data:image/png;base64,YWJj', 'image/png');
    expect(attachment.size).toBeGreaterThan(0);
  });
});
