"""Read-only, prospective SAC-246 evidence snapshots from Cloudflare D1."""
import json
import runpy
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path('/Users/sachin/code/deos-sac-172')
OUT = Path(__file__).resolve().parent
helper = runpy.run_path(str(ROOT / '.agents/skills/cloudflare-container-load/scripts/query_container_load.py'))
token = helper['api_token'](Path('/Users/sachin/code/deos/.env'))
api = 'https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/'
issue = 'e08fdf64-e2dc-42d5-b7e6-ab0a11607241'
run = 'workflow:99426d9b-cda7-4db4-9136-692a95a0b090:' + issue + ':run:1'

def read(path, body=None):
    request = Request(api + path, data=None if body is None else json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result['success']:
        raise RuntimeError(result)
    return result['result']

queries = {
    'policy': ("SELECT * FROM project_workflow_policies WHERE project_id=?", ['99426d9b-cda7-4db4-9136-692a95a0b090']),
    'run': ('SELECT * FROM orchestration_runs WHERE issue_id=?', [issue]),
    'deliveries': ('SELECT * FROM deliveries WHERE correlation_id LIKE ?', ['%' + issue + '%']),
    'active_attempts_all': ("SELECT run_id,attempt_id,node_id,state FROM agent_attempts WHERE state IN ('pending','starting','running','collecting')", []),
    'attempts': ('SELECT attempt_id,node_id,state,started_at,ended_at,result_class,cleanup_state,sandbox_id FROM agent_attempts WHERE run_id=? ORDER BY created_at', [run]),
    'gates': ('SELECT * FROM human_gate_visits WHERE run_id=? ORDER BY visit_sequence', [run]),
    'errors': ('SELECT * FROM workflow_errors WHERE run_id=? ORDER BY occurred_at', [run]),
    'implementation': ('SELECT * FROM implementation_runs WHERE run_id=?', [run]),
    'tries': ('SELECT attempt_id,try_sequence,kind,status,public_error_code,updated_at FROM implementation_tries WHERE run_id=? ORDER BY try_sequence', [run]),
    'environments': ('SELECT * FROM implementation_environments WHERE run_id=?', [run]),
    'definitions': ("SELECT version,digest FROM workflow_definitions WHERE definition_id='implementation' ORDER BY version DESC LIMIT 2", []),
    'progress': ('SELECT * FROM implementation_progress WHERE run_id=? ORDER BY observed_at DESC LIMIT 5', [run]),
}
rows = read('d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query', {'batch': [{'sql': sql, 'params': params} for sql, params in queries.values()]})
result = {name: row['results'] for name, row in zip(queries, rows)}
result['deployment'] = read('workers/scripts/deos-queue-consumer-ts/deployments')['deployments'][0]
result['observed_at'] = datetime.now(timezone.utc).isoformat()
path = OUT / ('readback-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json')
path.write_text(json.dumps(result, indent=2) + '\n')
(OUT / 'latest.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'path': str(path), **{k: result[k] for k in ['policy','run','active_attempts_all','attempts','gates','errors','implementation','progress','deployment']}}, indent=2))
