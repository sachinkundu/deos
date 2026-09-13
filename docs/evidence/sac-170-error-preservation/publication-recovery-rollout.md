# Publication recovery deployment and real retry

*2026-09-12T12:46:46Z by Showboat 0.6.1*
<!-- showboat-id: 691e525c-c372-4482-b13b-491d4cb6e36a -->

```bash
rtk proxy python3 /tmp/deos-sac170-ops.py wrangler deploy --config wrangler.queue-consumer-ts.jsonc --containers-rollout none --keep-vars --message "Recover publication readbacks 8710906"

```

```output

 ⛅️ wrangler 4.125.0 (update available 4.131.1)
───────────────────────────────────────────────
Total Upload: 1721.64 KiB / gzip: 338.60 KiB
Worker Startup Time: 11 ms
Your Worker has access to the following bindings:
Binding                                                                                 Resource                  
env.Sandbox (Sandbox)                                                                   Durable Object            
env.ORCHESTRATION_WORKFLOW (DeosWorkflow)                                               Workflow                  
env.DB (deos-sample-project)                                                            D1 Database               
env.ARTIFACTS (deos-sample-project-artifacts)                                           R2 Bucket                 
env.LINEAR_API_URL ("https://api.linear.app/graphql")                                   Environment Variable      
env.LINEAR_HUMAN_APPROVAL_STATE_ID ("71738607-03fd-49f2-b4be-b2aac29ccd13")             Environment Variable      
env.LINEAR_PROJECT_ID ("99426d9b-cda7-4db4-9136-692a95a0b090")                          Environment Variable      
env.LINEAR_PROJECT_NAME ("deos-sample-project")                                         Environment Variable      
env.LINEAR_START_STATE_NAME ("Todo")                                                    Environment Variable      
env.LINEAR_START_STATE_ID ("ee23b3ec-76fc-4186-8d9e-ddadd1254ee1")                      Environment Variable      
env.LINEAR_WORK_STATE_ID ("700c1b00-b9dd-4cfb-9d59-bd60c1d8d471")                       Environment Variable      
env.LINEAR_APPROVAL_STATE_NAMES ("In Progress")                                         Environment Variable      
env.LINEAR_REJECTION_STATE_NAMES ("Canceled")                                           Environment Variable      
env.LINEAR_APP_ACTOR_ID ("f010429f-7734-4f3f-9b4b-13a4abb9b4ab")                        Environment Variable      
env.LINEAR_TEAM_ID ("ac53207d-68c0-42f1-a245-c1baf047f234")                             Environment Variable      
env.GITHUB_API_URL ("https://api.github.com")                                           Environment Variable      
env.OPENROUTER_API_URL ("https://openrouter.ai/api/v1")                                 Environment Variable      
env.OPENROUTER_SUPPORTED_MODELS ("deepseek/deepseek-v4-pro")                            Environment Variable      
env.TRIAL_REPOSITORY ("sachinkundu/deos-sample-project")                                Environment Variable      
env.TRIAL_DISPATCH_ENABLED ("false")                                                    Environment Variable      
env.CODEX_AUTH_PROFILE_ID ("controlled-trial")                                          Environment Variable      
env.SANDBOX_FAILURE_RETENTION_MINUTES ("0")                                             Environment Variable      
env.CAPABILITY_BASE_URL ("https://deos-queue-consumer-ts.skundu...")                    Environment Variable      
env.PORTAL_BASE_URL ("https://deos.voxdez.com")                                         Environment Variable      
env.ROUTE_ADMIN_ALLOWED_EMAIL ("sachinkundu@gmail.com")                                 Environment Variable      

The following containers are available:
- deos-queue-consumer-ts-sandbox (/Users/sachin/code/deos/Dockerfile)

Uploaded deos-queue-consumer-ts (6.90 sec)
Deployed deos-queue-consumer-ts triggers (9.54 sec)
  https://deos-queue-consumer-ts.skundu.workers.dev
  schedule: */15 * * * *
  Consumer for deos-sample-project-events
  workflow: deos-sandbox-codex-workflow
Current Version ID: 2cde8efc-b6ca-4e05-b628-25e8a16a4838
```

```bash
rtk proxy python3 /tmp/deos-sac170-ops.py health

```

```output
{
  "worker": [
    {
      "version_id": "2cde8efc-b6ca-4e05-b628-25e8a16a4838",
      "percentage": 100
    }
  ],
  "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:a275dfc2c81de9cc167606907ce5724bdbc3ed71dc40e3bf787232381844f875",
  "health": {
    "errors": [],
    "instances": {
      "active": 0,
      "assigned": 0,
      "healthy": 4,
      "stopped": 0,
      "failed": 0,
      "scheduling": 0,
      "starting": 0
    }
  },
  "rollout": null
}
```

