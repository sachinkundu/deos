import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {requiredProofKinds} from '../src/shared-test-close.ts';
import {SharedTestFirstProofPublisher} from '../src/shared-test-first-proof.ts';
import {SharedTestPrBodyWriter} from '../src/shared-test-pr-body.ts';
import {sharedTestProofUrl} from '../src/shared-test-proof-url.ts';
import {routePublicProof} from '../portal/test-proof/worker.ts';

function fixture() {
  const db=new ImplementationTestDatabase();
  const bucket=new ImplementationTestBucket();
  db.sqlite.prepare(`INSERT INTO test_lease_requests
    (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,
     state,created_at,updated_at) VALUES
    ('request-1','run-1',1,'attempt-1','issue-1',?,?,'granted','now','now')`)
    .run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`INSERT INTO test_leases
    (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,
     stage,state,fence,base_manifest_id,base_traffic_revision,base_json,
     repository,branch,pull_request_number,candidate_commit,patch_sha256,created_at)
    VALUES ('lease-1','request-1','run-1','attempt-1','issue-1','SAC-182','Test',
      'team-1','shared_test_demo','active',1,'manifest-1','traffic-1','{}',
      'owner/repo','codex/test',150,?,?,'now')`).run('a'.repeat(40),'b'.repeat(64));
  db.sqlite.prepare(`UPDATE test_environment SET state='active',owner_run_id='run-1',
    owner_lease_id='lease-1',fence=1 WHERE site_id=1`).run();
  const payload=new Map<string,Uint8Array>();
  for(const [index,kind] of requiredProofKinds.entries()) {
    const id=`00000000-0000-0000-0000-${String(index+1).padStart(12,'0')}`;
    const bytes=new TextEncoder().encode(`safe-${kind}`),url=sharedTestProofUrl(id);
    const media=['app_screen','linear_screen'].includes(kind)?'image/png':
      kind==='showboat'?'text/plain':'application/json';
    const ext=media==='image/png'?'png':media==='text/plain'?'txt':'json';
    bucket.objects.set(`shared-test/public/lease-1/${id}.${ext}`,bytes);
    payload.set(url,bytes);
    db.sqlite.prepare(`INSERT INTO test_proof_items
      (proof_id,run_id,lease_id,phase,kind,classification,view_rule,
       sanitizer_result,source_sha256,object_key,content_type,byte_count,
       public_sha256,public_url,projected_at) VALUES
      (?,'run-1','lease-1','first',?,'public_safe','public',
       'passed',?,'raw',?,?, ?,?,'now')`)
      .run(id,kind,'f'.repeat(64),media,bytes.length,
        createHash('sha256').update(bytes).digest('hex'),url);
  }
  let body='Reviewer notes stay here.\n';
  const writer=new SharedTestPrBodyWriter(db as unknown as D1Database,{
    read:async()=>body,write:async(_repo,_number,next)=>{body=next;},
  });
  return {db,bucket,payload,writer,body:()=>body,
    changeBody:(next:string)=>{body=next;}};
}

test('first proof set preserves PR text and reads every safe link back',async()=>{
  const f=fixture();
  try {
    const fetcher:typeof fetch=async url=>routePublicProof(new Request(String(url)),{
      DB:f.db as unknown as D1Database,ARTIFACTS:f.bucket as unknown as R2Bucket});
    const publisher=new SharedTestFirstProofPublisher(f.db as unknown as D1Database,
      f.writer,fetcher);
    await publisher.publish('run-1','lease-1');
    await publisher.publish('run-1','lease-1');
    assert.match(f.body(),/Reviewer notes stay here/);
    assert.match(f.body(),/Close report: pending/);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM test_proof_items
      WHERE body_marker='deos-test-proof:lease-1' AND read_at IS NOT NULL`)
      .get()?.count,requiredProofKinds.length);
  }finally{f.db.close();}
});

test('a missing public item leaves close proof unread',async()=>{
  const f=fixture();
  try {
    const fetcher:typeof fetch=async()=>new Response('unavailable',{status:503});
    const publisher=new SharedTestFirstProofPublisher(f.db as unknown as D1Database,
      f.writer,fetcher);
    await assert.rejects(publisher.publish('run-1','lease-1'),
      /test_first_proof_http_app_screen_503/);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM test_proof_items
      WHERE read_at IS NOT NULL`).get()?.count,0);
  }finally{f.db.close();}
});

test('a changed proof section during link checks cannot mark readback',async()=>{
  const f=fixture();
  try {
    let first=true;
    const fetcher:typeof fetch=async url=>{
      if(first) {
        first=false;
        f.changeBody(f.body().replace('Close report: pending.',
          'Close report: changed.'));
      }
      return routePublicProof(new Request(String(url)),{
        DB:f.db as unknown as D1Database,
        ARTIFACTS:f.bucket as unknown as R2Bucket});
    };
    await assert.rejects(new SharedTestFirstProofPublisher(
      f.db as unknown as D1Database,f.writer,fetcher)
      .publish('run-1','lease-1'),/verified_content_changed/);
    assert.equal(f.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM test_proof_items
      WHERE read_at IS NOT NULL`).get()?.count,0);
  }finally{f.db.close();}
});
