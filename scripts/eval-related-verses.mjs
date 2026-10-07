/**
 * eval-related-verses.mjs — ADR-0015 §6 blind evaluation: today's Ask AI vs "related verses first".
 *
 * For each question in the fixture (tests/fixtures/related-verses-eval.json):
 *   CONTROL   = today's exact request: the app's buildRequestBody with no
 *               related verses → no RELATED VERSES block, no rule sentence
 *               (pinned byte-identical to pre-ADR-0015 by relatedPrompt.test.ts);
 *   TREATMENT = the same request + the related verses relatedVerses.ts finds
 *               (block in the user message → the server rule sentence).
 * Both go through aiTransport.ownKeyBody — the final messages the proxy
 * builds — to OpenRouter with the SAME model, sampling and stream settings.
 * Measuring and judging live in lib/evalRun.mjs (shared with
 * eval-question-aware.mjs, ADR-0016). A failed or empty answer is a FAILURE
 * and loses its pair — never a pass (R14). The blind judge is asked in both
 * A/B orders; only a verdict that survives the swap counts.
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/eval-related-verses.mjs <results.json> <vote.html> [fixture.json]
 * Costs real OpenRouter credit (2 answers + 2 judge calls per question).
 *   node scripts/eval-related-verses.mjs --dry-run [fixture.json]
 * builds both requests for every question (no network, no key, no files)
 * and prints the related verses and request sizes.
 */
import { writeFileSync } from 'node:fs';
import { blindPairs, votePageHtml } from './lib/evalVotePage.mjs';
import {
  DEFAULT_FIXTURE, answer, measure, judge, assertSameOutsideMessages, summariseArms, printArms, questionContext, withApp,
} from './lib/evalRun.mjs';

const TITLE = 'Scripture to Life related-verses eval';

function usage(message) {
  process.stderr.write(`${message}\nusage: OPENROUTER_API_KEY=… node scripts/eval-related-verses.mjs <results.json> <vote.html> [fixture.json]\n`);
  process.exit(2);
}

/** Build both requests for one question; throws if the control is not today's request or the arms differ elsewhere. */
async function requests(app, model, pack, slide, question) {
  const { related, warnings } = await app.relatedVerses.loadRelatedVerses(pack, question);
  const control = app.askAIStream.buildRequestBody(pack, slide, [], question, { model });
  const treatment = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related });
  if (control.includes('RELATED VERSES (')) throw new Error('control leaked the treatment block (R14)');
  assertSameOutsideMessages(control, treatment);
  return { related, warnings, control, treatment };
}

async function runQuestion(app, key, fixture, packs, q) {
  const { pack, slide, passage, question } = questionContext(app, packs, q);
  const req = await requests(app, fixture.model, pack, slide, question);
  process.stdout.write(`${q.id}: ${req.related.length} related, asking both arms…\n`);
  const [c, t] = await Promise.all([answer(app, key, TITLE, req.control), answer(app, key, TITLE, req.treatment)]);
  const item = {
    id: q.id, kind: q.kind, pack: q.pack, passageRef: pack.passageRef, question,
    related: req.related.map(r => r.ref), relatedWarnings: req.warnings, treatmentHasBlock: req.related.length > 0,
    control: await measure(app, pack, passage, c, []),
    treatment: await measure(app, pack, passage, t, req.related),
  };
  item.judge = await judge(key, TITLE, fixture.judge, item);
  return item;
}

function summarise(items) {
  return {
    ...summariseArms(items),
    treatmentWithoutBlock: items.filter(i => !i.treatmentHasBlock).map(i => i.id),
    relatedWarnings: items.flatMap(i => i.relatedWarnings.map(w => `${i.id}: ${w}`)),
  };
}

function printSummary(s) {
  printArms(s);
  if (s.treatmentWithoutBlock.length) process.stdout.write(`treatment had NO related verses (same as control): ${s.treatmentWithoutBlock.join(', ')}\n`);
  if (s.relatedWarnings.length) process.stdout.write(`related-verse warnings:\n  ${s.relatedWarnings.join('\n  ')}\n`);
}

/** --dry-run: both requests per question, built and checked; nothing sent. */
async function dryRun(app, fixture, packs) {
  for (const q of fixture.questions) {
    const { pack, slide, question } = questionContext(app, packs, q);
    const req = await requests(app, fixture.model, pack, slide, question);
    const size = body => app.aiTransport.ownKeyBody('ask', body).length;
    process.stdout.write(`${q.id} ${pack.passageRef}: related [${req.related.map(r => r.ref).join(', ')}] ` +
      `control ${size(req.control)} chars, treatment ${size(req.treatment)} chars` +
      `${req.warnings.length ? `, WARNINGS ${req.warnings.join('; ')}` : ''}\n`);
  }
}

async function main() {
  if (process.argv[2] === '--dry-run') return withApp(process.argv[3] ?? DEFAULT_FIXTURE, dryRun);
  const [resultsPath, votePath, fixturePath = DEFAULT_FIXTURE] = process.argv.slice(2);
  if (!resultsPath || !votePath) usage('missing output paths');
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) usage('OPENROUTER_API_KEY is not set');
  await withApp(fixturePath, async (app, fixture, packs) => {
    const items = [];
    for (const q of fixture.questions) items.push(await runQuestion(app, key, fixture, packs, q));
    const summary = summarise(items);
    const meta = { date: new Date().toISOString(), model: fixture.model, judge: fixture.judge, fixture: fixturePath };
    writeFileSync(resultsPath, JSON.stringify({ meta, summary, items }, null, 2));
    writeFileSync(votePath, votePageHtml(blindPairs(items)));
    printSummary(summary);
    process.stdout.write(`\nresults: ${resultsPath}\nvote page: ${votePath}\n`);
  });
}

await main();
