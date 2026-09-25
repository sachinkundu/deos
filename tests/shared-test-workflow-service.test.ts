import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {ImplementationService} from '../src/implementation-service.ts';
import {stagingManifestDigest} from '../src/shared-test-decision-store.ts';
import type {ImplementationRun} from '../src/implementation-store.ts';
import type {OrchestrationRunRecord} from '../src/orchestration-store.ts';
import type {LoadedWorkflowDefinition} from '../src/workflow-definition.ts';

test('a required workflow candidate keeps one waiting request across timed visits',async()=>{
  const db=new ImplementationTestDatabase();
  const serviceRow={service_name:'portal',source_commit:'b'.repeat(40),
    deploy_version:'version-1',build_input_sha256:'c'.repeat(64),
    app_paths_json:'["portal/"]',provider_paths_json:'["src/deos/"]'};
  const digest=await stagingManifestDigest([serviceRow]);
  db.sqlite.prepare(`INSERT INTO staging_release_manifests
    (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
    VALUES ('manifest-1',1,'traffic-1',1,?,'now')`).run(digest);
  db.sqlite.prepare(`INSERT INTO staging_release_services
    (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
     app_paths_json,provider_paths_json,read_at)
    VALUES ('manifest-1','portal',?,?,?,?,?,'now')`)
    .run(serviceRow.source_commit,serviceRow.deploy_version,
      serviceRow.build_input_sha256,serviceRow.app_paths_json,serviceRow.provider_paths_json);
  db.sqlite.prepare(`UPDATE staging_release_pointer SET state='stable',
    manifest_id='manifest-1',manifest_revision=1,traffic_revision='traffic-1'
    WHERE site_id=1`).run();
  const work={run_id:'run-1',pr_head_sha:'a'.repeat(40),patch_sha:'d'.repeat(64),
    pr_number:150} as ImplementationRun;
  const definition={nodes:{shared_test_demo:{}}} as unknown as LoadedWorkflowDefinition;
  const service=new ImplementationService({DB:db as unknown as D1Database,
    ARTIFACTS:{} as R2Bucket} as Env,definition);
  service.store.requireRun=async()=>work;
  service.store.candidate=async()=>({files:[{path:'portal/src/main.ts'}]}) as never;
  const run={run_id:'run-1',issue_id:'issue-1',current_visit_sequence:7} as OrchestrationRunRecord;
  try {
    assert.equal((await service.execute(run,'implementation.shared_test_decide')).outcome,'test_required');
    assert.equal((await service.execute(run,'implementation.shared_test_demo')).outcome,'waiting');
    assert.equal((await service.execute({...run,current_visit_sequence:8},
      'implementation.shared_test_demo')).outcome,'waiting');
    const rows=db.sqlite.prepare(`SELECT node_visit,task_id,candidate_commit,state
      FROM test_lease_requests`).all();
    assert.equal(rows.length,1);
    assert.deepEqual({...rows[0]},{node_visit:7,task_id:'issue-1',
      candidate_commit:'a'.repeat(40),state:'waiting'});
  } finally {db.close();}
});
