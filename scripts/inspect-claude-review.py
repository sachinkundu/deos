#!/usr/bin/env python3
"""Read durable Claude canary state and optionally hash-check protected R2 receipts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import tempfile
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--env-file', type=Path, required=True)
parser.add_argument('--issue-id', required=True, help='Linear issue UUID')
parser.add_argument('--check-r2', action='store_true')
parser.add_argument('--check-container', action='store_true')
args = parser.parse_args()
values = {}
for line in args.env_file.read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'):
        continue
    key, value = line.removeprefix('export ').split('=', 1)
    if key in {'CLOUDFLARE_TOKEN', 'CLOUDFLARE_API_TOKEN'}:
        values['CLOUDFLARE_API_TOKEN'] = shlex.split(value, comments=True)[0]
if not values.get('CLOUDFLARE_API_TOKEN'):
    parser.error('Cloudflare token is missing')
endpoint = 'https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query'
def query(sql, params):
    request = urllib.request.Request(endpoint, data=json.dumps({'sql': sql, 'params': params}).encode(),
        headers={'Authorization': 'Bearer ' + values['CLOUDFLARE_API_TOKEN'], 'Content-Type': 'application/json'})
    data = json.load(urllib.request.urlopen(request, timeout=30))
    if not data['success']:
        raise RuntimeError('D1 read failed')
    return data['result'][0]['results']

runs = query('SELECT run_id, definition_id, definition_version, definition_digest, status, current_node, independent_review_provider, independent_review_model, independent_review_reasoning, independent_review_account_binding FROM orchestration_runs WHERE issue_id = ? ORDER BY created_at', [args.issue_id])
for run in runs:
    rid = run['run_id']
    run['ingress'] = query('SELECT d.delivery_id, d.classification, d.payload_hash, d.received_at FROM deliveries d JOIN orchestration_runs r ON r.selection_delivery_id = d.delivery_id WHERE r.run_id = ?', [rid])
    run['attempts'] = query('SELECT attempt_id, node_id, state, result_class, cleanup_state FROM agent_attempts WHERE run_id = ? ORDER BY created_at', [rid])
    run['claudeInvocations'] = query('SELECT c.attempt_id, c.state, c.secret_version, c.account_binding, c.safe_cause, c.retry_not_before, c.cleanup_state FROM claude_review_invocations c JOIN agent_attempts a ON a.attempt_id = c.attempt_id WHERE a.run_id = ? ORDER BY c.created_at', [rid])
    run['planningReviews'] = query('SELECT review_id, reviewer_provider, reviewer_model, reasoning_effort, overall_outcome, accepted FROM trace_reviews WHERE run_id = ? ORDER BY created_at', [rid])
    run['designReviews'] = query('SELECT a.review_attempt_id, a.model_provider, a.model, a.reasoning, a.outcome, a.accepted FROM design_review_attempts a JOIN design_review_rounds r ON r.round_id = a.round_id WHERE r.run_id = ? ORDER BY a.created_at', [rid])
    turns = query('SELECT t.* FROM claude_review_turns t JOIN agent_attempts a ON a.attempt_id = t.attempt_id WHERE a.run_id = ? ORDER BY a.created_at, t.ordinal', [rid])
    run['turns'] = turns
    if args.check_r2:
        for turn in turns:
            if not turn['receipt_key']:
                continue
            with tempfile.TemporaryDirectory(prefix='deos-claude-proof-') as temp:
                path = Path(temp) / 'receipt.json'
                result = subprocess.run(['npx', 'wrangler', 'r2', 'object', 'get', 'deos-sample-project-artifacts/' + turn['receipt_key'], '--remote', '--file', str(path)], env={**os.environ, **values}, capture_output=True)
                if result.returncode:
                    raise RuntimeError('protected receipt read failed')
                raw = path.read_bytes()
                if hashlib.sha256(raw).hexdigest() != turn['receipt_sha256']:
                    raise RuntimeError('receipt hash mismatch')
                receipt = json.loads(raw)
                turn['hashVerified'] = True
                turn['providerProof'] = {key: receipt[key] for key in ['model', 'effort', 'route', 'clientVersion', 'accountEvidence', 'secretVersion', 'paidUsage', 'observedModels', 'appliedEfforts', 'quotaEvidenceScope', 'quotaObservations']}
if args.check_container:
    result = subprocess.run(['npx', 'wrangler', 'containers', 'info', 'a0344373-884d-4c06-b4c2-4e58295de498'], env={**os.environ, **values}, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('container read failed')
    print(json.dumps({'container': json.loads(result.stdout), 'runs': runs}, indent=2))
else:
    print(json.dumps(runs, indent=2))
