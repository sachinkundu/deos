import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestDecisionStore,stagingManifestDigest} from '../src/shared-test-decision-store.ts';

const commit='a'.repeat(40),patch='b'.repeat(64),build='c'.repeat(64);
const service={service_name:'portal',source_commit:commit,deploy_version:'version-1',
  build_input_sha256:build,app_paths_json:JSON.stringify(['portal/']),
  provider_paths_json:JSON.stringify(['src/linear-'])};

async function fixture() {
  const db=new ImplementationTestDatabase();
  const digest=await stagingManifestDigest([service]);
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(digest);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at) VALUES ('manifest-1',?,?,?,?,?,?, 'now')`)
    .run(service.service_name,service.source_commit,service.deploy_version,
      service.build_input_sha256,service.app_paths_json,service.provider_paths_json);
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',manifest_id='manifest-1',
    manifest_revision=1,traffic_revision='traffic-1',revision=1 WHERE site_id=1`).run();
  return {db,store:new SharedTestDecisionStore(db as unknown as D1Database)};
}

test('saved path decision and release read share the immutable manifest',async()=>{
  const {db,store}=await fixture();
  try {
    const subject={runId:'run-1',candidateCommit:commit,patchSha256:patch};
    const decision=await store.record({...subject,changedPaths:['portal/src/main.tsx']});
    assert.equal(decision.choice,'test_required');
    const exact={...subject,manifestId:'manifest-1',manifestRevision:1,changedPaths:['portal/src/main.tsx']};
    assert.deepEqual(await store.releaseCheck(exact),{allowed:false,choice:'test_required'});
    assert.deepEqual(await store.releaseCheck({...exact,changedPaths:['docs/notes.md']}),{allowed:false,choice:'test_required'});
    assert.deepEqual(await store.releaseCheck({...exact,manifestRevision:2}),{allowed:false,choice:null});
    await assert.rejects(store.record({...subject,changedPaths:['docs/notes.md']}),/decision_conflict/);
  }finally{db.close();}
});

test('non-app decision is exact and cannot be overwritten after staging changes',async()=>{
  const {db,store}=await fixture();
  try {
    const subject={runId:'run-2',candidateCommit:commit,patchSha256:patch,changedPaths:['docs/notes.md']};
    assert.equal((await store.record(subject)).choice,'test_not_required');
    assert.deepEqual(await store.releaseCheck({...subject,manifestId:'manifest-1',manifestRevision:1}),
      {allowed:true,choice:'test_not_required'});
    db.sqlite.prepare("UPDATE staging_release_pointer SET state='updating',revision=2 WHERE site_id=1").run();
    await assert.rejects(store.record({...subject,runId:'run-3'}),/stable_staging_pointer_missing/);
    assert.deepEqual(await store.releaseCheck({...subject,manifestId:'manifest-1',manifestRevision:1}),
      {allowed:true,choice:'test_not_required'});
  }finally{db.close();}
});
