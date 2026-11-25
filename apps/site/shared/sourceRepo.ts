/**
 * sourceRepo.ts — the public source repository · 开源仓库链接
 *
 * Single source (R3) for the GitHub link shown in the landing footer and on
 * the feedback page. The code is AGPL-3.0-or-later (LICENSE, CONTRIBUTING.md).
 * Chinese first (ADR-0003 §1).
 */
export const SOURCE_REPO_URL = 'https://github.com/Annaxiebot/bible';
/** Footer link text, next to 意见反馈 · Feedback. */
export const CONTRIBUTE_LABEL = '参与开发 · Contribute on GitHub';
/** The feedback page's one line pointing developers to the repo. */
export const CONTRIBUTE_PROMPT = '想参与开发？· Want to help build it?';
/** An external link opens in a new tab and gives the new page no handle on this one. */
export const EXTERNAL_LINK_PROPS = { target: '_blank', rel: 'noopener noreferrer' } as const;
