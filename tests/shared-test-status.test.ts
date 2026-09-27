import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {handleTestStatus,statusHtml} from '../portal/test-status/worker.ts';

const request=(path='/',token='valid')=>new Request(`https://deos-test.voxdez.com${path}`,{
  headers:{'CF-Access-Jwt-Assertion':token},
});
const auth=async(token:string|null)=>{
  if (token!=='valid') throw new Error('unauthorized');
  return {email:'owner@example.com'};
};

test('status requires Access before reading D1 and shows a safe free state',async()=>{
  const db=new ImplementationTestDatabase();
  try {
    const env={DB:db as unknown as D1Database,ACCESS_TEAM_DOMAIN:'team.cloudflareaccess.com',
      ACCESS_AUD:'audience',ALLOWED_EMAIL:'owner@example.com'};
    assert.equal((await handleTestStatus(request('/','bad'),env,auth)).status,401);
    assert.equal((await handleTestStatus(request('/api/status'),env,auth)).status,404);
    const response=await handleTestStatus(request(),env,auth);
    assert.equal(response.status,200);
    assert.match(await response.text(),/Test site available/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  } finally {db.close();}
});

test('active status leads with issue identity and escapes provider text',()=>{
  const html=statusHtml({state:'active',saved_phase:'active',owner_run_id:'run',
    owner_lease_id:'lease',hold_reason:null,updated_at:'2026-09-27',
    task_key:'SAC-182',task_title:'Fix <unsafe> & test'});
  assert.match(html,/<h1>SAC-182 · Fix &lt;unsafe&gt; &amp; test<\/h1>/);
  assert.doesNotMatch(html,/<unsafe>/);
});
