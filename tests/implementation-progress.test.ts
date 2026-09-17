import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { countImplementationTasks, latestImplementationProgress, saveImplementationProgress } from "../src/implementation-progress.ts";
import { readImplementationTaskProgress } from "../src/implementation-progress-reader.ts";
import { implementationProgressWatcher } from "../src/implementation-progress-watcher.ts";
import { ImplementationTestDatabase, ImplementationTestBucket, seedRun, seedAttempt } from "./helpers/implementation-fixture.ts";
import { ImplementationStore, type ImplementationInput } from "../src/implementation-store.ts";
import { implementationPolicy } from "../src/implementation-contract.ts";

test("checklist counts ignore code examples, accept checked case, and allow reopening tasks", () => {
  const tasks = "# Tasks\n- [x] 1.1 Done\n  - [X] 1.2 Also done\n- [ ] 1.3 Remaining\n```md\n- [x] Example\n```\n~~~\n- [ ] Example\n~~~\n> - [x] Quote\n- [x] \n";
  assert.deepEqual(countImplementationTasks(tasks), {completed:2,total:3});
  assert.deepEqual(countImplementationTasks(tasks.replace("[x] 1.1", "[ ] 1.1")), {completed:1,total:3});
  assert.deepEqual(countImplementationTasks("Preparing the plan"), {completed:0,total:0});
});

test("progress read uses author permissions, rejects truncation and retains original transport errors", async () => {
  const original = new Error("RPC lost", {cause:new Error("connection reset")});
  await assert.rejects(readImplementationTaskProgress({exists:async()=>{throw original;}} as never,"sample"), error=>error===original);
  await assert.rejects(readImplementationTaskProgress({} as never,"../../root"), /Invalid implementation change/);
  assert.equal(await readImplementationTaskProgress({exists:async()=>({exists:false})} as never,"sample"), null);
  const result = await readImplementationTaskProgress({exists:async()=>({exists:true}),exec:async(argv:unknown)=>{
    assert.deepEqual(argv,["runuser","-u","deos-author","--","env","-i","PATH=/usr/bin:/bin","cat","--","/deos/workspace/repository/openspec/changes/sample/tasks.md"]);
    return {output:async()=>({stdout:"- [x] Done\n- [ ] Next",stderr:"",exitCode:0,timedOut:false,truncated:false})};
  }} as never,"sample");
  assert.equal(result?.completed,1); assert.equal(result?.total,2); assert.match(result!.tasksSha,/^[a-f0-9]{64}$/);
  assert.equal(result?.tasks,"- [x] Done\n- [ ] Next");
  await assert.rejects(readImplementationTaskProgress({exists:async()=>({exists:true}),exec:async()=>({output:async()=>({
    stdout:"partial",stderr:"original stderr",exitCode:1,timedOut:false,truncated:true,
  })})} as never,"sample"), error=>error instanceof Error && error.message.includes("original stderr") && (error as Error & {stdout:string}).stdout==="partial");
});

test("live counts are scoped to the current try and base, reject old observations, and never change workflow status", async () => {
  const db = new ImplementationTestDatabase();
  try {
    seedRun(db);
    const store = new ImplementationStore(db as unknown as D1Database,new ImplementationTestBucket() as unknown as R2Bucket);
    const work = await store.allocate({version:1,runId:"run-1",repository:"owner/repo",change:"sample",branch:"deos/agent/SAC-1/run-1",
      approvedDesignSha:"a".repeat(40),testedBaseSha:"b".repeat(40),policy:implementationPolicy,approvedFiles:[],issue:{},receipts:{},
      requirements:{kinds:["showboat"],reasons:[],blockedProviders:[]}} as ImplementationInput,{userId:"human",revision:1},"SAC-1",1);
    seedAttempt(db,"a1");
    await store.beginTry(work,{attempt_id:"a1",sandbox_id:"impl-a1",visit_sequence:1},"build");
    const input = {runId:"run-1",attemptId:"a1",testedBaseSha:work.tested_base_sha,tasksSha:"c".repeat(64),completed:23,total:57,observedAt:"2026-09-14T16:00:00Z"};
    const database = db as unknown as D1Database;
    await saveImplementationProgress(database,input);
    assert.equal((await latestImplementationProgress(database,"run-1"))?.completed,23);
    await saveImplementationProgress(database,{...input,completed:3,observedAt:"2026-09-14T15:59:00Z"});
    assert.equal((await latestImplementationProgress(database,"run-1"))?.completed,23);
    await saveImplementationProgress(database,{...input,completed:57,observedAt:"2026-09-14T16:01:00Z"});
    assert.equal(db.sqlite.prepare("SELECT status FROM orchestration_runs").get()?.status,"awaiting_human");
    assert.equal(db.sqlite.prepare("SELECT status FROM implementation_runs").get()?.status,work.status);
    assert.equal(await latestImplementationProgress(database,"other-run"),null);
    seedAttempt(db,"a2"); await store.beginTry(work,{attempt_id:"a2",sandbox_id:"impl-a2",visit_sequence:2},"build");
    assert.equal(await latestImplementationProgress(database,"run-1"),null,"a retry never displays the old live counter");
    await saveImplementationProgress(database,{...input,completed:0,observedAt:"2026-09-14T16:02:00Z"});
    assert.equal(db.sqlite.prepare("SELECT completed FROM implementation_progress WHERE attempt_id='a1'").get()?.completed,57);
    await saveImplementationProgress(database,{...input,attemptId:"a2",observedAt:"2026-09-14T16:02:00Z"});
    db.sqlite.prepare("UPDATE implementation_runs SET tested_base_sha=?").run("e".repeat(40));
    assert.equal(await latestImplementationProgress(database,"run-1"),null);
    db.sqlite.exec("UPDATE agent_attempts SET state='completed'");
    await saveImplementationProgress(database,{...input,attemptId:"a2",completed:57,observedAt:"2026-09-14T16:03:00Z"});
    assert.equal(db.sqlite.prepare("SELECT completed FROM implementation_progress WHERE attempt_id='a2'").get()?.completed,23);
  } finally { db.close(); }
});

