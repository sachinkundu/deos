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

migration_applied_json="$(
  npx wrangler d1 execute DB --remote --config "$config_path" --command \
    "SELECT COUNT(*) AS applied FROM d1_migrations WHERE name = '0007_workflow_visit_identity.sql';" --json
)"
migration_applied="$(
  node --input-type=module -e '
    const payload = JSON.parse(process.argv[1]);
    const applied = payload?.[0]?.results?.[0]?.applied;
    if (applied !== 0 && applied !== 1) throw new Error("could not determine visit-identity migration state");
    process.stdout.write(String(applied));
  ' "$migration_applied_json"
)"

if [[ "$migration_applied" == "0" ]]; then
  migration_preflight_json="$(
    npx wrangler d1 execute DB --remote --config "$config_path" --command \
      "SELECT (SELECT COUNT(*) FROM project_workflow_policies WHERE dispatch_enabled <> 0) AS enabled_policies, (SELECT COUNT(*) FROM orchestration_runs WHERE status IN ('pending_dispatch', 'active', 'awaiting_human')) AS active_runs;" --json
  )"
  node --input-type=module -e '
    const payload = JSON.parse(process.argv[1]);
    const result = payload?.[0]?.results?.[0];
    if (!Number.isInteger(result?.enabled_policies) || !Number.isInteger(result?.active_runs)) {
      throw new Error("could not determine visit-identity migration readiness");
    }
    if (result.enabled_policies !== 0 || result.active_runs !== 0) {
      throw new Error(
        `0007_workflow_visit_identity.sql requires dispatch disabled for every policy and zero active runs; found ${result.enabled_policies} enabled policies and ${result.active_runs} active runs`,
      );
    }
  ' "$migration_preflight_json"
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
