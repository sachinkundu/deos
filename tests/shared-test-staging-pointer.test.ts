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

test('the coordinator initializes and refreshes the full pointer using only version reads',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const store=new SharedTestStagingPointer(db as unknown as D1Database);
    const base={revision:'versions-1',services:[
      {serviceName:'bettaview',sourceCommit:'c'.repeat(40),deployVersion:'version-1',
        buildInputSha256:'d'.repeat(64),trafficPercent:100},
      {serviceName:'portal',sourceCommit:'a'.repeat(40),deployVersion:'version-2',
        buildInputSha256:'b'.repeat(64),trafficPercent:100},
    ]};
    let reads=0;
    const first=await store.sync(async()=>{reads++;return base;});
    assert.equal(first.state,'stable');
    assert.equal(first.traffic_revision,base.revision);
    assert.equal(reads,4);
    const same=await store.sync(async()=>{reads++;return base;});
    assert.equal(same.manifest_id,first.manifest_id);
    assert.equal(reads,6);
    const changed={...base,revision:'versions-2',services:[base.services[0],
      {...base.services[1],deployVersion:'version-3'}]};
    const next=await store.sync(async()=>changed);
    assert.equal(next.state,'stable');
    assert.equal(next.traffic_revision,'versions-2');
    assert.notEqual(next.manifest_id,first.manifest_id);
  } finally {db.close();}
});

test('a version change during pointer sync does not publish a manifest',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const store=new SharedTestStagingPointer(db as unknown as D1Database);
    const base={revision:'versions-1',services:[
      {serviceName:'bettaview',sourceCommit:'c'.repeat(40),deployVersion:'version-1',
        buildInputSha256:'d'.repeat(64),trafficPercent:100},
      {serviceName:'portal',sourceCommit:'a'.repeat(40),deployVersion:'version-2',
        buildInputSha256:'b'.repeat(64),trafficPercent:100},
    ]};
    let reads=0;
    await assert.rejects(store.sync(async()=>++reads<=2?base:{...base,revision:'versions-2'}),
      /staging_version_changed_during_sync/);
    assert.equal((await store.pointer()).state,'updating');
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM staging_release_manifests').get()?.n,0);
    assert.equal((await store.sync(async()=>base)).state,'stable');
  } finally {db.close();}
});
