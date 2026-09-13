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
issues = "('401b2151-28a4-423c-b8a7-dd06859bba50','ec27e96b-1a1a-4f38-a4d1-070258a45ec0')"
print(json.dumps({
    "runs": query(f"SELECT issue_id,run_id,status,current_node,definition_version,updated_at FROM orchestration_runs WHERE issue_id IN {issues}"),
    "attempts": query(f"SELECT attempt_id,node_id,state,result_class,cleanup_state FROM agent_attempts WHERE run_id IN (SELECT run_id FROM orchestration_runs WHERE issue_id IN {issues}) ORDER BY created_at"),
    "lateFeedbackReceipt": query("SELECT state,safe_error_category,completed_at FROM provider_operations WHERE run_id LIKE '%401b2151%' AND safe_error_category = 'planning_review_feedback_deferred'"),
    "deployment": read("workers/scripts/deos-queue-consumer-ts/deployments")["result"]["deployments"][0],
    "containers": [{"id": app["id"], "image": app["configuration"]["image"], "health": app["health"]} for app in [read("containers/applications/"+id)["result"] for id in ["a0344373-884d-4c06-b4c2-4e58295de498", "a03d8a75-5574-4d37-806d-8b07ed1a79c6"]]],
}, indent=2))
