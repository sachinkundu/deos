import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {PuppeteerNode} from '@cloudflare/puppeteer/internal/node/PuppeteerNode.js';
import {auditTestBrowserPage} from '../src/shared-test-browser-audit.ts';

test('audit refuses another origin before inspecting storage',async()=>{
  await assert.rejects(auditTestBrowserPage({url:()=> 'https://elsewhere.test',
    evaluate:()=>{throw new Error('must not read');}} as never,'https://lease.test',[]),
  /test_browser_audit_origin/);
});

test('audit detects known credentials without returning values or resource queries',async()=>{
  const secret='fixture-secret-for-audit';
  const page={url:()=> 'https://lease.test/review',evaluate:async()=>({
    storage:[{kind:'session',key:'access_token',value:secret}],
    resources:[{name:`https://api.linear.app/graphql?private=${secret}`,initiatorType:'fetch'},
      {name:`https://lease.test/api/pr?private=${secret}`,initiatorType:'fetch'}],timeOrigin:Date.now(),
  })};
  const result=await auditTestBrowserPage(page as never,'https://lease.test',[secret]);
  assert.equal(result.storage.knownCredentialPresent,true);
  assert.equal(result.storage.credentialNamedKeys,1);
  assert.equal(result.network.linearRequests,1);
  assert.deepEqual(result.network.origins,['https://api.linear.app','https://lease.test']);
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).includes('access_token'));
});

test('audit observes real browser requests and both storage areas without passing secrets to the page',
  {skip:!process.env.DEOS_BROWSER_EXECUTABLE},async()=>{
    const server=createServer((request,response)=>{
      if(request.url?.startsWith('/probe')){response.end('ok');return;}
      response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Audit</title>');
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address && typeof address!=='string');
    const origin=`http://127.0.0.1:${address.port}`;
    const puppeteer=new PuppeteerNode({isPuppeteerCore:true});let browser;
    try {
      browser=await puppeteer.launch({executablePath:process.env.DEOS_BROWSER_EXECUTABLE,headless:true});
      const page=await browser.newPage();await page.goto(origin);
      await page.evaluate(async()=>{
        localStorage.setItem('draft','unpublished note');sessionStorage.setItem('review','COMMENT');
        await (await fetch('/probe?private=omit-me')).text();
      });
      const result=await auditTestBrowserPage(page as never,origin,['never-pass-this-credential']);
      assert.equal(result.storage.entries,2);assert.equal(result.storage.knownCredentialPresent,false);
      assert.equal(result.storage.knownCredentialsChecked,1);assert.equal(result.network.linearRequests,0);
      assert.ok(result.network.resourceCount>=1);assert.deepEqual(result.network.origins,[origin]);
      assert.ok(!JSON.stringify(result).includes('omit-me'));
      assert.ok(!JSON.stringify(result).includes('unpublished note'));
      await page.evaluate(()=>localStorage.setItem('extra','x'.repeat(1_000_001)));
      await assert.rejects(auditTestBrowserPage(page as never,origin,[]),/test_browser_audit_storage_limit/);
    } finally {
      try {await browser?.close();} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }
  });
