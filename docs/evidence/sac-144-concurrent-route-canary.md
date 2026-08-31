# SAC-144 concurrent repository route canary

*2026-08-31T11:07:08Z by Showboat 0.6.1*
<!-- showboat-id: 40ba934a-70d7-4068-ba17-1cff7540a909 -->

This record captures the deployed D1 authority while two provider-originated Codex author attempts run against different frozen repositories. It uses durable business state, not a synthetic request or unit-test fixture.

```bash
rtk env -u CLOUDFLARE_API_TOKEN -u CF_API_TOKEN npx wrangler d1 execute DB --remote --config wrangler.queue-consumer-ts.jsonc --command "SELECT issue.issue_key, run.run_sequence, run.status, run.current_node, run.route_repository, run.route_revision, run.route_digest FROM orchestration_runs run JOIN linear_issue_index issue ON issue.issue_id = run.issue_id WHERE (issue.issue_key = 'SAC-146' AND run.run_sequence = 4) OR issue.issue_key = 'SAC-147' ORDER BY issue.issue_key; SELECT lease.profile_id, lease.attempt_id, attempt.run_id, attempt.node_id, attempt.state, lease.object_etag, lease.created_at FROM credential_leases lease JOIN agent_attempts attempt ON attempt.attempt_id = lease.attempt_id ORDER BY lease.created_at; PRAGMA foreign_key_check;" --json | jq -c 'map(.results)'
```

```output
[[{"issue_key":"SAC-146","run_sequence":4,"status":"active","current_node":"planning_author","route_repository":"sachinkundu/deos-sample-project-2","route_revision":4,"route_digest":"719d1ff690232d5bb71807af7fbd49ffb04025b30a9012c7a62964be8cdd361f"},{"issue_key":"SAC-147","run_sequence":1,"status":"active","current_node":"planning_author","route_repository":"sachinkundu/deos-sample-project","route_revision":1,"route_digest":"464ec282a1af74ce8af94f4e4782ba71152af07a804721f1e2337c829b2ae846"}],[{"profile_id":"controlled-trial","attempt_id":"01a0577a-1139-7364-ab66-463b51fd190d","run_id":"workflow:b0b6265d-5e61-4315-9ef4-724ddb391700:a43e2c94-d76f-402e-bc08-88cad29e9702:run:4","node_id":"planning_author","state":"running","object_etag":"acf2f1269c2346927821401d840296c4","created_at":"2026-08-31T11:00:13.275Z"},{"profile_id":"controlled-trial","attempt_id":"01a0577b-57f8-7ef2-87f9-205338109dde","run_id":"workflow:99426d9b-cda7-4db4-9136-692a95a0b090:568be9be-f416-4822-af8e-281467f8877d:run:1","node_id":"planning_author","state":"running","object_etag":"acf2f1269c2346927821401d840296c4","created_at":"2026-08-31T11:01:38.321Z"}],[]]
```

PASS: D1 records one active author run per repository and two separate checkout rows for the shared protected profile. Both attempts started from the same R2 ETag without blocking each other. The foreign-key check is empty.
