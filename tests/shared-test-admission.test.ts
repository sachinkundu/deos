import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {SharedTestDecisionStore,stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {SharedTestLeaseStore,sharedTestRequestId} from '../src/shared-test-lease.ts';
import {SharedTestAdmission} from '../src/shared-test-admission.ts';
import type {ImplementationPull} from '../src/implementation-github.ts';
import type {OrchestrationRunRecord} from '../src/orchestration-store.ts';

test('admission checks current team, draft PR, run and two staging reads before grant',async()=>{
  const db=new ImplementationTestDatabase();
  const base='b'.repeat(40),candidate='c'.repeat(40),patch='d'.repeat(64),tree='e'.repeat(40);
  const service={service_name:'portal',source_commit:base,deploy_version:'version-1',
    build_input_sha256:'f'.repeat(64),app_paths_json:'["portal/"]',
    provider_paths_json:'["src/deos/"]'};
  const digest=await stagingManifestDigest([service]);
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(digest);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at)
    VALUES ('manifest-1','portal',?,?,?,?,?,'now')`)
    .run(service.source_commit,service.deploy_version,service.build_input_sha256,
      service.app_paths_json,service.provider_paths_json);
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',
    manifest_id='manifest-1',manifest_revision=1,traffic_revision='traffic-1',revision=1
    WHERE site_id=1`).run();
  seedRun(db,'run-1','issue-1');
  db.sqlite.prepare(`UPDATE orchestration_runs SET current_node='shared_test_demo',
    status='active' WHERE run_id='run-1'`).run();
  const implementation=new ImplementationStore(db as unknown as D1Database,
    new ImplementationTestBucket() as unknown as R2Bucket);
  await implementation.allocate({version:1,runId:'run-1',repository:'owner/repo',
    change:'sample',branch:'deos/agent/SAC-172/run-1',approvedDesignSha:'a'.repeat(40),
    testedBaseSha:base,policy:implementationPolicy,approvedFiles:[],issue:{},
    receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
    {userId:'human',revision:1},'SAC-172',1);
  db.sqlite.prepare(`UPDATE implementation_runs SET pr_head_sha=?,patch_sha=?,
    tree_sha=?,pr_number=42 WHERE run_id='run-1'`).run(candidate,patch,tree);
  const work=await implementation.requireRun('run-1');
  const decision=await new SharedTestDecisionStore(db as unknown as D1Database).record({
    runId:'run-1',candidateCommit:candidate,patchSha256:patch,
    changedPaths:['portal/src/main.ts']});
  const request={runId:'run-1',nodeVisit:7,attemptId:'demo-attempt-1',
    taskId:'issue-1',candidateCommit:candidate,patchSha256:patch};
  await new SharedTestLeaseStore(db as unknown as D1Database).request(request);
  const read={revision:'traffic-1',services:[{serviceName:'portal',sourceCommit:base,
    deployVersion:'version-1',buildInputSha256:'f'.repeat(64),trafficPercent:100}]};
  let reads=0;
  const pull={number:42,draft:true,state:'open',head:{sha:candidate,ref:work.branch},
    base:{ref:'main',repo:{full_name:'owner/repo'}}} as ImplementationPull;
  const github={repository:'owner/repo',current:async()=>{},ref:async()=>candidate,
    matches:async()=>true,json:async<T>()=>pull as T};
  const run=db.sqlite.prepare(`SELECT * FROM orchestration_runs WHERE run_id='run-1'`)
    .get() as unknown as OrchestrationRunRecord;
  try {
    const wrong=new SharedTestAdmission(db as unknown as D1Database,
      {readTestIssue:async()=>({id:'issue-1',identifier:'SAC-172',title:'Test',
        teamId:'other-team',description:''})},github,async()=>read,'team-1');
    await assert.rejects(wrong.grant(run,work,decision,{...request,
      requestId:await sharedTestRequestId(request)}),/team_or_issue_changed/);
    assert.equal(reads,0);
    const correct=new SharedTestAdmission(db as unknown as D1Database,
      {readTestIssue:async()=>({id:'issue-1',identifier:'SAC-172',title:'Test',
        teamId:'team-1',description:''})},github,async()=>{reads++;return read;},'team-1');
    const result=await correct.grant(run,work,decision,{...request,
      requestId:await sharedTestRequestId(request)});
    assert.equal(result.state,'granted');
    assert.equal(reads,2);
  } finally {db.close();}
});
