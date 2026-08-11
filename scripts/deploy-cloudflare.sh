#!/usr/bin/env bash
set -euo pipefail

: "${LINEAR_WEBHOOK_SECRET:?Set LINEAR_WEBHOOK_SECRET without committing it}"

config_path="${1:-wrangler.jsonc}"
if [[ ! -f "$config_path" ]]; then
  echo "Wrangler config not found: $config_path" >&2
  exit 1
fi

for command_name in npx uvx; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 1
  fi
done

echo "Applying D1 migrations..."
npx wrangler d1 migrations apply DB --remote --config "$config_path"

echo "Uploading Linear webhook secret..."
printf '%s' "$LINEAR_WEBHOOK_SECRET" | npx wrangler secret put LINEAR_WEBHOOK_SECRET --config "$config_path"

echo "Deploying Python Worker..."
uvx --from workers-py pywrangler deploy
