# SAC-151 design canary

SAC-166 run 3 entered design after proposal PR 11 merged as `34ac2699e7b449e35aa50597638a21e2dd234746` and DEOS verified the approved manifest. Design author attempt `01a08b4b-0598-7ed7-ad46-acfc651c0b7a` started at 2026-09-10T12:29:12.030Z in Sandbox `sbx-v1-oyxubz33fvs32ckbtge4f76xymhzndrrwxulemeoygmvioafhhca`.

## First native design review

The first child, `01a08b56-bd3a-7f42-8f15-51a1dfee8a06`, started at 12:41:52.757Z. Its accepted result raised one correctness concern: evaluating conversion formulas left to right can overflow an intermediate value even when the final result would fit the chosen number format. The reviewer requested safer scaling while preserving rejection of genuinely non-finite final results.

D1 records session `01a08b4b-0598-7ed7-ad46-acfc651c0b7a:1:0` as accepted with outcome `concerns`. R2 proof readback matched hash `bd7a309c7c4d0edb5c3e167f1e64a90fac8249a3703bea53506e5446d7976efa` and the child ID. The reviewer had fresh context (`fork_context: false`), its before/after file manifests matched, and no runtime fault was recorded.

At 12:45Z, the original author attempt and Sandbox were still running. Repair, fresh recheck, publication, independent review, and design human rework remain pending.

## Repair, recheck, and independent acceptance

The same author changed the conversion design to precompute combined scale factors, avoiding the unnecessary large numerator. Candidate 2 received a fresh child review from `01a08b5d-7251-7131-ac23-5a08e75cd04c`. D1 accepted its pass result at 12:50:35.531Z. Its R2 proof hash was `d20ebc1cb59331a2b87747ad06569dc090c7f14dc85924072ccaba63bfb77dc5`; readback confirmed the hash, child identity, fresh context, unchanged reviewer file manifests, and no fault.

The original author completed at 12:51:08.008Z and its Sandbox was destroyed. [Design PR 12](https://github.com/sachinkundu/deos-sample-project/pull/12) published head `00c0468fa3f3a67318c726ae841adfb5fb088622`. Independent attempt `01a08b5f-7f59-71de-98eb-a196b1fdc9db` ran from 12:51:33.092Z to 12:56:54.911Z and was cleaned up. D1 accepted its pass review bound to that exact head; GitHub's design check succeeded. The workflow reached `design_review` / `awaiting_human`.

## Design human feedback

The trial reviewer read the 180-line design and requested a concrete Python runtime, minimum version, package layout, installed entry point, clean-environment install/smoke checks, and rollback. The design had left the language and install path unspecified despite relying on runtime parsing and formatting. [Review 5167406768](https://github.com/sachinkundu/deos-sample-project/pull/12#pullrequestreview-5167406768) requests changes on that published head; [comment 3979327179](https://github.com/sachinkundu/deos-sample-project/pull/12#discussion_r3979327179) is on line 180. Linear was moved to In Progress at 13:02:56.832Z through the normal rework gate. Rework delivery, revision, reply, and approval remain to be verified.

Provider delivery `a1c7b851-60b8-455e-a2c2-530a46466561` arrived at 13:02:57.699Z and was classified relevant. Run 3 entered `design_revision_author`. Fresh attempt `01a08b6a-722a-75eb-a8b0-3409af2cb555` started at 13:03:31.276Z in Sandbox `sbx-v1-aonnis3bih4qma7rovkq5qrenhynxmbwdpaciayh22mzi6da247q`. This confirms the real design rework round started; it is not yet completion proof.

## Reply-shape failure and completion hotfix

The revision failed at 13:14:01.855Z as `author_completion_verification_mismatch`; its Sandbox was destroyed and nothing was published. D1's original detail was `trusted design review replies are invalid`. R2 retained the patch, result, completion receipt, and reply file. The author wrote a substantive reply with `threadId: 3979327179`, but the trusted publisher requires `commentId`. The frozen feedback snapshot contains the correct human root comment and timestamps. This was not an OpenRouter failure or a missing GitHub comment.

The local completion receipt had reported success because its checks covered design scope, sections, whitespace, and OpenSpec validation but omitted reply shape. Branch `codex/sac-151-reply-check`, commit `9197eb5`, adds final reply-file validation before the bounded same-session correction loop ends. It checks JSON array shape, positive safe integer `commentId`, non-empty body, and duplicate roots. Missing/malformed files produce a concrete correction instruction; filesystem infrastructure errors still propagate. Native candidate checks remain usable before the final reply file exists. Trusted publisher binding and human review rules remain unchanged.

The regression reproduces the live `threadId` error and verifies that the existing bounded loop resumes the exact same session and passes after correction to `commentId`. Missing files, malformed JSON, blank replies, duplicate roots, and empty valid arrays are also checked. All 355 Node tests, TypeScript checking, and supervisor syntax checking passed. The hotfix was merged into SAC-151; deployment activation and the resumed trial must still be verified.
