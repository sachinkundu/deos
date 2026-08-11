#!/usr/bin/env bash
set -euo pipefail

: "${CLOUDFLARE_ACCOUNT_ID:?Set CLOUDFLARE_ACCOUNT_ID}"
: "${DEOS_D1_DATABASE_ID:?Set DEOS_D1_DATABASE_ID from the created D1 database}"
: "${LINEAR_WEBHOOK_SECRET:?Set LINEAR_WEBHOOK_SECRET without committing it}"

template_path="${1:-wrangler.toml.example}"
if [[ ! -f "$template_path" ]]; then
  echo "Wrangler template not found: $template_path" >&2
  exit 1
fi

for command_name in npx uv; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done

config_dir="$(mktemp -d)"
trap 'rm -rf "$config_dir"' EXIT
config_path="$config_dir/wrangler.toml"
cp "$template_path" "$config_path"

CONFIG_PATH="$config_path" \
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
DEOS_D1_DATABASE_ID="$DEOS_D1_DATABASE_ID" \
LINEAR_PROJECT_IDS="${LINEAR_PROJECT_IDS:-99426d9b-cda7-4db4-9136-692a95a0b090}" \
LINEAR_START_TRANSITIONS="${LINEAR_START_TRANSITIONS:-Started}" \
python3 - <<'PY'
from pathlib import Path
import os

path = Path(os.environ["CONFIG_PATH"])
text = path.read_text()
replacements = {
    "SET_CLOUDFLARE_ACCOUNT_ID": os.environ["CLOUDFLARE_ACCOUNT_ID"],
    "SET_D1_DATABASE_ID": os.environ["DEOS_D1_DATABASE_ID"],
    "99426d9b-cda7-4db4-9136-692a95a0b090": os.environ["LINEAR_PROJECT_IDS"],
    "Started": os.environ["LINEAR_START_TRANSITIONS"],
}
for old, new in replacements.items():
    text = text.replace(old, new)
path.write_text(text)
PY

echo "Applying D1 migrations..."
npx wrangler d1 migrations apply DB --remote --config "$config_path"

echo "Uploading Linear webhook secret..."
printf '%s' "$LINEAR_WEBHOOK_SECRET" | npx wrangler secret put LINEAR_WEBHOOK_SECRET --config "$config_path"

echo "Deploying Python Worker..."
uv run pywrangler deploy --config "$config_path"
