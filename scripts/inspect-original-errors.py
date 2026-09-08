"""Read stored original errors for one run. Never changes workflow or provider state."""

import argparse
import importlib.util
import json
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parents[1]
helper = root / ".agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py"
spec = importlib.util.spec_from_file_location("workflow_telemetry", helper)
assert spec is not None and spec.loader is not None
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--run-id", required=True)
parser.add_argument("--env-file", type=Path, default=root / ".env")
args = parser.parse_args()
account, token = module.load_credentials(args.env_file, root / "wrangler.jsonc")
request = urllib.request.Request(
    f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/"
    "4e854f8a-018a-42c4-a325-c4b8805c06b2/query",
    data=json.dumps({
        "sql": "SELECT error_id, step_name, location, message, occurred_at FROM workflow_errors "
        "WHERE run_id = ? ORDER BY occurred_at",
        "params": [args.run_id],
    }).encode(),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(request) as response:
    payload = json.load(response)
if not payload.get("success"):
    raise RuntimeError(json.dumps(payload.get("errors")))
print(json.dumps(payload["result"][0]["results"], indent=2))
