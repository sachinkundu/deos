import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {PuppeteerNode} from '@cloudflare/puppeteer/internal/node/PuppeteerNode.js';
import {browserCommand} from '../src/implementation-browser.ts';
import {checkTestBrowserAdmission} from '../src/shared-test-browser-provider.ts';

test('leave-drafts consent cannot authorize a click or an unknown dialog response',async()=>{
  const api={connect:async()=>{throw new Error('must reject before connection');}} as never;
  await assert.rejects(browserCommand({} as never,'draft-reload','https://example.test',
    {operation:'click',selector:'button',beforeUnload:'accept'},api),/explicit navigation/);
  await assert.rejects(browserCommand({} as never,'draft-reload','https://example.test',
    {operation:'navigate',beforeUnload:'all' as 'accept'},api),/explicit navigation/);
});

test('explicit draft reload confirms beforeunload and restores saved drafts across reconnects',
  {skip:!process.env.DEOS_BROWSER_EXECUTABLE},async()=>{
    const server=createServer((_request,response)=>{
      response.setHeader('Content-Type','text/html');
      response.end(`<!doctype html><title>Draft reload</title>
        <button id="draft">Add draft</button><output></output><script>
        const output=document.querySelector('output');
        output.textContent=sessionStorage.getItem('draft') || 'No draft';
        if(location.search.includes('confirm=1')) output.textContent=String(confirm('Publish review?'));
        document.querySelector('button').onclick=()=>{
          sessionStorage.setItem('draft','Unpublished note');
          output.textContent='Unpublished note';
        };
        addEventListener('beforeunload',event=>{
          if(sessionStorage.getItem('draft')) {event.preventDefault();event.returnValue='';}
        });</script>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address && typeof address!=='string');
    const origin=`http://127.0.0.1:${address.port}`;
    const puppeteer=new PuppeteerNode({isPuppeteerCore:true});
    let browser;
    try {
      browser=await puppeteer.launch({executablePath:process.env.DEOS_BROWSER_EXECUTABLE,headless:true});
      const endpoint=browser.wsEndpoint();
      await browser.disconnect();
      const api={connect:async()=>puppeteer.connect({browserWSEndpoint:endpoint})} as never;
      const call=(input:Parameters<typeof browserCommand>[3])=>browserCommand({} as never,'draft-reload',origin,input,api);
      await call({operation:'navigate'});
      await call({operation:'click',selector:'#draft'});
      browser=await puppeteer.connect({browserWSEndpoint:endpoint});
      const page=(await browser.pages())[0]!;
      await checkTestBrowserAdmission(page as unknown as Parameters<typeof checkTestBrowserAdmission>[0],origin);
      assert.equal(page.url(),`${origin}/`);
      assert.equal(await page.$eval('output',element=>element.textContent),'Unpublished note');
      await browser.disconnect();
      const result=await call({operation:'navigate',url:'/?reloaded=1',beforeUnload:'accept'});
      assert.equal(result.documentStatus,200);
      assert.equal(result.url,`${origin}/?reloaded=1`);
      assert.ok('content' in result);
      assert.match(result.content,/<output>Unpublished note<\/output>/);
      const unrelated=await call({operation:'navigate',url:'/?confirm=1',beforeUnload:'accept'});
      assert.ok('content' in unrelated);
      assert.match(unrelated.content,/<output>false<\/output>/);
      browser=await puppeteer.connect({browserWSEndpoint:endpoint});
    } finally {
      try {await browser?.close();} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }
  });
