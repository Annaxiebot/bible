/**
 * newStudyStrings.ts — every user-visible string of "新建查经 New study" · 文案
 *
 * Single source (R3): components render these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it.
 */
import { bilingual, bilingualLine, ContentLanguage } from '../studypack/principles';

export const NS_TITLE = bilingual('新建查经', 'New study');
export const NS_INTRO = bilingualLine(
  '选择经文，AI 在你的浏览器里起草查经包；经文来自内置的和合本与 BSB，不来自 AI',
  'Pick a passage; the AI drafts a study pack in your browser. Verses come from the bundled 和合本 + BSB, never from the AI'
);

// ---- first-visit guide (FirstTimeGuide) ----
export const NS_GUIDE_TITLE = bilingualLine('第一次使用？三步就好', 'First time? Three steps');
/** The three steps in order; FirstTimeGuide numbers them with NS_GUIDE_MARKS. */
export const NS_GUIDE_STEPS = [
  bilingualLine('选经文，AI 起草查经包', 'Pick a passage — the AI drafts a study pack'),
  bilingualLine('看一看、改一改，按保存', 'Read it, edit anything, Save'),
  bilingualLine('周五在电视上放映，组员扫码报名', 'Present it on the TV on Friday — members scan the QR to sign up'),
] as const;
export const NS_GUIDE_MARKS = ['①', '②', '③'] as const;
export const NS_GUIDE_GOT_IT = bilingualLine('知道了', 'Got it');

// ---- form ----
export const NS_BOOK = bilingual('书卷', 'Book');
export const NS_CHAPTER = bilingual('章', 'Chapter');
export const NS_VERSE_FROM = bilingual('起始节', 'From verse');
export const NS_VERSE_TO = bilingual('结束节', 'To verse');
export const NS_LESSON_TITLE = bilingual('课题（可选）', 'Lesson title (optional)');
export const NS_LESSON_NUMBER = bilingual('第几课（可选）', 'Lesson number (optional)');
export const NS_DATE = bilingual('日期', 'Date');
/** "内容语言 Content language": how much English the generated lines carry (ADR-0003 §1 note). */
export const NS_CONTENT_LANGUAGE = bilingual('内容语言', 'Content language');
export const NS_CONTENT_LANGUAGE_OPTIONS: Record<ContentLanguage, string> = {
  'zh-keywords': bilingual('中文为主，关键词英文', 'Chinese, English keywords'),
  bilingual: bilingual('中英双语', 'Bilingual (中文 · English)'),
  'en-keywords': bilingual('英文为主，关键词中文', 'English, Chinese keywords'),
};
/** The fold over the optional fields (content language, lesson title/number, date): most leaders keep the defaults. */
export const NS_MORE_OPTIONS = bilingual('更多选项', 'More options');
/** Short Chinese name of each content-language mode, for the fold's one-line summary. */
export const NS_CONTENT_LANGUAGE_SHORT: Record<ContentLanguage, string> = {
  'zh-keywords': '中文为主', bilingual: '中英双语', 'en-keywords': '英文为主',
};
export const NS_GENERATE = bilingual('生成查经包', 'Generate study pack');
export const NS_GENERATING = bilingual('生成中…', 'Generating…');
export const NS_CANCEL = bilingual('取消', 'Cancel');
export const NS_RETRY = bilingual('重试', 'Retry');
export const NS_BACK = bilingual('返回', 'Back');

export const NS_ERR_RANGE = bilingualLine('结束节不能小于起始节', 'The end verse cannot be before the start verse');
export const NS_ERR_CHAPTER = bilingualLine('该书卷没有这一章', 'That chapter does not exist in this book');

// ---- generation progress / errors ----
export const NS_STEP_VERSES = bilingualLine('读取经文', 'Loading the passage');
export const NS_STEP_AI = bilingualLine('AI 起草中', 'AI is drafting');
export const NS_STEP_VALIDATE = bilingualLine('检查结构', 'Checking the pack');
/** Progress line while the model streams; "{n}" is the character count. */
export const NS_PROGRESS_CHARS = bilingualLine('已收到 {n} 字', '{n} characters received');

export const NS_ERR_VERSES_UNAVAILABLE = bilingualLine(
  '无法读取内置经文（请检查网络或部署）', 'The bundled passage could not be loaded (check the connection or deployment)'
);
export const NS_ERR_VERSES_OUT_OF_RANGE = bilingualLine('这一章没有这些节', 'This chapter does not have those verses');
export const NS_ERR_NO_JSON = bilingualLine(
  'AI 返回的内容格式有误，请重试', "The AI's reply was not in the expected format — please retry"
);
/** finish_reason "length" twice (first reply + one continuation); "{n}" is the character count received. */
export const NS_ERR_OUTPUT_LIMIT = bilingualLine(
  '输出超出长度上限（{n} 字已收到）', 'The reply exceeded the output limit ({n} characters received)'
);
export const NS_ERR_INVALID = bilingualLine(
  'AI 返回的内容不完整或格式不对', 'The AI content is incomplete or malformed'
);
export const NS_ERR_NO_CROSS_REFS = bilingualLine(
  'AI 给的交叉经文都无效', 'None of the AI cross-references were valid'
);
export const NS_ERR_LIFE_AREAS = bilingualLine(
  '生活应用缺少七个领域中的某些项', 'The life menu is missing some of the seven areas'
);

