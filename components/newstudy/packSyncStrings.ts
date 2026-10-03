/**
 * packSyncStrings.ts — every user-visible line of pack sync · 查经包同步文案
 *
 * Single source (R3) for packRemote / packSync / PackSyncLine and their
 * tests. Chinese first (ADR-0003 §1). Pure module so Playwright specs can
 * import it.
 */
import { bilingualLine } from '../studypack/principles';

export const PS_ERR_PULL = bilingualLine('读取云端查经包失败', 'Could not load your packs from your account');
export const PS_ERR_PUSH = bilingualLine('查经包未能保存到云端（本机已保存）', 'Pack not saved to your account (it is saved on this device)');
export const PS_ERR_DELETE = bilingualLine('云端删除失败，本机未删除', 'Could not delete from your account; nothing was deleted here');
export const PS_ERR_INVALID_REMOTE = bilingualLine('云端有无法读取的查经包', 'Unreadable packs in your account');
export const PS_SYNCING = bilingualLine('正在同步查经包', 'Syncing your packs');
export const PS_SYNCED = bilingualLine('查经包已同步到你的账号', 'Your packs are saved to your account');
