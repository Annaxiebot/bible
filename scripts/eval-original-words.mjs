/**
 * eval-original-words.mjs — ADR-0018 blind evaluation: today's Ask AI vs "original words first".
 *
 * For each word question in the fixture (tests/fixtures/original-words-eval.json):
 *   CONTROL   = today's exact request: the app's buildRequestBody with the
 *               related verses the TV sends today and NO ORIGINAL WORDS block
 *               → no rule (pinned byte-identical to master by originalWordsRequests.test.tsx);
 *   TREATMENT = the same request + the ORIGINAL WORDS block originalWords.ts
 *               builds for the question (→ the server's one rule).
 * Both go through aiTransport.ownKeyBody — the final messages the proxy
 * builds — to OpenRouter with the SAME model, sampling and stream settings
 * (lib/evalRun.mjs, shared with ADR-0015/0016). A failed or empty answer is a
 * FAILURE and loses its pair — never a pass (R14). Measures per arm:
 * answered/failed, "no such verse", Greek/Hebrew forms mentioned and how
 * many are in the verse data (lexicalAccuracy.ts — both arms checked against
 * the SAME word list), and the order-proof judge (both A/B orders; only a
 * verdict that survives the swap counts).
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/eval-original-words.mjs <results.json> <vote.html> [fixture.json]
 * Costs real OpenRouter credit (2 answers + 2 judge calls per question).
 *   node scripts/eval-original-words.mjs --dry-run [fixture.json]
 * builds both requests for every question (no network, no key, no files).
 */
import { writeFileSync } from 'node:fs';
import { blindPairs, votePageHtml } from './lib/evalVotePage.mjs';
import {
  answer, measure, judge, assertSameOutsideMessages, summariseArms, printArms, questionContext, withApp,
} from './lib/evalRun.mjs';

const FIXTURE = 'tests/fixtures/original-words-eval.json';
const TITLE = 'Scripture to Life original-words eval';
/** The judge's question (ADR-0018 §6), fixed before any run. */
const JUDGE_CRITERION = 'Which answer better explains the word for a church small group: accurate original-language sense, clear, faithful to Scripture?';
const ARMS = {
  control: '对照 · control (today)',
  treatment: '实验 · treatment (original words)',
  title: 'Original Words Vote',
  heading: '原文词汇盲评 · Original-language words blind vote',
  instructions: '每题两个回答，标签隐藏。选更能为小组解释这个词的一个（原文含义准确、清楚、忠于经文），最后揭晓。 · ' +
    'Two answers per question, labels hidden: pick the one that better explains the word for a church small group ' +
    '(accurate original-language sense, clear, faithful), then reveal.',
};

function usage(message) {
  process.stderr.write(`${message}\nusage: OPENROUTER_API_KEY=… node scripts/eval-original-words.mjs <results.json> <vote.html> [fixture.json]\n`);
  process.exit(2);
}

/** Today's related verses, exactly as askAIFallback.relatedFor sends them (the control must be today's request). */
async function todaysRelated(app, pack, question) {
  if (app.relatedPick.QUESTION_AWARE_ENABLED) throw new Error('ADR-0016 pick is on: today\'s request needs a pick call — update this script first');
  if (!app.relatedVerses.RELATED_VERSES_ENABLED) return { related: [], warnings: [] };
  return app.relatedVerses.loadRelatedVerses(pack, question);
}

/** Build both requests for one question; throws if the control leaks the block or the arms differ elsewhere. */
async function requests(app, model, pack, slide, question) {
  const { related, warnings: relatedWarnings } = await todaysRelated(app, pack, question);
  const original = await app.originalWords.loadOriginalWords(pack, question);
  const control = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related });
  const treatment = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related, original: original.verses });
  if (control.includes('ORIGINAL WORDS (')) throw new Error('control leaked the treatment block (R14)');
  assertSameOutsideMessages(control, treatment);
  const words = original.verses.flatMap(v => v.words);
  return { related, relatedWarnings, original, words, control, treatment };
}

/** One arm's lexical accuracy against the target verses' words; a failed answer has none (it already lost). */
function lexical(app, arm, words) {
  if (arm.failed) return null;
  const r = app.lexicalAccuracy.checkLexicalAccuracy(arm.text, words);
  return { mentioned: r.total, found: r.found, notFound: r.mentions.filter(m => !m.found).map(m => m.form), mentions: r.mentions };
}

