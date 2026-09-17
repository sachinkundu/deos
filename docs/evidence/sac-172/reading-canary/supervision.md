# Reading queue canary supervision

Issue: SAC-245, https://linear.app/sachinkundu/issue/SAC-245/build-a-desktop-reading-queue.
UUID: 775b1ebe-3de0-4889-9198-58ff8adb3c0f. Project: 99426d9b-cda7-4db4-9136-692a95a0b090.
Expected first run: workflow:99426d9b-cda7-4db4-9136-692a95a0b090:775b1ebe-3de0-4889-9198-58ff8adb3c0f:run:1. Verify actual identity in D1.

Confirmed run 1 created 09:15:44.488 UTC; workflow instance wf-v1-m6ek5brhdw5sac2jrr3oqvwk23zwh6axxhpopobfvv4vawu2bujq. Genuine Linear Todo transition at 09:15:36.240, relevant provider delivery de0b70ea-1ca2-4f87-ad55-a621fdc7505d received 09:15:37.048. No synthetic trigger.

Active five-minute heartbeat: run-reading-queue-canary-to-pr, attached to task 01a0aea4-4f62-7ea3-82da-6b79702e2665. Pause it at implementation completion. The previous expense heartbeat remains paused.

Sachin explicitly authorized this run on 2026-09-17 in task 01a0aea4-4f62-7ea3-82da-6b79702e2665: automatically take all prerequisite gates, answer questions on his behalf, maintain a failure log with reasons, safely fix workflow issues where possible, and leave all implementation code to Cloudflare agents. Notify on completed implementation PR or substantive problems. Do not merge or release the implementation PR: the issue explicitly ends at readiness for human review.

Use /Users/sachin/code/deos-sac-172, the deployed workflow checkout. Read its AGENTS.md, docs/implementation-canary-lessons.md, and docs/implementation-canary-failures.md. Preserve unrelated work. Prefix shell commands with rtk. No local sample-app code, tests, demos or replacement proof. No local subagents needed. Cloudflare authors perform planning, implementation and revisions; Claude selects demos and reviews once, Sol implements and responds once.

Scope: one desktop reading queue, title and author, add/edit/delete, To read / Reading / Finished, filter and counts, browser-local persistence, clear validation. No login, mobile layout, outside integration or product release. Answer routine details consistently with this scope. Use supported static-preview-v1 hosting and the assigned Cloudflare service browser. Do not invent extra requirements.

Read authoritative D1 before each decision using `rtk proxy python3 /Users/sachin/code/deos-sac-172/docs/evidence/sac-172/reading-canary/readback.py`. This writes timestamped snapshots and latest.json. Credentials stay in ignored /Users/sachin/code/deos/.env. Never print credentials. Use real Linear provider transitions, never manual D1 mutation. Inspect the actual proposal/spec and design PR diff before approving via a concise Linear comment and Merging transition. Verify the delivery was consumed and predecessor merged. Route revisions/questions through supported workflow. Do not resend approvals merely because progress is slow.

Preserve original errors and saved stage work. Retry the failed stage of the same run using supported operator flow. Deploy validated workflow-only fixes at a stopped gate with no pending/starting/running/collecting attempts anywhere. Verify active Worker and container versions. Pre-change rollback source is 87c2c4e; recent repairs added no schema migrations. Never swap runtime under active authors as routine recovery.

Preflight 09:14:29 UTC: no existing run, no active attempts anywhere, project implementation v39 digest e4c09e10838c6470db75b9a0dcad83e2c8ecc8ef27e1b1c6d4216ee0de51ba0c, dispatch enabled, start Todo. Backend 8027527b-c89b-4cbd-8c57-dc98793964e6 at 100%. Previous activation evidence has all four container pools healthy on image b14f001b65b1c6f82033d3f89fc8f01ba3fb30bccb05f470dfe37f70ac78e83f. Recheck before interventions.

Maintain prospective run failures in failures.md here and link from the shared register. Record each recovered or unrecovered occurrence: timestamp/stage, original error, evidence, known or unknown cause, recovery, deployment, outcome. Separate app check failures, expected negative tests, review findings and local operator errors. Authorized gate approvals are normal actions, not recovery interventions. Audit full transcripts/diagnostics before final counts; zero D1 errors does not establish zero agent failures. Previous read-only artifact helpers: /tmp/sac182-d1-read.py, /tmp/sac243-reader/read.py, /tmp/sac238-reader. Never print token.json. Adapt a reader only after inspecting its contract; keep new private raw captures under /tmp/sac245-reader or /tmp/sac245-artifacts. Save sanitized evidence here and commit/push only these intended files on the SAC-172 branch.

Specifically observe recent fixes in real cloud execution: dependency commands must finish successfully before dependent work; status must remain readable during demos; completed demo results and image paths must be retrieved without duplicate capture; recovered transient errors retain diagnostics without misleading current failure. Quiet activity alone is not evidence of a stalled agent.

At completion verify the final PR, hosted preview, actual images and behavior evidence using connected external Brave. Check published image URLs without authenticated tokens. Report implementation PR and preview plus concise failure/intervention summary. Pause the supervision automation. Never restart retired canaries or advance the implementation gate.

09:16:04.672 UTC: planning author 01a0aea6-d157-7cdf-88a4-f0b4468266d4 is running in Cloudflare, sandbox sbx-v1-stmaaudqj2ubvxhp2jr477s57tw6wmdeo7logsy7odjeeueenqmq. No workflow errors in D1. Fresh activation readback saved as preflight-activation.json.
