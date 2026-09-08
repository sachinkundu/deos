# SAC-160: Done after success

*2026-09-08T08:31:26Z by Showboat 0.6.1*
<!-- showboat-id: b36ee876-9a43-41b4-889b-09e71ad20f07 -->

Controlled replay of the existing provider-started SAC-160 success traversal. This is not a fresh full workflow run. A temporary authenticated endpoint invokes the production terminal callback using D1 traversal 40; no agent, merge, or new workflow instance is run. The endpoint is removed after proof. The portal and container image are preserved.

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions upload --config .wrangler/sac-160-proof/wrangler.json --tag sac160-proof --message "Temporary authenticated SAC-160 terminal replay proof"
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYour Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running `deploy`.[0m


Total Upload: 1619.38 KiB / gzip: 319.58 KiB
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

Uploaded deos-queue-consumer-ts (5.97 sec)
Worker Version ID: 494f44d4-494f-4168-811f-a9905c0d739f

To deploy this version to production traffic use the command wrangler versions deploy

Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy

Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy

```

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions deploy 494f44d4-494f-4168-811f-a9905c0d739f@100% --config .wrangler/sac-160-proof/wrangler.json --message "Controlled SAC-160 replay validation" --yes
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
╭ Deploy Worker Versions by splitting traffic between multiple versions
│
├ Fetching latest deployment
│
├ Your current deployment has 1 version(s):
│
│ (100%) 516663b1-8ef5-4665-97b3-a1b4a21a11b8
│       Created:  2026-09-08T05:23:10.420445Z
│           Tag:  -
│       Message:  Plain comments and no false SSE parsing errors
│
├ Fetching versions
│
├ Which version(s) do you want to deploy?
├ 1 Worker Version(s) selected
│
├     Worker Version 1:  494f44d4-494f-4168-811f-a9905c0d739f
│              Created:  2026-09-08T08:31:37.575091Z
│                  Tag:  sac160-proof
│              Message:  Temporary authenticated SAC-160 terminal replay proof
│
├ What percentage of traffic should Worker Version 1 receive?
├ 100% of traffic
├
├ Add a deployment message
│ Deployment message Controlled SAC-160 replay validation
│
├ Deploying 1 version(s)
│
├ Syncing non-versioned settings
│
│ Synced non-versioned settings:
│                      logpush:  false
│                observability:  enabled:             true
│                                head_sampling_rate:  1
│               tail_consumers:  <skipped>
│     streaming_tail_consumers:  <skipped>
│
╰  SUCCESS  Deployed deos-queue-consumer-ts version 494f44d4-494f-4168-811f-a9905c0d739f at 100% (2.45 sec)
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/invoke.py contract
```

```output
{
  "httpStatus": 200,
  "payload": {
    "data": {
      "viewer": {
        "id": "f010429f-7734-4f3f-9b4b-13a4abb9b4ab",
        "name": "DEOS Workflow"
      },
      "workflowStates": {
        "nodes": [
          {
            "id": "5eb3915f-933f-48aa-9f3a-e8f5d1c0d651",
            "name": "Done"
          }
        ]
      }
    }
  }
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/invoke.py failure
```

```output
{
  "mode": "failure",
  "result": {
    "transitioned": true
  },
  "requests": [
    {
      "outcome": "failed",
      "retryable": false
    }
  ],
  "status": "succeeded",
  "terminalAt": "2026-09-08T08:02:21.029Z",
  "transitionId": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition"
}
```

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/invoke.py success
```

```output
{
  "mode": "success",
  "result": {
    "transitioned": true
  },
  "requests": [
    {
      "outcome": "succeeded"
    }
  ],
  "status": "succeeded",
  "terminalAt": "2026-09-08T08:02:21.029Z",
  "transitionId": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition"
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions upload --config .wrangler/sac-160-proof/production.json --tag sac160-implementation --message "SAC-160: best-effort Done after owned success; remove proof endpoint"
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mYour Worker has Containers configured. Container configuration changes (such as image, max_instances, etc.) will not be gradually rolled out with versions. These changes will only take effect after running `deploy`.[0m


Total Upload: 1615.62 KiB / gzip: 318.43 KiB
Worker Startup Time: 10 ms
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

Uploaded deos-queue-consumer-ts (6.13 sec)
Worker Version ID: 4f4d5044-a85d-49a7-9ecc-d46dee402bab

To deploy this version to production traffic use the command wrangler versions deploy

Changes to non-versioned settings (config properties 'logpush' or 'tail_consumers') take effect after your next deployment using the command wrangler versions deploy

Changes to triggers (routes, custom domains, cron schedules, etc) must be applied with the command wrangler triggers deploy

```

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions deploy 4f4d5044-a85d-49a7-9ecc-d46dee402bab@100% --config .wrangler/sac-160-proof/production.json --message "SAC-160 Done notifier; proof endpoint removed" --yes
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
╭ Deploy Worker Versions by splitting traffic between multiple versions
│
├ Fetching latest deployment
│
├ Your current deployment has 1 version(s):
│
│ (100%) 494f44d4-494f-4168-811f-a9905c0d739f
│       Created:  2026-09-08T08:31:37.575091Z
│           Tag:  sac160-proof
│       Message:  Temporary authenticated SAC-160 terminal replay proof
│
├ Fetching versions
│
├ Which version(s) do you want to deploy?
├ 1 Worker Version(s) selected
│
├     Worker Version 1:  4f4d5044-a85d-49a7-9ecc-d46dee402bab
│              Created:  2026-09-08T08:34:05.225066Z
│                  Tag:  sac160-implementation
│              Message:  SAC-160: best-effort Done after owned success; remove proof endpoint
│
├ What percentage of traffic should Worker Version 1 receive?
├ 100% of traffic
├
├ Add a deployment message
│ Deployment message SAC-160 Done notifier; proof endpoint removed
│
├ Deploying 1 version(s)
│
├ Syncing non-versioned settings
│
│ Synced non-versioned settings:
│                      logpush:  false
│                observability:  enabled:             true
│                                head_sampling_rate:  1
│               tail_consumers:  <skipped>
│     streaming_tail_consumers:  <skipped>
│
╰  SUCCESS  Deployed deos-queue-consumer-ts version 4f4d5044-a85d-49a7-9ecc-d46dee402bab at 100% (2.23 sec)
```

The returning Linear delivery initially reached ingress but failed with D1_TYPE_ERROR: Python None crosses the JavaScript boundary as undefined. The completed run has no active route, so three optional route columns need explicit jsnull. This fixes ignored-delivery persistence without adding any Done receipt or changing workflow authority.

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-pywrangler.py deploy
```

```output
Using CPython 3.13.15
Creating virtual environment at: .venv-workers
Activate with: source .venv-workers/bin/activate
Using CPython 3.13.2
Creating virtual environment at: .venv-workers/pyodide-venv
Activate with: source .venv-workers/pyodide-venv/bin/activate
INFO     Resolved 1 requirements from                                           
         /Users/sachin/code/deos-sac-160-implementation/pylock.toml.            
INFO     Installing packages into python_modules...                             
INFO     Packages installed in python_modules.                                  
INFO     Installing packages into .venv-workers...                              
INFO     Packages installed in .venv-workers.                                   
INFO     Passing command to npx wrangler: npx --yes wrangler deploy             

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
Attaching additional modules:
┌─────────────────────┬────────┬───────────┐
│ Name                │ Type   │ Size      │
├─────────────────────┼────────┼───────────┤
│ deos/__init__.py    │ python │ 0.20 KiB  │
├─────────────────────┼────────┼───────────┤
│ deos/dispatch.py    │ python │ 4.21 KiB  │
├─────────────────────┼────────┼───────────┤
│ deos/fakes.py       │ python │ 2.29 KiB  │
├─────────────────────┼────────┼───────────┤
│ deos/ingress.py     │ python │ 11.01 KiB │
├─────────────────────┼────────┼───────────┤
│ deos/ports.py       │ python │ 4.64 KiB  │
├─────────────────────┼────────┼───────────┤
│ deos/telemetry.py   │ python │ 3.77 KiB  │
├─────────────────────┼────────┼───────────┤
│ deos/worker.py      │ python │ 0.80 KiB  │
├─────────────────────┼────────┼───────────┤
│ worker_telemetry.py │ python │ 0.65 KiB  │
├─────────────────────┼────────┼───────────┤
│ Vendored Modules    │        │ 0.01 KiB  │
├─────────────────────┼────────┼───────────┤
│ Total (10 modules)  │        │ 27.58 KiB │
└─────────────────────┴────────┴───────────┘
Total Upload: 38.31 KiB / gzip: 9.14 KiB
Worker Startup Time: 679 ms
Your Worker has access to the following bindings:
Binding                                                               Resource                  
env.QUEUE (inherited)                                                 Queue                     
env.DB (deos-sample-project)                                          D1 Database               
env.ARTIFACTS (deos-sample-project-artifacts)                         R2 Bucket                 
env.LINEAR_START_TRANSITIONS ("Todo")                                 Environment Variable      
env.LINEAR_APPROVAL_TRANSITIONS ("In Progress")                       Environment Variable      
env.LINEAR_REJECTION_TRANSITIONS ("Canceled")                         Environment Variable      

Uploaded deos-sample-project (10.48 sec)
Deployed deos-sample-project triggers (2.66 sec)
  https://deos-sample-project.skundu.workers.dev
  Producer for deos-sample-project-events
Current Version ID: c9aa04f4-b81d-412a-ac73-b9e6eb5e7ae0
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions deploy 494f44d4-494f-4168-811f-a9905c0d739f@100% --config .wrangler/sac-160-proof/wrangler.json --message "SAC-160 repeat proof after ingress null fix" --yes
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
╭ Deploy Worker Versions by splitting traffic between multiple versions
│
├ Fetching latest deployment
│
├ Your current deployment has 1 version(s):
│
│ (100%) 4f4d5044-a85d-49a7-9ecc-d46dee402bab
│       Created:  2026-09-08T08:34:05.225066Z
│           Tag:  sac160-implementation
│       Message:  SAC-160: best-effort Done after owned success; remove proof endpoint
│
├ Fetching versions
│
├ Which version(s) do you want to deploy?
├ 1 Worker Version(s) selected
│
├     Worker Version 1:  494f44d4-494f-4168-811f-a9905c0d739f
│              Created:  2026-09-08T08:31:37.575091Z
│                  Tag:  sac160-proof
│              Message:  Temporary authenticated SAC-160 terminal replay proof
│
├ What percentage of traffic should Worker Version 1 receive?
├ 100% of traffic
├
├ Add a deployment message
│ Deployment message SAC-160 repeat proof after ingress null fix
│
├ Deploying 1 version(s)
│
├ Syncing non-versioned settings
│
│ Synced non-versioned settings:
│                      logpush:  false
│                observability:  enabled:             true
│                                head_sampling_rate:  1
│               tail_consumers:  <skipped>
│     streaming_tail_consumers:  <skipped>
│
╰  SUCCESS  Deployed deos-queue-consumer-ts version 494f44d4-494f-4168-811f-a9905c0d739f at 100% (2.48 sec)
```

At 08:40:04 UTC, Linear MCP moved the completed SAC-160 test issue from Done to Merging solely to repeat the provider proof after the null fix. D1 remains succeeded; this is not a human-gate approval or new run. The following terminal replay restores Done using the app actor.

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "7a5bbbf0-bbf2-48e8-aee7-5c441fef87a6",
      "received_at": "2026-09-08T08:40:06.288999+00:00",
      "classification": "irrelevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/invoke.py success
```

```output
{
  "mode": "success",
  "result": {
    "transitioned": true
  },
  "requests": [
    {
      "outcome": "succeeded"
    }
  ],
  "status": "succeeded",
  "terminalAt": "2026-09-08T08:02:21.029Z",
  "transitionId": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition"
}
```

```bash
rtk proxy python3 .wrangler/sac-160-proof/run-wrangler.py versions deploy 4f4d5044-a85d-49a7-9ecc-d46dee402bab@100% --config .wrangler/sac-160-proof/production.json --message "SAC-160 validated; temporary proof endpoint removed" --yes
```

```output

 ⛅️ wrangler 4.125.0 (update available 4.129.1)
───────────────────────────────────────────────
╭ Deploy Worker Versions by splitting traffic between multiple versions
│
├ Fetching latest deployment
│
├ Your current deployment has 1 version(s):
│
│ (100%) 494f44d4-494f-4168-811f-a9905c0d739f
│       Created:  2026-09-08T08:31:37.575091Z
│           Tag:  sac160-proof
│       Message:  Temporary authenticated SAC-160 terminal replay proof
│
├ Fetching versions
│
├ Which version(s) do you want to deploy?
├ 1 Worker Version(s) selected
│
├     Worker Version 1:  4f4d5044-a85d-49a7-9ecc-d46dee402bab
│              Created:  2026-09-08T08:34:05.225066Z
│                  Tag:  sac160-implementation
│              Message:  SAC-160: best-effort Done after owned success; remove proof endpoint
│
├ What percentage of traffic should Worker Version 1 receive?
├ 100% of traffic
├
├ Add a deployment message
│ Deployment message SAC-160 validated; temporary proof endpoint removed
│
├ Deploying 1 version(s)
│
├ Syncing non-versioned settings
│
│ Synced non-versioned settings:
│                      logpush:  false
│                observability:  enabled:             true
│                                head_sampling_rate:  1
│               tail_consumers:  <skipped>
│     streaming_tail_consumers:  <skipped>
│
╰  SUCCESS  Deployed deos-queue-consumer-ts version 4f4d5044-a85d-49a7-9ecc-d46dee402bab at 100% (2.23 sec)
```

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "7a5bbbf0-bbf2-48e8-aee7-5c441fef87a6",
      "received_at": "2026-09-08T08:40:06.288999+00:00",
      "classification": "irrelevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    },
    {
      "delivery_id": "05373765-6b8a-4556-a646-0da87c131af6",
      "received_at": "2026-09-08T08:40:26.044999+00:00",
      "classification": "irrelevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 docs/evidence/sac-160/read-proof.py /Users/sachin/code/deos/.env
```

```output
{
  "evidence": "run",
  "results": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "status": "succeeded",
      "current_node": "done",
      "current_visit_sequence": 41,
      "last_transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "terminal_at": "2026-09-08T08:02:21.029Z",
      "selection_delivery_id": "49ad7fa5-9627-4d67-b90b-62723259dd42"
    }
  ],
  "rows_written": 0
}
{
  "evidence": "final_transition",
  "results": [
    {
      "transition_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1:visit:40:transition",
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:fe309e48-a316-40c4-a000-eb2927e7d72d:run:1",
      "from_node": "merge_design_pr",
      "to_node": "done",
      "cause_type": "workflow",
      "cause_reference": "system:github.merge_design_pull_request:completed",
      "actor_id": null,
      "actor_type": "workflow",
      "provider_operation_id": null,
      "occurred_at": "2026-09-08T08:02:21.029Z",
      "from_visit_sequence": 40,
      "to_visit_sequence": 41
    }
  ],
  "rows_written": 0
}
{
  "evidence": "deliveries",
  "results": [
    {
      "delivery_id": "49ad7fa5-9627-4d67-b90b-62723259dd42",
      "received_at": "2026-09-07T11:34:39.297999+00:00",
      "classification": "relevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    },
    {
      "delivery_id": "1e375a90-4818-42cf-ad67-bb37fc6cae45",
      "received_at": "2026-09-08T05:39:28.275000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T05:39:27.482Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "48ca5c85-0a1c-45a7-89f4-6681f409c4b7",
      "received_at": "2026-09-08T08:01:57.283000+00:00",
      "classification": "relevant",
      "provider_time": "2026-09-08T08:01:55.808Z",
      "actor_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "from_state_name": null,
      "to_state_name": "Merging",
      "state": "processed"
    },
    {
      "delivery_id": "7a5bbbf0-bbf2-48e8-aee7-5c441fef87a6",
      "received_at": "2026-09-08T08:40:06.288999+00:00",
      "classification": "irrelevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    },
    {
      "delivery_id": "05373765-6b8a-4556-a646-0da87c131af6",
      "received_at": "2026-09-08T08:40:26.044999+00:00",
      "classification": "irrelevant",
      "provider_time": null,
      "actor_id": null,
      "from_state_name": null,
      "to_state_name": null,
      "state": null
    }
  ],
  "rows_written": 0
}
{
  "evidence": "counts",
  "results": [
    {
      "transitions": 40,
      "provider_operations": 51,
      "retries": 0,
      "recoveries": 0
    }
  ],
  "rows_written": 0
}
```

```bash
rtk proxy python3 docs/evidence/sac-160/read-deployments.py /Users/sachin/code/deos/.env
```

```output
{
  "script": "deos-queue-consumer-ts",
  "deployment": {
    "id": "86ca2d5c-bc03-4bdc-b107-0382972b6839",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/message": "SAC-160 validated; temporary proof endpoint removed",
      "workers/triggered_by": "deployment"
    },
    "versions": [
      {
        "version_id": "4f4d5044-a85d-49a7-9ecc-d46dee402bab",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-08T08:40:30.123926Z"
  }
}
{
  "script": "deos-sample-project",
  "deployment": {
    "id": "13d88f2d-a171-4589-aa6d-4bb0adb88d85",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/triggered_by": "deployment"
    },
    "versions": [
      {
        "version_id": "c9aa04f4-b81d-412a-ac73-b9e6eb5e7ae0",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-08T08:38:48.230973Z"
  }
}
{
  "script": "deos-workflow-portal",
  "deployment": {
    "id": "8f3e9e53-caee-4a9b-90ef-072b3b67dc44",
    "source": "wrangler",
    "strategy": "percentage",
    "author_email": "sachin.kundu@pm.me",
    "annotations": {
      "workers/triggered_by": "deployment"
    },
    "versions": [
      {
        "version_id": "b5c1cb7c-31ab-4e95-95f0-bb5337626bd9",
        "percentage": 100
      }
    ],
    "created_on": "2026-09-08T07:10:23.135674Z"
  }
}
{
  "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-sandbox@sha256:39c3bc98bfbd51f6da275b0c8470b79317fcc53efb71bd3ec8422df57a948053",
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
  }
}
```

```bash
rtk proxy curl -s -o /dev/null -w "%{http_code}\n" https://deos-queue-consumer-ts.skundu.workers.dev/__sac160-proof
```

```output
404
```
