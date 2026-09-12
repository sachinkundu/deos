"""Read provider evidence without changing production. Argument: ignored env file."""
import json
import sys
import urllib.request
from pathlib import Path

values = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
base = "https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e"


def read(path, data=None):
    request = urllib.request.Request(
        base + path,
        data=json.dumps(data).encode() if data else None,
        headers={"Authorization": "Bearer " + values.get("CLOUDFLARE_API_TOKEN", values.get("CLOUDFLARE_TOKEN", "")),
                 "Content-Type": "application/json"},
    )
    payload = json.load(urllib.request.urlopen(request))
    if not payload.get("success"):
        raise RuntimeError(json.dumps(payload.get("errors")))
    return payload["result"]


result = read("/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query", {
    "sql": """SELECT delivery_id,received_at,classification,label_selection_evidence_json FROM deliveries
    WHERE delivery_id IN ('944cb38f-a7a4-48ec-9681-d7281e42f5ed','bbd663a3-afdb-49e4-a83f-a5191ae04a8f') ORDER BY received_at""",
})
print(json.dumps({"linear_deliveries": result[0]["results"], "rows_written": result[0]["meta"]["rows_written"]}, indent=2))
applications = read("/containers/applications")
print(json.dumps({"sandbox_classes": [{"id": app["id"], "name": app["name"],
    "vcpu": app["configuration"]["vcpu"], "memory_mib": app["configuration"]["memory_mib"],
    "image": app["configuration"]["image"]} for app in applications if app["name"].startswith("deos-sac171-contract-probe-")]}, indent=2))
