# Scripture to Life · 活出神的话

AI 辅助的小组查经工具。An AI-assisted tool for small-group Bible study.

Live site: <https://scripturetolife.org>

## 这是什么 · What it is

A small-group leader enters a passage. The site drafts a study pack, the
group studies it together on a TV, and members carry one practice into the
week. The loop is 明白神的话 Understand the Word → 活出神的话 Live the Word →
生命兴盛 Flourish.

- **生成查经包 · Generate a study pack** (`#/new`): from a passage (or the
  leader's own study guide), AI drafts the outline, questions and a life
  menu. The leader reviews and adjusts each section before using it.
- **大屏演示 · Present on a TV** (`#/pack/<id>`): full-screen slides with
  clickable verse references (和合本 first, then BSB) and an on-screen
  "问一问 Ask AI" panel for the group's questions.
- **扫码报名 · Sign up by QR** (`#/signup`): members scan a code on the
  screen and commit to one practice for the week. No account needed.
- **周中提醒 · Mid-week check-ins**: short emails on Tuesday, Thursday and
  the weekend. Answers stay private unless the member chooses to share
  them with the leader. Members can stop the emails at any time.
- **上周分享 · Last week's sharing**: the next meeting opens with a slide
  summarizing only what members chose to share, reviewed by the leader first.
- **个人研经 · Personal Bible app** (`#app`): bilingual reading
  (和合本 + BSB, side by side, readable offline), notes, handwriting
  annotations, and AI study help. Signed in with Google it syncs; signed out
  it stays in the browser.

The Bible text is bundled in the repository (`public/bible-data/`), so a
meeting never depends on a third-party Bible API.

## 本地运行 · Run locally

Prerequisites: Node.js 20+.

```bash
git clone https://github.com/Annaxiebot/bible.git
cd bible
npm install
npm run dev          # http://localhost:3000/bible/
```

Without a Supabase project the reading app, the landing page and TV mode
for the bundled sample pack work; sign-in, sync, AI and sign-ups need the
configuration below.

### 测试 · Tests

```bash
npx tsc --noEmit     # type check
npx vitest run       # unit and integration tests
npx playwright test  # end-to-end tests (starts the dev server on port 3000)
npm run build        # production build
```

End-to-end tests mock Supabase and the AI; they never call a live service.

## 架构 · Architecture

- **Front end:** Vite + React 19 + TypeScript, a static site on GitHub
  Pages. Deployed from `master` by `.github/workflows/deploy.yml`.
- **Back end:** Supabase — Google sign-in, Postgres with row-level security
  (schemas and runbooks in `database/`), and three edge functions in
  `supabase/functions/`:
  - `ai-proxy` — relays AI requests to OpenRouter with the site's key, so
    leaders need no key of their own.
  - `send-checkins` — the mid-week check-in emails (Resend), run by pg_cron.
  - `feedback` — stores messages from the `#/feedback` page and emails the
    owner.
- **AI models:** OpenRouter, through the hosted proxy (a monthly quota per
  leader). Model ids are single constants in `services/aiDefaults.ts`.

Decisions are recorded as ADRs in [`docs/adr/`](docs/adr/):

| ADR | Topic |
| --- | --- |
| [0003](docs/adr/0003-scripturetolife-content-principles.md) | Content principles: Chinese first, translations, Ask AI answer contract, flourishing model |
| [0004](docs/adr/0004-per-pack-signup-and-checkins.md) | Per-pack sign-up and automated check-ins |
| [0005](docs/adr/0005-leader-settings-sync.md) | Leader settings sync |
| [0006](docs/adr/0006-packs-in-supabase.md) | Study packs in Supabase |
| [0007](docs/adr/0007-hosted-ai.md) | Hosted AI proxy |
| [0008](docs/adr/0008-last-week-sharing.md) | Last week's sharing |
| [0009](docs/adr/0009-checkin-opt-out.md) | Check-in opt-out |
| [0010](docs/adr/0010-personal-app-sync.md) | Personal app sync |
| [0011](docs/adr/0011-feedback.md) | Feedback page |
| [0012](docs/adr/0012-site-stats.md) | Site-wide usage counters |

## 配置 · Configuration

Front end (`.env.local`, never committed):

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key; row-level security protects the data |
| `VITE_OPENROUTER_API_KEY` | Optional, local development only. It is compiled into the bundle, so never set it for a public build |
| `VITE_BASE_PATH` | Build base path (default `/bible/`; the production build uses `/`) |

Edge function secrets (set with `supabase secrets set`; names only — values
are never committed):

- `ai-proxy`: `OPENROUTER_API_KEY`, `AI_PROXY_ENABLED`
- `send-checkins`: `RESEND_API_KEY`, `CHECKIN_FROM`, `CHECKIN_REPLY_TO`,
  `CHECKIN_CRON_SECRET`, `CHECKIN_SMS_ENABLED`, `TWILIO_ACCOUNT_SID`,
  `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `DRY_RUN`
- `feedback`: `FEEDBACK_TO`, `FEEDBACK_SALT` (and the Resend secrets above)
- All functions also read `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
  `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides.

## 隐私 · Privacy

Members give a name and an email or phone number, used only for the
check-ins of the group they joined. Check-in answers stay on the member's
own device unless they choose to share them. Nothing is sold or used for
advertising. Full statement: [privacy.html](https://scripturetolife.org/privacy.html)
(source: `public/privacy.html`).

## 参与开发 · Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Report security problems privately as
described in [SECURITY.md](SECURITY.md). Non-technical feedback:
<https://scripturetolife.org/#/feedback>.

## 许可 · License

Code © the Scripture to Life contributors, licensed under the
[GNU Affero General Public License v3.0 or later](LICENSE)
(AGPL-3.0-or-later). If you run a modified version as a public service, you
must offer its source to its users.

The bundled Bible text is public domain and not covered by the code
license: 和合本 Chinese Union Version (1919) and the Berean Standard Bible
(dedicated to the public domain in 2023). Photos and fonts keep their own
licenses. See [NOTICE](NOTICE) for the full list.
