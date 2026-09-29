import type {CapabilityClaims} from './capability-auth.ts';
import {SharedTestAppLauncher} from './shared-test-app-launcher.ts';
import {SharedTestBrowser} from './shared-test-browser.ts';
import {CloudflareTestBrowserProvider,type TestBrowserOperation} from './shared-test-browser-provider.ts';
import {SharedTestBrowserStore} from './shared-test-browser-store.ts';
import {sharedTestCandidateDeployment} from './shared-test-candidate-deployment.ts';
import {SharedTestFailureStore} from './shared-test-failures.ts';
import {SharedTestLeaseStore,type StableStagingBase} from './shared-test-lease.ts';
import {sharedTestServicePlans} from './shared-test-service-plan.ts';
import {SharedTestRawProofStore} from './shared-test-raw-proof.ts';
import {withSharedTestBrowserLock} from './shared-test-browser-lock.ts';

interface Lease {
  lease_id:string;run_id:string;attempt_id:string;task_id:string;
  repository:string;fence:number;state:string;base_json:string;
  candidate_commit:string;patch_sha256:string;base_manifest_id:string;
  base_traffic_revision:string;
}
type BrowserEnv=Env & {TEST_APP_SERVICE_CLIENT_ID?:string;
  TEST_APP_SERVICE_CLIENT_SECRET?:string};

/** The agent names only a service and browser gesture; D1 chooses the origin. */
export class SharedTestBrowserAction {
  readonly env:BrowserEnv;
  constructor(env:BrowserEnv) {this.env=env;}

  async handle(claims:CapabilityClaims,value:unknown):Promise<Response> {
    if(!claims.actions.includes('test_app_browser') ||
        !claims.leaseId || !claims.fence)
      return Response.json({error:'test_browser_denied'},{status:403});
    if(!value || typeof value!=='object' || Array.isArray(value))
      return Response.json({error:'test_browser_request_invalid'},{status:400});
    const request=value as Record<string,unknown>;
    if(request.version!==1 || !['portal','bettaview'].includes(String(request.service)) ||
        typeof request.operation!=='string' ||
        !['open','reset','navigate','state','click','fill','press','wait','viewport','capture','api','select']
          .includes(request.operation) ||
        Object.keys(request).some(key=>!['version','service','operation','url',
          'selector','text','key','width','height','modifiers','method','body'].includes(key)) ||
        (request.method!==undefined && !['GET','POST'].includes(String(request.method))) ||
        (request.body!==undefined && (typeof request.body!=='string' || request.body.length>100000)) ||
        (request.url!==undefined && (typeof request.url!=='string' ||
          request.url.length>2048)) ||
        (request.selector!==undefined && (typeof request.selector!=='string' ||
          request.selector.length>512)) ||
        (request.text!==undefined && (typeof request.text!=='string' ||
          request.text.length>10_000)) ||
        (request.key!==undefined && (typeof request.key!=='string' ||
          request.key.length>64)))
      return Response.json({error:'test_browser_request_invalid'},{status:400});
    try {
      await new SharedTestLeaseStore(this.env.DB).assertWrite(claims.runId,
        claims.attemptId,claims.leaseId,claims.fence);
      const agent=await this.env.DB.prepare(`SELECT 1 AS active FROM agent_attempts a
        JOIN orchestration_runs o ON o.run_id=a.run_id WHERE a.attempt_id=?
          AND a.run_id=? AND a.node_id='shared_test_demo' AND a.state='running'
          AND a.cleanup_state='pending' AND a.absolute_deadline>?
          AND o.current_node='shared_test_demo' AND o.status='active'
          AND o.issue_id=?`)
        .bind(claims.attemptId,claims.runId,new Date().toISOString(),claims.issueId)
        .first<{active:number}>();
      if(agent?.active!==1)throw new Error('test_browser_agent_inactive');
      const lease=await this.env.DB.prepare(`SELECT lease_id,run_id,attempt_id,
        task_id,repository,fence,state,base_json,candidate_commit,patch_sha256,
        base_manifest_id,base_traffic_revision FROM test_leases WHERE lease_id=?`)
        .bind(claims.leaseId).first<Lease>();
      if(!lease || lease.run_id!==claims.runId ||
          lease.attempt_id!==claims.attemptId || lease.task_id!==claims.issueId ||
          lease.repository!==claims.repository || lease.fence!==claims.fence ||
          lease.state!=='active')
        throw new Error('test_browser_lease_scope_changed');
      const plans=sharedTestServicePlans(lease.lease_id,
        JSON.parse(lease.base_json) as StableStagingBase);
      const plan=plans.find(item=>item.serviceName===request.service);
      if(!plan)throw new Error('test_browser_service_not_in_lease');
      const clientId=this.env.TEST_APP_SERVICE_CLIENT_ID,
        clientSecret=this.env.TEST_APP_SERVICE_CLIENT_SECRET;
      if(!clientId || !clientSecret)
        throw new Error('test_browser_access_unconfigured');
      const scope={runId:lease.run_id,attemptId:lease.attempt_id,
        leaseId:lease.lease_id,fence:lease.fence,plan};
      const deployment=sharedTestCandidateDeployment(this.env);
      const browser=new SharedTestBrowser(new SharedTestBrowserStore(this.env.DB),
        new CloudflareTestBrowserProvider(this.env.IMPLEMENTATION_BROWSER),
        new SharedTestAppLauncher(this.env.DB,clientId,clientSecret),
        ()=>deployment.verifyReady(lease));
      return await withSharedTestBrowserLock(this.env.DB,lease.lease_id,plan.serviceName,async()=>{
        if(request.operation==='open') {
          await browser.open(scope);
          return Response.json({ready:true,origin:`https://${plan.canonicalHost}`});
        }
        if(request.operation==='reset') {
          await browser.reset(scope);
          return Response.json({ready:true,freshContext:true,origin:`https://${plan.canonicalHost}`});
        }
        if(request.operation==='capture') {
          const proofId=await new SharedTestRawProofStore(this.env.DB,this.env.ARTIFACTS)
            .saveAppScreen(scope,await browser.capture(scope));
          return Response.json({proofId,classification:'private',
            sanitizerResult:'pending'});
        }
        const input:TestBrowserOperation={operation:request.operation as TestBrowserOperation['operation'],
          ...(request.method==='GET'||request.method==='POST'?{method:request.method}:{}),
          ...(typeof request.body==='string'?{body:request.body}:{}),
          ...(typeof request.url==='string'?{url:request.url}:{}),
          ...(typeof request.selector==='string'?{selector:request.selector}:{}),
          ...(typeof request.text==='string'?{text:request.text}:{}),
          ...(typeof request.key==='string'?{key:request.key}:{}),
          ...(typeof request.width==='number'?{width:request.width}:{}),
          ...(typeof request.height==='number'?{height:request.height}:{}),
          ...(Array.isArray(request.modifiers)?{modifiers:request.modifiers as string[]}:{}),
        };
        return Response.json(await browser.command(scope,input));
      });
    }catch(error) {
      try {
        await new SharedTestFailureStore(this.env.DB,this.env.ARTIFACTS).record({
          runId:claims.runId,leaseId:claims.leaseId,fence:claims.fence,
          phase:'active',operation:'shared_test.browser',
          safeCode:'test_browser_action_failed',
        },error);
      }catch(diagnostic) {
        throw new AggregateError([error,diagnostic],
          'Test browser action and diagnostic storage failed',{cause:error});
      }
      throw error;
    }
  }
}
