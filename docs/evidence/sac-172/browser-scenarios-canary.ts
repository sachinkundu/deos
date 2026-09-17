// Disposable integration probe. Run locally with a remote Browser binding and
// a Quick Tunnel. This fixture tests the collector, not calculator behavior.
import puppeteer from '@cloudflare/puppeteer';
import {browserCommand} from '../../../src/implementation-browser.ts';
import {collectBrowserDemo, implementationToolQueue, beginBrowserDemo, finishBrowserDemo} from '../../../container/implementation-browser-demo.mjs';

const fixture = `<!doctype html><title>Demo collector reset fixture</title>
<main><h1>Demo collector reset fixture</h1><output>0</output><button>Increment</button></main>
<script>
let value = Number(localStorage.count || 0);
const output = document.querySelector('output'); output.textContent = value;
document.querySelector('button').onclick = () => {
 output.textContent = ++value; localStorage.count = value; sessionStorage.count = value;
 document.cookie = 'count=' + value + '; path=/';
};
</script>`;

async function probe(request: Request, env: any) {
  if (new URL(request.url).pathname === '/fixture')
    return new Response(fixture, {headers:{'content-type':'text/html','cache-control':'no-store'}});
  if (request.headers.get('authorization') !== `Bearer ${env.PROBE_TOKEN}`)
    return new Response('Unauthorized',{status:401});
  const {origin} = await request.json() as {origin:string};
  const allocated = await puppeteer.launch(env.BROWSER,{keep_alive:60_000,guardrails:{allowedDomains:[new URL(origin).hostname]}});
  const sessionId = allocated.sessionId();
  await allocated.disconnect();
  const events: any[] = [], calls: string[] = [], starts: any[] = [];
  let primaryError: unknown;
  try {
    let viewport: any, documentStatus: number | undefined;
    const inspect = async () => {
      const connection = await puppeteer.connect(env.BROWSER, sessionId);
      try {
        const pages = await connection.pages();
        const state = await pages[0].evaluate(() => ({
          value:document.querySelector('output')?.textContent,
          local:localStorage.getItem('count'), session:sessionStorage.getItem('count'), cookie:document.cookie,
        }));
        return {...state,pages:pages.length,contexts:connection.browserContexts().length};
      } finally { await connection.disconnect(); }
    };
    const browser = async (step: any) => {
      calls.push(step.operation);
      const result = await browserCommand(env.BROWSER,sessionId,origin,{...step,viewport,documentStatus});
      viewport = result.viewport;
      documentStatus = result.documentStatus;
      if (step.operation === 'reset') starts.push(await inspect());
      if ('image' in result && result.image) {
        const state = await inspect();
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',result.image)),v=>v.toString(16).padStart(2,'0')).join('');
        return {state,proof:{id:step.captureId,kind:'browser_image',caption:step.caption,sha256},bytes:result.image.byteLength};
      }
      return {url:result.url,documentStatus};
    };
    const scenario = (id:string,count:number) => ({id,url:'/fixture',steps:[
      ...Array.from({length:count},()=>({operation:'click',selector:'button'})),
      {operation:'screenshot',caption:`Counter after ${count} clicks`},
    ]});
    const queue = implementationToolQueue();
    const state = {proof:[{id:'old',kind:'browser_image'}]};
    beginBrowserDemo(state);
    const collection = queue.run(()=>collectBrowserDemo({action:'demo',scenarios:[scenario('one',1),scenario('two',2),scenario('one-again',1)]},
      {browser,record:async(event:any)=>events.push(event)}), (error:Error)=>{throw error;});
    const competing = queue.run(()=>browser({operation:'click',selector:'button'}),(error:Error)=>{throw error;});
    const result = await collection;
    finishBrowserDemo(state,result);
    await competing;
    if (JSON.stringify(result.captures.map((c:any)=>c.state.value)) !== '["1","2","1"]')
      throw new Error(`Unexpected captures: ${JSON.stringify(result.captures)}`);
    if (starts.some(s=>s.value!=='0'||s.local!==null||s.session!==null||s.cookie!==''||s.pages!==1||s.contexts!==2))
      throw new Error(`Browser state leaked across scenarios: ${JSON.stringify(starts)}`);
    beginBrowserDemo(state);
    let failed: any;
    await queue.run(()=>collectBrowserDemo({action:'demo',scenarios:[{...scenario('failure',1),steps:[
      {operation:'screenshot',caption:'Initial state'}, {operation:'click',selector:'#does-not-exist'},
      {operation:'screenshot',caption:'Must never capture'},
    ]},scenario('must-not-start',1)]},{browser,record:async(event:any)=>events.push(event)}), (error:any)=>{failed=error;});
    if (!failed?.cause?.message.includes('No element found') || state.proof.length ||
        events.some(e=>e.scenarioId==='must-not-start')) throw new Error('Failure did not stop collection');
    const recovered = await queue.run(()=>collectBrowserDemo({action:'demo',scenarios:[scenario('recovered',1)]},
      {browser,record:async(event:any)=>events.push(event)}),(error:Error)=>{throw error;});
    finishBrowserDemo(state,recovered);
    return Response.json({sessionId,starts,calls,captures:result.captures,failed:{message:failed.message,cause:failed.cause.message},
      recovered:recovered.captures,selected:state.proof,events:events.map(({result,...event})=>event)});
  } catch(error) { primaryError=error; throw error; }
  finally {
    try {
      const connection = await puppeteer.connect(env.BROWSER, sessionId);
      await connection.close();
    } catch(cleanupError) {
      throw new AggregateError(primaryError ? [primaryError,cleanupError]:[cleanupError],'Probe browser cleanup failed',{cause:primaryError??cleanupError});
    }
  }
}
export default {async fetch(request: Request, env: any) {
  try { return await probe(request,env); }
  catch (error: any) { return Response.json({error:{message:error.message,stack:error.stack,cause:error.cause?.message}},{status:500}); }
}};
