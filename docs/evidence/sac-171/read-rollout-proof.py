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


for name in ['deos-sample-project','deos-queue-consumer-ts','deos-workflow-portal','deos-workflow-portal-staging']:
    latest=max(read('/workers/scripts/'+name+'/deployments')['deployments'],key=lambda row:row['created_on'])
    print(json.dumps({'worker':name,'deployment_id':latest['id'],'versions':latest['versions']},indent=2))
for name,sql in {
 'tier_validation':Path('scripts/sandbox-tier-validate.sql').read_text(),
 'tier_enforcement':"SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'sandbox_tier_%' ORDER BY name",
 'rollout_runs':"SELECT r.run_id,r.issue_id,r.status,r.current_node,r.sandbox_tier,r.sandbox_tier_source,r.sandbox_tier_policy_version,a.attempt_id,a.sandbox_tier AS attempt_tier,a.state,a.started_at,a.ended_at FROM orchestration_runs r LEFT JOIN agent_attempts a ON a.run_id=r.run_id WHERE r.issue_id IN ('5f773b25-3023-405c-9c89-9146bbf5fb07','353a3f52-740c-443a-811e-e27a6f20dc6f') AND r.created_at>'2026-09-12T16:00:00' ORDER BY r.created_at,a.created_at",
}.items():
    result=read('/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',{'sql':sql})[0]
    print(json.dumps({name:result['results'],'rows_written':result['meta']['rows_written']},indent=2))
print(json.dumps({'queue':read('/queues/5895ad3935824a088891edd6abb16699/metrics')},indent=2))
apps=read('/containers/applications')
print(json.dumps({'sandbox_classes':[{'name':a['name'],'image':a['configuration']['image'],'vcpu':a['configuration']['vcpu'],'memory_mib':a['configuration']['memory_mib'],'max_instances':a['max_instances'],'health':a['health']} for a in apps if a['name'].startswith('deos-queue-consumer-ts-')]},indent=2))
