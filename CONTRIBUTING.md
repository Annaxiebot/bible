# 参与开发 · Contributing

Thank you for helping build Scripture to Life. This page says how to
propose a change, the rules every change follows, and how to check your
work before you open a pull request.

By contributing you agree that your contribution is licensed under the
GNU Affero General Public License v3.0 or later (see [LICENSE](LICENSE)),
and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## 怎样提交 · How to propose a change

1. **Open an issue first** for anything beyond a small fix (a typo, a
   one-line bug). Describe the problem or idea and wait for agreement on
   the approach. This saves you from writing code that cannot be merged.
2. **Fork the repository and create a branch** from `master`.
3. **One concern per pull request.** A bug fix does not also refactor; a
   feature does not also reformat unrelated files. If you find something
   else that needs work, open a separate issue.
4. **Open a pull request** that explains what changed and why, how you
   tested it, and which issue it closes.

Non-technical feedback (wording, a confusing page, a wish) is welcome on
the site's feedback page: <https://scripturetolife.org/#/feedback>.
Security problems: see [SECURITY.md](SECURITY.md), never a public issue.

## 规则 · Rules every change follows

### Code

- **Tests alongside the code, never after.** Every bug fix comes with a
  regression test. Changes to sign-up, check-ins, sync, AI or input
  handling also need a test of the real user flow (an end-to-end test in
  `tests/e2e/`), not only unit tests. Mocks must enforce the same rules as
  the real service, or they hide bugs.
- **No silent error swallowing.** Every `try/catch` either rethrows with
  context, shows the user an error, or carries a comment explaining why
  ignoring the error is correct. Logging to the console alone does not
  count. An empty or timed-out result is a failure, not a success.
- **One source for shared strings.** A string that must match in several
  places (a user-visible label, a prompt, a config key, a column list)
  lives in one module as an exported constant. Tests import the constant
  instead of copying the literal. Search the codebase before adding a new
  constant, function or long string.
- **Size budget.** At most 50 lines per function and 300 lines per file.
  Do not push a file over 300 lines; split it in the same change. Some
  older files are already over; you may fix bugs in them, but do not add a
  new feature to one without splitting it first.
- **Clean build.** `npx tsc --noEmit` passes with no errors, no `any`
  without a stated reason, no `@ts-ignore`, no commented-out code, no
  `console.log` in production code, no magic numbers (use named
  constants).
- **Delete dead code.** Remove unused files and functions you come across
  in the area you touch; do not leave `.backup`, `.old` or `_v2` copies.
  Git history keeps the old version.

### Decisions

- **Record decisions in an ADR.** A change to architecture, data model,
  privacy or content rules gets a short Architecture Decision Record in
  [`docs/adr/`](docs/adr/) (context, decision, consequences). Read the
  existing ADRs before changing the area they cover.

### Content and theology (ADR-0003)

[ADR-0003](docs/adr/0003-scripturetolife-content-principles.md) binds every
part of the site that shows or generates content. In short:

- **Chinese first.** Every bilingual user-facing string shows 中文 first,
  then English (`中文 · English`). Simplified Chinese.
- **Translations.** Scripture is 和合本 (CUV) and the Berean Standard Bible
  (BSB), both public domain and bundled in `public/bible-data/`. Never add
  a copyrighted translation (for example NIV).
- **A leader's guide is used literally.** The AI adds nothing uninvited;
  leader-only material (hints, reference answers) never reaches the TV.
  App-added layers are visibly the app's.
- **The Ask AI answer contract.** Short first, deeper only when asked;
  start from the passage, then the whole Bible with 1-2 references; cite
  verses (every reference is clickable); mark contested readings as
  "一种理解 · one reading"; follow the pack's content-language setting;
  never equate a medical or emotional condition with weak faith. The AI
  supports the discussion; the group and the pastor lead it.
- **Three kinds of claims stay separate.** "Scripture says X"
  (interpretation), "X may lead to behavior Y" (application hypothesis) and
  "Y affects physiology Z" (a scientific claim that needs evidence). The
  last two are never presented as biblical claims.
- **Readable for seniors.** Large type, tap targets of at least 48px,
  animation never carries information and respects reduced motion.

### Privacy and secrets

- **Never commit secrets** (API keys, tokens, passwords, the Supabase
  service-role key) or a `.env` file. Only the Supabase anon key may appear
  in a build, and only through `VITE_SUPABASE_ANON_KEY`.
- **Never commit personal data**: real names, emails or phone numbers,
  real check-in answers, logs, recordings or screenshots of real content.
  Use obviously fake test data (`member@example.com`).
- Reflections are private by default (ADR-0003 §17); a change must not
  send a member's data anywhere they did not choose.

## 检查 · Run the checks

```bash
npm install
npx tsc --noEmit     # types: must be clean
npx vitest run       # unit and integration tests: all pass
npx playwright test  # end-to-end tests: all pass
npm run build        # production build: no warnings
```

Unit tests live next to the code in `__tests__/` folders; end-to-end tests
live in `tests/e2e/`. End-to-end tests must not call live services: mock
Supabase and the AI with fakes that enforce the real contract.

Include the test output (the last lines are enough) in your pull request.

## 提交信息 · Commit messages

```
type(scope): short description

- What changed and why
- Searched: "<terms you searched for>" - no duplicates
- Tests: which tests cover it and pass
```

`type` is one of `feat`, `fix`, `test`, `refactor`, `docs`, `chore`.
`scope` is the area, for example `landing`, `studypack`, `signup`,
`checkins`. Explain *why* in the body; the diff already shows *what*.
