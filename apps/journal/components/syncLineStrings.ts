/**
 * syncLineStrings.ts — the #app sync line's words, Chinese first · 同步状态文字
 *
 * Import-free so Playwright specs (Node) can pin the exact text (R3). The
 * Google button reuses SU_SIGN_IN_GOOGLE / SU_SIGNING_IN (signupStrings) and
 * sign-out reuses SETUP_SIGN_OUT (setupStrings).
 */
export const SYNC_LINE_LOCAL = '未登录：数据只保存在本浏览器 · 登录后自动同步 · Not signed in: data stays in this browser · sign in to sync';
export const SYNC_LINE_SYNCED = '已登录 · 已同步 · Signed in · synced';
export const SYNC_LINE_SYNCING = '已登录 · 同步中… · Signed in · syncing…';
export const SYNC_LINE_ERROR = '已登录 · 同步出错 · Signed in · sync error';
export const SYNC_LINE_EXPORT = '导出 Export';
export const SYNC_LINE_LAST_SYNC = '上次同步 Last sync';
