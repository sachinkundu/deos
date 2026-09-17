import assert from "node:assert/strict";
import test from "node:test";
import { ImplementationStore, type ImplementationInput } from "../../src/implementation-store.ts";
import { implementationPolicy } from "../../src/implementation-contract.ts";
import { countImplementationTasks, parseImplementationTasks, saveImplementationProgress } from "../../src/implementation-progress.ts";
import { ImplementationTestBucket, ImplementationTestDatabase, seedAttempt, seedRun } from "../../tests/helpers/implementation-fixture.ts";
import { loadImplementationChecklist, ChecklistPendingError } from "../src/implementation-tasks.ts";
import { routePortalRequest } from "../src/worker.ts";

test("OpenSpec checklist preserves sections, numbering and wrapped text while excluding examples", () => {
  const markdown = "# Tasks\n## 1. Implementation\n- [x] 1.1 Save `tasks.md`\n  with its counts.\n- [ ] 1.2 Render popup\n```md\n- [x] Example\n```\n## 2. Verification\n- [X] 2.1 Check browser\n> - [ ] Quoted task";
  const sections = parseImplementationTasks(markdown);
  assert.deepEqual(sections.map(section=>section.title),["1. Implementation","2. Verification"]);
  assert.deepEqual(sections[0].tasks.map(task=>[task.text,task.completed]),[["1.1 Save `tasks.md` with its counts.",true],["1.2 Render popup",false]]);
  assert.deepEqual(countImplementationTasks(markdown),{completed:2,total:3});
});

test("protected task popup reads the exact observation, rejects stale fallback and corrupt snapshots", async () => {
  const db = new ImplementationTestDatabase();
  const memoryBucket = new ImplementationTestBucket();
  const bucket = Object.assign(memoryBucket, {
    async head(key:string) { return memoryBucket.objects.has(key) ? {} : null; },
  });
  const store = new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
  try {
    seedRun(db);
    const work = await store.allocate({version:1,runId:"run-1",repository:"owner/repo",change:"sample",branch:"deos/agent/SAC-1/run-1",
      approvedDesignSha:"a".repeat(40),testedBaseSha:"b".repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
      requirements:{kinds:["showboat"],reasons:[],blockedProviders:[]}} as ImplementationInput,{userId:"human",revision:1},"SAC-1",1);
    seedAttempt(db,"a1");
    await store.beginTry(work,{attempt_id:"a1",sandbox_id:"impl-a1",visit_sequence:1},"build");
    const markdown = "## 1. Build\n- [x] 1.1 Done\n- [ ] 1.2 Remaining";
    const saved = await store.put(work.run_id,"task-progress.md",markdown,"text/markdown");
    await saveImplementationProgress(store.db,{runId:work.run_id,attemptId:"a1",testedBaseSha:work.tested_base_sha,
      tasksSha:saved.sha256,completed:1,total:2,observedAt:"2026-09-15T04:00:00Z"});
    const env = {DB:store.db,ARTIFACTS:store.bucket,ASSETS:{} as Fetcher,ACCESS_TEAM_DOMAIN:"test",ACCESS_AUD:"test",ALLOWED_EMAIL:"test@example.com"};
    const request = new Request("https://portal.test/api/implementation/run-1/tasks");
    assert.equal((await routePortalRequest(request,env,async()=>{throw new Error("unauthorized");})).status,401);
    assert.equal((await routePortalRequest(new Request(request.url,{method:"POST"}),env,async()=>({email:"test@example.com"}))).status,405);
    const response = await routePortalRequest(request,env,async()=>({email:"test@example.com"}));
    const checklist = await response.json() as Awaited<ReturnType<typeof loadImplementationChecklist>>;
    assert.equal(response.status,200);
    assert.equal(checklist.progress?.completed,1);
    assert.deepEqual(checklist.sections[0].tasks.map(task=>task.completed),[true,false]);
    bucket.objects.delete(saved.key);
    await assert.rejects(loadImplementationChecklist(store,work),ChecklistPendingError);
    assert.equal((await routePortalRequest(request,env,async()=>({email:"test@example.com"}))).status,503);
    bucket.objects.set(saved.key,new TextEncoder().encode("- [x] Forged task"));
    await assert.rejects(loadImplementationChecklist(store,work),/R2 hash mismatch/);
    seedAttempt(db,"a2");
    await store.beginTry(work,{attempt_id:"a2",sandbox_id:"impl-a2",visit_sequence:2},"build");
    assert.equal((await loadImplementationChecklist(store,work)).progress,null,"a new try cannot read the previous live snapshot");
  } finally { db.close(); }
});
