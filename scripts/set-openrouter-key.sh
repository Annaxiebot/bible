#!/usr/bin/env bash
# set-openrouter-key.sh — give hosted AI (ADR-0007) its OpenRouter key · 设置站点 AI 密钥
#
# Reads the key from a local file (never from the command line, never printed),
# checks it with OpenRouter, and stores it as the Supabase secret
# OPENROUTER_API_KEY that the ai-proxy edge function uses.
#
#   scripts/set-openrouter-key.sh                # uses ~/.supabase/scripturetolife-openrouter-key
#   scripts/set-openrouter-key.sh path/to/file   # e.g. a second account's key
#
# Key file: one line, the key only (sk-or-...). Keep it outside the repo,
# readable only by you:  chmod 600 <file>
# Switching OpenRouter accounts = put the other key in the file and run again.
set -euo pipefail

PROJECT_REF="lafipstknsudjtfxbkkn"
KEY_FILE="${1:-$HOME/.supabase/scripturetolife-openrouter-key}"
TOKEN_FILE="$HOME/.supabase/access-token"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

fail() { echo "✗ $*" >&2; exit 1; }

[ -f "$KEY_FILE" ] || fail "Key file not found: $KEY_FILE (create it with the key on one line, then chmod 600)"
[ -f "$TOKEN_FILE" ] || fail "Supabase access token not found: $TOKEN_FILE"
case "$(realpath "$KEY_FILE")" in
  "$REPO_DIR"/*) fail "Key file is inside the repo — move it outside ($KEY_FILE)";;
esac
perms="$(stat -f '%Lp' "$KEY_FILE" 2>/dev/null || stat -c '%a' "$KEY_FILE")"
if [ "$perms" != "600" ] && [ "$perms" != "400" ]; then
  chmod 600 "$KEY_FILE"
  echo "• Tightened $KEY_FILE to 600 (was $perms)"
fi

KEY="$(tr -d '[:space:]' < "$KEY_FILE")"
case "$KEY" in
  sk-or-*) ;;
  *) fail "The file does not look like an OpenRouter key (should start with sk-or-)";;
esac

# Check the key with OpenRouter before storing it (prints credit info only, never the key).
check="$(curl -s -w '\n%{http_code}' https://openrouter.ai/api/v1/key -K - <<<"header = \"Authorization: Bearer $KEY\"")"
code="${check##*$'\n'}"
body="${check%$'\n'*}"
[ "$code" = "200" ] || fail "OpenRouter rejected the key (HTTP $code)"
python3 - "$body" <<'PY'
import json, sys
d = json.loads(sys.argv[1]).get("data", {})
usage, limit = d.get("usage"), d.get("limit")
left = "no per-key limit (account balance applies)" if limit is None else f"${limit - (usage or 0):.2f} left of ${limit:.2f}"
print(f"• OpenRouter key OK — label: {d.get('label', '?')}, used so far: ${usage or 0:.2f}, {left}")
PY

# Pass the key through a private temp env file, not argv (argv is visible in `ps`).
ENV_FILE="$(mktemp)"
trap 'rm -f "$ENV_FILE"' EXIT
chmod 600 "$ENV_FILE"
printf 'OPENROUTER_API_KEY=%s\n' "$KEY" > "$ENV_FILE"
unset KEY
SUPABASE_ACCESS_TOKEN="$(cat "$TOKEN_FILE")" npx --yes supabase secrets set \
  --project-ref "$PROJECT_REF" --env-file "$ENV_FILE" >/dev/null
echo "✓ Stored as Supabase secret OPENROUTER_API_KEY (project $PROJECT_REF). Hosted AI uses it immediately."
