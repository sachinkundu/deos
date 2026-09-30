import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase,seedRun} from './helpers/implementation-fixture.ts';
import {SharedTestShowboatRawDriver} from '../src/shared-test-showboat-raw.ts';
import {SharedTestShowboatProjection} from '../src/shared-test-showboat-projection.ts';
import {routePublicProof} from '../portal/test-proof/worker.ts';
import {sharedTestProofUrl} from '../src/shared-test-proof-url.ts';

const leaseId='f'.repeat(64),candidate='a'.repeat(40);
const document=`# SAC-182 real app proof\n\n*by Showboat*\n<!-- showboat-id: 00000000-0000-0000-0000-000000000001 -->\n\n\`\`\`bash\ngit rev-parse HEAD\n\`\`\`\n\n\`\`\`output\n${candidate}\n\`\`\`\n\nPrivate note: Bearer demo-secret\n`;
const key='runs/run-1/attempts/attempt-1/showboat.md';
const digest=createHash('sha256').update(document).digest('hex');

function fixture() {
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  seedRun(db,'run-1','issue-1');
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run(candidate,'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES (?,'request-1','run-1','attempt-1','issue-1','SAC-182','Test',
      'team-1','shared_test_demo','active',1,'manifest-1','traffic-1','{}',
      'owner/repo','codex/test',150,?,?,'now')`)
    .run(leaseId,candidate,'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',
    owner_run_id='run-1',owner_lease_id=?,fence=1 WHERE site_id=1`)
    .run(leaseId);
  db.sqlite.prepare(`INSERT INTO artifact_manifests
    (manifest_id,run_id,attempt_id,r2_key,state,created_at)
    VALUES ('manifest:attempt-1','run-1','attempt-1',
      'runs/run-1/attempts/attempt-1/manifest.json','complete','now')`).run();
  db.sqlite.prepare(`INSERT INTO artifacts
    (manifest_id,logical_name,r2_key,media_type,byte_size,sha256,created_at,
     policy_outcome) VALUES ('manifest:attempt-1','showboat.md',?,
      'text/markdown',?,?,'now','accepted')`)
    .run(key,Buffer.byteLength(document),digest);
  bucket.objects.set(key,new TextEncoder().encode(document));
  return {db,bucket,driver:new SharedTestShowboatRawDriver(
    db as unknown as D1Database,bucket as unknown as R2Bucket)};
}

test('collected Showboat stays private with checked source and one proof row',async()=>{
  const f=fixture();
  try {
    assert.equal(await f.driver.resume(),'saved');
    assert.equal(await f.driver.resume(),'idle');
    const row=f.db.sqlite.prepare(`SELECT classification,sanitizer_result,
      source_sha256,object_key,public_url FROM test_proof_items
      WHERE lease_id=? AND kind='showboat'`).get(leaseId);
    assert.equal(row?.classification,'private');
    assert.equal(row?.sanitizer_result,'pending');
    assert.equal(row?.source_sha256,digest);
    assert.equal(row?.public_url,null);
    const saved=await f.bucket.get(String(row?.object_key));
    assert.equal(await saved?.text(),document);
    const projection=new SharedTestShowboatProjection(f.db as unknown as D1Database,
      f.bucket as unknown as R2Bucket);
    assert.equal(await projection.resume(),'projected');
    assert.equal(await projection.resume(),'idle');
    const publicResponse=await routePublicProof(new Request(
      sharedTestProofUrl(String(f.db.sqlite.prepare(`SELECT proof_id
        FROM test_proof_items WHERE kind='showboat'`).get()?.proof_id))),{
      DB:f.db as unknown as D1Database,
      ARTIFACTS:f.bucket as unknown as R2Bucket});
    assert.equal(publicResponse.status,200);
    const publicText=await publicResponse.text();
    assert.match(publicText,/git rev-parse HEAD/);
    assert.match(publicText,new RegExp(candidate));
    assert.doesNotMatch(publicText,/Bearer|demo-secret|showboat-id/);
  }finally{f.db.close();}
});

test('a changed collected Showboat object cannot become proof',async()=>{
  const f=fixture();
  try {
    f.bucket.objects.set(key,new TextEncoder().encode(`${document}changed`));
    await assert.rejects(f.driver.resume(),/test_showboat_artifact_changed/);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS n FROM test_proof_items`)
      .get()?.n,0);
  }finally{f.db.close();}
});

test('a Showboat checkout for another commit stays private',async()=>{
  const f=fixture();
  try {
    const wrong=document.replace(candidate,'e'.repeat(40));
    f.bucket.objects.set(key,new TextEncoder().encode(wrong));
    f.db.sqlite.prepare(`UPDATE artifacts SET byte_size=?,sha256=?
      WHERE logical_name='showboat.md'`)
      .run(Buffer.byteLength(wrong),createHash('sha256').update(wrong).digest('hex'));
    assert.equal(await f.driver.resume(),'saved');
    await assert.rejects(new SharedTestShowboatProjection(
      f.db as unknown as D1Database,f.bucket as unknown as R2Bucket)
      .resume(),/test_showboat_checkout_proof_missing/);
    assert.equal(f.db.sqlite.prepare(`SELECT classification FROM test_proof_items
      WHERE kind='showboat'`).get()?.classification,'private');
  }finally{f.db.close();}
});


test('large accepted Showboat preserves every byte while public projection stays narrow',async()=>{
  const f=fixture();
  try {
    const large=document+'Private scenario detail\n'.repeat(150_000);
    const bytes=new TextEncoder().encode(large),sha=createHash('sha256').update(bytes).digest('hex');
    f.bucket.objects.set(key,bytes);
    f.db.sqlite.prepare("UPDATE artifacts SET byte_size=?,sha256=? WHERE logical_name='showboat.md'").run(bytes.byteLength,sha);
    assert.equal(await f.driver.resume(),'saved');
    const row=f.db.sqlite.prepare("SELECT * FROM test_proof_items WHERE kind='showboat'").get()!;
    assert.equal(await (await f.bucket.get(String(row.object_key)))!.text(),large);
    assert.equal(row.source_sha256,sha);
    assert.equal(await new SharedTestShowboatProjection(f.db as unknown as D1Database,f.bucket as unknown as R2Bucket).resume(),'projected');
    const projected=await routePublicProof(new Request(sharedTestProofUrl(String(row.proof_id))),{
      DB:f.db as unknown as D1Database,ARTIFACTS:f.bucket as unknown as R2Bucket});
    const text=await projected.text();
    assert.match(text,new RegExp(candidate)); assert.doesNotMatch(text,/Private scenario|demo-secret/);
    assert.ok(text.length<1000);
  }finally{f.db.close();}
});
