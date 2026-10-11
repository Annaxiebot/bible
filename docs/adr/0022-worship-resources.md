# ADR-0022: Worship resources — a footer page first, a worship step in studies later (2026-10-11)

Status: step 1 built 2026-10-11 (Family Music Ministry · Original Christian Songs playlist); step 2 proposed — deferred until step 1 shows interest.

## Context

- Small groups and families often sing before they study. The owner's
  family has a worship music channel on YouTube and asked whether the site
  should offer it for family or small-group worship.
- The site is meant to be adopted by other groups and churches. A single
  family's channel placed prominently could read as self-promotion and make
  other churches hesitant; worship offered as a resource inside the study
  flow reads as help.
- Copyright: embedding or linking YouTube videos is fine (YouTube handles
  the music licensing on its platform); the site must not download or
  re-host songs.
- The owner prefers few buttons and words (minimalist UI).

## Decision

### Step 1 — now: "敬拜资源 · Worship resources" (a link and one static page)
- One link in the landing footer, next to 意见反馈 Feedback and Contribute:
  "敬拜资源 · Worship resources".
- It opens one static page (same style and structure as
  `public/privacy.html`): a line or two on singing together before a
  study, then a short list of YouTube channels — each with its name, a
  one-line description and "打开 YouTube · Open on YouTube" (a plain link
  opening YouTube; nothing embedded, nothing downloaded).
- The owner's family channel is listed; other trusted Chinese worship
  channels are added only when the owner names them (links verified before
  publishing). No ranking claims, no analytics, no tracking parameters.
- Easy to change or remove: one page and one footer link.

### Step 2 — deferred: an optional "敬拜诗歌 · Worship" step in a study
- A leader may add one or two YouTube links to a study; the TV shows them
  as the opening slide (played full screen) before the passage.
- When adding a song, the site may suggest videos from the channels on the
  step-1 page as a starting list — the owner's channel among others.
- Built only if step 1 shows that groups want worship inside the site.
  Needs its own design pass: the pack section and validation, the TV slide
  (YouTube embed, fullscreen, network failure), and the privacy notice
  (an embedded YouTube player sets YouTube's own cookies — use the
  privacy-enhanced `youtube-nocookie.com` embed).

## Consequences

- Worship is one click away without adding controls to the study flow.
- The site stays neutral enough to recommend church-wide and to other
  churches.
- The owner's family appears on a public page; the family should be
  comfortable with that (especially if children appear in the videos).

## Pending

- From the owner: the family channel's link, the name to show, a one-line
  description; whether to list other channels (and which).
