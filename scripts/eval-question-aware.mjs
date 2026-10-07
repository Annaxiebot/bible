/**
 * eval-question-aware.mjs — ADR-0016 blind evaluation: vote-ranked vs question-aware related verses.
 *
 * For each question in the fixture (default QA_FIXTURE, the second attempt's
 * 34 questions fixed before the run; the first run's 12 are
 * tests/fixtures/related-verses-eval.json):
 *   CONTROL   = today's ON behaviour (ADR-0015): RELATED VERSES = the vote
 *               top 6 (relatedVerses.loadRelatedVerses with no chooser);
 *   TREATMENT = the same request, RELATED VERSES chosen by the 'pick' call
 *               (relatedPick.questionAwareChooser — the app's own two-hop
 *               pool (relatedSecondHop), prompt, parser, fill and fallback,
 *               with the app's PICK_TIMEOUT_MS).
 * Both answer requests come from the app's buildRequestBody with the SAME
 * model, sampling and stream settings (checked: the bodies differ only in
 * `messages`, and only in the list). The pick call goes direct to OpenRouter
 * through aiTransport.ownKeyBody('pick', …) — the final messages the proxy
 * builds. Measuring and judging: lib/evalRun.mjs, the same code as ADR-0015's
 * evaluation (order-proof judge; a failed or empty answer loses — R14).
 * "Cited from memory" counts against each arm's OWN related list. The
 * results keep both arms' lists and, for the treatment, the pool size the
 * pick saw and which picks came from hop 2.
 *
 * Usage:
 *   OPENROUTER_API_KEY=… node scripts/eval-question-aware.mjs <results.json> <vote.html> [fixture.json]
 * Costs real OpenRouter credit (1 pick + 2 answers + 2 judge calls per question).
 *   node scripts/eval-question-aware.mjs --dry-run [fixture.json]
 * no network, no key, no files: per question the hop-1 and two-hop pool
 * sizes, how many hop-2 candidates the pick would see, the pick request
 * size and the vote top 6 (the control's list).
 */
import { writeFileSync } from 'node:fs';
import { blindPairs, votePageHtml } from './lib/evalVotePage.mjs';
import {
  streamOwnKey, answer, measure, judge, assertSameOutsideMessages, summariseArms, printArms, questionContext, withApp,
} from './lib/evalRun.mjs';

const TITLE = 'Scripture to Life question-aware eval';
/** ADR-0016 second attempt: fixed (committed) before the run. */
const QA_FIXTURE = 'tests/fixtures/question-aware-eval-2.json';
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

/** Wraps the app's chooser: records the pool it saw (size, hop-2 count) and which final targets came from hop 2. */
function recording(app, chooser, log) {
  return async (pool, byVotes, passage) => {
    const out = await chooser(pool, byVotes, passage);
    const isHop2 = app.relatedSecondHop.isSecondHop;
    Object.assign(log, {
      hop1Pool: pool.length,
      poolSize: out.pool?.length ?? null,
      hop2InPool: out.pool?.filter(isHop2).length ?? null,
      hop2Picks: out.targets.filter(isHop2).map(t => t.ref),
    });
    return out;
  };
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
  return recording(app, app.relatedPick.questionAwareChooser({ passageRef: pack.passageRef, question, model, signal: new AbortController().signal, send }), log);
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
    hop2Picks: items.reduce((n, i) => n + i.pick.hop2Picks.length, 0),
    questionsWithHop2Pick: items.filter(i => i.pick.hop2Picks.length > 0).length,
    pickFellBack: items.filter(i => i.pick.source === 'votes').map(i => `${i.id}: ${i.pick.warnings.join('; ')}`),
    sameListAsControl: items.filter(i => i.sameList).map(i => i.id),
  };
}

function printSummary(s) {
  printArms(s);
  process.stdout.write(`pick used: ${s.pickUsed} of ${s.questions}\n`);
  process.stdout.write(`picks from hop 2: ${s.hop2Picks} (in ${s.questionsWithHop2Pick} questions)\n`);
  if (s.pickFellBack.length) process.stdout.write(`pick fell back to votes:\n  ${s.pickFellBack.join('\n  ')}\n`);
  if (s.sameListAsControl.length) process.stdout.write(`treatment list identical to control: ${s.sameListAsControl.join(', ')}\n`);
}

const DRY_RUN = 'dry run: nothing sent';

/**
 * --dry-run: the app's own chooser with a sender that sends nothing, so it
 * builds the two-hop pool and the pick body, then falls back to the vote
 * top 6 (the control's list). No key, no network.
 */
async function dryRun(app, fixture, packs) {
  for (const q of fixture.questions) {
    const { pack, question } = questionContext(app, packs, q);
    const log = {};
    let body = '';
    const send = async b => { body = b; throw new Error(DRY_RUN); };
    const chooser = app.relatedPick.questionAwareChooser({ passageRef: pack.passageRef, question, model: fixture.model, signal: new AbortController().signal, send });
    const votes = await app.relatedVerses.loadRelatedVerses(pack, question, recording(app, chooser, log));
    const warnings = votes.warnings.filter(w => !w.endsWith(DRY_RUN));
    process.stdout.write(`${q.id} ${pack.passageRef}: pool hop 1 ${log.hop1Pool} → pick sees ${log.poolSize} (${log.hop2InPool} from hop 2), ` +
      `request ${body ? app.aiTransport.ownKeyBody('pick', body).length : 0} chars; vote top 6 [${votes.related.map(r => r.ref).join(', ')}]` +
      `${warnings.length ? `, WARNINGS ${warnings.join('; ')}` : ''}\n`);
  }
}

async function main() {
  if (process.argv[2] === '--dry-run') return withApp(process.argv[3] ?? QA_FIXTURE, dryRun);
  const [resultsPath, votePath, fixturePath = QA_FIXTURE] = process.argv.slice(2);
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
      secondHopSeeds: app.relatedSecondHop.SECOND_HOP_SEEDS, secondHopWeight: app.relatedSecondHop.SECOND_HOP_WEIGHT,
    };
    writeFileSync(resultsPath, JSON.stringify({ meta, summary, items }, null, 2));
    writeFileSync(votePath, votePageHtml(blindPairs(items), ARMS));
    printSummary(summary);
    process.stdout.write(`\nresults: ${resultsPath}\nvote page: ${votePath}\n`);
  });
}

await main();
