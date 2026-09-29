import puppeteer,{type Page} from '@cloudflare/puppeteer';
import {browserCommand,CloudflareBrowserProvider} from './implementation-browser.ts';
import {auditTestBrowserPage} from './shared-test-browser-audit.ts';

export type TestBrowserOperation={
  operation:'navigate'|'state'|'click'|'fill'|'press'|'wait'|'viewport'|'api'|'select'|'audit';
  url?:string;selector?:string;text?:string;key?:string;
  width?:number;height?:number;modifiers?:string[];
  viewport?:{width:number;height:number};documentStatus?:number;
  method?:'GET'|'POST';body?:string;
  beforeUnload?:'accept';
};

export interface TestBrowserProvider {
  inventory():Promise<string[]>;
  history(id:string):Promise<unknown>;
  capacity():Promise<{available:boolean;retryAfterMs:number}>;
  create(host:string):Promise<{id:string;disconnect():Promise<void>}>;
  prepare(id:string,origin:string,cookie:{name:string;value:string;
    domain:string;httpOnly:true;secure:true;sameSite:'Lax';path:'/'},
    clientId:string,clientSecret:string,fresh?:boolean):Promise<void>;
  command(id:string,origin:string,input:TestBrowserOperation):Promise<{url:string;title?:string;content?:string;documentStatus?:number}>;
  capture(id:string,origin:string,viewport?:{width:number;height:number}):Promise<{image:Uint8Array;url:string}>;
  close(id:string):Promise<void>;
  keepAlive(id:string):Promise<void>;
}

/** Renew admission without replacing the app document or its draft state. */
export async function checkTestBrowserAdmission(page:Page,origin:string):Promise<void> {
  if(page.url()==='about:blank') {
    const response=await page.goto(`${origin}/api/version`,{waitUntil:'networkidle0',timeout:30_000});
    if(!response?.ok())throw new Error(`test_browser_access_http_${response?.status()??0}`);
    return;
  }
  if(new URL(page.url()).origin!==origin)throw new Error('test_browser_admission_origin');
  const status=await page.evaluate(async url=>{
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30_000)});
    return response.status;
  },`${origin}/api/version`);
  if(status<200 || status>=300)throw new Error(`test_browser_access_http_${status}`);
}

