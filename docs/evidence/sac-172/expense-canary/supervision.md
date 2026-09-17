# Expense canary supervision

Issue: SAC-243, https://linear.app/sachinkundu/issue/SAC-243/build-a-desktop-expense-tracker. UUID: 32952e35-b116-41a0-a704-6f37b0946ec4.
Run: workflow:99426d9b-cda7-4db4-9136-692a95a0b090:32952e35-b116-41a0-a704-6f37b0946ec4:run:1.
Instance: wf-v1-kvfw4v6vuisgslywjbw5otben66abdj2uyglkj6u6lio6jvqwwqa.
Genuine Linear Todo trigger: 2026-09-17T05:25:17.011Z; delivery 32156fc7-6925-4a89-9fcc-8eb0d637d379.
First author starting at 05:25:42.939Z, attempt 01a0add3-ee2d-7474-9a3e-650fd5df015c.

Authorized by Sachin on 2026-09-17 in task 01a0adc7-c699-7553-b07f-5a261c833db9.

Create a fresh small desktop expense tracker in deos-sample-project. Run through normal provider-originated workflow, automatically reviewing and approving proposal/specification and design gates. Answer routine clarification questions on Sachin's behalf, including permission to use the assigned Cloudflare service browser. Stop at the finished implementation PR, unmerged and unreleased. Notify Sachin on completion or a problem that needs attention; remain quiet about routine monitoring.

All sample-app code, tests, demos and revisions must be authored by Cloudflare agents. The local supervisor may inspect evidence and safely repair workflow infrastructure, but must never finish application implementation or replace its proof locally. Claude chooses useful demo scenarios and their count; Sol implements, captures, receives one Claude review and responds once.

Use /Users/sachin/code/deos-sac-172 as the current SAC-172 workflow checkout. Read its AGENTS.md, docs/implementation-canary-lessons.md and docs/implementation-canary-failures.md. Query remote D1 before every gate/recovery/deployment decision. Preserve saved stage work and original error details. Deploy workflow fixes only at a stopped gate with no pending, starting, running or collecting attempt. Record unknown causes as unknown.

Extend docs/implementation-canary-failures.md with this run. Save prospective snapshots and transcript evidence in this directory. Count repeated occurrences separately, with app check failures, workflow failures, quality findings and operator errors separated. Normal authorized gate approvals are not recovery interventions.

Suggested behavior checks, subject to Claude's useful demo selection: lunch EUR12.50 plus coffee EUR3.20 totals EUR15.70; edit coffee to EUR4.00 and total becomes EUR16.50; category filter, refresh and delete preserve correct state; blank names and invalid amounts are rejected. Fixed categories and positive amounts are reasonable defaults. Use browser-local storage and the supported static-preview-v1 publisher.
