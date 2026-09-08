"""Read-only SAC-160 evidence. Pass the ignored DEOS env file as argument 1."""
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
run = "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1"
correlation = run.removesuffix(":run:1")
queries = {
    "run": f"SELECT run_id,status,current_node,current_visit_sequence,last_transition_id,terminal_at,selection_delivery_id FROM orchestration_runs WHERE run_id='{run}'",
    "final_transition": f"SELECT * FROM workflow_transitions_v2 WHERE run_id='{run}' ORDER BY from_visit_sequence DESC LIMIT 1",
    "deliveries": f"SELECT d.delivery_id,d.received_at,d.classification,i.provider_time,i.actor_id,i.from_state_name,i.to_state_name,i.state FROM deliveries d LEFT JOIN workflow_event_inbox i ON i.delivery_id=d.delivery_id WHERE d.correlation_id='{correlation}' AND (d.delivery_id=(SELECT selection_delivery_id FROM orchestration_runs WHERE run_id='{run}') OR i.to_state_name IN ('Todo','Merging','Done') OR d.received_at > '2026-09-08T08:20:00') ORDER BY d.received_at",
    "counts": f"SELECT (SELECT COUNT(*) FROM workflow_transitions_v2 WHERE run_id='{run}') AS transitions, (SELECT COUNT(*) FROM provider_operations WHERE run_id='{run}') AS provider_operations, (SELECT COUNT(*) FROM agent_stage_retries WHERE run_id='{run}') AS retries, (SELECT COUNT(*) FROM workflow_runtime_recoveries WHERE run_id='{run}') AS recoveries",
}
for label, sql in queries.items():
    request = urllib.request.Request(
        base + "/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query",
        data=json.dumps({"sql": sql}).encode(),
        headers={"Authorization": "Bearer " + values.get("CLOUDFLARE_API_TOKEN", values.get("CLOUDFLARE_TOKEN", "")), "Content-Type": "application/json"},
    )
    payload = json.load(urllib.request.urlopen(request))
    if not payload.get("success"):
        raise RuntimeError("D1 evidence query failed")
    print(json.dumps({"evidence": label, "results": payload["result"][0]["results"],
                      "rows_written": payload["result"][0]["meta"]["rows_written"]}, indent=2))
