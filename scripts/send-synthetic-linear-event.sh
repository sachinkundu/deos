#!/usr/bin/env bash
set -euo pipefail

issue_identifier="${1:?usage: send-synthetic-linear-event.sh ISSUE TRANSITION}"
transition="${2:?usage: send-synthetic-linear-event.sh ISSUE TRANSITION}"
ingress_url="${LINEAR_INGRESS_URL:-https://deos-sample-project.skundu.workers.dev}"

for variable_name in LINEAR_APP_ACCESS_TOKEN LINEAR_WEBHOOK_SECRET; do
  if [[ -z "${!variable_name:-}" ]]; then
    echo "Required secret is not set: ${variable_name}" >&2
    exit 1
  fi
done

issue_payload="$(curl --fail-with-body --silent --show-error \
  https://api.linear.app/graphql \
  -H "Authorization: Bearer ${LINEAR_APP_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$(jq -cn --arg id "$issue_identifier" '{
    query: "query SyntheticIssue($id: String!) { issue(id: $id) { id state { id name } project { id } } }",
    variables: {id: $id}
  }')")"

issue_id="$(jq -er '.data.issue.id' <<<"$issue_payload")"
project_id="$(jq -er '.data.issue.project.id' <<<"$issue_payload")"
previous_state_id="$(jq -er '.data.issue.state.id' <<<"$issue_payload")"
previous_state_name="$(jq -er '.data.issue.state.name' <<<"$issue_payload")"
timestamp_ms="$(( $(date +%s) * 1000 ))"
occurred_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
delivery_id="$(uuidgen | tr 'A-F' 'a-f')"
body="$(jq -cn \
  --arg issue "$issue_id" \
  --arg project "$project_id" \
  --arg transition "$transition" \
  --arg previousStateId "$previous_state_id" \
  --arg previousStateName "$previous_state_name" \
  --arg occurredAt "$occurred_at" \
  --argjson webhookTimestamp "$timestamp_ms" \
  '{
    action: "update",
    type: "Issue",
    webhookTimestamp: $webhookTimestamp,
    data: {
      id: $issue,
      updatedAt: $occurredAt,
      project: {id: $project},
      state: {id: ("synthetic-state-" + ($transition | ascii_downcase | gsub(" "; "-"))), name: $transition}
    },
    updatedFrom: {stateId: $previousStateId, state: $previousStateName},
    actor: {id: "synthetic-operator", type: "user"}
  }')"
signature="$(printf '%s' "$body" | python3 -c '
import hashlib
import hmac
import os
import sys

print(hmac.new(os.environ["LINEAR_WEBHOOK_SECRET"].encode(), sys.stdin.buffer.read(), hashlib.sha256).hexdigest())
')"
response="$(curl --fail-with-body --silent --show-error \
  "$ingress_url" \
  -H "Content-Type: application/json" \
  -H "Linear-Delivery: ${delivery_id}" \
  -H "Linear-Event: Issue" \
  -H "Linear-Timestamp: ${timestamp_ms}" \
  -H "Linear-Signature: ${signature}" \
  --data-binary "$body")"

printf 'SYNTHETIC delivery=%s issue=%s transition=%s response=%s\n' \
  "$delivery_id" "$issue_identifier" "$transition" "$response"
