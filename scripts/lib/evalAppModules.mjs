/**
 * evalAppModules.mjs — the app's REAL request builders, loaded into Node for
 * scripts/eval-related-verses.mjs (ADR-0015 §6) and eval-question-aware.mjs (ADR-0016).
 *
 * The evaluation must send exactly what the TV sends (R14), so it never
 * re-implements a prompt: Vite's SSR loader imports the TypeScript modules
 * themselves (askAIStream.buildRequestBody, aiTransport.ownKeyBody,
 * relatedVerses, relatedPick, citations). `envPrefix` exposes no VITE_* variable, so no
 * Supabase client is created. fetch() of a relative bible-data/ URL is
 * served from public/ (the static files the site serves); every other URL
 * goes to the real network.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');

/** Serve bible-data/ URLs from public/ (404 when absent, like the static host); pass the rest through. */
export function serveBundledData() {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const text = String(url);
    const at = text.indexOf('bible-data/');
    if (at < 0 || /^https?:/.test(text)) return realFetch(url, init);
    const file = path.join(PUBLIC_DIR, text.slice(at));
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(file, 'utf-8'), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

/** Load the app modules the evaluation needs; call close() when done. */
export async function loadAppModules() {
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    envPrefix: 'EVAL_RELATED_VERSES_NO_ENV_',
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true, hmr: false, watch: null },
    resolve: { alias: { '@': REPO_ROOT } },
    optimizeDeps: { noDiscovery: true, entries: [] }, // SSR loads node_modules directly; no browser pre-bundling scan
  });
  const load = p => server.ssrLoadModule(p);
  const [packTypes, askAI, askAIStream, aiTransport, relatedVerses, citations, relatedPick] = await Promise.all([
    load('/components/studypack/packTypes.ts'),
    load('/components/studypack/askAI.ts'),
    load('/components/studypack/askAIStream.ts'),
    load('/services/aiTransport.ts'),
    load('/components/studypack/relatedVerses.ts'),
    load('/components/studypack/citations.ts'),
    load('/components/studypack/relatedPick.ts'),
  ]);
  return { packTypes, askAI, askAIStream, aiTransport, relatedVerses, citations, relatedPick, close: () => server.close() };
}

function readChapter(translation, bookId, chapter) {
  const file = path.join(PUBLIC_DIR, 'bible-data', translation, bookId, `${chapter}.json`);
  return new Map(JSON.parse(readFileSync(file, 'utf-8')).verses.map(v => [v.verse, v.text]));
}

/**
 * A fixture pack: a committed pack file, or a minimal pack (title +
 * scripture) built from the bundled 和合本 + BSB chapter — the shape the
 * pack generator writes, parsed by the app's own parseStudyPack.
 */
export function buildPack(spec, parseStudyPack) {
  if (spec.file) return parseStudyPack(JSON.parse(readFileSync(path.join(REPO_ROOT, spec.file), 'utf-8')));
  const cuv = readChapter('cuv', spec.bookId, spec.chapter);
  const bsb = readChapter('bsb', spec.bookId, spec.chapter);
  const verses = [];
  for (let num = spec.from; num <= spec.to; num++) {
    if (!cuv.get(num) || !bsb.get(num)) throw new Error(`${spec.id}: no bundled text for ${spec.bookId} ${spec.chapter}:${num}`);
    verses.push({ num, cuv: cuv.get(num), en: bsb.get(num) });
  }
  return parseStudyPack({
    id: `eval-${spec.id}`, title: spec.title, date: '2026-10-06', passageRef: spec.passageRef, enVersion: 'BSB',
    contentLanguage: spec.contentLanguage,
    sections: [
      { kind: 'title', heading: spec.title },
      { kind: 'scripture', heading: `经文 Scripture — ${spec.passageRef}`, verses },
    ],
  });
}
