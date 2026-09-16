import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {PuppeteerNode} from '@cloudflare/puppeteer/internal/node/PuppeteerNode.js';
import {browserCommand} from '../src/implementation-browser.ts';

test('real browser fill replaces an existing name and clears controlled input across reconnects',
  {skip: !process.env.DEOS_BROWSER_EXECUTABLE},async()=>{
    const server=createServer((_request,response)=>{
      response.setHeader('Content-Type','text/html');
      response.end(`<!doctype html><title>Browser input regression</title>
        <form><input id="name" value="Rain coat"><button>Save</button></form><output></output>
        <script>
        const field=document.querySelector('input'), output=document.querySelector('output');
        field.addEventListener('input',()=>output.dataset.input=field.value);
        document.querySelector('form').addEventListener('submit',event=>{
          event.preventDefault();output.textContent=field.value;
        });
        </script>`);
    });
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const address=server.address();assert.ok(address && typeof address!=='string');
    const origin=`http://127.0.0.1:${address.port}`;
    const puppeteer=new PuppeteerNode({isPuppeteerCore:true});
    let browser;
    try {
      browser=await puppeteer.launch({executablePath:process.env.DEOS_BROWSER_EXECUTABLE,headless:true});
      const endpoint=browser.wsEndpoint();
      const api={connect:async()=>puppeteer.connect({browserWSEndpoint:endpoint})} as never;
      const call=(input:Parameters<typeof browserCommand>[3])=>browserCommand({} as never,'regression',origin,input,api);
      await call({operation:'navigate'});
      await call({operation:'fill',selector:'#name',text:'Jacket'});
      await call({operation:'press',key:'Enter'});
      const page=(await browser.pages())[0]!;
      assert.equal(await page.$eval('output',element=>element.textContent),'Jacket');
      await call({operation:'fill',selector:'#name',text:''});
      assert.equal(await page.$eval('#name',element=>element.value),'');
      assert.equal(await page.$eval('output',element=>element.dataset.input),'');
    } finally {
      try {await browser?.close();} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }
  });
