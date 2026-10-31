# ADR-0027 — 图片 Picture slides, embedded in the pack

Status: accepted, built 2026-10-31.

## Context

Some leaders want to insert illustration pictures as slides (maps, artwork,
a photo from the group). Packs are one JSON document that syncs to Supabase
(ADR-0006), opens on member phones via the share link (ADR-0026) and prints
from the QR page — any image store outside the pack would need upload
plumbing, anon-read URLs and a deletion story.

## Decision

- A new addable section kind `picture` holding ONE illustration:
  `{ src, caption? }`. Named `picture`, not `image` — qr sections already
  carry a legacy `image` string field with a different meaning.
- EMBEDDED by default: the editor's 选择图片 picker downscales the photo
  client-side (imageResize.ts: 1280px long edge, JPEG 0.8 then 0.6, result
  capped ~400KB) and stores it in the pack as a data URL. No storage
  service: the picture syncs, shares and presents wherever the pack goes.
- Pasting an http(s) image URL is a free extra (the same `src` field); the
  pack then stays small but the link can rot.
- At most MAX_PACK_PICTURES = 5 picture sections per pack (sectionRules):
  embedded images grow the pack ~200–400KB each, and Supabase JSONB and
  IndexedDB are comfortable at ~2MB but not unbounded.
- A picture section may sit anywhere between the head (title/worship/
  sharing/scripture) and the tail (qr/closing); movable like other body
  sections; blank src (mid-edit) renders no slide.
- PACK_SCHEMA_VERSION 3 → 4 (additive; old packs parse unchanged).

## Consequences

- A pack with 5 photos is ~1–2MB: fine for sync and the member link on
  phones, but leaders should not expect to paste whole photo albums.
- The AI never drafts picture sections; they are leader-added only, so
  generation and prompts are untouched.
- Future: if groups want many photos, an external store (Supabase Storage
  with anon-read per shared pack) becomes its own ADR; the `src` field
  already accepts URLs, so the schema would not change.
