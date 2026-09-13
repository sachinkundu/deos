# Basic default and completion wake: release evidence

[Implementation PR #125](https://github.com/sachinkundu/deos/pull/125) merged as `94a835f51a96c917ee83e86a9d7f104be0abb3f4`. Both bot findings are fixed and both review threads have replies. The threads remain unresolved for the reviewer.

## Production release

The ingress uses `legacy-basic-v1`, which saves Basic for new starts without changing saved tiers. Version `1b5e60e7-37d1-4681-a36a-73434542584a` serves 100% of traffic. The backend runs `52b1b190-9bd3-40a6-8994-b08bf8e6bd9f` at 100%.

Both container rollouts completed with four of four instances on image digest `735a2a6cd25fe2b873ae95485e7fc5cd4e2e22123c31afe533a05e28ed54d38e`. Basic targets application version 62 and Standard-2 targets version 3. The application-list response still showed Standard-2's old version, but its rollout record confirmed 100% of instances on target version 3. See [the Cloudflare readbacks](rollout.md).

Basic ingress was released first while GitHub writes were failing. The backend was released after merge, once SAC-177 had no active attempts. The portal was not redeployed.

## Real provider check

SAC-179 started through a real Linear `Todo` transition with no labels. Delivery `6eb279cc-342b-46a2-8e75-c76e803c6971` was received at `09:28:34.620Z` and classified relevant. D1 saved Basic under `legacy-basic-v1`; the [production portal](basic-running.png) showed the same tier.

All times below are UTC on 13 September 2026. Terminal completion includes artifact verification and, for these bounded-review attempts, confirmed sandbox destruction. It is an upper bound on cleanup delay, not a measurement of pure idle or billable time.

| Attempt | Supervisor finished | Durable completion | Delay | Artifacts | Cleanup |
| --- | --- | --- | --- | --- | --- |
| Planning author | 09:35:28.134 | 09:36:03.201 | 35.067 s | 11 | Destroyed |
| Independent reviewer | 09:37:31.358 | 09:38:10.587 | 39.229 s | 13 | Destroyed |
| Author response | 09:40:45.335 | 09:41:20.139 | 34.804 s | 10 | Destroyed |

Each supervisor exited with code 0. Each primary manifest is complete. The status diagnostic was read back from R2 and hashed; the exact keys and hashes are in [the executable evidence](rollout.md). The first completion notification was captured live at `09:35:29.441Z`, 1.307 seconds after supervisor finish, and was also found in retained Cloudflare logs. See [the sanitized live event](completion-wake.json).

The independent reviewer normally uses a five-minute heartbeat. Its 39-second completion delay and recorded wake show that this attempt did not wait for that heartbeat. The heartbeat remains the fallback for a missing notification. This is a bounded production check, not a controlled performance benchmark or a claim that the entire planning workflow passed.

## Test shutdown and retained diagnostics

After the first completed attempt, SAC-179 was set to Canceled to stop further test work. This workflow does not treat cancellation during an active agent as an immediate runtime stop. The follow-on reviewer and author response finished; their artifacts and cleanup are included above.

The test planning PR was closed. The later publish action refused to update it and retained `GitHub recorded planning pull-request identity mismatch`, followed by `system_action_invariant_failed`. D1 records the run as failed; Cloudflare records the Workflow as errored at `09:41:57.406Z`. A subsequent termination request reported that the instance could not be terminated because it was already terminal. No D1 outcome was rewritten. All three attempt sandboxes are destroyed, and no test work remains active.

The existing missing-startup-heartbeat diagnostic and ordinary wait-timeout diagnostics remain in protected error records. Neither invalidated an attempt. No failure evidence was deleted or relabeled as a successful full workflow.

## Validation

432 TypeScript tests and 70 Python tests passed, along with typechecking, Python lint, generated backend bindings, both Worker dry runs, strict change validation, and all six CI checks. The final spec sync passed validation for all ten main specs. No fixed 20-attempt qualification window was required.
