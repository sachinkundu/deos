"""Read-only SAC-161 staging evidence. Pass the ignored local credential file."""
import json
from pathlib import Path
import shlex
import sys
import urllib.request

root = Path(__file__).resolve().parent
credentials = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    if "=" not in line or line.lstrip().startswith("#"):
        continue
    key, value = line.removeprefix("export ").split("=", 1)
    if key in {"CLOUDFLARE_API_TOKEN", "CLOUDFLARE_TOKEN"}:
        words = shlex.split(value, comments=True)
        if words:
            credentials["token"] = words[0]
base = "https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e"


def api(path, data=None):
    request = urllib.request.Request(base + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={"Authorization": "Bearer " + credentials["token"], "Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if not payload.get("success"):
        raise RuntimeError(json.dumps(payload))
    return payload["result"]


def query(sql, params=()):
    return api("/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query",
        {"sql": sql, "params": list(params)})[0]["results"]


before = json.loads((root / "staging-issues-before.json").read_text())
rows = query("SELECT run_id,status,current_node,updated_at,run_sequence FROM orchestration_runs WHERE run_id IN ("
    + ",".join("?" for _ in before) + ")", [row["run_id"] for row in before])
changes = [{"before": {key: old[key] for key in row}, "after": row}
    for row in rows for old in before if old["run_id"] == row["run_id"]
    and any(row[key] != old[key] for key in row)]
history = query("SELECT recency_id,issue_identifier FROM portal_recent_issues "
    "WHERE person_key=(SELECT person_key FROM portal_recent_issues WHERE recency_id=11) ORDER BY recency_id DESC")
expected = json.loads((root / "staging-browser-responses.json").read_text())["expectedOrder"]
assert [row["issue_identifier"] for row in history] == expected
assert len(rows) == 10 and not changes
versions = {}
for name in ("deos-queue-consumer-ts", "deos-workflow-portal-staging", "deos-workflow-portal"):
    deployments = api("/workers/scripts/" + name + "/deployments")["deployments"]
    latest = max(deployments, key=lambda item: item["created_on"])
    assert len(latest["versions"]) == 1 and latest["versions"][0]["percentage"] == 100
    versions[name] = latest["versions"][0]["version_id"]
assert versions["deos-workflow-portal"] == "b01771d7-464b-4c5d-b6d8-e613f759f201"
print(json.dumps({"versionsAt100Percent": versions, "history": history,
    "workflowStatesUnchanged": len(rows), "productionPortalUnchanged": True}, indent=2))
