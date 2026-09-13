"""Read-only SAC-163 and SAC-172 recovery proof."""
import argparse
import importlib.util
import json
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--env-file", type=Path, required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("credentials", root / ".agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py")
credentials = importlib.util.module_from_spec(spec)
spec.loader.exec_module(credentials)
account, token = credentials.load_credentials(args.env_file, root / "wrangler.jsonc")
base = f"https://api.cloudflare.com/client/v4/accounts/{account}/"
def read(path, data=None):
    request = Request(base + path, data=None if data is None else json.dumps(data).encode(),
                      headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)

def query(sql):
    payload = read("d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query", {"sql": sql, "params": []})
    if not payload.get("success"):
        raise RuntimeError(payload)
    return payload["result"][0]["results"]
issue = "ec27e96b-1a1a-4f38-a4d1-070258a45ec0"
run = query(f"SELECT run_id,status,current_node,current_visit_sequence,updated_at FROM orchestration_runs WHERE issue_id='{issue}'")[0]
attempts = query(f"SELECT attempt_id,node_id,state,result_class,cleanup_state,manifest_id,started_at,updated_at FROM agent_attempts WHERE run_id='{run['run_id']}' AND node_id='design_author' ORDER BY created_at DESC LIMIT 2")
latest = attempts[0]
artifacts = query(f"SELECT logical_name,byte_size,sha256,r2_key FROM artifacts WHERE manifest_id='{latest['manifest_id']}' AND logical_name IN ('transcript.jsonl','review-journal.json','review-progress.json','supervisor-stderr.txt')")
import hashlib
for artifact in artifacts:
    request = Request(base + "r2/buckets/deos-sample-project-artifacts/objects/" + quote(artifact['r2_key'],safe=''), headers={"Authorization":f"Bearer {token}"})
    with urlopen(request,timeout=30) as response: content=response.read()
    artifact['readBackVerified'] = hashlib.sha256(content).hexdigest() == artifact['sha256'] and len(content) == artifact['byte_size']
    if not artifact['readBackVerified']: raise RuntimeError(f"Artifact verification failed: {artifact['logical_name']}")
print(json.dumps({"run":run,"attempts":attempts,"artifacts":artifacts,
  "transcriptOwners":query(f"SELECT owner_kind,owner_id,byte_size,event_count FROM review_transcript_owners WHERE attempt_id='{latest['attempt_id']}'"),
  "deployment":read("workers/scripts/deos-queue-consumer-ts/deployments")["result"]["deployments"][0],
  "containers":[{"id":app["id"],"image":app["configuration"]["image"],"health":app["health"]} for app in [read("containers/applications/"+id)["result"] for id in ["a0344373-884d-4c06-b4c2-4e58295de498","a03d8a75-5574-4d37-806d-8b07ed1a79c6"]]],
},indent=2))
