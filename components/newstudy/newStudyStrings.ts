/**
 * newStudyStrings.ts — every user-visible string of "新建查经 New study" · 文案
 *
 * Single source (R3): components render these, unit + e2e tests import
 * them. Chinese first, English second (ADR-0003 §1). Pure module (no React)
 * so Playwright specs can import it.
 */
import { bilingual, bilingualLine } from '../studypack/principles';

export const NS_TITLE = bilingual('新建查经', 'New study');
export const NS_INTRO = bilingualLine(
  '选择经文，AI 在你的浏览器里起草查经包；经文来自内置的和合本与 BSB，不来自 AI',
  'Pick a passage; the AI drafts a study pack in your browser. Verses come from the bundled 和合本 + BSB, never from the AI'
);

// ---- form ----
export const NS_BOOK = bilingual('书卷', 'Book');
export const NS_CHAPTER = bilingual('章', 'Chapter');
export const NS_VERSE_FROM = bilingual('起始节', 'From verse');
export const NS_VERSE_TO = bilingual('结束节', 'To verse');
export const NS_LESSON_TITLE = bilingual('课题（可选）', 'Lesson title (optional)');
export const NS_LESSON_NUMBER = bilingual('第几课（可选）', 'Lesson number (optional)');
export const NS_DATE = bilingual('日期', 'Date');
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
  'AI 没有返回完整的 JSON（可能被截断）', 'The AI did not return complete JSON (it may have been cut off)'
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
export const NS_EDIT_HINT = bilingualLine('每行保持「中文 · English」', 'Keep each line "中文 · English"');
export const NS_PACK_TITLE = bilingual('标题', 'Title');
export const NS_SCRIPTURE_NOTE = bilingualLine('经文来自内置圣经，不可编辑', 'Scripture comes from the bundled Bible and is not editable');
export const NS_QUESTION_ADD = bilingual('加一题', 'Add a question');
export const NS_QUESTION_REMOVE = bilingual('删除', 'Remove');
export const NS_SAVE = bilingual('保存', 'Save');
export const NS_SAVED = bilingual('已保存', 'Saved');
/** Quiet auto-save indicator: the pack is stored without the leader pressing anything. */
export const NS_AUTOSAVED = bilingual('已自动保存', 'Saved');
export const NS_SAVING = bilingual('保存中…', 'Saving…');
/** Optional Google Form for feedback; when set, check-in links point there instead of #/checkin. */
export const NS_FEEDBACK_FORM = bilingual('反馈表（可选）', 'Google Form for feedback (optional)');
export const NS_FEEDBACK_FORM_HINT = bilingualLine(
  '留空则用内置的跟进页；填表单链接后，提醒里的链接会指向该表单',
  'Leave empty to use the built-in check-in page; with a form link, check-ins link to that form'
);
export const NS_ERR_FEEDBACK_FORM = bilingualLine(
  '反馈表链接必须是 Google 表单地址（https://docs.google.com/forms/…）',
  'The feedback form link must be a Google Form URL (https://docs.google.com/forms/…)'
);
// ---- auto-created feedback form (services/googleForms, ADR-0004 §9) ----
export const NS_FORM_CREATED = bilingual('已创建反馈表', 'Feedback form created');
export const NS_FORM_CREATING = bilingual('正在创建反馈表…', 'Creating the feedback form…');
export const NS_FORM_FALLBACK = bilingualLine('将使用内置的跟进页', 'The built-in check-in page will be used');
export const NS_FORM_NO_TOKEN = bilingualLine('未获得 Google 表单权限 — 请重新登录', 'Google Forms permission not granted — sign in again');
export const NS_FORM_NO_PERMISSION = NS_FORM_NO_TOKEN;
export const NS_FORM_API_DISABLED = bilingualLine('表单 API 未启用', 'Forms API not enabled');
export const NS_FORM_FAILED = bilingualLine('创建反馈表失败', 'Could not create the feedback form');
/** Generation form: the same link, remembered as the leader's default when the checkbox is on. */
export const NS_FEEDBACK_FORM_LINK = bilingual('反馈表链接（可选）', 'Google Form link for feedback (optional)');
export const NS_FEEDBACK_FORM_DEFAULT = bilingualLine('用于我所有的查经', 'Use for all my studies');
export const NS_PREVIEW = bilingual('预览', 'Preview on TV');
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
export const NS_ERR_DUPLICATE_SECTION = bilingualLine('这种段落只能有一个', 'Only one section of this kind is allowed');

// ---- my packs ----
export const NS_MY_PACKS = bilingual('我的查经包', 'My packs');
export const NS_NO_PACKS = bilingualLine('还没有查经包', 'No packs yet');
export const NS_EDIT = bilingual('编辑', 'Edit');
export const NS_EXPORT = bilingual('导出 JSON', 'Export JSON');
export const NS_IMPORT = bilingual('导入 JSON', 'Import JSON');
export const NS_DELETE = bilingual('删除', 'Delete');
export const NS_SIGNUPS = bilingual('报名', 'Sign-ups');
export const NS_DELETE_CONFIRM = bilingualLine('确定删除这个查经包？', 'Delete this study pack?');
export const NS_ERR_IMPORT = bilingualLine('导入失败：文件不是有效的查经包', 'Import failed: the file is not a valid study pack');
export const NS_ERR_STORAGE = bilingualLine('浏览器存储出错', 'Browser storage error');
export const NS_INVALID_RECORDS = bilingualLine('无法读取的记录', 'Unreadable records');

// ---- privacy ----
export const NS_PRIVACY = bilingualLine(
  '查经包只保存在这台设备的浏览器里；密钥与内容都不会上传到我们的服务器',
  'Packs stay in this browser; neither the key nor the content is uploaded to our servers'
);
