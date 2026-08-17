#!/usr/bin/env bash
set -euo pipefail

auth_path="${1:?usage: deploy-versioned-codex-auth.sh AUTH_JSON [WRANGLER_CONFIG]}"
config_path="${2:-wrangler.queue-consumer-ts.jsonc}"
bucket_name="${CODEX_AUTH_BUCKET:-deos-sample-project-artifacts}"
object_key="${CODEX_AUTH_OBJECT_KEY:-credentials/controlled-trial/auth.v1.enc}"

if [[ ! -r "$auth_path" ]]; then
  echo "Codex auth JSON is not readable" >&2
  exit 1
fi
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"
fi

umask 077
task_tmp="$(mktemp -d "${TMPDIR:-/tmp}/deos-versioned-auth.XXXXXX")"
cleanup() {
  rm -f "$task_tmp/auth.v1.enc" "$task_tmp/secrets.json"
  rmdir "$task_tmp"
}
trap cleanup EXIT

export CODEX_AUTH_ENCRYPTION_KEY="$(openssl rand -hex 32)"
jq -n --arg key "$CODEX_AUTH_ENCRYPTION_KEY" \
  '{CODEX_AUTH_ENCRYPTION_KEY: $key}' > "$task_tmp/secrets.json"
env CODEX_AUTH_ENCRYPTION_KEY="$CODEX_AUTH_ENCRYPTION_KEY" \
  node scripts/encrypt-codex-auth.mjs "$auth_path" > "$task_tmp/auth.v1.enc"

npx wrangler deploy \
  --config "$config_path" \
  --containers-rollout gradual \
  --secrets-file "$task_tmp/secrets.json"
npx wrangler r2 object put "$bucket_name/$object_key" \
  --remote \
  --file "$task_tmp/auth.v1.enc" \
  --content-type application/json \
  --config "$config_path"
npx wrangler r2 object get "$bucket_name/$object_key" \
  --remote \
  --file /dev/null \
  --config "$config_path"
