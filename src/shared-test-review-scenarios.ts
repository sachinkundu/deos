import {SharedTestReviewRuntime} from './shared-test-review-runtime.ts';
import {sharedTestReviewFixture,sharedTestReviewProfile} from './shared-test-review-profile.ts';
import {sharedTestReviewKey} from './shared-test-review-signing.ts';
import {ImplementationProviderTest} from './implementation-provider-test.ts';
import type {SharedTestReviewBinding} from './shared-test-review-provider.ts';
import type {CapabilityClaims} from './capability-auth.ts';
import {sharedReviewFaultKinds,type SharedReviewFaultKind} from './shared-test-review-faults.ts';

/** Bounded fixture operations. Callers cannot choose a database, provider
 * identity, query, event payload, workflow definition, or external target. */
export class SharedTestReviewScenarios {
  readonly env:Env;
  readonly fetcher:typeof fetch;
  constructor(env:Env,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.fetcher=fetcher;
  }

  async live(binding:SharedTestReviewBinding) {
    const row=await this.env.DB.prepare(`SELECT 1 AS allowed FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active'
      AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=? AND e.heartbeat_due_at>?
      AND l.state='active' AND l.fence=e.fence AND l.attempt_id=?`)
      .bind(binding.runId,binding.leaseId,binding.fence,new Date().toISOString(),binding.attemptId)
      .first<{allowed:number}>();
    if(row?.allowed!==1)throw new Error('test_review_scenario_fenced');
    return sharedTestReviewFixture(this.env.DB,{run_id:binding.runId,attempt_id:binding.attemptId});
  }

