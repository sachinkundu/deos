import puppeteer from '@cloudflare/puppeteer';
import {browserCommand,CloudflareBrowserProvider} from './implementation-browser.ts';

export type TestBrowserOperation={
  operation:'navigate'|'state'|'click'|'fill'|'press'|'wait'|'viewport';
  url?:string;selector?:string;text?:string;key?:string;
  width?:number;height?:number;modifiers?:string[];
  viewport?:{width:number;height:number};documentStatus?:number;
};

export interface TestBrowserProvider {
  inventory():Promise<string[]>;
  capacity():Promise<{available:boolean;retryAfterMs:number}>;
  create(host:string):Promise<{id:string;disconnect():Promise<void>}>;
  prepare(id:string,origin:string,cookie:{name:string;value:string;
    domain:string;httpOnly:true;secure:true;sameSite:'Lax';path:'/'},
    clientId:string,clientSecret:string):Promise<void>;
  command(id:string,origin:string,input:TestBrowserOperation):ReturnType<typeof browserCommand>;
  close(id:string):Promise<void>;
  keepAlive(id:string):Promise<void>;
}

/** Browser guardrails allow only the lease app host. */
export class CloudflareTestBrowserProvider implements TestBrowserProvider {
  readonly browser:CloudflareBrowserProvider;
  readonly binding:Parameters<typeof puppeteer.sessions>[0];
  constructor(binding:Parameters<typeof puppeteer.sessions>[0]) {
    this.binding=binding;
    this.browser=new CloudflareBrowserProvider(binding);
  }
  inventory() {return this.browser.inventory();}
  capacity() {return this.browser.capacity();}
  create(host:string) {return this.browser.create(host);}
  close(id:string) {return this.browser.close(id);}
  keepAlive(id:string) {return this.browser.keepAlive(id);}
  command(id:string,origin:string,input:TestBrowserOperation) {
    return browserCommand(this.binding,id,origin,input);
  }

  async prepare(id:string,origin:string,cookie:{name:string;value:string;
    domain:string;httpOnly:true;secure:true;sameSite:'Lax';path:'/'},
    clientId:string,clientSecret:string):Promise<void> {
    if(new URL(origin).hostname!==cookie.domain || !clientId || !clientSecret)
      throw new Error('test_browser_admission_invalid');
    const browser=await puppeteer.connect(this.binding,id);
    let primary:unknown;
    try {
      const pages=await browser.pages();
      if(pages.length>1)throw new Error('test_browser_tabs_unexpected');
      const page=pages[0]??await browser.newPage();
      await page.setExtraHTTPHeaders({
        'CF-Access-Client-Id':clientId,
        'CF-Access-Client-Secret':clientSecret,
      });
      const response=await page.goto(`${origin}/api/version`,{
        waitUntil:'networkidle0',timeout:30_000});
      if(!response?.ok())throw new Error(`test_browser_access_http_${response?.status()??0}`);
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
