# Reader retry: real production outcome

*2026-09-12T12:27:34Z by Showboat 0.6.1*
<!-- showboat-id: 1bc66164-9fdc-40de-a7aa-ce06cef9e919 -->

```bash
rtk proxy python3 /tmp/deos-sac170-live.py snapshot

```

```output
{
  "runs": [
    {
      "run_id": "workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1",
      "issue_id": "eecb8048-26ce-4c5c-9467-97e583842f5b",
      "status": "failed",
      "current_node": "system_action_failed",
      "definition_id": "simple-traceability-claude",
      "definition_version": 24,
      "workflow_instance_id": "wf-v1-qukaj5wlowestvgpyeel6orrimijpsnvy2b6wxqhvtwa2xdv7trq",
      "updated_at": "2026-09-12T12:20:33.164Z"
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
    "status": "errored",
    "versionId": "1b9c0988-b2af-492d-93b1-8d4b55df1cb4",
    "start": "2026-09-12T12:04:30.266Z",
    "end": "2026-09-12T12:20:34.631Z",
    "error": {
      "name": "Error",
      "message": "NonRetryableError: system_action_invariant_failed"
    },
    "step_count": 19
  },
  "lastStep": {
    "name": "authority:workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:eecb8048-26ce-4c5c-9467-97e583842f5b:run:1-7",
    "type": "step",
    "finished": null,
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

```bash
rtk proxy gh pr view 108 --json state,headRefOid,title,url,updatedAt

```

```output
{"headRefOid":"3a5ba08f296ecfbbc41189aa3dad1a2d9c5366f8","state":"OPEN","title":"SAC-170: OpenSpec design","updatedAt":"2026-09-12T12:20:31Z","url":"https://github.com/sachinkundu/deos/pull/108"}
```

```bash
rtk proxy python3 /tmp/deos-sac170-ops.py query "SELECT attempt_id,state,safe_cause,cleanup_state,updated_at FROM claude_review_invocations WHERE attempt_id='01a09581-521a-717b-abf6-bd402993d528'"

```

```output
[
  {
    "attempt_id": "01a09581-521a-717b-abf6-bd402993d528",
    "state": "finished",
    "safe_cause": null,
    "cleanup_state": "destroyed",
    "updated_at": "2026-09-12T12:08:00.867Z"
  }
]
```
