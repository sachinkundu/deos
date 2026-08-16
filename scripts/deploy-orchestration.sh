#!/usr/bin/env bash
set -euo pipefail

config_path="${1:-wrangler.queue-consumer-ts.jsonc}"

required_secrets=(
  LINEAR_APP_ACCESS_TOKEN
  GITHUB_APP_ID
  GITHUB_INSTALLATION_ID
  CODEX_AUTH_ENCRYPTION_KEY
  CAPABILITY_SIGNING_SECRET
  CLEANUP_AUDIT_SECRET
)

for secret_name in "${required_secrets[@]}"; do
  if [[ -z "${!secret_name:-}" ]]; then
    echo "Required secret is not set: ${secret_name}" >&2
    exit 1
  fi
done

if [[ -z "${GITHUB_APP_PRIVATE_KEY:-}" && -z "${GITHUB_APP_PRIVATE_KEY_PATH:-}" ]]; then
  echo "Required secret is not set: GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH" >&2
  exit 1
fi

if [[ -n "${GITHUB_APP_PRIVATE_KEY_PATH:-}" && ! -r "$GITHUB_APP_PRIVATE_KEY_PATH" ]]; then
  echo "GitHub App private key path is not readable" >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_TOKEN:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"
fi

if grep -q 'configure-before-' "$config_path"; then
  echo "Replace every configure-before-* value before orchestration deployment" >&2
  exit 1
fi

npx wrangler d1 migrations apply DB --remote --config "$config_path"

for secret_name in "${required_secrets[@]}"; do
  printf '%s' "${!secret_name}" | npx wrangler secret put "$secret_name" --config "$config_path"
done

if [[ -n "${GITHUB_APP_PRIVATE_KEY:-}" ]]; then
  printf '%s' "$GITHUB_APP_PRIVATE_KEY" | npx wrangler secret put GITHUB_APP_PRIVATE_KEY --config "$config_path"
else
  npx wrangler secret put GITHUB_APP_PRIVATE_KEY --config "$config_path" < "$GITHUB_APP_PRIVATE_KEY_PATH"
fi

npx wrangler deploy --config "$config_path" --containers-rollout gradual