```bash
rtk proxy python3 /tmp/deos-sac170-live.py retry /tmp/deos-sac170-publication-retry.json

```

```output
202 {"retry":{"retry_id":"publication-retry:workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1:visit:50:transition","run_id":"workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1","failed_attempt_id":"workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1:visit:50:transition","retry_node":"publish_design_response","from_visit_sequence":51,"to_visit_sequence":52,"transition_id":"transition:publication-retry:workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1:visit:50:transition","state":"established","workflow_status":"queued","safe_error_category":null,"requested_by":"sachin","created_at":"2026-09-12T12:47:38.223Z","updated_at":"2026-09-12T12:47:39.923Z","established_at":"2026-09-12T12:47:39.923Z","retry_kind":"same_definition","source_definition_id":"simple-traceability-claude","source_definition_version":24,"source_definition_digest":"3fffb452df0c533e5619c73b27916c2e3e41fe36291d46ea7fd5b8ad5b0f47b4","target_definition_id":"simple-traceability-claude","target_definition_version":24,"target_definition_digest":"3fffb452df0c533e5619c73b27916c2e3e41fe36291d46ea7fd5b8ad5b0f47b4","source_workflow_instance_id":"wf-v1-qukaj5wlowestvgpyeel6orrimijpsnvy2b6wxqhvtwa2xdv7trq","target_workflow_instance_id":"wf-v1-bxaau4qkcdbfe6kf62g6wrfcf3ii24ql6toiikzpz44dxawzkx4a","source_delivery_id":"2de55c04-0b95-4b4f-9fba-1e04811af283","current_node":"publish_design_response","current_visit_sequence":52,"run_status":"active","workflow_instance_id":"wf-v1-bxaau4qkcdbfe6kf62g6wrfcf3ii24ql6toiikzpz44dxawzkx4a"}}
```

```bash
rtk proxy python3 /tmp/deos-sac170-live.py snapshot

```

```output
{
  "runs": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1",
      "issue_id": "eecb8048-26ce-4c5c-9467-97e583842f5b",
      "status": "awaiting_human",
      "current_node": "design_review",
      "definition_id": "simple-traceability-claude",
      "definition_version": 24,
      "workflow_instance_id": "wf-v1-bxaau4qkcdbfe6kf62g6wrfcf3ii24ql6toiikzpz44dxawzkx4a",
      "updated_at": "2026-09-12T12:48:08.780Z"
    },
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:096ce85d-9c56-4faa-ad74-ef8055bafc91:run:1",
      "issue_id": "096ce85d-9c56-4faa-ad74-ef8055bafc91",
      "status": "succeeded",
      "current_node": "done",
      "definition_id": "simple-traceability-claude",
      "definition_version": 24,
      "workflow_instance_id": "wf-v1-5oklscanzhh74xyzxgownabtfg6omcvjtuum2iybzn6esdif6xpa",
      "updated_at": "2026-09-12T11:58:49.169Z"
    }
  ],
  "attempts": [
    {
      "attempt_id": "01a09586-4b02-7b52-868b-fb02ab1daba6",
      "node_id": "design_independent_response",
      "state": "completed",
      "heartbeat_at": "2026-09-12T12:15:11.885Z",
      "result_class": "completed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-12T12:10:01.346Z"
    },
    {
      "attempt_id": "01a09581-521a-717b-abf6-bd402993d528",
      "node_id": "design_independent_review",
      "state": "completed",
      "heartbeat_at": "2026-09-12T12:04:44.066Z",
      "result_class": "concerns",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-12T12:04:35.482Z"
    }
  ]
}
{
  "issue": "eecb8048-26ce-4c5c-9467-97e583842f5b",
  "workflow": {
    "status": "running",
    "versionId": "c435a4c4-d6e8-4cf0-98ae-5a0e4263a234",
    "start": "2026-09-12T12:47:41.196Z",
    "end": null,
    "error": null,
    "step_count": 12
  },
  "lastStep": {
    "name": "linear-event:design_review:visit:53-1",
    "type": "waitForEvent",
    "finished": false,
    "error": null
  }
}
{
  "issue": "096ce85d-9c56-4faa-ad74-ef8055bafc91",
  "workflow": {
    "status": "complete",
    "versionId": "f87280db-3260-4d6f-a61b-4909e3d4b491",
    "start": "2026-09-12T07:35:49.076Z",
    "end": "2026-09-12T12:06:57.509Z",
    "error": null,
    "step_count": 780
  },
  "lastStep": {
    "name": "authority:workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:096ce85d-9c56-4faa-ad74-ef8055bafc91:run:1-254",
    "type": "step",
    "finished": null,
    "error": null
  }
}
```
