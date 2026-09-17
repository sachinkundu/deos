# SAC-182 failed build evidence and fresh retry

*2026-09-14T16:56:29Z by Showboat 0.6.1*
<!-- showboat-id: fa70debc-5e99-4c01-95ae-18e243c7653c -->

```bash
rtk proxy python3 scripts/sac-172/rollout-status.py --env-file /Users/sachin/code/deos/.env
```

```output
{
  "deployments": {
    "deos-queue-consumer-ts": {
      "versions": [
        {
          "version_id": "5f9de6cf-5882-4cb0-9a05-bba7d493922c",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-14T16:52:43.997167Z"
    },
    "deos-sample-project": {
      "versions": [
        {
          "version_id": "7dcb3e04-2c21-4f8f-ab26-b389d4f8c175",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-14T12:29:19.555854Z"
    },
    "deos-workflow-portal-staging": {
      "versions": [
        {
          "version_id": "1944cb2e-0101-43e8-af3b-34f600ce8ca3",
          "percentage": 100
        }
      ],
      "created_on": "2026-09-14T16:11:47.495622Z"
    }
  },
  "containers": [
    {
      "name": "deos-queue-consumer-ts-implementationstandard2sandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationstandard2sandbox@sha256:bdf40ca5e4058c96cced59de2c7ab5cddadb4ed1604a6dcf345808b8189c15af",
      "version": 3,
      "rollout": "completed",
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
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    },
    {
      "name": "deos-queue-consumer-ts-implementationsandbox",
      "image": "registry.cloudflare.com/c68856288112af7698f5be52ea94b96e/deos-queue-consumer-ts-implementationsandbox@sha256:bdf40ca5e4058c96cced59de2c7ab5cddadb4ed1604a6dcf345808b8189c15af",
      "version": 3,
      "rollout": "completed",
      "health": {
        "errors": [],
        "instances": {
          "active": 1,
          "assigned": 0,
          "healthy": 3,
          "stopped": 0,
          "failed": 0,
          "scheduling": 0,
          "starting": 0
        }
      },
      "progress": {
        "total_steps": 2,
        "current_step": 2,
        "updated_instances": 4,
        "total_instances": 4,
        "version_distribution": {
          "target_version_instances": 4,
          "current_version_instances": 0,
          "target_version_percentage": 100
        }
      }
    }
  ],
  "run": [
    {
      "status": "active",
      "current_node": "implementation_build",
      "current_visit_sequence": 35,
      "definition_id": "implementation",
      "definition_version": 27,
      "definition_digest": "ad7fec5d557145b5dc8332c1a514a3ff9f3597fd3feee23f9f8e77e526b22f1c",
      "workflow_instance_id": "wf-v1-6fv7343ma6ueq2rxqhzg3scgx5uznhmanxh33qxfottpfyi3kzma",
      "allowed_linear_user_id": "8efc07d8-0d85-430f-84e7-f51bc6833a0b",
      "human_binding_revision": 1
    }
  ],
  "handoff": [
    {
      "state": "established",
      "target_workflow_instance_id": "wf-v1-hkwmsuzcsdgkoib5m3w3c6vyqusabubbpg2qq5zrz44cdkgg3dca",
      "plan_digest": "04465b28466b95ea7b09a5fa467712b8814ebf68cd973f38bc640233272b46b3"
    }
  ],
  "gates": [
    {
      "visit_sequence": 22,
      "state": "open",
      "pull_request_number": 136,
      "approved_head_sha": "ae79e7e0a7658942e26e24be0f7070908864ee1c",
      "decision_delivery_id": null,
      "decision_outcome": null,
      "created_at": "2026-09-14T11:32:03.299Z"
    },
    {
      "visit_sequence": 23,
      "state": "merge_authorized",
      "pull_request_number": 136,
      "approved_head_sha": "ae79e7e0a7658942e26e24be0f7070908864ee1c",
      "decision_delivery_id": "9009a6b5-e2fc-4784-93c5-799cbbba756c",
      "decision_outcome": "merge_authorized",
      "created_at": "2026-09-14T11:32:03.299Z"
    }
  ],
  "active_attempts": [
    {
      "attempt_id": "01a0a0d7-0ea0-715b-bf5e-a57a8c14965c",
      "node_id": "implementation_build",
      "state": "running"
    }
  ],
  "provider_test_profile": [
    {
      "adapter_binding": "github-linear-review-v1@d1ab8b099831c782cbf8e235dc93bd0028cb9d9c3f380cd5285640991e22038d",
      "profile_sha": "d1ab8b099831c782cbf8e235dc93bd0028cb9d9c3f380cd5285640991e22038d",
      "checked_at": "2026-09-14T12:33:02.207Z"
    }
  ],
  "implementation_attempts": [
    {
      "attempt_id": "01a0a0d7-0ea0-715b-bf5e-a57a8c14965c",
      "node_id": "implementation_build",
      "visit_sequence": 35,
      "state": "running",
      "sandbox_id": "impl-v1-kgyk6c52qtknrd5yorbndx6ngawafva6tqhpej2pyk6hbqiz3dtq",
      "process_id": "5394d6f1-79de-42fd-8df5-aa948c71aed5",
      "result_class": null,
      "cleanup_state": "pending",
      "created_at": "2026-09-14T16:54:03.680Z",
      "ended_at": null
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "node_id": "implementation_build",
      "visit_sequence": 33,
      "state": "failed",
      "sandbox_id": "impl-v1-cw637tfbteg2g3god7gl3662xpm6wya3dvcoqz5et4mbo4c7z4qa",
      "process_id": "111e03dd-fdbd-4006-ba0c-ffdec4b9ef16",
      "result_class": "supervisor_failed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-14T13:46:02.238Z",
      "ended_at": "2026-09-14T16:23:40.215Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "node_id": "implementation_tasks",
      "visit_sequence": 32,
      "state": "completed",
      "sandbox_id": "impl-v1-zj2jvf7ebznxw5rsvfrp6vvm77vkav6yn337rb3u5zvxs7ib6gmq",
      "process_id": "5b2ff642-b0e7-4c19-a33f-cefc8bb21139",
      "result_class": "completed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-14T13:34:13.107Z",
      "ended_at": "2026-09-14T13:45:57.567Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "node_id": "implementation_tasks",
      "visit_sequence": 30,
      "state": "failed",
      "sandbox_id": "impl-v1-jwbrkkg34zvbybzlkgsikx2kugph73hmctalnjf6sp6pqc2ffy7q",
      "process_id": "1463a8e2-777c-47b6-b2c3-468ab7beb12d",
      "result_class": "post_collection_validation_failed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-14T13:06:52.419Z",
      "ended_at": "2026-09-14T13:23:24.644Z"
    },
    {
      "attempt_id": "01a0a004-82c7-7b33-9855-f6cbc157c4f5",
      "node_id": "implementation_tasks",
      "visit_sequence": 28,
      "state": "failed",
      "sandbox_id": "impl-v1-tna2jeely2fu6okgc34rgidwu53n6ce4n5cwqe5ub7itmpndp5ka",
      "process_id": null,
      "result_class": "startup_failed",
      "cleanup_state": "destroyed",
      "created_at": "2026-09-14T13:04:05.319Z",
      "ended_at": "2026-09-14T13:04:12.033Z"
    }
  ],
  "retries": [
    {
      "retry_id": "stage-retry:01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "failed_attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "retry_node": "implementation_build",
      "state": "established",
      "from_visit_sequence": 34,
      "to_visit_sequence": 35,
      "source_workflow_instance_id": "wf-v1-e5gu5tea6xkrn6x7c6ji3nw6zg6itg5llahafblrli7gvf6upmza",
      "target_workflow_instance_id": "wf-v1-6fv7343ma6ueq2rxqhzg3scgx5uznhmanxh33qxfottpfyi3kzma"
    },
    {
      "retry_id": "stage-retry:01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "failed_attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "retry_node": "implementation_tasks",
      "state": "established",
      "from_visit_sequence": 31,
      "to_visit_sequence": 32,
      "source_workflow_instance_id": "wf-v1-pnqzh2yjy2eaqo7dgld5db2vublhfuatzyqyhnlxfwtor2nh75rq",
      "target_workflow_instance_id": "wf-v1-e5gu5tea6xkrn6x7c6ji3nw6zg6itg5llahafblrli7gvf6upmza"
    },
    {
      "retry_id": "stage-retry:01a0a004-82c7-7b33-9855-f6cbc157c4f5",
      "failed_attempt_id": "01a0a004-82c7-7b33-9855-f6cbc157c4f5",
      "retry_node": "implementation_tasks",
      "state": "established",
      "from_visit_sequence": 29,
      "to_visit_sequence": 30,
      "source_workflow_instance_id": "wf-v1-rq3zjbece7ruwtvftfnnhqwetxywlbvq6nhbcnpte4b6jd7pk77q",
      "target_workflow_instance_id": "wf-v1-pnqzh2yjy2eaqo7dgld5db2vublhfuatzyqyhnlxfwtor2nh75rq"
    },
    {
      "retry_id": "stage-retry:01a09ff6-1fcd-75f5-8b40-158b5bd52a4b",
      "failed_attempt_id": "01a09ff6-1fcd-75f5-8b40-158b5bd52a4b",
      "retry_node": "implementation_tasks",
      "state": "established",
      "from_visit_sequence": 27,
      "to_visit_sequence": 28,
      "source_workflow_instance_id": "wf-v1-hkwmsuzcsdgkoib5m3w3c6vyqusabubbpg2qq5zrz44cdkgg3dca",
      "target_workflow_instance_id": "wf-v1-rq3zjbece7ruwtvftfnnhqwetxywlbvq6nhbcnpte4b6jd7pk77q"
    }
  ],
  "implementation": [
    {
      "status": "build",
      "approved_design_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "tested_base_sha": "f2b994131d879967940e69ced07932dfffb8bc9a",
      "branch": "deos/agent/SAC-182/run-1",
      "tree_sha": "a6587b946b01a9ae0bc991d7e2f08ab2aef66673",
      "pr_url": null
    }
  ],
  "recent_errors": [
    {
      "step_name": "agent:implementation_build:visit:35",
      "message": "File not found: /deos/output/heartbeat.json",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/66799be0-1666-4444-b88d-be8bf2338ae9.json",
      "occurred_at": "2026-09-14T16:54:28.807Z"
    },
    {
      "step_name": "workflow runtime",
      "message": "implementation_failed",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/18ca51c2-b730-406f-8ecd-b248484b4427.json",
      "occurred_at": "2026-09-14T16:23:57.494Z"
    },
    {
      "step_name": "workflow runtime",
      "message": "implementation_failed",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/bc2d8b8f-6eaa-49de-90de-ad4d212d7e6b.json",
      "occurred_at": "2026-09-14T16:23:57.494Z"
    },
    {
      "step_name": "agent:implementation_build:visit:33",
      "message": "proof repair changed the base finding set",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/18a191c9-7512-42bb-aa08-1d7b1585d07f.json",
      "occurred_at": "2026-09-14T16:23:37.970Z"
    },
    {
      "step_name": "agent:implementation_build:visit:33",
      "message": "bad link",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/3648e82a-5592-4d1a-8471-0feb47b275bb.json",
      "occurred_at": "2026-09-14T16:23:37.970Z"
    },
    {
      "step_name": "agent:implementation_build:visit:33",
      "message": "link is not bidirectional",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/0eae69ec-a96b-4cb5-89b3-ca76f9868feb.json",
      "occurred_at": "2026-09-14T16:23:37.970Z"
    },
    {
      "step_name": "agent:implementation_build:visit:33",
      "message": "Unexpected token 'o', \"not JSON\" is not valid JSON",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/0a1623db-9fdd-42f8-b076-6ab95cfb122b.json",
      "occurred_at": "2026-09-14T16:23:37.970Z"
    },
    {
      "step_name": "agent:implementation_build:visit:33",
      "message": "Unexpected token '`', \"```json\n{\"\"... is not valid JSON",
      "detail_r2_key": "original-errors/workflow%3A2a653831-c1ec-4db7-972a-d0d08ac0a3d8%3Ae75aad25-c32f-4c23-8184-b4b38388a631%3Arun%3A1/4fe825e5-1e49-451f-ac0c-30cbd474bbee.json",
      "occurred_at": "2026-09-14T16:23:37.970Z"
    }
  ],
  "implementation_tries": [
    {
      "attempt_id": "01a0a0d7-0ea0-715b-bf5e-a57a8c14965c",
      "try_sequence": 4,
      "kind": "build",
      "status": "running",
      "input_patch_sha": "ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4",
      "output_patch_sha": null,
      "public_error_code": null,
      "updated_at": "2026-09-14T16:54:18.436Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "try_sequence": 3,
      "kind": "build",
      "status": "failed",
      "input_patch_sha": "ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4",
      "output_patch_sha": null,
      "public_error_code": "documentation_denied",
      "updated_at": "2026-09-14T16:23:44.867Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "try_sequence": 2,
      "kind": "tasks",
      "status": "completed",
      "input_patch_sha": "ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4",
      "output_patch_sha": "ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4",
      "public_error_code": "documentation_denied",
      "updated_at": "2026-09-14T13:45:57.359Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "try_sequence": 1,
      "kind": "tasks",
      "status": "failed",
      "input_patch_sha": null,
      "output_patch_sha": null,
      "public_error_code": "documentation_denied",
      "updated_at": "2026-09-14T13:44:33.687Z"
    }
  ],
  "recovered_input": [
    {
      "attempt_id": "01a0a0d7-0ea0-715b-bf5e-a57a8c14965c",
      "retry_source": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "input_patch_sha": "ba672fcd7068c4db12c6bf15879dcc92ed4272fba20ed4c34824571711d259b4",
      "recovered_attempt": null
    }
  ],
  "document_reads": [
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:24.237Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://linear.app/developers/webhooks",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:21.871Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://linear.app/developers/oauth-actor-authorization",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:20.073Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://linear.app/developers/graphql",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:18.353Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://docs.github.com/en/rest/pulls/comments",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:16.596Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "url": "https://docs.github.com/en/rest/pulls/reviews",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:49:15.034Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://linear.app/developers/webhooks",
      "content_returned": 1,
      "read_count": 2,
      "last_read": "2026-09-14T13:40:19.587Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://docs.github.com/en/rest/pulls/reviews",
      "content_returned": 1,
      "read_count": 2,
      "last_read": "2026-09-14T13:40:13.137Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://docs.github.com/en/rest/pulls/comments",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:39:36.254Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://linear.app/developers/oauth-actor-authorization",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:39:33.599Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://linear.app/developers/graphql",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:39:30.987Z"
    },
    {
      "attempt_id": "01a0a020-1873-7c07-a1d7-1c784cce073d",
      "url": "https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:39:25.943Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:41.207Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://linear.app/developers/webhooks",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:38.377Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://linear.app/developers/oauth-actor-authorization",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:35.673Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://linear.app/developers/graphql",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:32.046Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://docs.github.com/en/rest/pulls/comments",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:28.586Z"
    },
    {
      "attempt_id": "01a0a007-0f83-7e22-a761-04f5ec9ef9cd",
      "url": "https://docs.github.com/en/rest/pulls/reviews",
      "content_returned": 1,
      "read_count": 1,
      "last_read": "2026-09-14T13:10:25.342Z"
    }
  ],
  "task_progress": [
    {
      "attempt_id": "01a0a0d7-0ea0-715b-bf5e-a57a8c14965c",
      "completed": 0,
      "total": 57,
      "tasks_sha": "d952f4e2f6fc6145f15f18c25689c431dfc1389e18cdb76e2908677d2e4fc9e7",
      "observed_at": "2026-09-14T16:54:43.714Z"
    },
    {
      "attempt_id": "01a0a02a-ea7e-7034-94c4-31a3b1301fd7",
      "completed": 57,
      "total": 57,
      "tasks_sha": "f4776d30b0e9a93d74ce62f86505208fe40a35cf08e7c942b86c1ad8ecc775e4",
      "observed_at": "2026-09-14T16:18:29.367Z"
    }
  ]
}
```
