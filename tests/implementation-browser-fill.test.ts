import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {PuppeteerNode} from '@cloudflare/puppeteer/internal/node/PuppeteerNode.js';
import {browserCommand} from '../src/implementation-browser.ts';
import {selectTestBrowserText} from '../src/shared-test-browser-provider.ts';

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
      assert.equal(await page.$eval('#name',element=>(element as unknown as {value:string}).value),'');
      assert.equal(await page.$eval('output',element=>element.dataset.input),'');
    } finally {
      try {await browser?.close();} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }
  });

test('document selection followed by composer fill survives repeated selection and reconnects',
  {skip: !process.env.DEOS_BROWSER_EXECUTABLE},async()=>{
    const server=createServer((_request,response)=>{
      response.setHeader('Content-Type','text/html');
      response.end(`<!doctype html><title>Review selection regression</title>
        <article><p>A test note goes here.</p></article>
        <aside hidden><textarea id="comment"></textarea><button>Add comment</button></aside><output></output>
        <script>
        const article=document.querySelector('article'), field=document.querySelector('textarea');
        article.addEventListener('mouseup',()=>{
          if(!getSelection().toString().trim())return;
          field.value='';document.querySelector('aside').hidden=false;field.focus();
        });
        document.querySelector('button').addEventListener('click',()=>{
          document.querySelector('output').textContent=field.value;
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
      for(let index=0;index<2;index++) {
        const connected=await puppeteer.connect({browserWSEndpoint:endpoint});
        try {
          const page=(await connected.pages())[0]! as unknown as Parameters<typeof selectTestBrowserText>[0];
          assert.equal(await selectTestBrowserText(page,'article p'),'A test note goes here.');
        } finally {await connected.disconnect();}
      }
      await call({operation:'fill',selector:'#comment',text:'A retained inline note.'});
      await call({operation:'click',selector:'button'});
      assert.equal(await (await browser.pages())[0]!.$eval('output',el=>el.textContent),'A retained inline note.');
    } finally {
      try {await browser?.close();} finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
    }
  });
