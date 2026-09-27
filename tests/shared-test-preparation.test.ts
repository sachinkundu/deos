import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestPreparation} from '../src/shared-test-preparation.ts';
import {sharedTestBuildKey} from '../src/shared-test-build-store.ts';
import type {StableStagingBase} from '../src/shared-test-lease.ts';

const leaseId='a'.repeat(64),sourceCommit='b'.repeat(40),worker=Buffer.from('export default {}');
const asset=Buffer.from('<html>test</html>');
const migration=Buffer.from('CREATE TABLE example (id TEXT);');
const hash=createHash('sha256').update(sourceCommit);
for (const [path,content] of [
  ['migrations/0001_initial.sql',migration],['portal/dist/index.html',asset],
  ['portal-worker/worker.js',worker],
] as const) {
  const name=Buffer.from(path),length=Buffer.alloc(4),size=Buffer.alloc(8);
  length.writeUInt32BE(name.byteLength);size.writeBigUInt64BE(BigInt(content.byteLength));
  hash.update(length).update(name).update(size).update(content);
}
const base:StableStagingBase={revision:'version-1',services:[{serviceName:'portal',
  sourceCommit,deployVersion:'version-1',buildInputSha256:hash.digest('hex'),trafficPercent:100}]};
const payload=JSON.stringify({serviceName:'portal',sourceCommit,files:[
  {path:'migrations/0001_initial.sql',contentBase64:migration.toString('base64')},
  {path:'portal-worker/worker.js',contentBase64:worker.toString('base64')},
  {path:'portal/dist/index.html',contentBase64:asset.toString('base64')},
]});

function fixture() {
  const db=new ImplementationTestDatabase();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run(sourceCommit,'c'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,repository,
     branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-1','Test','team-1',
      'shared_test_demo','preparing',1,'manifest-1','version-1',?,'owner/repo',
      'codex/test',150,?,?,'now')`)
    .run(leaseId,JSON.stringify(base),sourceCommit,'c'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='preparing',owner_run_id='run-1',
    owner_lease_id=?,fence=1,heartbeat_due_at='9999-01-01T00:00:00Z'
    WHERE site_id=1`).run(leaseId);
  return db;
}

test('a missing pinned bundle prevents every Cloudflare create',async()=>{
  const db=fixture();let creates=0;
  try {
    const prepare=new SharedTestPreparation(db as unknown as D1Database,
      {get:async()=>null} as unknown as R2Bucket,{
        lookup:async()=>null,create:async()=>{creates++;return 'remote';},
      },{
        lookup:async()=>null,create:async()=>{creates++;},
      },{
        apply:async()=>{creates++;},
      });
    await assert.rejects(prepare.prepare({runId:'run-1',leaseId,fence:1,base}),
      /test_build_artifact_missing/);
    assert.equal(creates,0);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_resources').get()?.n,0);
  } finally {db.close();}
});

test('all worker and store names are saved before the first Cloudflare create',async()=>{
  const db=fixture(),remote=new Map<string,string>();
  try {
    let workerIdentity:{workerName:string;sourceCommit:string;baseVersionId:string;
      buildInputSha256:string}|null=null;
    const prepare=new SharedTestPreparation(db as unknown as D1Database,
      {get:async(key:string)=>{
        assert.equal(key,sharedTestBuildKey(base.services[0]));
        return {size:Buffer.byteLength(payload),text:async()=>payload};
      }} as unknown as R2Bucket,{
        lookup:async plan=>remote.get(plan.providerKey)??null,
        create:async plan=>{
          assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_resources').get()?.n,3);
          assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
            WHERE kind='test_worker' AND plan_state='planned'`).get()?.n,1);
          const id=plan.kind==='d1_database'?'db-uuid':plan.providerKey;
          remote.set(plan.providerKey,id);return id;
        },
      },{
        lookup:async()=>workerIdentity,
        create:async plan=>{
          assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM test_resources').get()?.n,3);
          assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
            WHERE kind IN ('d1_database','r2_bucket') AND plan_state='created'`).get()?.n,2);
          workerIdentity={workerName:plan.service.workerName,
            sourceCommit:plan.service.base.sourceCommit,
            baseVersionId:plan.service.base.deployVersion,
            buildInputSha256:plan.service.base.buildInputSha256};
        },
      },{
        apply:async(input,migrations,assertFence)=>{
          await assertFence();
          assert.equal(input.databaseId,'db-uuid');
          assert.equal(Buffer.from(migrations.get('migrations/0001_initial.sql')!).toString(),
            migration.toString());
        },
      });
    const result=await prepare.prepare({runId:'run-1',leaseId,fence:1,base});
    assert.equal(Buffer.from(result.get('portal')!.worker).toString(),worker.toString());
    assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_resources
      WHERE plan_state='created'`).get()?.n,3);
  } finally {db.close();}
});
