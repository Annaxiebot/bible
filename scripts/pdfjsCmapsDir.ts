/**
 * pdfjsCmapsDir.ts — where the pdfjs CMap files are served, under the site base (ADR-0019 §1).
 * One constant for the Vite plugin that serves/copies them and the loader that points pdfjs at them (R3).
 */
export const PDFJS_CMAPS_DIR = 'pdfjs-cmaps';
