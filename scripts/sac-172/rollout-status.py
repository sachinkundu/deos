"""Read deployment and gate evidence. This script never changes provider state."""
import argparse
import json
import runpy
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('--env-file', type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
helper = runpy.run_path(str(root / '.agents/skills/cloudflare-container-load/scripts/query_container_load.py'))
token = helper['api_token'](args.env_file)
api = 'https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/'


def read(path, body=None):
    request = Request(api + path, data=None if body is None else json.dumps(body).encode(),
                      headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result['success']:
        raise RuntimeError(result)
    return result['result']


deployments = {}
for worker in ('deos-queue-consumer-ts', 'deos-sample-project', 'deos-workflow-portal-staging'):
    current = read(f'workers/scripts/{worker}/deployments')['deployments'][0]
    deployments[worker] = {'versions': current['versions'], 'created_on': current['created_on']}
containers = []
for app in read('containers/applications'):
    if not app['name'].startswith('deos-queue-consumer-ts-implementation'):
        continue
    app = read(f"containers/applications/{app['id']}")
    rollout = read(f"containers/applications/{app['id']}/rollouts")[0]
    containers.append({'name': app['name'], 'image': app['configuration']['image'],
                       'version': app['version'], 'rollout': rollout['status'],
                       'health': app['health'], 'progress': rollout['progress']})
run = 'workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:1'
queries = [
    'SELECT status,current_node,current_visit_sequence,definition_id,definition_version,definition_digest,workflow_instance_id,allowed_linear_user_id,human_binding_revision FROM orchestration_runs WHERE run_id=?',
    'SELECT state,target_workflow_instance_id,plan_digest FROM implementation_handoffs WHERE run_id=?',
    'SELECT visit_sequence,state,pull_request_number,approved_head_sha,decision_delivery_id,decision_outcome,created_at FROM human_gate_visits WHERE run_id=? AND visit_sequence>=22 ORDER BY visit_sequence',
    "SELECT attempt_id,node_id,state FROM agent_attempts WHERE run_id=? AND state IN ('pending','starting','running','collecting')",
    'SELECT adapter_binding,profile_sha,checked_at FROM implementation_test_profiles WHERE run_id=?',
]
rows = read('d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',
            {'batch': [{'sql': sql, 'params': [run]} for sql in queries]})
print(json.dumps({'deployments': deployments, 'containers': containers,
                  'run': rows[0]['results'], 'handoff': rows[1]['results'],
                  'gates': rows[2]['results'], 'active_attempts': rows[3]['results'],
                  'provider_test_profile': rows[4]['results']}, indent=2))