async function runQuestion(app, key, fixture, packs, q) {
  const { pack, slide, passage, question } = questionContext(app, packs, q);
  const req = await requests(app, fixture.model, pack, slide, question);
  process.stdout.write(`${q.id}: verses [${req.original.targets.join(', ')}], ${req.words.length} words, asking both arms…\n`);
  const [c, t] = await Promise.all([answer(app, key, TITLE, req.control), answer(app, key, TITLE, req.treatment)]);
  const item = {
    id: q.id, testament: q.testament, pack: q.pack, passageRef: pack.passageRef, question,
    targets: req.original.targets, originalWarnings: req.original.warnings, relatedWarnings: req.relatedWarnings,
    treatmentHasBlock: req.original.verses.length > 0,
    control: await measure(app, pack, passage, c, req.related),
    treatment: await measure(app, pack, passage, t, req.related),
  };
  item.control.lexical = lexical(app, item.control, req.words);
  item.treatment.lexical = lexical(app, item.treatment, req.words);
  item.judge = await judge(key, TITLE, fixture.judge, item, JUDGE_CRITERION);
  return item;
}

function lexicalSummary(items, name) {
  const checked = items.map(i => i[name].lexical).filter(Boolean);
  const mentioned = checked.reduce((n, l) => n + l.mentioned, 0);
  const found = checked.reduce((n, l) => n + l.found, 0);
  return {
    formsMentioned: mentioned,
    formsFound: found,
    lexicalAccuracyPct: mentioned ? Math.round((found / mentioned) * 1000) / 10 : null,
    answersWithAForm: checked.filter(l => l.mentioned > 0).length,
  };
}

function summarise(items) {
  const arms = summariseArms(items);
  return {
    ...arms,
    control: { ...arms.control, ...lexicalSummary(items, 'control') },
    treatment: { ...arms.treatment, ...lexicalSummary(items, 'treatment') },
    treatmentWithoutBlock: items.filter(i => !i.treatmentHasBlock).map(i => i.id),
    warnings: items.flatMap(i => [...i.originalWarnings, ...i.relatedWarnings].map(w => `${i.id}: ${w}`)),
  };
}

function printSummary(s) {
  printArms(s);
  for (const r of ['formsMentioned', 'formsFound', 'lexicalAccuracyPct', 'answersWithAForm']) {
    process.stdout.write(`${r.padEnd(18)}${String(s.control[r]).padStart(10)}${String(s.treatment[r]).padStart(12)}\n`);
  }
  if (s.treatmentWithoutBlock.length) process.stdout.write(`treatment had NO original words (same as control): ${s.treatmentWithoutBlock.join(', ')}\n`);
  if (s.warnings.length) process.stdout.write(`warnings:\n  ${s.warnings.join('\n  ')}\n`);
}

/** --dry-run: both requests per question, built and checked; nothing sent. */
async function dryRun(app, fixture, packs) {
  for (const q of fixture.questions) {
    const { pack, slide, question } = questionContext(app, packs, q);
    const req = await requests(app, fixture.model, pack, slide, question);
    const size = body => app.aiTransport.ownKeyBody('ask', body).length;
    const warnings = [...req.original.warnings, ...req.relatedWarnings];
    process.stdout.write(`${q.id} ${pack.passageRef}: verses [${req.original.targets.join(', ')}] ${req.words.length} words, ` +
      `control ${size(req.control)} chars, treatment ${size(req.treatment)} chars` +
      `${req.original.verses.length ? '' : ', NO BLOCK'}${warnings.length ? `, WARNINGS ${warnings.join('; ')}` : ''}\n`);
  }
}

async function main() {
  if (process.argv[2] === '--dry-run') return withApp(process.argv[3] ?? FIXTURE, dryRun);
  const [resultsPath, votePath, fixturePath = FIXTURE] = process.argv.slice(2);
  if (!resultsPath || !votePath) usage('missing output paths');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) usage('OPENROUTER_API_KEY is not set');
  await withApp(fixturePath, async (app, fixture, packs) => {
    const items = [];
    for (const q of fixture.questions) items.push(await runQuestion(app, key, fixture, packs, q));
    const summary = summarise(items);
    const meta = { date: new Date().toISOString(), model: fixture.model, judge: fixture.judge, judgeCriterion: JUDGE_CRITERION, fixture: fixturePath };
    writeFileSync(resultsPath, JSON.stringify({ meta, summary, items }, null, 2));
    writeFileSync(votePath, votePageHtml(blindPairs(items), ARMS));
    printSummary(summary);
    process.stdout.write(`\nresults: ${resultsPath}\nvote page: ${votePath}\n`);
  });
}

await main();
