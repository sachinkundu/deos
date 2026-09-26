import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestStagingPointer} from '../src/shared-test-staging-pointer.ts';

const traffic={revision:'traffic-1',services:[{serviceName:'portal',sourceCommit:'a'.repeat(40),
  deployVersion:'version-1',buildInputSha256:'b'.repeat(64),trafficPercent:100}]};
const scopes=[{serviceName:'portal',appPaths:['portal/'],providerPaths:['src/linear-']}];

test('a staging pointer publishes only a full manifest after two matching provider reads',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const store=new SharedTestStagingPointer(db as unknown as D1Database);
    const planned=await store.begin('work-1','manifest-1','release-controller');
    assert.equal(planned.state,'updating');
    let reads=0;
    const finished=await store.finish('work-1','manifest-1',scopes,async()=>{reads++;return traffic;});
    assert.equal(reads,2);
    assert.equal(finished.revision,planned.revision+1);
    const saved=await store.pointer();
    assert.equal(saved.state,'stable');
    assert.equal(saved.manifest_revision,finished.revision);
    assert.equal(saved.traffic_revision,traffic.revision);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM staging_release_services').get()?.n,1);
    assert.deepEqual(await store.finish('work-1','manifest-1',scopes,async()=>traffic),finished);
  } finally {db.close();}
});

test('mixed traffic leaves the pointer updating and blocks a second writer',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const store=new SharedTestStagingPointer(db as unknown as D1Database);
    await store.begin('work-1','manifest-1','release-controller');
    let reads=0;
    await assert.rejects(store.finish('work-1','manifest-1',scopes,async()=>
      ++reads===1?traffic:{...traffic,services:[{...traffic.services[0],deployVersion:'version-2'}]}),
      /staging_traffic_changed/);
    assert.equal((await store.pointer()).state,'updating');
    await assert.rejects(store.begin('work-2','manifest-2','release-controller'),/staging_release_busy/);
  } finally {db.close();}
});
