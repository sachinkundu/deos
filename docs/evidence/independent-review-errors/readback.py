"""Read-only SAC-172 failure evidence from D1 and R2."""
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
payload = read("d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query", {
    "sql": "SELECT message, occurred_at, detail_r2_key FROM workflow_errors WHERE error_id = ?",
    "params": ["4058e2aa-a92f-4e00-8d06-d67e6f8ecb70"],
})
if not payload.get("success"):
    raise RuntimeError(json.dumps(payload.get("errors")))
row = payload["result"][0]["results"][0]
detail = read("r2/buckets/deos-sample-project-artifacts/objects/" + quote(row["detail_r2_key"], safe=""))
print(json.dumps({"evidence": "live D1 and R2 readback of the original failed attempt", "issue": "SAC-172",
                  "time": row["occurred_at"], "message": row["message"], "detail": detail}, indent=2))
