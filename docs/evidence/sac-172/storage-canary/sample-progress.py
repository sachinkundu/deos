"""Bounded read-only progress sampling for this canary; records changed values only."""
import json
import runpy
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

OUT = Path(__file__).resolve().parent / 'sampled-progress.jsonl'
helper = runpy.run_path('/Users/sachin/code/deos/.agents/skills/cloudflare-container-load/scripts/query_container_load.py')
token = helper['api_token'](Path('/Users/sachin/code/deos/.env'))
run_id = 'workflow:99426d9b-cda7-4db4-9136-692a95a0b090:e08fdf64-e2dc-42d5-b7e6-ab0a11607241:run:1'
url = 'https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query'
sql = """SELECT r.current_node,r.status,p.attempt_id,p.completed,p.total,p.tasks_sha,p.observed_at
FROM orchestration_runs r LEFT JOIN implementation_progress p ON p.run_id=r.run_id
WHERE r.run_id=? ORDER BY p.observed_at"""
previous = None
for sample in range(240):
    request = Request(url, data=json.dumps({'sql': sql, 'params': [run_id]}).encode(), headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
    with urlopen(request, timeout=30) as response:
        result = json.load(response)
    if not result['success']:
        raise RuntimeError(result)
    rows = result['result'][0]['results']
    if rows != previous:
        record = {'sampledAt': datetime.now(timezone.utc).isoformat(), 'rows': rows}
        with OUT.open('a') as output:
            output.write(json.dumps(record)+'\n')
        print(json.dumps(record), flush=True)
        previous = rows
    if rows and rows[0]['status'] in ('completed', 'failed', 'canceled'):
        break
    if sample < 239:
        time.sleep(15)
print('Progress sampling completed.', flush=True)
