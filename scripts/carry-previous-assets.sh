#!/usr/bin/env bash
# Keep the previous deploy's assets for one more deploy (used by deploy.yml).
#
# Why: index.html is served with max-age=600, so for up to 10 minutes after a
# deploy a browser or CDN can still hold the OLD page, which asks for the OLD
# hashed bundles. force_orphan replaces gh-pages wholesale, so those bundles
# 404 and the page renders blank. Carrying them one more round fixes that, and
# only ONE generation is carried: each build lists its own files in
# ASSETS_MANIFEST, and only the files in the previous build's manifest come
# along — carried files are never listed, so old bundles still age out.
#
# Usage: carry-previous-assets.sh <dist dir> <git ref of the live site>
# A missing ref (first deploy) carries nothing. A live site from before the
# manifest existed carries all of its assets/ (then exactly one generation).
set -euo pipefail

ASSETS_MANIFEST=assets-manifest.txt
dist=$1
ref=$2

ls "$dist/assets" > "$dist/$ASSETS_MANIFEST"

if ! git rev-parse --verify --quiet "$ref^{commit}" > /dev/null; then
  echo "carry-previous-assets: no live site at $ref, nothing to carry"
  exit 0
fi

if git cat-file -e "$ref:$ASSETS_MANIFEST" 2> /dev/null; then
  previous=$(git show "$ref:$ASSETS_MANIFEST")
else
  previous=$(git ls-tree --name-only "$ref" assets/ | sed 's|^assets/||')
fi

carried=0
for name in $previous; do
  if [ ! -e "$dist/assets/$name" ] && git cat-file -e "$ref:assets/$name" 2> /dev/null; then
    git show "$ref:assets/$name" > "$dist/assets/$name"
    carried=$((carried + 1))
  fi
done
echo "carry-previous-assets: carried $carried file(s) from the previous deploy"
