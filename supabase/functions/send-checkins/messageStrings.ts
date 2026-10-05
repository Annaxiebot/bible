/**
 * messageStrings.ts — the wording shared by the text and HTML emails · 邮件文案
 *
 * A leaf module (no imports) so templates.ts (text) and emailHtml.ts (HTML)
 * both read one copy (R3) without importing each other. templates.ts
 * re-exports everything here, so existing imports keep working.
 */

/** Public site; pack JSON and TV links are served from here. */
export const SITE_ORIGIN = 'https://scripturetolife.org';
/** The landing (home page): the email header wordmark and footer link point here. */
export const SITE_HOME_URL = `${SITE_ORIGIN}/`;
/** "scripturetolife.org": the footer link's text (the HTML never shows a raw https:// URL). */
export const SITE_HOST = new URL(SITE_ORIGIN).host;

export const BILINGUAL_SEPARATOR = ' · ';

/** Label before a committed practice (text line and the email's card). */
export const PRACTICE_LABEL = `你选的操练${BILINGUAL_SEPARATOR}Your practice`;

/** Label before the passage reference. */
export const PASSAGE_LABEL = `本周经文${BILINGUAL_SEPARATOR}This week's passage`;

/** Heading over the whole passage at the end of an email. */
export const FULL_PASSAGE_HEADING = `经文全文${BILINGUAL_SEPARATOR}The whole passage`;

/** Button labels in the HTML email (the text part shows the URL itself). */
export const LINK_LABEL = {
  checkin: `写下这周的进展${BILINGUAL_SEPARATOR}Write your check-in`,
  welcome: `打开我的跟进页${BILINGUAL_SEPARATOR}Open my check-in page`,
  pack: `打开查经包${BILINGUAL_SEPARATOR}Open the study`,   // a leader's test (no signup id)
  stop: `不想再收到？停止提醒${BILINGUAL_SEPARATOR}Stop these emails`,
} as const;
