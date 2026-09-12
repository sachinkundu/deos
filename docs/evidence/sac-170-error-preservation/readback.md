# SAC-170 original error preservation

*2026-09-11T15:22:37Z by Showboat 0.6.1*
<!-- showboat-id: 0c347cae-021d-46f9-a707-cd1c04ba9189 -->

All 375 backend tests and TypeScript checks passed. Worker version d5811a58-9705-4e44-abe0-4c7e257684bd was deployed at 100% traffic. The container image remained sha256:e7ed313d4b4a57a1142b2fc2726f96c1aa1767cdb84f0088a103e24c0c795e1f with four healthy instances. The authorized retry preserved run 1 and frozen definition v24. Its new attempt was 01a0910c-2910-7efd-ae57-b5f817c8af3a.

```python3
import importlib.util,json,urllib.request
from pathlib import Path
s=importlib.util.spec_from_file_location('credentials','.agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py')
h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
account,token=h.load_credentials(Path('.env'),Path('wrangler.jsonc'))
sql="SELECT location,message,occurred_at,detail_r2_key FROM workflow_errors WHERE run_id='workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1' AND location='src/claude-runner.ts:handle:tools' AND occurred_at>'2026-09-11T15:17:00Z'"
r=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',data=json.dumps({'sql':sql}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(r,timeout=30) as response:
 print(json.dumps(json.load(response)['result'][0]['results'],indent=2))

```

```output
[
  {
    "location": "src/claude-runner.ts:handle:tools",
    "message": "E2BIG: argument list too long, posix_spawn 'node'",
    "occurred_at": "2026-09-11T15:20:20.379Z",
    "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Aeecb8048-26ce-4c5c-9467-97e583842f5b%3Arun%3A1/7b673eeb-c116-49ed-a486-69a302cdfcf4.json"
  }
]
```

The saved job produces 163,413 bytes of read-tool state, encoded into a single 217,884-byte command argument. ProcessSpawnFailedError retains the SDK stack at ClaudeRunner.read. The invocation failed without a review receipt. This verifies original-error capture in production; it does not fix the oversized-argument defect. The next repair should pass context via a file or standard input.

![Original error visible in the production portal](original-error.png)

File handoff repair: each tool call now reads a complete request JSON file. Design snapshot sources are materialized into a separate directory and checked against the frozen source hashes. The saved SAC-170 command sed -n 105,135p openspec/changes/sac-170/design.md succeeded in the built Linux image and returned the exact expected design lines from the 163,688-byte request file. All 376 tests and TypeScript checks pass.

Final deployment: Worker e4985e63-03ad-44cb-9b3e-d5cb5d2a874a at 100% traffic; container image sha256:46c62f15cc93cefd1dd207ec38b4021aaffac16f7d8d220d266551f48b5c9531 with four healthy instances and no active rollout. The authorized retry created attempt 01a09124-cf40-7f5d-b551-4dcee3ea7fd0 in the same run and frozen workflow definition v24.

```python3
import importlib.util,json,urllib.request
from pathlib import Path
s=importlib.util.spec_from_file_location('credentials','.agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py')
h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
account,token=h.load_credentials(Path('.env'),Path('wrangler.jsonc'))
sql="SELECT a.attempt_id,a.state,c.state AS reviewer_state,c.safe_cause,c.cleanup_state,t.receipt_key,t.receipt_sha256 FROM agent_attempts a JOIN claude_review_invocations c ON c.attempt_id=a.attempt_id JOIN claude_review_turns t ON t.attempt_id=a.attempt_id WHERE a.attempt_id='01a09124-cf40-7f5d-b551-4dcee3ea7fd0'"
r=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',data=json.dumps({'sql':sql}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(r,timeout=30) as response:
 print(json.dumps(json.load(response)['result'][0]['results'],indent=2))

```

```output
[
  {
    "attempt_id": "01a09124-cf40-7f5d-b551-4dcee3ea7fd0",
    "state": "running",
    "reviewer_state": "finished",
    "safe_cause": null,
    "cleanup_state": "destroyed",
    "receipt_key": "protected/claude-reviews/094cecea08fab38fdb0f6606c89e680896aea9f53bce9ee78a4d9dd822bbd398/0.json",
    "receipt_sha256": "8c30d58aebb4283fe1258ea3fb31b38eccf0af7fc7ffc5c6a6b7628b6bc8759b"
  }
]
```

The protected receipt was read back from R2 and matched its stored SHA-256. Claude Opus 5 completed the review with outcome concerns and paidUsage false. There were no new workflow errors in this attempt at readback. Concerns are review findings, not an execution failure.

```python3
import importlib.util,json,urllib.request
from pathlib import Path
s=importlib.util.spec_from_file_location('credentials','.agents/skills/linear-workflow-telemetry/scripts/query_workflow_telemetry.py')
h=importlib.util.module_from_spec(s);s.loader.exec_module(h)
account,token=h.load_credentials(Path('.env'),Path('wrangler.jsonc'))
sql="SELECT a.state,a.cleanup_state,a.result_class,r.status,r.current_node FROM agent_attempts a JOIN orchestration_runs r ON r.run_id=a.run_id WHERE a.attempt_id='01a09124-cf40-7f5d-b551-4dcee3ea7fd0'"
r=urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',data=json.dumps({'sql':sql}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urllib.request.urlopen(r,timeout=30) as response:
 print(json.dumps(json.load(response)['result'][0]['results'],indent=2))

```

```output
[
  {
    "state": "interrupted",
    "cleanup_state": "destroyed",
    "result_class": "review_failure",
    "status": "failed",
    "current_node": "agent_failed"
  }
]
```

Final workflow limitation: at 15:50:22 UTC, DEOS marked the attempt interrupted and the run failed before accepting the review. The Claude invocation remains finished with a hash-verified concerns receipt, but the failure manifest has no collected files. This proves the context fixes reached a completed provider review, not successful workflow completion. The completion path overwrites its local failure category with review_failure for Claude, so the durable category does not distinguish the interruption cause. No further retry was made.
