/** Strip all HTML tags from a string */
export const stripHTML = (text: string): string =>
  text.replace(/<[^>]*>/g, '');

/** Strip HTML tags and trim whitespace */
export const stripHTMLAndTrim = (text: string): string =>
  stripHTML(text).trim();

/** Truncate text to maxLength with ellipsis */
export const truncate = (text: string, maxLength: number): string =>
  text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