// ---- editor ----
export const NS_EDIT_TITLE = bilingual('审阅与编辑', 'Review and edit');
/** Editor hint per content language: what shape each model-drafted line keeps. */
export const NS_EDIT_HINTS: Record<ContentLanguage, string> = {
  'zh-keywords': bilingualLine('每行中文，关键词附英文（括号）', 'Keep each line Chinese, with the English keyword in parentheses'),
  bilingual: bilingualLine('每行保持「中文 · English」', 'Keep each line "中文 · English"'),
  'en-keywords': bilingualLine('每行英文，关键词附中文（括号）', 'Keep each line English, with the Chinese keyword in parentheses'),
};
export const NS_PACK_TITLE = bilingual('标题', 'Title');
export const NS_SCRIPTURE_NOTE = bilingualLine('经文来自内置圣经，不可编辑', 'Scripture comes from the bundled Bible and is not editable');
export const NS_QUESTION_ADD = bilingual('加一题', 'Add a question');
export const NS_QUESTION_REMOVE = bilingual('删除', 'Remove');
export const NS_SAVE = bilingual('保存', 'Save');
export const NS_SAVED = bilingual('已保存', 'Saved');
/** Quiet auto-save indicator: the pack is stored without the leader pressing anything. */
export const NS_AUTOSAVED = bilingual('已自动保存', 'Saved');
export const NS_SAVING = bilingual('保存中…', 'Saving…');
export const NS_PREVIEW = bilingual('放映', 'Preview');
export const NS_ERR_EMPTY_QUESTION = bilingualLine('讨论题不能为空', 'A discussion question cannot be empty');

// ---- editor: scripture range ----
export const NS_RANGE_APPLY = bilingual('更新经文', 'Update scripture');
export const NS_RANGE_UPDATED = bilingualLine('经文已更新', 'Scripture updated');
export const NS_RANGE_UPDATING = bilingualLine('读取经文中…', 'Loading the passage…');

// ---- editor: section order ----
export const NS_SECTION_UP = bilingual('上移', 'Move up');
export const NS_SECTION_DOWN = bilingual('下移', 'Move down');
export const NS_SECTION_REMOVE = bilingual('删除本段', 'Remove section');
export const NS_SECTION_REMOVE_CONFIRM = bilingualLine('确定删除这一段？', 'Remove this section?');
export const NS_CONFIRM = bilingual('确定', 'Confirm');
export const NS_SECTION_ADD = bilingual('添加段落', 'Add section');
export const NS_ERR_TITLE_FIRST = bilingualLine('标题必须在最前', 'The title must come first');
export const NS_ERR_SCRIPTURE_PLACE = bilingualLine('经文必须紧跟标题', 'Scripture must directly follow the title');
export const NS_ERR_TAIL = bilingualLine('签到和闭环必须在最后', 'Sign up and Closing must be the last sections');
export const NS_ERR_SHARING_PLACE = bilingualLine('上周操练分享只能紧跟在标题之后', "Last week's sharing must come right after the title");
export const NS_ERR_DUPLICATE_SECTION = bilingualLine('这种段落只能有一个', 'Only one section of this kind is allowed');

// ---- my packs ----
export const NS_MY_PACKS = bilingual('我的查经包', 'My packs');
export const NS_NO_PACKS = bilingualLine('还没有查经包', 'No packs yet');
export const NS_EDIT = bilingual('编辑', 'Edit');
/** The one quiet link under My packs; most leaders never need it (signed-in studies save online). */
export const NS_BACKUP_TOGGLE = bilingual('备份与恢复', 'Backup & restore');
export const NS_BACKUP_NOTE = bilingualLine(
  '登录后查经包自动保存在云端；备份文件适合想自己保存一份的人',
  'When you are signed in, your studies are saved online automatically; a backup file is for keeping your own copy',
);
export const NS_BACKUP_DOWNLOAD = bilingual('下载备份文件', 'Download a backup file');
export const NS_BACKUP_RESTORE = bilingual('从备份文件恢复', 'Restore from a backup file');
export const NS_BACKUP_RESTORED = (n: number) => bilingualLine(`已恢复 ${n} 个查经包`, `Restored ${n} ${n === 1 ? 'study' : 'studies'}`);
export const NS_DELETE = bilingual('删除', 'Delete');
export const NS_SIGNUPS = bilingual('报名', 'Sign-ups');
export const NS_DELETE_CONFIRM = bilingualLine('确定删除这个查经包？', 'Delete this study pack?');
export const NS_ERR_IMPORT = bilingualLine('恢复失败：这不是有效的备份文件', 'Restore failed: this is not a valid backup file');
export const NS_ERR_STORAGE = bilingualLine('浏览器存储出错', 'Browser storage error');
export const NS_INVALID_RECORDS = bilingualLine('无法读取的记录', 'Unreadable records');

// ---- privacy ----
export const NS_PRIVACY = bilingualLine(
  '查经包保存在这台设备的浏览器里；带领者登录后同步到你的账号（只有你能读取）',
  'Packs are saved in this browser; once a leader signs in they sync to that account (only you can read them)'
);
