/**
 * eval-question-aware.mjs — ADR-0016 blind evaluation: vote-ranked vs question-aware related verses.
 *
 * For each question in the fixture (tests/fixtures/related-verses-eval.json):
 *   CONTROL   = today's ON behaviour (ADR-0015): RELATED VERSES = the vote
 *               top 6 (relatedVerses.loadRelatedVerses with no chooser);
 *   TREATMENT = the same request, RELATED VERSES chosen by the 'pick' call
 *               (relatedPick.questionAwareChooser — the app's own pool,
 *               prompt, parser, fill and fallback, with the app's PICK_TIMEOUT_MS).
 * Both answer requests come from the app's buildRequestBody with the SAME
 * model, sampling and stream settings (checked: the bodies differ only in
 * `messages`, and only in the list). The pick call goes direct to OpenRouter
 * through aiTransport.ownKeyBody('pick', …) — the final messages the proxy
 * builds. Measuring and judging: lib/evalRun.mjs, the same code as ADR-0015's
 * evaluation (order-proof judge; a failed or empty answer loses — R14).
 * "Cited from memory" counts against each arm's OWN related list.
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/eval-question-aware.mjs <results.json> <vote.html> [fixture.json]
 * Costs real OpenRouter credit (1 pick + 2 answers + 2 judge calls per question).
 *   node scripts/eval-question-aware.mjs --dry-run [fixture.json]
 * no network, no key, no files: per question the pool size, the pick
 * request size and the vote top 6 (the control's list).
 */
import { writeFileSync } from 'node:fs';
import { blindPairs, votePageHtml } from './lib/evalVotePage.mjs';
import {
  DEFAULT_FIXTURE, streamOwnKey, answer, measure, judge, assertSameOutsideMessages, summariseArms, printArms, questionContext, withApp,
} from './lib/evalRun.mjs';

const TITLE = 'Scripture to Life question-aware eval';
const ARMS = {
  control: '对照 · control (vote top 6)',
  treatment: '实验 · treatment (question-aware pick)',
  title: 'Question-Aware Vote',
  heading: '按问题选经文盲评 · Question-aware related verses blind vote',
};

function usage(message) {
  process.stderr.write(`${message}\nusage: OPENROUTER_API_KEY=… node scripts/eval-question-aware.mjs <results.json> <vote.html> [fixture.json]\n`);
  process.exit(2);
}

/** The app's chooser with a sender that goes direct to OpenRouter; the raw reply and time are kept for the results. */
function recordingChooser(app, key, model, pack, question, log) {
  const send = async (body, signal) => {
    const started = Date.now();
    const out = await streamOwnKey(app, key, TITLE, 'pick', body, signal);
    Object.assign(log, { reply: out.text, error: out.error, ms: Date.now() - started });
    if (out.error) throw new Error(out.error);
    return out.text;
  };
  return app.relatedPick.questionAwareChooser({ passageRef: pack.passageRef, question, model, signal: new AbortController().signal, send });
}

/** Both arms' related lists and answer bodies; throws if the arms differ anywhere but the list (R14). */
async function requests(app, key, model, pack, slide, question) {
  const votes = await app.relatedVerses.loadRelatedVerses(pack, question);
  const pickLog = {};
  const picked = await app.relatedVerses.loadRelatedVerses(pack, question, recordingChooser(app, key, model, pack, question, pickLog));
  const control = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related: votes.related });
  const treatment = app.askAIStream.buildRequestBody(pack, slide, [], question, { model, related: picked.related });
  assertSameOutsideMessages(control, treatment);
  return { votes, picked, pickLog, control, treatment };
}

async function runQuestion(app, key, fixture, packs, q) {
  const { pack, slide, passage, question } = questionContext(app, packs, q);
  const req = await requests(app, key, fixture.model, pack, slide, question);
  process.stdout.write(`${q.id}: pick ${req.picked.source}${req.pickLog.ms !== undefined ? ` (${req.pickLog.ms} ms)` : ''}, asking both arms…\n`);
  const [c, t] = await Promise.all([answer(app, key, TITLE, req.control), answer(app, key, TITLE, req.treatment)]);
  const refs = list => list.map(r => r.ref);
  const item = {
    id: q.id, kind: q.kind, pack: q.pack, passageRef: pack.passageRef, question,
    related: { control: refs(req.votes.related), treatment: refs(req.picked.related) },
    sameList: refs(req.votes.related).join() === refs(req.picked.related).join(),
    pick: { source: req.picked.source, warnings: req.picked.warnings, ...req.pickLog },
    controlWarnings: req.votes.warnings,
    control: await measure(app, pack, passage, c, req.votes.related),
    treatment: await measure(app, pack, passage, t, req.picked.related),
  };
  item.judge = await judge(key, TITLE, fixture.judge, item);
  return item;
}

function summarise(items) {
  return {
    ...summariseArms(items),
    pickUsed: items.filter(i => i.pick.source === 'pick').length,
    pickFellBack: items.filter(i => i.pick.source === 'votes').map(i => `${i.id}: ${i.pick.warnings.join('; ')}`),
    sameListAsControl: items.filter(i => i.sameList).map(i => i.id),
  };
}

function printSummary(s) {
  printArms(s);
  process.stdout.write(`pick used: ${s.pickUsed} of ${s.questions}\n`);
  if (s.pickFellBack.length) process.stdout.write(`pick fell back to votes:\n  ${s.pickFellBack.join('\n  ')}\n`);
  if (s.sameListAsControl.length) process.stdout.write(`treatment list identical to control: ${s.sameListAsControl.join(', ')}\n`);
}

/** --dry-run: the pool the pick would see and the vote top 6; nothing sent (the pick needs the AI). */
async function dryRun(app, fixture, packs) {
  for (const q of fixture.questions) {
    const { pack, question } = questionContext(app, packs, q);
    let pool = [];
    const votes = await app.relatedVerses.loadRelatedVerses(pack, question, async (p, byVotes) => {
      pool = p;
      return { targets: byVotes, source: 'votes', warnings: [] };
    });
    const candidates = app.relatedPick.pickCandidates(pool);
    const body = app.relatedPick.buildPickBody(pack.passageRef, question, candidates, fixture.model);
    process.stdout.write(`${q.id} ${pack.passageRef}: pool ${pool.length} (pick sees ${candidates.length}, ` +
      `request ${app.aiTransport.ownKeyBody('pick', body).length} chars); vote top 6 [${votes.related.map(r => r.ref).join(', ')}]` +
      `${votes.warnings.length ? `, WARNINGS ${votes.warnings.join('; ')}` : ''}\n`);
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
    const meta = {
      date: new Date().toISOString(), model: fixture.model, judge: fixture.judge, fixture: fixturePath,
      pickTimeoutMs: app.relatedPick.PICK_TIMEOUT_MS, poolMax: app.relatedPick.RELATED_POOL_MAX,
    };
    writeFileSync(resultsPath, JSON.stringify({ meta, summary, items }, null, 2));
    writeFileSync(votePath, votePageHtml(blindPairs(items), ARMS));
    printSummary(summary);
    process.stdout.write(`\nresults: ${resultsPath}\nvote page: ${votePath}\n`);
  });
}

await main();
