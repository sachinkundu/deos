import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {ImplementationStore} from '../src/implementation-store.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import {stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {SharedTestLeaseStore} from '../src/shared-test-lease.ts';
import {SharedTestCoordinator} from '../src/shared-test-coordinator.ts';
import type {ImplementationPull} from '../src/implementation-github.ts';

test('the queue coordinator grants only the oldest checked live request',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  const base='b'.repeat(40),candidate='c'.repeat(40),patch='d'.repeat(64),tree='e'.repeat(40);
  const service={service_name:'portal',source_commit:base,deploy_version:'version-1',
    build_input_sha256:'f'.repeat(64),app_paths_json:'["portal/"]',
    provider_paths_json:'["src/deos/"]'};
  try {
    db.sqlite.prepare(`INSERT INTO staging_release_manifests
      (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
      VALUES ('manifest-1',1,'traffic-1',1,?,'now')`)
      .run(await stagingManifestDigest([service]));
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
      status='active',route_repository='owner/repo' WHERE run_id='run-1'`).run();
    const store=new ImplementationStore(db as unknown as D1Database,bucket as unknown as R2Bucket);
    await store.allocate({version:1,runId:'run-1',repository:'owner/repo',change:'sample',
      branch:'deos/agent/SAC-172/run-1',approvedDesignSha:'a'.repeat(40),
      testedBaseSha:base,policy:implementationPolicy,approvedFiles:[],issue:{},
      receipts:{},requirements:{kinds:[],reasons:[],blockedProviders:[]}},
    {userId:'human',revision:1},'SAC-172',1);
    const saved=await store.put('run-1','candidate.json',JSON.stringify({files:[
      {path:'portal/src/main.ts'},
    ]}));
    db.sqlite.prepare(`UPDATE implementation_runs SET pr_head_sha=?,patch_sha=?,
      tree_sha=?,pr_number=42,candidate_key=?,candidate_sha=? WHERE run_id='run-1'`)
      .run(candidate,patch,tree,saved.key,saved.sha256);
    const decisionStore=await import('../src/shared-test-decision-store.ts');
    await new decisionStore.SharedTestDecisionStore(db as unknown as D1Database).record({
      runId:'run-1',candidateCommit:candidate,patchSha256:patch,
      changedPaths:['portal/src/main.ts'],
    });
    const leases=new SharedTestLeaseStore(db as unknown as D1Database);
    await leases.request({runId:'run-1',nodeVisit:7,attemptId:'attempt-1',taskId:'issue-1',
      candidateCommit:candidate,patchSha256:patch});
    const read={revision:'traffic-1',services:[{serviceName:'portal',sourceCommit:base,
      deployVersion:'version-1',buildInputSha256:'f'.repeat(64),trafficPercent:100}]};
    const pull={number:42,draft:true,state:'open',head:{sha:candidate,
      ref:'deos/agent/SAC-172/run-1'},base:{ref:'main',repo:{full_name:'owner/repo'}}} as ImplementationPull;
    let trafficReads=0;
    const coordinator=new SharedTestCoordinator({DB:db as unknown as D1Database,
      ARTIFACTS:bucket as unknown as R2Bucket,LINEAR_TEAM_ID:'team-1'} as unknown as Env,
    async()=>{trafficReads++;return read;},{
      linear:{readTestIssue:async()=>({id:'issue-1',identifier:'SAC-172',title:'Test',
        teamId:'team-1',description:''})},
      githubForRun:()=>({repository:'owner/repo',current:async()=>{},
        ref:async()=>candidate,matches:async()=>true,json:async<T>()=>pull as T}),
    });
    assert.equal((await coordinator.grantHead()).state,'granted');
    assert.equal(trafficReads,2);
    assert.equal((await coordinator.grantHead()).state,'busy');
  } finally {db.close();}
});
