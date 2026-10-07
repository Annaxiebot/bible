/**
 * guideFixtureRequest.ts — the fixture guide as the New-study form hands it on · 测试用讲义请求
 *
 * The text is what guidePdf.test.ts proves pdfjs extracts from the committed
 * PDF (pages joined by a blank line); the passage is what guidePassage finds.
 */
import type { StudyRequest } from '../../packAssembly';
import type { LoadedGuide } from '../loadGuide';
import { detectGuidePassage } from '../guidePassage';
import { GUIDE_FIXTURE_FILE, GUIDE_PAGES } from './guideFixture';

export const GUIDE_TEXT = GUIDE_PAGES.map(page => page.join('\n')).join('\n\n');

export const LOADED_GUIDE: LoadedGuide = {
  name: GUIDE_FIXTURE_FILE, pages: GUIDE_PAGES.length, text: GUIDE_TEXT, passage: detectGuidePassage(GUIDE_TEXT),
};

/** Mark 1:1–15, Chinese with English keywords — the reply in guideFixture is drafted that way. */
export const GUIDE_REQUEST: StudyRequest = {
  bookId: 'MRK', chapter: 1, verseFrom: 1, verseTo: 15, date: '2026-10-09', contentLanguage: 'zh-keywords', guide: LOADED_GUIDE,
};
