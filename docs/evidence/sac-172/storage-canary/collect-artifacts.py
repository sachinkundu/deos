"""Read-only D1/R2 collection; retain full private files and verify SHA256."""
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import runpy
import subprocess
from urllib.request import Request, urlopen

ROOT = Path('/Users/sachin/code/deos-sac-172')
OUT = Path('/tmp/sac246-artifacts')
OUT.mkdir(mode=0o700, exist_ok=True)
helper = runpy.run_path('/Users/sachin/code/deos/.agents/skills/cloudflare-container-load/scripts/query_container_load.py')
token = helper['api_token'](Path('/Users/sachin/code/deos/.env'))
run = 'workflow:99426d9b-cda7-4db4-9136-692a95a0b090:e08fdf64-e2dc-42d5-b7e6-ab0a11607241:run:1'
sql = 'SELECT m.attempt_id,a.logical_name,a.r2_key,a.sha256,a.byte_size FROM artifacts a JOIN artifact_manifests m ON m.manifest_id=a.manifest_id WHERE m.run_id=? AND m.state=? ORDER BY a.created_at'
body = json.dumps({'sql': sql, 'params': [run, 'complete']}).encode()
request = Request('https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query', data=body, headers={'Authorization': 'Bearer '+token, 'Content-Type': 'application/json'})
with urlopen(request, timeout=30) as response:
    result = json.load(response)
if not result['success']:
    raise RuntimeError(result)
wanted = {'transcript.jsonl', 'implementation-diagnostics.jsonl', 'original-errors.jsonl', 'validation.txt', 'trace-validation.txt', 'review-validation.txt', 'failure-summary.json', 'result.json', 'status.json', 'author-completion.json', 'patch.diff', 'recovery-patch.diff'}
rows = [r for r in result['result'][0]['results'] if r['logical_name'] in wanted]
env = os.environ.copy()
env['CLOUDFLARE_API_TOKEN'] = token

def collect(row):
    path = OUT / (hashlib.sha256(row['r2_key'].encode()).hexdigest()[:12]+'-'+row['logical_name'])
    if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest() != row['sha256']:
        completed = subprocess.run(['rtk', 'proxy', 'npx', '--no-install', 'wrangler', 'r2', 'object', 'get', 'deos-sample-project-artifacts/'+row['r2_key'].replace('%', '%25'), '--remote', '--file', str(path)], cwd=ROOT, env=env, capture_output=True, text=True)
        if completed.returncode:
            raise RuntimeError(f"R2 get {row['logical_name']} failed ({completed.returncode}): {completed.stdout}\n{completed.stderr}")
    os.chmod(path, 0o600)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if actual != row['sha256']:
        raise ValueError(f"Hash mismatch for {path}: {actual}")
    return {**row, 'local': str(path)}

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    index = list(executor.map(collect, rows))
(OUT / 'index.json').write_text(json.dumps(index, indent=2)+'\n')
print(json.dumps({'saved': str(OUT / 'index.json'), 'verifiedFiles': len(index), 'attempts': sorted(set(r['attempt_id'] for r in index))}, indent=2))