/** Browser guardrails allow only the lease app host. */
export class CloudflareTestBrowserProvider implements TestBrowserProvider {
  readonly browser:CloudflareBrowserProvider;
  readonly binding:Parameters<typeof puppeteer.sessions>[0];
  readonly protectedValues:string[];
  constructor(binding:Parameters<typeof puppeteer.sessions>[0],protectedValues:string[]=[]) {
    this.protectedValues=protectedValues;
    this.binding={fetch:async(input:RequestInfo|URL,init?:RequestInit)=>{
      const response=await binding.fetch(input,init);
      if(new Headers(init?.headers).get('Upgrade')?.toLowerCase()==='websocket' &&
          !response.webSocket) {
        // The SDK otherwise dereferences a null WebSocket and discards the
        // provider's HTTP error, hiding why reconnect failed.
        throw new Error(`test_browser_connect_http_${response.status}: ${await response.text()}`);
      }
      return response;
    }} as Parameters<typeof puppeteer.sessions>[0];
    this.browser=new CloudflareBrowserProvider(this.binding);
  }
  inventory() {return this.browser.inventory();}
  async history(id:string) {
    const history=await this.browser.history(id);
    if(!history)return null;
    // The provider may add signed debugger URLs. Retain only lifecycle facts.
    return Object.fromEntries(Object.entries(history).filter(([key])=>[
      'sessionId','closeReason','closeReasonText','startTime','endTime',
      'connectionStartTime','connectionEndTime','lastUpdated',
    ].includes(key)));
  }
  capacity() {return this.browser.capacity();}
  create(host:string) {return this.browser.create(host);}
  close(id:string) {return this.browser.close(id);}
  keepAlive(id:string) {return this.browser.keepAlive(id);}
  async command(id:string,origin:string,input:TestBrowserOperation) {
    if(input.operation==='audit') {
      const browser=await puppeteer.connect(this.binding,id);
      let primary:unknown;
      try {
        const pages=await browser.pages(),page=pages[0];
        if(pages.length!==1||!page)throw new Error('test_browser_audit_page');
        return {url:page.url(),content:JSON.stringify(await auditTestBrowserPage(page,origin,this.protectedValues))};
      }catch(error){primary=error;throw error;}
      finally {
        try {await browser.disconnect();}
        catch(error){if(primary)throw new AggregateError([primary,error],'Browser audit and disconnect failed',{cause:primary});throw error;}
      }
    }
    if(input.operation==='select') {
      if(!input.selector || input.selector.length>512)throw new Error('test_browser_selection_invalid');
      const browser=await puppeteer.connect(this.binding,id);
      let primary:unknown;
      try {
        const pages=await browser.pages(),page=pages[0];
        if(pages.length!==1 || !page || new URL(page.url()).origin!==origin)throw new Error('test_browser_selection_origin');
        const selected=await page.$eval(input.selector,element=>{
          const doc=element.ownerDocument,range=doc.createRange(),selection=doc.getSelection();
          if(!selection || !element.textContent?.trim())throw new Error('No selectable text');
          range.selectNodeContents(element);selection.removeAllRanges();selection.addRange(range);
          const event=doc.createEvent('MouseEvents');event.initEvent('mouseup',true,true);element.dispatchEvent(event);
          return selection.toString();
        });
        return {url:page.url(),content:JSON.stringify({selected})};
      }catch(error){primary=error;throw error;}
      finally {
        try {await browser.disconnect();}
        catch(error){if(primary)throw new AggregateError([primary,error],'Text selection and disconnect failed',{cause:primary});throw error;}
      }
    }
    if(input.operation==='api') {
      const target=new URL(input.url??'',origin);
      if(target.origin!==origin || !['/api/pr','/api/review-continuations','/api/review-continuations/publish',
          '/api/review-continuations/action','/api/settings/bettaview-account'].includes(target.pathname) ||
          !['GET','POST'].includes(input.method??'GET') || (input.body?.length??0)>100000)
        throw new Error('test_browser_api_denied');
      const browser=await puppeteer.connect(this.binding,id);
      let primary:unknown;
      try {
        const pages=await browser.pages(),page=pages[0];
        if(pages.length!==1 || !page || new URL(page.url()).origin!==origin)throw new Error('test_browser_api_origin');
        const result=await page.evaluate(async({url,method,body})=>{
          const response=await fetch(url,{method,body:method==='POST'?body:undefined,
            headers:{'Content-Type':'application/json'},redirect:'error'});
          return {status:response.status,body:await response.text()};
        },{url:target.toString(),method:input.method??'GET',body:input.body});
        return {url:page.url(),content:JSON.stringify(result),documentStatus:result.status};
      }catch(error){primary=error;throw error;}
      finally {
        try {await browser.disconnect();}
        catch(error){if(primary)throw new AggregateError([primary,error],'Test API request and disconnect failed',{cause:primary});throw error;}
      }
    }
    return browserCommand(this.binding,id,origin,{...input,operation:input.operation});
  }
  async capture(id:string,origin:string,viewport?:{width:number;height:number}):Promise<{image:Uint8Array;url:string}> {
    const result=await browserCommand(this.binding,id,origin,{operation:'screenshot',viewport});
    if(!('image' in result) || !(result.image instanceof Uint8Array) ||
        !result.url || new URL(result.url).origin!==origin)
      throw new Error('test_browser_capture_invalid');
    return {image:result.image,url:result.url};
  }

  async prepare(id:string,origin:string,cookie:{name:string;value:string;
    domain:string;httpOnly:true;secure:true;sameSite:'Lax';path:'/'},
    clientId:string,clientSecret:string,fresh=false):Promise<void> {
    if(new URL(origin).hostname!==cookie.domain || !clientId || !clientSecret)
      throw new Error('test_browser_admission_invalid');
    const browser=await puppeteer.connect(this.binding,id);
    let primary:unknown;
    try {
      if(fresh) {
        const prior=browser.browserContexts(),context=await browser.createBrowserContext();
        await context.newPage();
        for(const old of prior) {
          if(old===browser.defaultBrowserContext())for(const page of await old.pages())await page.close();
          else await old.close();
        }
      }
      const pages=await browser.pages();
      if(pages.length>1)throw new Error('test_browser_tabs_unexpected');
      const page=pages[0]??await browser.newPage();
      await page.setExtraHTTPHeaders({
        'CF-Access-Client-Id':clientId,
        'CF-Access-Client-Secret':clientSecret,
      });
      await checkTestBrowserAdmission(page,origin);
      await page.setCookie(cookie);
    }catch(error){primary=error;throw error;}
    finally {
      try {await browser.disconnect();}
      catch(error) {
        if(primary)throw new AggregateError([primary,error],
          'Test browser admission and disconnect failed',{cause:primary});
        throw error;
      }
    }
  }
}
