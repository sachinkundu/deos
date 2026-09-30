import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestWorkerProvisioner,type TestWorkerIdentity} from '../src/shared-test-worker-provisioner.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';

const leaseId='a'.repeat(64);
const base:StableStagingBase={revision:'version-1',services:[{serviceName:'portal',
  sourceCommit:'b'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100}]};

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('b'.repeat(40),'c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','preparing',1,'manifest-1','version-1',?,'owner/repo',
      'codex/test',150,?,?,'now')`)
    .run(leaseId,JSON.stringify(base),'b'.repeat(40),'c'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='preparing',owner_run_id='run-1',
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(leaseId);
  return db;
}

const build={worker:new Uint8Array([1]),assets:new Map([['portal/dist/index.html',new Uint8Array([2])]]),
  modules:new Map<string,Uint8Array>(),
  migrations:new Map([['migrations/0001_initial.sql',new Uint8Array([3])]]),
  sha256:base.services[0].buildInputSha256};
const builds=new Map([['portal',build]]);
const subject={runId:'run-1',leaseId,fence:1,base};

test('creates the lease portal before BettaView binds to it',async()=>{
  const db=fixture();
  try {
    const twoBase:StableStagingBase={...base,services:[{
      serviceName:'bettaview',sourceCommit:'b'.repeat(40),
      deployVersion:'version-1',buildInputSha256:'c'.repeat(64),trafficPercent:100,
    },...base.services]};
    const seen:string[]=[];
    const identities=new Map<string,TestWorkerIdentity>();
    const worker=new SharedTestWorkerProvisioner(db as unknown as D1Database,{
      lookup:async plan=>identities.get(plan.service.serviceName)??null,
      create:async plan=>{
        seen.push(plan.service.serviceName);
        identities.set(plan.service.serviceName,{workerName:plan.service.workerName,
          sourceCommit:plan.service.base.sourceCommit,
          baseVersionId:plan.service.base.deployVersion,
          buildInputSha256:plan.service.base.buildInputSha256});
      },
    });
    await worker.provision({...subject,base:twoBase},
      new Map([['portal',build],['bettaview',build]]));
    assert.deepEqual(seen,['portal','bettaview']);
  }finally{db.close();}
});

test('a lost Worker upload response keeps its name uncertain and never repeats create',async()=>{
  const db=fixture();let identity:TestWorkerIdentity|null=null,creates=0;
  try {
    const worker=new SharedTestWorkerProvisioner(db as unknown as D1Database,{
      lookup:async()=>identity,
      create:async plan=>{
        creates++;
        identity={workerName:plan.service.workerName,
          sourceCommit:plan.service.base.sourceCommit,
          baseVersionId:plan.service.base.deployVersion,
          buildInputSha256:plan.service.base.buildInputSha256};
        throw new Error('upload reply lost');
      },
    });
    await assert.rejects(worker.provision(subject,builds),/upload reply lost/);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE kind='test_worker'`).get()?.plan_state,'uncertain');
    identity=null;
    await assert.rejects(worker.provision(subject,builds),/reconcile_pending/);
    assert.equal(creates,1);
    identity={workerName:`deos-test-portal-${leaseId.slice(0,32)}`,
      sourceCommit:base.services[0].sourceCommit,
      baseVersionId:base.services[0].deployVersion,
      buildInputSha256:base.services[0].buildInputSha256};
    await worker.provision(subject,builds);
    assert.equal(creates,1);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE kind='test_worker'`).get()?.plan_state,'created');
  } finally {db.close();}
});

test('a pre-existing Worker with different fixed base cannot be adopted',async()=>{
  const db=fixture();
  try {
    const worker=new SharedTestWorkerProvisioner(db as unknown as D1Database,{
      lookup:async plan=>({workerName:plan.service.workerName,
        sourceCommit:'d'.repeat(40),baseVersionId:plan.service.base.deployVersion,
        buildInputSha256:plan.service.base.buildInputSha256}),
      create:async()=>{throw new Error('must not upload');},
    });
    await assert.rejects(worker.provision(subject,builds),/identity_changed/);
  } finally {db.close();}
});
