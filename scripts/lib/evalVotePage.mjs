/**
 * evalVotePage.mjs — the owner's blind-vote page for ADR-0015 §6 (self-contained HTML).
 *
 * Pairs in random order, each pair's A/B in random order, arm names hidden
 * until "Reveal". Votes stay in the page (nothing is sent anywhere); Reveal
 * shows which answer was which and the tally. Answers render as text
 * (textContent), never as HTML.
 */

function shuffle(list, random) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The blind pairs: [{ id, passage, question, a, b, aArm }] with order and sides randomised. */
export function blindPairs(items, random = Math.random) {
  return shuffle(items, random).map(item => {
    const controlFirst = random() < 0.5;
    const [first, second] = controlFirst ? [item.control, item.treatment] : [item.treatment, item.control];
    const shown = arm => (arm.failed ? `（无回答 · no answer: ${arm.error ?? 'empty'}）` : arm.text);
    return {
      id: item.id, passage: item.passageRef, question: item.question,
      a: shown(first), b: shown(second), aArm: controlFirst ? 'control' : 'treatment',
    };
  });
}

const STYLE = `
:root { --bg:#faf8f3; --fg:#1d1b16; --muted:#6b6457; --card:#fff; --line:#e3ddd0; --accent:#9a6b12; }
@media (prefers-color-scheme: dark) { :root { --bg:#16140f; --fg:#ece6d8; --muted:#a39b8a; --card:#201d16; --line:#3a3428; --accent:#e0b04a; } }
body { background:var(--bg); color:var(--fg); font:16px/1.6 system-ui, "PingFang SC", sans-serif; margin:0; padding:16px; }
main { max-width:1100px; margin:0 auto; }
.pair { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:16px; margin:16px 0; }
.q { color:var(--muted); margin:0 0 12px; }
.cols { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:12px; }
.ans { border:1px solid var(--line); border-radius:8px; padding:12px; white-space:pre-wrap; }
.ans h3 { margin:0 0 8px; color:var(--accent); }
label { display:block; margin-top:8px; cursor:pointer; }
.arm { display:none; color:var(--muted); font-size:14px; }
body.revealed .arm { display:block; }
button { font:inherit; padding:8px 16px; border-radius:8px; border:1px solid var(--accent); background:transparent; color:var(--fg); cursor:pointer; }
#tally { margin-top:12px; color:var(--muted); }
`;

/** What Reveal calls each arm, and the page title — ADR-0015's evaluation by default. */
export const RELATED_VERSES_ARMS = {
  control: '对照 · control (today)',
  treatment: '实验 · treatment (related verses)',
  title: 'Related Verses Vote',
  heading: '相关经文盲评 · Related verses blind vote',
};

/** What the owner is asked to judge (ADR-0015/0016); an evaluation may pass its own `arms.instructions`. */
const VOTE_INSTRUCTIONS = '每题两个回答，标签隐藏。选更适合小组查经的一个（忠于经文、交叉经文恰当、清楚），最后揭晓。 · ' +
  'Two answers per question, labels hidden: pick the one that better serves a church small group (faithful to Scripture, apt cross-references, clear), then reveal.';

const SCRIPT = `
const pairs = JSON.parse(document.getElementById('pairs').textContent);
const arms = JSON.parse(document.getElementById('arms').textContent);
const main = document.querySelector('main');
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
pairs.forEach((p, i) => {
  const box = el('section', 'pair');
  box.append(el('h2', '', (i + 1) + '. ' + p.passage), el('p', 'q', p.question));
  const cols = el('div', 'cols');
  for (const side of ['a', 'b']) {
    const ans = el('div', 'ans');
    const arm = side === 'a' ? p.aArm : (p.aArm === 'control' ? 'treatment' : 'control');
    ans.append(el('h3', '', side.toUpperCase()), el('div', '', p[side]), el('div', 'arm', arm === 'control' ? arms.control : arms.treatment));
    const label = el('label');
    const radio = el('input'); radio.type = 'radio'; radio.name = 'v' + i; radio.value = arm;
    label.append(radio, document.createTextNode(' 选 ' + side.toUpperCase() + ' · prefer ' + side.toUpperCase()));
    ans.append(label);
    cols.append(ans);
  }
  box.append(cols);
  main.append(box);
});
const reveal = el('button', '', '揭晓 · Reveal');
const tally = el('p', ''); tally.id = 'tally';
reveal.onclick = () => {
  document.body.classList.add('revealed');
  const votes = [...document.querySelectorAll('input:checked')].map(r => r.value);
  const n = arm => votes.filter(v => v === arm).length;
  tally.textContent = '实验 treatment ' + n('treatment') + ' · 对照 control ' + n('control') + ' · 未投 unvoted ' + (pairs.length - votes.length);
};
main.append(reveal, tally);
`;

/** The whole page; JSON is embedded with "<" escaped so no answer can close the script tag. */
export function votePageHtml(pairs, arms = RELATED_VERSES_ARMS) {
  const data = JSON.stringify(pairs).replace(/</g, '\\u003c');
  const armData = JSON.stringify(arms).replace(/</g, '\\u003c');
  const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(arms.title)}</title><style>${STYLE}</style></head>
<body><main><h1>${escape(arms.heading)}</h1>
<p>${escape(arms.instructions ?? VOTE_INSTRUCTIONS)}</p>
</main><script type="application/json" id="pairs">${data}</script><script type="application/json" id="arms">${armData}</script><script>${SCRIPT}</script></body></html>
`;
}
