import { readFile } from 'node:fs/promises';
import { X509Certificate, createHash } from 'node:crypto';

// Pin the sandbox HTTPS interceptor's CA key, without disabling TLS validation
// for every server. The CA is absent outside Cloudflare (e.g. local regression tests).
export async function browserLaunchOptions() {
  const args = ['--disable-dev-shm-usage'];
  let certificate;
  try { certificate = await readFile('/etc/cloudflare/certs/cloudflare-containers-ca.crt'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (certificate) {
    const key = new X509Certificate(certificate).publicKey.export({type:'spki',format:'der'});
    args.push(`--ignore-certificate-errors-spki-list=${createHash('sha256').update(key).digest('base64')}`);
  }
  return {headless:true, chromiumSandbox:false, executablePath:'/deos/bin/implementation-chromium', args};
}

export class LocalImplementationBrowser {
  constructor({ launch, scripts, record = async () => {} }) {
    this.launch = launch; this.scripts = scripts; this.record = record;
    this.browser = null; this.context = null; this.page = null;
    this.origin = null; this.documentStatus = undefined; this.traceEnabled = false;
    this.messages = []; this.viewport = {width:1280,height:900};
    this.retired = false;
  }
  async ensure() {
    if (this.retired) throw new Error('Local browser ended. Resume in a fresh implementation attempt; do not replay an ambiguous action.');
    if (!this.browser) {
      this.browser = await this.launch(await browserLaunchOptions());
      this.browser.on('disconnected', () => { this.retired = true; });
      await this.record({event:'local_browser_started',version:this.browser.version(),transport:'local-pipe',pid:process.pid});
    }
  }
  async newContext(origin) {
    await this.context?.close();
    this.context = null; this.page = null; this.documentStatus = undefined;
    this.traceEnabled = false; this.origin = origin;
    this.context = await this.browser.newContext({viewport:this.viewport,deviceScaleFactor:1,serviceWorkers:'block',acceptDownloads:false});
    // No WebSocket capability is exposed by the implementation browser contract.
    await this.context.routeWebSocket('**/*', socket => socket.close());
    this.page = await this.context.newPage();
    // Playwright route.continue() also follows redirects without re-running the
    // route handler. CDP Fetch pauses each redirect hop before network dispatch.
    this.interceptionFailure = null;
    const session = await this.context.newCDPSession(this.page);
    session.on('Fetch.requestPaused', event => {
      const intercept = async () => {
        const url = new URL(event.request.url);
        if (url.origin === this.origin && !url.username && !url.password && ['http:','https:'].includes(url.protocol))
          await session.send('Fetch.continueRequest',{requestId:event.requestId});
        else {
          this.messages.push({kind:'blocked_request',text:url.href});
          await session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
        }
      };
      intercept().catch(error => {
        this.interceptionFailure = error;
        this.messages.push({kind:'interception_error',text:String(error)});
      });
    });
    await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    this.page.setDefaultTimeout(30_000);
    this.page.on('console', message => this.messages.push({kind:message.type(),text:message.text()}));
    this.page.on('pageerror', error => this.messages.push({kind:'pageerror',text:String(error)}));
    this.page.on('response', response => {
      if (response.request().isNavigationRequest() && response.frame() === this.page.mainFrame())
        this.documentStatus = response.status();
    });
  }
  async command(origin, input) {
    const operations = ['reset','navigate','state','click','fill','press','wait','viewport','trace','measure','screenshot'];
    if (!operations.includes(input.operation)) throw new Error('Unsupported browser operation');
    const assigned = new URL(origin);
    if (assigned.origin !== origin || !['http:','https:'].includes(assigned.protocol) || assigned.username || assigned.password)
      throw new Error('Invalid assigned browser origin');
    const target = new URL(input.url ?? '/', origin);
    if (target.origin !== origin || target.username || target.password) throw new Error('Browser navigation escaped the assigned preview');
    if (['reset','viewport'].includes(input.operation)) {
      if (![input.width,input.height].every(v => Number.isInteger(v) && v >= 200 && v <= 3840))
        throw new Error('Viewport width and height must be integers from 200 to 3840 CSS pixels');
      this.viewport = {width:input.width,height:input.height};
    }
    await this.ensure();
    this.messages = [];
    if (input.operation === 'reset' || !this.context) await this.newContext(origin);
    if (this.origin !== origin) {
      if (input.operation !== 'navigate') throw new Error('Navigate to the selected preview before interacting with it');
      this.origin = origin;
    }
    const page = this.page;
    if (this.context.pages().length !== 1) throw new Error('Unexpected additional browser page');
    if (input.operation === 'viewport') await page.setViewportSize(this.viewport);
    if (input.operation === 'trace') {
      if (typeof input.enabled !== 'boolean') throw new Error('Trace enabled must be a boolean');
      this.traceEnabled = input.enabled;
    }
    const trace = async () => {
      if (page.url() !== 'about:blank') await page.evaluate(`${this.scripts.keyTraceScript}(${this.traceEnabled})`);
    };
    if (['reset','navigate'].includes(input.operation)) {
      this.documentStatus = undefined;
      let response;
      try { response = await page.goto(target.href,{waitUntil:'networkidle',timeout:30_000}); }
      catch (error) { this.documentStatus = undefined; throw error; }
      if (response) this.documentStatus = response.status();
    } else if (input.operation === 'click') {
      if (!input.selector) throw new Error('Click selector missing');
      await page.locator(input.selector).click();
    } else if (input.operation === 'fill') {
      if (!input.selector || typeof input.text !== 'string') throw new Error('Fill input missing');
      await page.locator(input.selector).fill(input.text);
    } else if (input.operation === 'wait') {
      if (!input.selector) throw new Error('Wait selector missing');
      await page.locator(input.selector).waitFor({state:'visible'});
    } else if (input.operation === 'press') {
      if (typeof input.key !== 'string' || !input.key || input.key.length > 64) throw new Error('A single browser key name is required');
      const modifiers = input.modifiers ?? [];
      if (!Array.isArray(modifiers) || modifiers.length > 4 || new Set(modifiers).size !== modifiers.length ||
          modifiers.some(key => !['Alt','Control','Meta','Shift'].includes(key))) throw new Error('Invalid keyboard modifiers');
      await page.keyboard.press([...modifiers,input.key].join('+'));
    }
    if (page.url() !== 'about:blank' && new URL(page.url()).origin !== origin) throw new Error('Browser left its preview origin');
    if (this.interceptionFailure) throw new Error('Browser request interception failed',{cause:this.interceptionFailure});
    await trace();
    const result = {url:page.url(),documentStatus:this.documentStatus,viewport:this.viewport,
      traceEnabled:this.traceEnabled,console:this.messages,transport:'sandbox-local-chromium'};
    if (input.operation === 'screenshot') {
      if (!Number.isInteger(this.documentStatus) || this.documentStatus < 200 || this.documentStatus >= 400)
        throw new Error(`Cannot capture successful app proof without a successful document response (status ${this.documentStatus})`);
      await page.addStyleTag({content:'[data-sensitive], input[type=password] { visibility:hidden !important; }'});
      return {...result,imageBase64:(await page.screenshot({type:'png',fullPage:true})).toString('base64')};
    }
    if (input.operation === 'measure') result.measurements = JSON.parse(await page.evaluate(this.scripts.browserMeasurementScript));
    return {...result,title:await page.title(),content:await page.content()};
  }
  async close() {
    if (!this.browser) return;
    await this.browser.close();
    await this.record({event:'local_browser_closed',transport:'local-pipe'});
    this.browser = null; this.context = null; this.page = null; this.retired = true;
  }
}