test("real file notifications signal task changes and atomic replacements before the heartbeat", {timeout:15000}, async () => {
  const directory = await mkdtemp(join(tmpdir(),"deos-task-progress-"));
  const changes = join(directory,"openspec","changes","sample");
  await mkdir(changes,{recursive:true});
  const requests: {path:string;body:string;authorization:string|undefined}[]=[];
  const server=createServer((request,response)=>{
    let body=""; request.on("data",chunk=>{body+=chunk;});request.on("end",()=>{
      requests.push({path:request.url!,body,authorization:request.headers.authorization});response.end('{"accepted":true}');
    });
  });
  await new Promise<void>(done=>server.listen(0,"127.0.0.1",done));
  const port=(server.address() as {port:number}).port;
  const script=join(directory,"watcher.mjs"), job=join(directory,"job.json");
  await writeFile(script,implementationProgressWatcher);
  await writeFile(job,JSON.stringify({cwd:directory,openspecChange:"sample",deadline:new Date(Date.now()+12000).toISOString(),
    capabilityUrl:`http://127.0.0.1:${port}/capabilities`,capabilityToken:"test-grant",attemptId:"test-attempt"}));
  const child=spawn(process.execPath,[script,job,resolve("container/original-errors.mjs")],{env:{...process.env,DEOS_ERROR_OUTPUT_ROOT:directory}});
  let errors="";child.stderr.on("data",data=>{errors+=data;});
  const closed=new Promise<void>(done=>child.once("close",()=>done()));
  const until=async(count:number)=>{
    const deadline=Date.now()+3500;
    while(requests.length<count && Date.now()<deadline) await new Promise(done=>setTimeout(done,25));
    assert.equal(requests.length,count,errors);
  };
  try {
    await until(1);
    await writeFile(join(changes,"tasks.md"),"- [ ] First\n");await until(2);
    await writeFile(join(changes,"replacement"),"- [x] First\n");await rename(join(changes,"replacement"),join(changes,"tasks.md"));await until(3);
    assert.deepEqual(requests.map(request=>request.path),Array(3).fill("/capabilities/attempt-progress"));
    for(const request of requests){assert.deepEqual(JSON.parse(request.body),{version:1});assert.equal(request.authorization,"Bearer test-grant");}
    assert.equal(errors,"");
  } finally {child.kill("SIGTERM");await closed;await new Promise<void>(done=>server.close(()=>done()));await rm(directory,{recursive:true,force:true});}
});

test('a lost progress signal retries without another task edit, while rejected credentials stop it', {timeout:20000}, async () => {
  for(const mode of ['lost','timeout','denied']) {
    const directory=await mkdtemp(join(tmpdir(),'deos-progress-retry-'));
    await mkdir(join(directory,'openspec','changes','sample'),{recursive:true});
    let calls=0;
    const server=createServer((req,res)=>{req.resume();req.on('end',()=>{
      calls++;
      if(mode==='lost' && calls===1) {req.socket.destroy();return;}
      if(mode==='timeout' && calls===1) return;
      res.statusCode=mode==='denied'?403:200;res.end(mode==='denied'?'revoked':'{"accepted":true}');
    });});
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const script=join(directory,'watcher.mjs'),job=join(directory,'job.json');
    await writeFile(script,implementationProgressWatcher);
    await writeFile(job,JSON.stringify({cwd:directory,openspecChange:'sample',deadline:new Date(Date.now()+9000).toISOString(),
      capabilityUrl:`http://127.0.0.1:${(server.address() as {port:number}).port}`,capabilityToken:'test',attemptId:'test'}));
    const child=spawn(process.execPath,[script,job,resolve('container/original-errors.mjs')],
      {env:{...process.env,DEOS_ERROR_OUTPUT_ROOT:directory}});
    let errors='';child.stderr.on('data',data=>{errors+=data;});
    const closed=new Promise<void>(resolve=>child.once('close',()=>resolve()));
    try {
      const expected=mode==='denied'?1:2;
      const deadline=Date.now()+6500;
      while(calls<expected && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
      assert.equal(calls,expected,errors);
      if(mode==='denied')await closed;
      else await new Promise(resolve=>setTimeout(resolve,1300));
      assert.equal(calls,expected,'no retries after delivery or credential rejection');
      assert.match(errors,mode==='lost'?/fetch failed/:mode==='timeout'?/TimeoutError/:/403: revoked/);
    } finally {
      child.kill('SIGTERM');await closed;
      await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});
    }
  }
});
