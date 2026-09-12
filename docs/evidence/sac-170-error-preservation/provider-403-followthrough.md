# SAC-170 retained 403 diagnostics and recovery

*2026-09-12T11:39:14Z by Showboat 0.6.1*
<!-- showboat-id: db024176-00ac-46ce-8b0e-75f423e30208 -->

```bash
rtk proxy python3 /tmp/deos-sac170-live.py retry /tmp/sac170-stage-retry-1123.json
```

```output
202 {"retry":{"retry_id":"stage-retry:01a0955b-9167-7cc9-97d1-7420f3d6d0d5","run_id":"workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1","failed_attempt_id":"01a0955b-9167-7cc9-97d1-7420f3d6d0d5","retry_node":"design_independent_review","from_visit_sequence":45,"to_visit_sequence":46,"transition_id":"transition:stage-retry:01a0955b-9167-7cc9-97d1-7420f3d6d0d5","state":"established","workflow_status":"queued","safe_error_category":null,"requested_by":"sachin","created_at":"2026-09-12T11:39:15.102Z","updated_at":"2026-09-12T11:39:16.760Z","established_at":"2026-09-12T11:39:16.760Z","retry_kind":"same_definition","source_definition_id":"simple-traceability-claude","source_definition_version":24,"source_definition_digest":"3fffb452df0c533e5619c73b27916c2e3e41fe36291d46ea7fd5b8ad5b0f47b4","target_definition_id":"simple-traceability-claude","target_definition_version":24,"target_definition_digest":"3fffb452df0c533e5619c73b27916c2e3e41fe36291d46ea7fd5b8ad5b0f47b4","source_workflow_instance_id":"wf-v1-pf4sw62lp3yovir734yl3e4mktmd2d7ssjgzv3svalwurdmoj6qq","target_workflow_instance_id":"wf-v1-rntenp5gkgagwmkc6othboimueh64mzscaedlrhhcekprce22amq","source_delivery_id":"2de55c04-0b95-4b4f-9fba-1e04811af283","workflow_instance_id":"wf-v1-rntenp5gkgagwmkc6othboimueh64mzscaedlrhhcekprce22amq"}}
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
      "status": "active",
      "current_node": "design_independent_review",
      "definition_id": "simple-traceability-claude",
      "definition_version": 24,
      "workflow_instance_id": "wf-v1-rntenp5gkgagwmkc6othboimueh64mzscaedlrhhcekprce22amq",
      "updated_at": "2026-09-12T11:39:15.102Z"
    },
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:096ce85d-9c56-4faa-ad74-ef8055bafc91:run:1",
      "issue_id": "096ce85d-9c56-4faa-ad74-ef8055bafc91",
      "status": "active",
      "current_node": "design_independent_response",
      "definition_id": "simple-traceability-claude",
      "definition_version": 24,
      "workflow_instance_id": "wf-v1-5oklscanzhh74xyzxgownabtfg6omcvjtuum2iybzn6esdif6xpa",
      "updated_at": "2026-09-12T11:34:24.419Z"
    }
  ],
  "attempts": [
    {
      "attempt_id": "01a0956a-3a29-778f-aa53-4b186d7d5aca",
      "node_id": "design_independent_review",
      "state": "running",
      "heartbeat_at": "2026-09-12T11:39:31.118Z",
      "result_class": null,
      "cleanup_state": "pending",
      "created_at": "2026-09-12T11:39:22.025Z"
    },
    {
      "attempt_id": "01a0955b-9167-7cc9-97d1-7420f3d6d0d5",
      "node_id": "design_independent_review",
      "state": "failed",
      "heartbeat_at": "2026-09-12T11:23:28.932Z",
      "result_class": "codex_exit_nonzero",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-12T11:23:21.319Z"
    }
  ]
}
{
  "issue": "eecb8048-26ce-4c5c-9467-97e583842f5b",
  "workflow": {
    "status": "running",
    "versionId": "742f0a75-7c6e-49e5-86c9-f6b60831a08d",
    "start": "2026-09-12T11:39:16.577Z",
    "end": null,
    "error": null,
    "step_count": 3
  },
  "lastStep": {
    "name": "agent-event:01a0956a-3a29-778f-aa53-4b186d7d5aca-1",
    "type": "waitForEvent",
    "finished": false,
    "error": null
  }
}
{
  "issue": "096ce85d-9c56-4faa-ad74-ef8055bafc91",
  "workflow": {
    "status": "running",
    "versionId": "f87280db-3260-4d6f-a61b-4909e3d4b491",
    "start": "2026-09-12T07:35:49.076Z",
    "end": null,
    "error": null,
    "step_count": 761
  },
  "lastStep": {
    "name": "agent:design_independent_response:visit:30-3",
    "type": "step",
    "finished": null,
    "error": null
  }
}
```
