# SAC-182 linked review provider proof


This is provider proof for the two main review outcomes in the isolated
SAC-182 candidate, not a claim that all twelve scenarios or cleanup passed.
The candidate is `9a8b2e3873b8968bc17024646d59b2d549021169`; the lease is
`be29ec6f1f30615bc8b079b95096026af2e4b986090e06d8b73cd18b5985737a`.
The disposable provider targets are GitHub `deos-sample-project` PR 63 and
Linear SAC-268. The real SAC-182 task stays in Human Review.

- Scenario s03 published a reply and a `CHANGES_REQUESTED` review
  (GitHub review 5357028504). Linear delivery
  `203f77ad-966c-43bb-9a6a-1b953e27730c` reached signed ingress, and the
  exact candidate workflow moved to `edited`.
- Scenario s04 published approval (GitHub review 5357067993). Linear delivery
  `252304a3-fffa-4739-97dc-bb48f236c16d` reached signed ingress, and the
  exact candidate workflow moved to `approved`.
- The scenario controller cancels each finished disposable workflow before
  preparing the next one. A later `canceled` status does not erase the saved
  review outcome `continued` or its prior traversal.
- Early GitHub comments and Linear setup/reset events are fixture inputs.
  They are not counted as app review publication proof.

The crop below comes from the runner's real browser capture. The fixed
status-label recipe removed all surrounding account, task, and provider IDs.
The saved [sanitizer manifest](sac182-linked-review-sanitizer.json) binds its
source and output hashes. This local checked crop is separate from the
coordinator's public proof publication ledger.

![GitHub and Linear completed the linked review](sac182-linked-review.png)

*2026-09-29T19:01:38Z by Showboat 0.6.1*
<!-- showboat-id: 4fcde582-11af-471e-a9da-5eed68f78f54 -->

```bash
rtk proxy python3 /tmp/deos_cf_env_exec.py python3 /tmp/sac253-v13-app-read.py /tmp/sac253-v13-app-results.sql
```

```output
[
  [
    {
      "scenario_id": "s01-freeze",
      "status": "canceled",
      "current_node": "review",
      "bettaview_account_policy_version": 1,
      "review_type": null,
      "github_status": null,
      "linear_status": null,
      "outcome": null,
      "target_state_name": null
    },
    {
      "scenario_id": "s02",
      "status": "canceled",
      "current_node": "review",
      "bettaview_account_policy_version": 1,
      "review_type": null,
      "github_status": null,
      "linear_status": null,
      "outcome": null,
      "target_state_name": null
    },
    {
      "scenario_id": "s03",
      "status": "canceled",
      "current_node": "edited",
      "bettaview_account_policy_version": 1,
      "review_type": "REQUEST_CHANGES",
      "github_status": "done",
      "linear_status": "done",
      "outcome": "continued",
      "target_state_name": "In Progress"
    },
    {
      "scenario_id": "s04",
      "status": "canceled",
      "current_node": "approved",
      "bettaview_account_policy_version": 1,
      "review_type": "APPROVE",
      "github_status": "done",
      "linear_status": "done",
      "outcome": "continued",
      "target_state_name": "Merging"
    },
    {
      "scenario_id": "s05",
      "status": "awaiting_human",
      "current_node": "review",
      "bettaview_account_policy_version": 1,
      "review_type": null,
      "github_status": null,
      "linear_status": null,
      "outcome": null,
      "target_state_name": null
    }
  ],
  [
    {
      "deliveries": 2
    }
  ]
]
```

```bash
rtk proxy gh api repos/sachinkundu/deos-sample-project/pulls/63/reviews --jq '[.[]|{id,state,submitted_at,commit_id}]'
```

```output
[{"commit_id":"3aa9321ee45a57eb6cb51f1654e7898e24fe35c6","id":5356966524,"state":"COMMENTED","submitted_at":"2026-09-29T18:49:59Z"},{"commit_id":"3aa9321ee45a57eb6cb51f1654e7898e24fe35c6","id":5357007991,"state":"COMMENTED","submitted_at":"2026-09-29T18:54:02Z"},{"commit_id":"3aa9321ee45a57eb6cb51f1654e7898e24fe35c6","id":5357027130,"state":"COMMENTED","submitted_at":"2026-09-29T18:55:56Z"},{"commit_id":"3aa9321ee45a57eb6cb51f1654e7898e24fe35c6","id":5357028504,"state":"CHANGES_REQUESTED","submitted_at":"2026-09-29T18:56:05Z"},{"commit_id":"3aa9321ee45a57eb6cb51f1654e7898e24fe35c6","id":5357067993,"state":"APPROVED","submitted_at":"2026-09-29T18:59:42Z"}]
```

