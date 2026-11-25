/**
 * prefsStrings.ts — 显示偏好 view-preferences strings (Chinese first, ADR-0003 §1).
 * Pure module so the Playwright specs import them directly.
 */
import { bilingual, bilingualLine } from '../../../shared/studypack/principles';

export const VP_BUTTON = bilingual('偏好', 'Prefs');
export const VP_TITLE = bilingual('显示偏好', 'View preferences');
export const VP_NOTE = bilingualLine('只改这台设备的显示，不改讲义本身', 'Changes how this device shows the pack — the pack itself is unchanged');
export const VP_SECTIONS = bilingual('显示栏目', 'Sections');
export const VP_ORDER = bilingual('中英顺序', 'Language order');
export const VP_ORDER_ZH_FIRST = bilingual('中文在前', 'Chinese first');
export const VP_ORDER_EN_FIRST = bilingual('英文在前', 'English first');
export const VP_CLOSE = bilingual('完成', 'Done');
/** One-time hint beside the 偏好 button (first-use guide rule). */
export const VP_HINT = bilingualLine('新功能：点「偏好」可隐藏栏目、调整中英顺序', 'New: tap Prefs to hide sections or swap the language order');
