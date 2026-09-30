import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestStoreProvisioner,type TestStoreProvider} from '../src/shared-test-store-provisioner.ts';
import {sharedTestStorePlans} from '../src/shared-test-service-plan.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';

const leaseId='a'.repeat(64),runId='run-1',fence=1;
const base:StableStagingBase={revision:'traffic-1',services:[{
  serviceName:'portal',sourceCommit:'b'.repeat(40),deployVersion:'version-1',
  buildInputSha256:'c'.repeat(64),trafficPercent:100,
}]};
const plans=sharedTestStorePlans(leaseId,base);

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
      'shared_test_demo','preparing',1,'manifest-1','traffic-1','{}','owner/repo',
      'codex/test',150,?,?,'now')`).run(leaseId,'b'.repeat(40),'c'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='preparing',owner_run_id='run-1',
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(leaseId);
  return db;
}

test('all isolated store names are planned before the first provider create',async()=>{
  const db=fixture(),remote=new Map<string,string>();
  try {
    let calls=0;
    const provider:TestStoreProvider={
      lookup:async plan=>remote.get(plan.providerKey)??null,
      create:async plan=>{
        calls++;
        assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources`).get()?.n,2);
        assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
          WHERE resource_id=?`).get(plan.resourceId)?.plan_state,'creating');
        const id=plan.kind==='d1_database'?'db-uuid':plan.providerKey;
        remote.set(plan.providerKey,id);return id;
      },
    };
    const subject={runId,leaseId,fence,base};
    const provisioner=new SharedTestStoreProvisioner(db as unknown as D1Database,provider);
    await provisioner.provision(subject);
    await provisioner.provision(subject);
    assert.equal(calls,2);
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
      WHERE plan_state='created'`).get()?.n,2);
  } finally {db.close();}
});

test('an ambiguous create keeps the original error and reconciles only the fixed name',async()=>{
  const db=fixture(),remote=new Map<string,string>();
  try {
    const original=new Error('Cloudflare reply lost');
    let calls=0;
    const provider:TestStoreProvider={
      lookup:async plan=>remote.get(plan.providerKey)??null,
      create:async plan=>{
        calls++;
        const id=plan.kind==='d1_database'?'db-uuid':plan.providerKey;
        remote.set(plan.providerKey,id);
        if (plan.kind==='d1_database') throw original;
        return id;
      },
    };
    const provisioner=new SharedTestStoreProvisioner(db as unknown as D1Database,provider);
    const subject={runId,leaseId,fence,base};
    await assert.rejects(provisioner.provision(subject),error=>error===original);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE resource_id=?`).get(plans[0].resourceId)?.plan_state,'uncertain');
    remote.delete(plans[0].providerName);
    await assert.rejects(provisioner.provision(subject),/reconcile_pending/);
    assert.equal(calls,1);
    remote.set(plans[0].providerName,'db-uuid');
    await provisioner.provision(subject);
    assert.equal(calls,2);
  } finally {db.close();}
});

test('pre-existing name without a create intent is rejected',async()=>{
  const db=fixture();
  try {
    const provisioner=new SharedTestStoreProvisioner(db as unknown as D1Database,{
      lookup:async()=> 'foreign-id',create:async()=>{throw new Error('must not create');},
    });
    await assert.rejects(provisioner.provision({runId,leaseId,fence,base}),/name_conflict/);
    assert.equal(db.sqlite.prepare(`SELECT plan_state FROM test_resources
      WHERE resource_id=?`).get(plans[0].resourceId)?.plan_state,'planned');
  } finally {db.close();}
});