```bash
rtk proxy python3 /tmp/deos_cf_env_exec.py python3 /tmp/sac253_d1_read.py /tmp/sac253-v13-linear-deliveries.sql
```

```output
[
  [
    {
      "delivery_id": "8a5068b4-1a62-4d4c-95bb-be58ba7486ec",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:40:23.716000+00:00",
      "received_at": "2026-09-29T18:49:01.031000+00:00",
      "payload_sha": "1eef95c866d21cea68b3bbc9e6f941866ff46699fe528102f541a6eb56b73665",
      "from_state_id": null,
      "to_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13"
    },
    {
      "delivery_id": "49288fc1-23ee-4794-83fd-62316aaeb60b",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:40:23.716000+00:00",
      "received_at": "2026-09-29T18:49:41.564000+00:00",
      "payload_sha": "4e53a61b516422a14c5667bc936466470909e6b7cd9198a4d0cb259ef1d82ec6",
      "from_state_id": null,
      "to_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13"
    },
    {
      "delivery_id": "69c2af7e-3079-411e-a2ef-e9640d89bfc3",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:40:23.716000+00:00",
      "received_at": "2026-09-29T18:53:44.124000+00:00",
      "payload_sha": "b6eaaf8beee66c4d6ed03ac7a3cd7ca06bfc928fb1c7345c5219b0112f94588c",
      "from_state_id": null,
      "to_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13"
    },
    {
      "delivery_id": "203f77ad-966c-43bb-9a6a-1b953e27730c",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:56:15.134000+00:00",
      "received_at": "2026-09-29T18:56:16.427000+00:00",
      "payload_sha": "80d71ae7d6617b3677aed6d896456fb9922f2f0abc404b2109b1146b905a51b2",
      "from_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13",
      "to_state_id": "700c1b00-b9dd-4cfb-9d59-bd60c1d8d471"
    },
    {
      "delivery_id": "cdef5940-cb5c-4094-8d60-f39352df52db",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:57:47.153000+00:00",
      "received_at": "2026-09-29T18:57:48.553999+00:00",
      "payload_sha": "68a0d7bd253036bea2487a48b7a5e4fa0afddd8392f431b36094f0f36d81bcb1",
      "from_state_id": "700c1b00-b9dd-4cfb-9d59-bd60c1d8d471",
      "to_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13"
    },
    {
      "delivery_id": "252304a3-fffa-4739-97dc-bb48f236c16d",
      "actor_type": "user",
      "provider_time": "2026-09-29T18:59:53.542000+00:00",
      "received_at": "2026-09-29T18:59:53.943000+00:00",
      "payload_sha": "dff81a9fe901dc5276e1b150e0cf897de8ff047102fa1d9899038d85c50398da",
      "from_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13",
      "to_state_id": "0bc91def-cb76-4e55-a39f-680181382528"
    },
    {
      "delivery_id": "05433935-9b15-45c7-b0f1-598ad1868f7c",
      "actor_type": "user",
      "provider_time": "2026-09-29T19:01:00.195000+00:00",
      "received_at": "2026-09-29T19:01:01.788999+00:00",
      "payload_sha": "0fc49ff24bd87fb505b6fa1a68c4d306f2be64d60ac83c7ebf42cf54f0f2de95",
      "from_state_id": "0bc91def-cb76-4e55-a39f-680181382528",
      "to_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13"
    },
    {
      "delivery_id": "45d3a78c-fc76-4187-87c8-6b80096a3694",
      "actor_type": "user",
      "provider_time": "2026-09-29T19:02:17.437000+00:00",
      "received_at": "2026-09-29T19:02:17.848000+00:00",
      "payload_sha": "d5d71e37f2d7ca480a7c163afe549ed2c45f219803955ff1986ce782f27d062b",
      "from_state_id": "71738607-03fd-49f2-b4be-b2aac29ccd13",
      "to_state_id": "0bc91def-cb76-4e55-a39f-680181382528"
    }
  ]
]
```
