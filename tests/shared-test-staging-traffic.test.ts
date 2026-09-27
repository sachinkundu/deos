import assert from 'node:assert/strict';
import test from 'node:test';
import {StagingVersionReader} from '../src/shared-test-staging-traffic.ts';
import {stableStagingBase} from '../src/shared-test-lease.ts';
import {sharedTestStagingTraffic} from '../src/shared-test-coordinator.ts';

const source='b'.repeat(40),build='c'.repeat(64);
const version='22222222-2222-4222-8222-222222222222';
const target={serviceName:'portal',host:'deos-staging.voxdez.com'};
const hostVersion={canonicalHost:target.host,sourceSha:source,versionId:version,
  buildInputSha256:build};

test('two equal version responses form a stable base without Cloudflare credentials',async()=>{
  let reads=0;
  const reader=new StagingVersionReader([target],async current=>{
    assert.deepEqual(current,target);
    reads++;
    return Response.json(hostVersion);
  });
  const first=await reader.read(),second=await reader.read();
  const base=stableStagingBase(first,second);
  assert.equal(base.services[0].sourceCommit,source);
  assert.equal(base.services[0].deployVersion,version);
  assert.equal(base.services[0].buildInputSha256,build);
  assert.equal(base.services[0].trafficPercent,100);
  assert.equal(reads,2);
});

test('version change between reads blocks a stable base',async()=>{
  let reads=0;
  const reader=new StagingVersionReader([target],async()=>Response.json({
    ...hostVersion,versionId:reads++===0 ? version : '33333333-3333-4333-8333-333333333333',
  }));
  await assert.rejects(async()=>stableStagingBase(await reader.read(),await reader.read()),
    /staging_traffic_unstable/);
});

test('invalid or mismatched version responses cannot become a lease base',async()=>{
  for (const value of [
    {...hostVersion,canonicalHost:'other.voxdez.com'},
    {...hostVersion,versionId:'not-a-version'},
    {...hostVersion,sourceSha:'bad'},
    {...hostVersion,buildInputSha256:'bad'},
  ]) {
    const reader=new StagingVersionReader([target],async()=>Response.json(value));
    await assert.rejects(reader.read(),/staging_host_version_invalid/);
  }
  const failed=new StagingVersionReader([target],async()=>new Response('unavailable',{status:503}));
  await assert.rejects(failed.read(),/staging_host_version_http_503/);
});

test('a private service binding can provide the version behind Access',async()=>{
  const reader=new StagingVersionReader([target],async current=>{
    assert.equal(current.host,target.host);
    return Response.json(hostVersion);
  });
  assert.equal((await reader.read()).services[0].deployVersion,version);
});

test('the coordinator reads both private bindings without an account token',async()=>{
  const seen:string[]=[];
  const binding=(canonicalHost:string)=>({fetch:async(request:Request)=>{
    seen.push(request.url);
    return Response.json({...hostVersion,canonicalHost});
  }});
  const env={STAGING_BETTAVIEW:binding('bettaview-staging.voxdez.com'),
    STAGING_PORTAL:binding(target.host)} as unknown as Env;
  const snapshot=await sharedTestStagingTraffic(env)();
  assert.deepEqual(snapshot.services.map(service=>service.serviceName),['bettaview','portal']);
  assert.deepEqual(seen,[
    'https://bettaview-staging.voxdez.com/api/version',
    'https://deos-staging.voxdez.com/api/version',
  ]);
});