  async control(binding:SharedTestReviewBinding,method:string,payload:Record<string,unknown>={}) {
    await this.live(binding);
    const runtime=await new SharedTestReviewRuntime(this.env,this.fetcher).saved(binding.leaseId);
    if(runtime.runId!==binding.runId || runtime.attemptId!==binding.attemptId || runtime.fence!==binding.fence)
      throw new Error('test_review_scenario_runtime_changed');
    const raw=JSON.stringify({...payload,method,leaseId:binding.leaseId,at:Date.now(),nonce:crypto.randomUUID()});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(await sharedTestReviewKey(
      this.env.TEST_MARKER_KEY_V1,binding.leaseId,binding.fence)),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signature=[...new Uint8Array(await crypto.subtle.sign('HMAC',key,
      new TextEncoder().encode('lease-test-control-v1:'+raw)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const response=await this.fetcher(`https://${runtime.hostname}/__deos_test_control`,{
      method:'POST',body:raw,headers:{'Content-Type':'application/json','X-Deos-Test-Control':signature,
        'CF-Access-Client-Id':this.env.TEST_APP_SERVICE_CLIENT_ID,
        'CF-Access-Client-Secret':this.env.TEST_APP_SERVICE_CLIENT_SECRET},
      redirect:'manual',signal:AbortSignal.timeout(30_000)});
    const text=await response.text();
    if(!response.ok)throw new Error(`test_review_control_failed:${response.status}:${text}`);
    return JSON.parse(text) as Record<string,unknown>;
  }

  async provider(binding:SharedTestReviewBinding,value:Record<string,unknown>) {
    const fixture=await this.live(binding),{row}=await sharedTestReviewProfile(this.env.DB,binding.runId);
    return new ImplementationProviderTest(this.env,async()=>{await this.live(binding);},binding.leaseId)
      .call(binding.runId,binding.attemptId,[row.adapter_binding],{...value,resourceId:fixture.resourceId},row.run_id);
  }

  async prepare(binding:SharedTestReviewBinding,scenario:string) {
    if(!/^s(?:0[1-9]|1[0-2])(?:-[a-z0-9-]{1,40})?$/.test(scenario))throw new Error('test_review_scenario_invalid');
    const fixture=await this.live(binding);
    const before=await this.env.DB.prepare('SELECT * FROM test_review_scenarios WHERE lease_id=? AND scenario_id=?')
      .bind(binding.leaseId,scenario).first<{state:string;scenario_run_id:string|null}>();
    if(before?.state==='retired')throw new Error('test_review_scenario_already_retired');
    if(before?.state==='ready')return this.control(binding,'evidence',{scenario});
    if(!before)await this.env.DB.batch([
      this.env.DB.prepare("UPDATE test_review_fault_injections SET state='cleared',used_at=? WHERE lease_id=? AND state='armed'").bind(new Date().toISOString(),binding.leaseId),
      this.env.DB.prepare("UPDATE test_review_scenarios SET state='retired' WHERE lease_id=? AND state='ready'").bind(binding.leaseId),
      this.env.DB.prepare("INSERT INTO test_review_scenarios (lease_id,scenario_id,state) VALUES (?,?,'preparing')").bind(binding.leaseId,scenario),
    ]);
    await this.provider(binding,{operation:'linear.move',operationId:`scenario-${scenario}-initial-state`,
      issueId:fixture.issueId,stateId:fixture.profile.states.review});
    const pull=await this.provider(binding,{operation:'github.read',path:''}) as {response:unknown};
    const value=await this.control(binding,'prepare',{scenario,pull:pull.response});
    if(typeof value.runId!=='string')throw new Error('test_review_scenario_run_missing');
    await this.env.DB.prepare(`UPDATE test_review_scenarios SET state='ready',scenario_run_id=?,prepared_at=?
      WHERE lease_id=? AND scenario_id=? AND state='preparing'`)
      .bind(value.runId,new Date().toISOString(),binding.leaseId,scenario).run();
    return value;
  }

  async forward(binding:SharedTestReviewBinding) {
    const fixture=await this.live(binding);
    const current=await this.env.DB.prepare("SELECT scenario_id,prepared_at FROM test_review_scenarios WHERE lease_id=? AND state='ready'")
      .bind(binding.leaseId).first<{scenario_id:string;prepared_at:string}>();
    if(!current)return;
    if(await this.env.DB.prepare(`SELECT 1 FROM test_review_fault_injections WHERE lease_id=?
      AND scenario_id=? AND kind='hold_linear_delivery' AND state='armed'`)
      .bind(binding.leaseId,current.scenario_id).first())return;
    const events=(await this.env.DB.prepare(`SELECT e.* FROM test_review_fixture_events e
      JOIN deliveries d ON d.delivery_id=e.delivery_id AND d.payload_hash=e.payload_sha
      WHERE e.resource_id=? AND e.issue_id=? AND e.received_at>=? AND NOT EXISTS (
        SELECT 1 FROM test_review_forwarded_events f WHERE f.lease_id=? AND f.scenario_id=? AND f.delivery_id=e.delivery_id)
      ORDER BY e.received_at,e.delivery_id LIMIT 20`)
      .bind(fixture.resourceId,fixture.issueId,current.prepared_at,binding.leaseId,current.scenario_id)
      .all<{delivery_id:string;issue_id:string;actor_id:string;actor_type:string|null;from_state_id:string|null;
        to_state_id:string;provider_time:string;payload_sha:string;received_at:string}>()).results;
    for(const e of events) {
      await this.control(binding,'delivery',{scenario:current.scenario_id,event:{deliveryId:e.delivery_id,
        issueId:e.issue_id,actorId:e.actor_id,actorType:e.actor_type,fromStateId:e.from_state_id,
        toStateId:e.to_state_id,providerTime:e.provider_time,payloadDigest:e.payload_sha,receivedAt:e.received_at}});
      await this.env.DB.prepare(`INSERT OR IGNORE INTO test_review_forwarded_events VALUES (?,?,?,?)`)
        .bind(binding.leaseId,current.scenario_id,e.delivery_id,new Date().toISOString()).run();
    }
  }

  async handle(claims:CapabilityClaims,value:unknown):Promise<Response> {
    if(!claims.actions.includes('test_review_fixture') || !claims.leaseId || !claims.fence)
      return Response.json({error:'test_review_fixture_denied'},{status:403});
    if(!value || typeof value!=='object' || Array.isArray(value))throw new Error('test_review_fixture_input_invalid');
    const input=value as Record<string,unknown>;
    if(input.version!==1 || Object.keys(input).some(k=>!['version','operation','scenario','path','kind','step'].includes(k)))
      return Response.json({error:'test_review_fixture_input_invalid',
        allowedFields:['version','operation','scenario','path','kind','step'],
        example:{version:1,operation:'inject',scenario:'s01',kind:'account_identity_mismatch'}},{status:400});
    const binding={runId:claims.runId,attemptId:claims.attemptId,leaseId:claims.leaseId,fence:claims.fence};
    await this.live(binding);
    if(input.operation==='bootstrap')return Response.json(await this.control(binding,'bootstrap'));
    if(input.operation==='prepare' && typeof input.scenario==='string')
      return Response.json(await this.prepare(binding,input.scenario));
    if(['seed_thread','advance_head','move_without_review'].includes(String(input.operation))) {
      if(typeof input.scenario!=='string' || !await this.env.DB.prepare(`SELECT 1 FROM test_review_scenarios
        WHERE lease_id=? AND scenario_id=? AND state='ready'`).bind(binding.leaseId,input.scenario).first())
        return Response.json({error:'test_review_scenario_not_current',
          recovery:'Use the exact scenario ID returned by the latest prepare, including its suffix.'},{status:409});
      if(input.step!==undefined && input.step!==1 && input.step!==2)throw new Error('test_review_step_invalid');
      const fixture=await this.live(binding),operationId=`${input.scenario}-${input.operation}-${input.step??1}`;
      if(input.operation==='seed_thread')return Response.json(await this.provider(binding,{operation:'github.review',operationId,
        body:{commit_id:fixture.scope.candidateCommit,event:'COMMENT',body:'Scenario input: existing thread for a reply.',
          comments:[{path:'canary-review.md',line:2,side:'RIGHT',body:`Scenario ${input.scenario}: reply to this starting thread.`}]}}));
      if(input.operation==='advance_head')return Response.json(await this.provider(binding,{operation:'github.advance_fixture_head',operationId}));
      return Response.json(await this.provider(binding,{operation:'linear.move',operationId,issueId:fixture.issueId,stateId:fixture.profile.states.work}));
    }
    if(['inject','clear_injections','shorten_delivery_deadline'].includes(String(input.operation))) {
      if(typeof input.scenario!=='string' || !await this.env.DB.prepare(`SELECT 1 FROM test_review_scenarios
        WHERE lease_id=? AND scenario_id=? AND state='ready'`).bind(binding.leaseId,input.scenario).first())
        return Response.json({error:'test_review_scenario_not_current',
          recovery:'Use the exact scenario ID returned by the latest prepare, including its suffix.'},{status:409});
      if(input.operation==='shorten_delivery_deadline')
        return Response.json(await this.control(binding,'shorten_delivery_deadline',{scenario:input.scenario}));
      if(input.operation==='clear_injections') {
        await this.env.DB.prepare(`UPDATE test_review_fault_injections SET state='cleared',used_at=?
          WHERE lease_id=? AND scenario_id=? AND state='armed'`)
          .bind(new Date().toISOString(),binding.leaseId,input.scenario).run();
        return Response.json({cleared:true});
      }
      if(!sharedReviewFaultKinds.includes(input.kind as SharedReviewFaultKind))throw new Error('test_review_injection_invalid');
      const injectionId=crypto.randomUUID();
      await this.env.DB.prepare(`INSERT INTO test_review_fault_injections
        (injection_id,lease_id,scenario_id,kind,state,armed_at) VALUES (?,?,?,?,'armed',?)`)
        .bind(injectionId,binding.leaseId,input.scenario,input.kind,new Date().toISOString()).run();
      return Response.json({injectionId,synthetic:true,kind:input.kind});
    }
    if(input.operation==='evidence' && typeof input.scenario==='string') {
      await this.forward(binding);
      return Response.json({runtime:await this.control(binding,'evidence',{scenario:input.scenario}),
        provider:await this.provider(binding,{operation:'events'}),
        proof:await this.proofStatus(binding),
        labeledInjections:(await this.env.DB.prepare('SELECT * FROM test_review_fault_injections WHERE lease_id=? AND scenario_id=?')
          .bind(binding.leaseId,input.scenario).all()).results});
    }
    if(input.operation==='github.read')return Response.json(await this.provider(binding,{operation:'github.read',path:input.path??''}));
    if(input.operation==='linear.read')return Response.json(await this.provider(binding,{operation:'linear.read'}));
    throw new Error('test_review_fixture_operation_denied');
  }

  /** Read publication state without exposing private object keys or granting
   * the demo agent any control over the trusted sanitizer. */
  async proofStatus(binding:SharedTestReviewBinding) {
    await this.live(binding);
    return (await this.env.DB.prepare(`SELECT proof_id AS proofId,kind,
      classification,sanitizer_result AS sanitizerResult,
      CASE WHEN classification='public_safe' AND sanitizer_result='passed'
        THEN public_url ELSE NULL END AS publicUrl
      FROM test_proof_items WHERE run_id=? AND lease_id=? AND phase='first'
      ORDER BY proof_id`).bind(binding.runId,binding.leaseId).all()).results;
  }
}
