import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestDecisionStore,stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import {SharedTestReleaseLinkStore} from '../src/shared-test-release-link.ts';
import {SharedTestReleaseGuard} from '../src/shared-test-release-guard.ts';

const commit='a'.repeat(40),base='b'.repeat(40),release='c'.repeat(40),
  tree='d'.repeat(40),patch='e'.repeat(64);

async function fixture() {
  const db=new ImplementationTestDatabase();
  const service={service_name:'portal',source_commit:base,deploy_version:'version-1',
    build_input_sha256:'f'.repeat(64),app_paths_json:'["portal/"]',
    provider_paths_json:'["src/entry.py"]'};
  const digest=await stagingManifestDigest([service]);
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(digest);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at) VALUES ('manifest-1',?,?,?,?,?,?,'now')`)
    .run(service.service_name,service.source_commit,service.deploy_version,
      service.build_input_sha256,service.app_paths_json,service.provider_paths_json);
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',
    manifest_id='manifest-1',manifest_revision=1,traffic_revision='traffic-1'
    WHERE site_id=1`).run();
  return {db,decision:new SharedTestDecisionStore(db as unknown as D1Database),
    links:new SharedTestReleaseLinkStore(db as unknown as D1Database)};
}

test('release SHA is linked only to a verified merge of the exact tested tree',async()=>{
  const {db,decision,links}=await fixture();
  try {
    await decision.record({runId:'run-1',candidateCommit:commit,patchSha256:patch,
      changedPaths:['docs/notes.md']});
    const input={runId:'run-1',candidateCommit:commit,releaseCommit:release,
      testedBase:base,treeSha:tree,patchSha256:patch,pullRequestNumber:150,
      mergeParents:[base,commit],mergeTreeSha:tree};
    await assert.rejects(links.record({...input,mergeParents:[commit,base]}),/parents_changed/);
    await assert.rejects(links.record({...input,mergeTreeSha:'0'.repeat(40)}),/parents_changed/);
    assert.equal(await links.record(input),true);
    assert.deepEqual(await links.check(release,['docs/notes.md']),
      {allowed:true,choice:'test_not_required',candidateCommit:commit});
    assert.deepEqual(await links.check(release,['portal/src/main.tsx']),
      {allowed:false,choice:'test_not_required',candidateCommit:commit});
    assert.deepEqual(await links.check('0'.repeat(40),['docs/notes.md']),
      {allowed:false,choice:null,candidateCommit:null});
    const observing=new SharedTestReleaseGuard(db as unknown as D1Database,'observe');
    const enforcing=new SharedTestReleaseGuard(db as unknown as D1Database,'enforce');
    const missing=await observing.check('0'.repeat(40),['portal/src/main.tsx']);
    assert.equal(missing.allowed,true);
    assert.equal(missing.proofAllowed,false);
    assert.equal((await enforcing.check('0'.repeat(40),['portal/src/main.tsx'])).allowed,false);
    assert.equal((await enforcing.check(release,['docs/notes.md'])).allowed,true);
  } finally {db.close();}
});
