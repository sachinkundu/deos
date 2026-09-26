import assert from 'node:assert/strict';
import test from 'node:test';
import {CloudflareStagingTrafficReader} from '../src/shared-test-staging-traffic.ts';

const account='a'.repeat(32),source='b'.repeat(40),build='c'.repeat(64);
const deployment='11111111-1111-4111-8111-111111111111';
const version='22222222-2222-4222-8222-222222222222';
const target={serviceName:'portal',workerName:'deos-workflow-portal-staging',
  host:'deos-staging.voxdez.com'};

test('staging base comes from 100 percent deployment and matching host readback',async()=>{
  const requests:string[]=[];
  const reader=new CloudflareStagingTrafficReader(account,'token',[target],
    (async(input,init)=>{
      const url=String(input);requests.push(url);
      assert.equal(init?.redirect,'manual');
      if(url.includes('/deployments')) return Response.json({success:true,result:{deployments:[
        {id:deployment,created_on:'2026-09-25T01:00:00Z',versions:[{version_id:version,percentage:100}]},
      ]}});
      if(url===`https://${target.host}/api/version`) return Response.json({
        canonicalHost:target.host,sourceSha:source,versionId:version,buildInputSha256:build});
      throw new Error(`unexpected request ${url}`);
    }) as typeof fetch);
  const first=await reader.read(),second=await reader.read();
  assert.deepEqual(first,second);
  assert.equal(first.services[0].sourceCommit,source);
  assert.equal(first.services[0].deployVersion,version);
  assert.equal(first.services[0].buildInputSha256,build);
  assert.equal(first.services[0].trafficPercent,100);
  assert.equal(requests.length,4);
});

test('mixed staging traffic cannot become a lease base',async()=>{
  const reader=new CloudflareStagingTrafficReader(account,'token',[target],
    (async()=>Response.json({success:true,result:{deployments:[
      {id:deployment,created_on:'2026-09-25T01:00:00Z',versions:[
        {version_id:version,percentage:50},{version_id:deployment,percentage:50}]},
    ]}})) as typeof fetch);
  await assert.rejects(reader.read(),/traffic_incomplete/);
});

test('a host on another version cannot become a lease base',async()=>{
  const reader=new CloudflareStagingTrafficReader(account,'token',[target],
    (async(input)=>String(input).includes('/deployments')
      ? Response.json({success:true,result:{deployments:[
          {id:deployment,created_on:'2026-09-25T01:00:00Z',versions:[{version_id:version,percentage:100}]},
        ]}})
      : Response.json({canonicalHost:target.host,sourceSha:source,versionId:deployment,
          buildInputSha256:build})) as typeof fetch);
  await assert.rejects(reader.read(),/deployment_mismatch/);
});

test('a private service binding can provide the running version behind Access',async()=>{
  let privateReads=0;
  const reader=new CloudflareStagingTrafficReader(account,'token',[target],
    (async()=>Response.json({success:true,result:{deployments:[
      {id:deployment,created_on:'2026-09-25T01:00:00Z',versions:[{version_id:version,percentage:100}]},
    ]}})) as typeof fetch,
    async current=>{
      assert.equal(current.workerName,target.workerName);
      privateReads++;
      return Response.json({canonicalHost:target.host,sourceSha:source,
        versionId:version,buildInputSha256:build});
    });
  assert.equal((await reader.read()).services[0].deployVersion,version);
  assert.equal(privateReads,1);
});
