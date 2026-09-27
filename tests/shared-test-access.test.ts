import assert from 'node:assert/strict';
import test from 'node:test';
import {generateKeyPair,SignJWT} from 'jose';
import {verifyTestAccess} from '../src/shared-test-access.ts';

const config={teamDomain:'test.cloudflareaccess.com',audience:'a'.repeat(64),
  allowedEmail:'owner@example.com',serviceClientId:'browser.access'};

test('test Access gate accepts only the configured person or service identity',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const keys=async()=>publicKey;
  const sign=(claims:Record<string,unknown>)=>new SignJWT({type:'app',...claims})
    .setProtectedHeader({alg:'RS256'}).setIssuer('https://test.cloudflareaccess.com')
    .setAudience(config.audience).setIssuedAt().setExpirationTime('5m')
    .sign(privateKey);
  const service=await verifyTestAccess(await sign({common_name:'browser.access',sub:''}),
    config,keys);
  assert.equal(service.kind,'service');
  const person=await verifyTestAccess(await sign({email:'OWNER@example.com',sub:'user-1'}),
    config,keys);
  assert.equal(person.kind,'human');
  assert.notEqual(person.principalSha256,service.principalSha256);
  await assert.rejects(verifyTestAccess(await sign({common_name:'other.access',sub:''}),
    config,keys),/service_forbidden/);
  await assert.rejects(verifyTestAccess(await sign({email:'other@example.com',sub:'user-1'}),
    config,keys),/human_forbidden/);
  await assert.rejects(verifyTestAccess(await sign({common_name:'browser.access',
    sub:'user-1'}),config,keys),/service_forbidden/);
  await assert.rejects(verifyTestAccess(await sign({email:'owner@example.com',sub:''}),
    config,keys),/human_forbidden/);
});

test('test Access gate rejects another audience and missing configuration',async()=>{
  const {privateKey,publicKey}=await generateKeyPair('RS256');
  const token=await new SignJWT({type:'app',common_name:'browser.access',sub:''})
    .setProtectedHeader({alg:'RS256'}).setIssuer('https://test.cloudflareaccess.com')
    .setAudience('b'.repeat(64)).setIssuedAt().setExpirationTime('5m')
    .sign(privateKey);
  await assert.rejects(verifyTestAccess(token,config,async()=>publicKey));
  await assert.rejects(verifyTestAccess(token,{...config,serviceClientId:''},
    async()=>publicKey),/configuration_invalid/);
});
