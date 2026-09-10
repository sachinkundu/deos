#!/usr/bin/env python3
"""Read SAC-151's live canary evidence. Does not change provider or workflow state."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from uuid import UUID

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.util.spec_from_file_location(
    'telemetry_credentials', ROOT / '.agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py')
credentials = importlib.util.module_from_spec(loader)
loader.loader.exec_module(credentials)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, default=ROOT / '.env')
    parser.add_argument('--issue-id', default='e5996a8a-295a-4f94-a020-6769cfcb2c7e')
    parser.add_argument('--verify-proofs', action='store_true')
    args = parser.parse_args()
    issue = str(UUID(args.issue_id))
    account, token = credentials.load_credentials(args.env_file, ROOT / 'wrangler.jsonc')
    api = f'https://api.cloudflare.com/client/v4/accounts/{account}/'

    def read(path, data=None, raw=False):
        request = Request(api + path, data=None if data is None else json.dumps(data).encode(),
                          headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
        with urlopen(request, timeout=60) as response:
            body = response.read()
        return body if raw else json.loads(body)

    def query(sql):
        result = read('d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query', {'sql': sql})
        return result['result'][0]['results']

    run_filter = f"run_id IN (SELECT run_id FROM orchestration_runs WHERE issue_id='{issue}')"
    attempt_filter = f'author_attempt_id IN (SELECT attempt_id FROM agent_attempts WHERE {run_filter})'
    result = {
        'evidence_class': 'live-provider-and-cloudflare-readback',
        'worker': read('workers/scripts/deos-queue-consumer-ts/deployments')['result']['deployments'][0],
        'container': read('containers/applications/a0344373-884d-4c06-b4c2-4e58295de498')['result'],
        'runs': query(f'SELECT run_id,run_sequence,current_node,status,definition_version,definition_digest,terminal_cause FROM orchestration_runs WHERE issue_id=\'{issue}\' ORDER BY run_sequence'),
        'deliveries': query(f"SELECT delivery_id,received_at,classification,route_revision FROM deliveries WHERE correlation_id LIKE '%:{issue}' ORDER BY received_at"),
        'attempts': query(f'SELECT attempt_id,sandbox_id,node_id,state,started_at,ended_at,result_class,cleanup_state,cleanup_hold_until FROM agent_attempts WHERE {run_filter} ORDER BY created_at'),
        'native_sessions': query(f'SELECT session_key,author_attempt_id,candidate_sequence,call_index,phase,state,subagent_id,review_id,stop_result,input_sha256,profile_sha256,proof_r2_key,proof_sha256 FROM self_review_sessions WHERE {attempt_filter} ORDER BY created_at'),
        'planning_work_products': query(f'SELECT * FROM run_work_products WHERE {run_filter}'),
        'design_work_products': query(f'SELECT * FROM design_work_products WHERE {run_filter}'),
    }
    if args.verify_proofs:
        proofs = []
        for row in result['native_sessions']:
            if not row['proof_r2_key']:
                continue
            body = read('r2/buckets/deos-sample-project-artifacts/objects/' + quote(row['proof_r2_key'], safe=''), raw=True)
            proof = json.loads(body)
            proofs.append({
                'session_key': row['session_key'],
                'hash_matches': hashlib.sha256(body).hexdigest() == row['proof_sha256'],
                'subagent_matches': proof.get('subagentId') == row['subagent_id'],
                'files_unchanged': proof.get('beforeManifest') == proof.get('afterManifest'),
                'fork_context': proof.get('effectiveInput', {}).get('fork_context'),
                'transcript_records': len(proof.get('transcript', [])),
                'fault': proof.get('fault'),
            })
        result['proof_readback'] = proofs
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
