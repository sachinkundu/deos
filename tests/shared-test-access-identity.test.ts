import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestAccessIdentityStore} from '../src/shared-test-access-identity.ts';

test('lease Access rights use fixed origins and disappear after a fence change',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const leaseId='a'.repeat(64);
    const base={revision:'traffic-1',services:[
      {serviceName:'portal',sourceCommit:'b'.repeat(40),deployVersion:'version-1',
        buildInputSha256:'c'.repeat(64),trafficPercent:100},
      {serviceName:'bettaview',sourceCommit:'d'.repeat(40),deployVersion:'version-2',
        buildInputSha256:'e'.repeat(64),trafficPercent:100},
    ]};
    db.sqlite.prepare(`INSERT INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,
       patch_sha256,state,created_at,updated_at) VALUES
      ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
      .run('f'.repeat(40),'0'.repeat(64));
    db.sqlite.prepare(`INSERT INTO test_leases
      (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,
       team_id,stage,state,fence,base_manifest_id,base_traffic_revision,
       base_json,repository,branch,pull_request_number,candidate_commit,
       patch_sha256,created_at) VALUES
      (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test',
       'team-1','shared_test_demo','active',1,'manifest-1','traffic-1',?,
       'owner/repo','codex/test',150,?,?,'now')`)
      .run(leaseId,JSON.stringify(base),'f'.repeat(40),'0'.repeat(64));
    db.sqlite.prepare(`UPDATE test_environment SET state='active',
      owner_run_id='run-1',owner_lease_id=?,fence=1,
      heartbeat_due_at='9999-01-01T00:00:00.000Z' WHERE site_id=1`).run(leaseId);
    const store=new SharedTestAccessIdentityStore(db as unknown as D1Database);
    const input={runId:'run-1',attemptId:'attempt-1',leaseId,fence:1,base};
    const config={audience:'1'.repeat(64),
      policyId:'12345678-1234-1234-1234-123456789abc',clientId:'client-1'};
    await store.provision(input,config);
    await store.provision(input,config);
    const rows=db.sqlite.prepare(`SELECT origin,policy_id,principal_sha256
      FROM test_access_identities ORDER BY origin`).all() as Array<{
        origin:string;policy_id:string;principal_sha256:string}>;
    assert.deepEqual(rows.map(row=>row.origin),[
      `https://bettaview-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`,
      `https://portal-${leaseId.slice(0,32)}.apps.deos-test.voxdez.com`,
    ]);
    assert.ok(rows.every(row=>row.policy_id===config.policyId &&
      /^[a-f0-9]{64}$/.test(row.principal_sha256)));
    await assert.rejects(store.provision(input,{...config,clientId:'other-client'}),
      /shared_test_access_identity_conflict/);
    db.sqlite.prepare(`UPDATE test_environment SET fence=2,state='quiescing'
      WHERE site_id=1`).run();
    await assert.rejects(store.provision(input,config),/shared_test_write_fenced/);
  } finally {db.close();}
});
