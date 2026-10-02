/**
 * AskAnswerMemo.test.tsx — the react-markdown components map must be stable
 * across streaming re-renders. During streaming every token re-renders
 * AskAnswer; a fresh components map each time would re-mount the override
 * tree (flicker). LazyMarkdown is mocked here to capture the prop identity,
 * so this file stays separate from the rendering tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'fs';
import React from 'react';
import { parseStudyPack, StudyPack } from '../packTypes';
import { TEST_PACK_PATH } from './fixtures';

const captured: unknown[] = [];
vi.mock('../../LazyMarkdown', () => ({
  default: ({ components, children }: { components: unknown; children: string }) => {
    captured.push(components);
    return <div>{children}</div>;
  },
}));

// Imported after the mock so AskAnswer binds to the mocked LazyMarkdown.
import AskAnswer from '../AskAnswer';

const pack: StudyPack = parseStudyPack(JSON.parse(readFileSync(TEST_PACK_PATH, 'utf-8')));

describe('AskAnswer markdown components identity', () => {
  it('keeps the same components map across re-renders with the same pack', () => {
    const { rerender } = render(<AskAnswer text="streaming " pack={pack} />);
    rerender(<AskAnswer text="streaming tok" pack={pack} />);
    rerender(<AskAnswer text="streaming token" pack={pack} />);
    expect(captured.length).toBeGreaterThanOrEqual(3);
    expect(captured[1]).toBe(captured[0]);
    expect(captured[2]).toBe(captured[0]);
  });

  it('rebuilds the map only when the pack changes', () => {
    captured.length = 0;
    const otherPack = { ...pack };
    const { rerender } = render(<AskAnswer text="a" pack={pack} />);
    rerender(<AskAnswer text="b" pack={otherPack} />);
    expect(captured[1]).not.toBe(captured[0]);
  });
});
