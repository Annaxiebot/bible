# ADR-0029: Monorepo layering — apps/journal, apps/site, shared

Date: 2026-11-24 · Status: accepted

## Context

The repo began as the personal Bible journal app; the Scripture to Life site
was built on top of it in place. By late 2026 the two were mingled: ~35
journal components sat at `components/` root beside the site's subfolders,
journal code imported site plumbing (auth, Ask AI), and nothing stated which
code belonged to which product. A repo split was considered and rejected:
the landing page's 个人研经 Personal Study door opens the journal inside the
same SPA, so site and journal are one runtime product. The owner approved a
monorepo reorg instead (2026-11-24), executed as pure moves with the dist
bundle proven byte-identical to the pre-reorg build.

## Decision

Three top-level layers, with one allowed dependency direction:

- `apps/site/` — the Scripture to Life site (landing, studypack, checkin,
  leader, admin, stats, newstudy, sharing, feedback).
- `apps/journal/` — the personal journal app (App.tsx, Bible viewer,
  journal, Notability, chat, journal services).
- `shared/` — code both sides use: Supabase/sync/storage services, AI
  plumbing (askAI*, transports, error UI, principles, tvHints), the whole
  signin/ and setup/ surfaces, pack model, routes/strings both reach,
  bibleBookData/bibleStorage, types, storageKeys.

Rules: `apps/site` and `apps/journal` may import `shared/` and never each
other; `shared/` imports neither app. Entry glue (index.tsx, configs,
styles/) stays at root; `supabase/` (backend), `database/`, `tests/`,
`scripts/` are outside the layering.

Classification was measured, not guessed: a module reachable from both the
site seeds and App.tsx went to `shared/`; one side only, to that app. The
journal genuinely signs in and runs AI through site-born plumbing, which is
why those surfaces are shared.

## Enforcement

`shared/__tests__/depDirection.test.ts` scans production sources (ts/tsx/js/
jsx/mjs/cjs) in the three trees and fails on any specifier that crosses the
wall, resolving relative, `@/`-alias and root-absolute forms (normalized), in
static/dynamic imports, require, `import.meta.glob` (incl. array form) and
`new URL(…, import.meta.url)`. Tests (`__tests__/`) may cross layers.

Known limits (heuristic scan, by policy stated rather than over-claimed):
runtime-built template-literal specifiers are invisible; glob patterns are
judged by their written prefix, not expanded; `scripts/` is out of scope;
`new URL` with another base can false-positive, which fails loud.

## Consequences

- A future repo split, if volunteers ever need one, is mechanical: the seam
  is `shared/`.
- New code must pick a layer; the guard turns a wrong `import` into a red
  test instead of silent re-mingling.
- Path-literal consumers (eval scripts, fixtures, scanners) were re-pointed;
  anything new should derive paths from module location, not hardcode roots.
