/**
 * guideStrings.ts — every user-visible string of the study-guide PDF path · 讲义文案 (ADR-0019)
 *
 * Single source (R3): components render these, unit + e2e tests import
 * them. Chinese first (ADR-0003 §1). Pure module (no React). "{n}" / "{name}"
 * are filled by the caller.
 */
import { bilingualLine } from '../../studypack/principles';

export const GD_PICK = bilingualLine('从讲义 PDF 生成', 'From a study-guide PDF');
export const GD_READING = bilingualLine('正在读取讲义…', 'Reading the guide…');
/** Banner over the form once a guide is read: "{name}", "{n}" pages. */
export const GD_LOADED = bilingualLine('讲义：{name}（{n} 页）', 'Guide: {name} ({n} pages)');
export const GD_DROP = bilingualLine('不用讲义', 'Without the guide');
/** "{ref}" = the passage found in the guide. */
export const GD_PASSAGE_FOUND = bilingualLine('讲义的经文：{ref}，请确认', 'Passage in the guide: {ref} — please confirm');
export const GD_PASSAGE_UNSURE = bilingualLine('没能确定讲义的经文，请选择', 'Could not tell the guide\'s passage — please choose');
export const GD_PRIVACY = bilingualLine(
  'PDF 只在你的浏览器里读取；只有其中的文字发给 AI', 'The PDF is read in your browser; only its text goes to the AI'
);

// ---- reading errors ----
export const GD_ERR_NOT_PDF = bilingualLine('请选择 PDF 文件', 'Please choose a PDF file');
/** "{n}" = the size cap in MB. */
export const GD_ERR_TOO_BIG = bilingualLine('PDF 太大（超过 {n} MB）', 'The PDF is too large (over {n} MB)');
/** "{n}" = the page cap. */
export const GD_ERR_TOO_MANY_PAGES = bilingualLine('PDF 页数太多（超过 {n} 页）', 'The PDF has too many pages (over {n})');
/** "{n}" = the character cap. */
export const GD_ERR_TOO_MUCH_TEXT = bilingualLine(
  '讲义文字太多（超过 {n} 字），请只保留这一课', 'The guide has too much text (over {n} characters) — keep just this lesson'
);
export const GD_ERR_NO_TEXT = bilingualLine(
  '这份 PDF 没有可读文字（可能是扫描件）', 'This PDF has no readable text (it may be a scan)'
);
export const GD_ERR_PASSWORD = bilingualLine('这份 PDF 有密码保护', 'This PDF is password-protected');
export const GD_ERR_UNREADABLE = bilingualLine('无法读取这份 PDF', 'This PDF could not be read');

// ---- editor marks ----
export const GD_FROM_GUIDE = bilingualLine('讲义原文', 'From the guide');
export const GD_AI_DRAFTED = bilingualLine('AI 补充', 'AI-drafted');
export const GD_NOT_VERBATIM = bilingualLine('与讲义原文不符', 'not word-for-word from the guide');
