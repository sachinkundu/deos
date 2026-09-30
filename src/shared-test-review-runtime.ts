import {SharedTestResourceStore,type SharedTestResourcePlan} from './shared-test-resources.ts';
import {sharedTestReviewKey} from './shared-test-review-signing.ts';
import {sharedTestReviewFixture} from './shared-test-review-profile.ts';
import type {SharedTestReviewBinding} from './shared-test-review-provider.ts';
import {sharedTestReviewRuntimeWorker} from './shared-test-review-runtime-worker.ts';
import {sharedTestReviewControlSource} from './shared-test-review-control.ts';

interface Runtime extends SharedTestReviewBinding {
  candidateCommit:string;compiledSha256:string;workerName:string;workflowName:string;hostname:string;
}
type RuntimeEnv=Env & {IMPLEMENTATION_ENVIRONMENT_TOKEN?:string};
const sha=async(bytes:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(value=>value.toString(16).padStart(2,'0')).join('');
const json=(body:unknown):RequestInit=>({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

/** Deploy the actual candidate entrypoints with only the lease's stores and a
 * provider binding whose scope is fixed in Cloudflare service-binding props. */
export class SharedTestReviewRuntime {
  readonly env:RuntimeEnv;
  readonly request:typeof fetch;
  readonly resources:SharedTestResourceStore;
  constructor(env:RuntimeEnv,request:typeof fetch=globalThis.fetch.bind(globalThis)) {
    this.env=env;this.request=request;this.resources=new SharedTestResourceStore(env.DB);
  }
  private async api<T>(path:string,init:RequestInit={},missing=false):Promise<T|null> {
    const account=this.env.IMPLEMENTATION_ENVIRONMENT_ACCOUNT_ID,token=this.env.IMPLEMENTATION_ENVIRONMENT_TOKEN;
    if(!/^[a-f0-9]{32}$/.test(account) || !token)throw new Error('test_review_runtime_provider_missing');
    const headers=new Headers(init.headers);headers.set('Authorization',`Bearer ${token}`);
    const response=await this.request(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,
      {...init,headers,redirect:'manual',signal:AbortSignal.timeout(30_000)});
    if(missing&&response.status===404)return null;
    const raw=await response.text();
    if(!response.ok)throw new Error(`Cloudflare ${init.method??'GET'} ${path}: ${response.status}: ${raw.replaceAll(token,'[redacted]')}`);
    if(init.method==='DELETE' && !raw.trim())return null;
    const envelope=JSON.parse(raw) as {success?:boolean;result?:T;errors?:unknown};
    if(envelope.success!==true)throw new Error(`Cloudflare ${path}: ${JSON.stringify(envelope.errors).replaceAll(token,'[redacted]')}`);
    return envelope.result??null;
  }
  private async active(binding:SharedTestReviewBinding):Promise<string> {
    const row=await this.env.DB.prepare(`SELECT l.candidate_commit FROM test_environment e
      JOIN test_leases l ON l.lease_id=e.owner_lease_id WHERE e.site_id=1
        AND e.state='active' AND e.owner_run_id=? AND e.owner_lease_id=?
        AND e.fence=? AND e.heartbeat_due_at>? AND l.state='active'
        AND l.fence=e.fence AND l.attempt_id=?`)
      .bind(binding.runId,binding.leaseId,binding.fence,new Date().toISOString(),binding.attemptId)
      .first<{candidate_commit:string}>();
    if(!row || !/^[a-f0-9]{40}$/.test(row.candidate_commit))throw new Error('test_review_runtime_fenced');
    return row.candidate_commit;
  }
  private plan(runtime:Runtime,kind:'worker'|'workflow'):SharedTestResourcePlan {
    return {resourceId:`review-runtime-${kind}:${runtime.leaseId}`,runId:runtime.runId,
      leaseId:runtime.leaseId,fence:runtime.fence,kind:`review_runtime_${kind}`,
      providerKey:kind==='worker'?runtime.workerName:runtime.workflowName,
      workId:`review-runtime-${kind}:${runtime.leaseId}`};
  }
  private async settings(runtime:Runtime) {
    const settings=await this.api<{tags?:string[]}>(`/workers/scripts/${runtime.workerName}/settings`,{},true);
    if(settings && (!Array.isArray(settings.tags) ||
      ![`deos-review-lease:${runtime.leaseId}`,`deos-review-source:${runtime.candidateCommit}`,
        `deos-review-build:${runtime.compiledSha256}`].every(tag=>settings.tags!.includes(tag))))
      throw new Error('test_review_runtime_worker_identity_changed');
    return settings;
  }
  private async workflow(runtime:Runtime) {
    const result=await this.api<{script_name:string;class_name:string;name:string;is_deleted:number}>(
      `/workflows/${runtime.workflowName}`,{},true);
    if(result && (result.script_name!==runtime.workerName || result.class_name!=='DeosWorkflow' ||
        result.name!==runtime.workflowName))throw new Error('test_review_runtime_workflow_identity_changed');
    return result?.is_deleted?null:result;
  }
  private async domains(runtime:Runtime) {
    const all=await this.api<Array<{id:string;hostname:string;service:string;zone_id:string}>>('/workers/domains');
    if(!Array.isArray(all))throw new Error('test_review_runtime_domains_invalid');
    const found=all.filter(row=>row.hostname===runtime.hostname);
    if(found.length>1 || found.some(row=>row.service!==runtime.workerName || row.zone_id!==this.env.SHARED_TEST_ZONE_ID))
      throw new Error('test_review_runtime_domain_identity_changed');
    return found;
  }
  private async store(runtime:Runtime,kind:string,name:string) {
    const row=await this.env.DB.prepare(`SELECT remote_id FROM test_resources WHERE
      run_id=? AND lease_id=? AND kind=? AND provider_key=? AND plan_state='created'`)
      .bind(runtime.runId,runtime.leaseId,kind,name).first<{remote_id:string}>();
    if(!row?.remote_id)throw new Error(`test_review_runtime_store_missing:${kind}`);
    return row.remote_id;
  }
  async hasBuild(commit:string):Promise<boolean> {
    if(!/^[a-f0-9]{40}$/.test(commit))throw new Error('test_review_runtime_source_invalid');
    const prefix=`shared-test/review-runtimes/${commit}/`;
    const list=await this.env.ARTIFACTS.list({prefix,limit:2});
    if(list.truncated || list.objects.length>1)throw new Error('test_review_runtime_build_ambiguous');
    if(!list.objects.length)return false;
    if(!new RegExp(`^${prefix}([a-f0-9]{64})\\.js$`).test(list.objects[0].key))
      throw new Error('test_review_runtime_build_key_invalid');
    return true;
  }
  async prepare(input:SharedTestReviewBinding):Promise<Runtime> {
    const binding={runId:input.runId,attemptId:input.attemptId,leaseId:input.leaseId,fence:input.fence};
    if(!/^[a-f0-9]{64}$/.test(binding.leaseId))throw new Error('test_review_runtime_lease_invalid');
    const commit=await this.active(binding),suffix=binding.leaseId.slice(0,32);
    const prefix=`shared-test/review-runtimes/${commit}/`;
    const list=await this.env.ARTIFACTS.list({prefix,limit:2});
    if(list.truncated || list.objects.length!==1)throw new Error('test_review_runtime_build_missing_or_ambiguous');
    const match=new RegExp(`^${prefix}([a-f0-9]{64})\\.js$`).exec(list.objects[0].key);
    if(!match)throw new Error('test_review_runtime_build_key_invalid');
    const object=await this.env.ARTIFACTS.get(list.objects[0].key);
    if(!object || object.size<1 || object.size>10_000_000)throw new Error('test_review_runtime_build_size_invalid');
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(await sha(bytes)!==match[1])throw new Error('test_review_runtime_build_changed');
    const runtime:Runtime={...binding,candidateCommit:commit,compiledSha256:match[1],
      workerName:`deos-test-review-${suffix}`,workflowName:`deos-test-review-${suffix}`,
      hostname:`review-${suffix}.apps.deos-test.voxdez.com`};
    await this.env.DB.prepare(`INSERT OR IGNORE INTO test_review_runtimes
      (lease_id,run_id,attempt_id,fence,candidate_commit,compiled_sha256,worker_name,workflow_name,hostname)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(binding.leaseId,binding.runId,binding.attemptId,binding.fence,
        commit,runtime.compiledSha256,runtime.workerName,runtime.workflowName,runtime.hostname).run();
    const saved=await this.saved(binding.leaseId);
    if((Object.keys(runtime) as Array<keyof Runtime>).some(key=>saved[key]!==runtime[key]))
      throw new Error('test_review_runtime_subject_changed');
    const fixture=await sharedTestReviewFixture(this.env.DB,{run_id:binding.runId,attempt_id:binding.attemptId});
    const fixtureRecord=await this.env.DB.prepare('SELECT metadata_json FROM test_review_fixtures WHERE resource_id=?')
      .bind(fixture.resourceId).first<{metadata_json:string}>();
    const fixtureMetadata=JSON.parse(fixtureRecord!.metadata_json) as {issueUrl:string};
    const reviewer=await this.env.DB.prepare('SELECT allowed_linear_user_id FROM orchestration_runs WHERE run_id=?')
      .bind(binding.runId).first<{allowed_linear_user_id:string}>();
    if(!reviewer?.allowed_linear_user_id)throw new Error('test_review_runtime_linear_identity_missing');
    const workerPlan=this.plan(runtime,'worker'),workflowPlan=this.plan(runtime,'workflow');
    const workerRow=await this.resources.beginCreate(workerPlan);
    await this.resources.beginCreate(workflowPlan);
    if(!await this.settings(runtime)) {
      if(workerRow.plan_state==='created')throw new Error('test_review_runtime_worker_disappeared');
      const database=await this.store(runtime,'d1_database',`deos-test-portal-db-${suffix}`);
      const artifacts=await this.store(runtime,'r2_bucket',`deos-test-portal-artifacts-${suffix}`);
      const variables={TEST_CANONICAL_HOST:runtime.hostname,TEST_SOURCE_SHA:commit,
        TEST_COMPILED_SHA256:runtime.compiledSha256,TEST_LEASE_ID:runtime.leaseId,
        TEST_REVIEW_FIXTURE:JSON.stringify({...fixture,linearUserId:reviewer.allowed_linear_user_id,
          issueUrl:fixtureMetadata.issueUrl,issueKey:new URL(fixtureMetadata.issueUrl).pathname.split('/')[3]}),
        GITHUB_API_URL:this.env.GITHUB_API_URL,LINEAR_API_URL:this.env.LINEAR_API_URL,
        LINEAR_APP_ACCESS_TOKEN:'lease-provider-proxy',LINEAR_APP_ACTOR_ID:this.env.LINEAR_APP_ACTOR_ID,
        LINEAR_TEAM_ID:fixture.profile.teamId,LINEAR_HUMAN_APPROVAL_STATE_ID:fixture.profile.states.review,
        LINEAR_WORK_STATE_ID:fixture.profile.states.work,LINEAR_START_STATE_ID:fixture.profile.states.work,
        LINEAR_APPROVAL_STATE_NAMES:'Merging',LINEAR_REJECTION_STATE_NAMES:'In Progress',
        ROUTE_ADMIN_ALLOWED_EMAIL:'reviewer@deos-test.invalid'};
      const bindings:unknown[]=[...Object.entries(variables).map(([name,text])=>({type:'plain_text',name,text})),
        {type:'secret_text',name:'REVIEW_CONTINUATION_SECRET',text:await sharedTestReviewKey(
          this.env.TEST_MARKER_KEY_V1,runtime.leaseId,runtime.fence)},
        {type:'d1',name:'DB',id:database},{type:'r2_bucket',name:'ARTIFACTS',bucket_name:artifacts},
        {type:'version_metadata',name:'CF_VERSION_METADATA'},
        {type:'workflow',name:'ORCHESTRATION_WORKFLOW',workflow_name:runtime.workflowName,class_name:'DeosWorkflow'},
        {type:'service',name:'REVIEW_PROVIDER_TRANSPORT',service:'deos-queue-consumer-ts',
          entrypoint:'SharedTestReviewProvider',props:binding}];
      const form=new FormData();
      form.set('metadata',JSON.stringify({main_module:'edge.js',compatibility_date:'2026-09-01',
        compatibility_flags:['nodejs_compat'],bindings,tags:[`deos-review-lease:${runtime.leaseId}`,
          `deos-review-source:${commit}`,`deos-review-build:${runtime.compiledSha256}`]}));
      form.set('edge.js',new Blob([sharedTestReviewRuntimeWorker],{type:'application/javascript+module'}),'edge.js');
      form.set('test-control.js',new Blob([sharedTestReviewControlSource],{type:'application/javascript+module'}),'test-control.js');
      form.set('candidate-runtime.js',new Blob([bytes],{type:'application/javascript+module'}),'candidate-runtime.js');
      await this.active(binding);
      await this.api(`/workers/scripts/${runtime.workerName}`,{method:'PUT',body:form});
    }
    if(!await this.settings(runtime))throw new Error('test_review_runtime_worker_unconfirmed');
    await this.resources.created(workerPlan,runtime.workerName);
    if(!await this.workflow(runtime)) {
      await this.active(binding);
      await this.api(`/workflows/${runtime.workflowName}`,json({script_name:runtime.workerName,class_name:'DeosWorkflow'}));
    }
    if(!await this.workflow(runtime))throw new Error('test_review_runtime_workflow_unconfirmed');
    await this.resources.created(workflowPlan,runtime.workflowName);
    if(!(await this.domains(runtime)).length) {
      await this.active(binding);
      await this.api('/workers/domains',json({hostname:runtime.hostname,service:runtime.workerName,
        zone_id:this.env.SHARED_TEST_ZONE_ID}));
    }
    if((await this.domains(runtime)).length!==1)throw new Error('test_review_runtime_domain_unconfirmed');
    let version:string|undefined;
    for(let read=0;read<2;read++) {
      const response=await this.request(`https://${runtime.hostname}/api/version`,{
        headers:{'CF-Access-Client-Id':this.env.TEST_APP_SERVICE_CLIENT_ID,
          'CF-Access-Client-Secret':this.env.TEST_APP_SERVICE_CLIENT_SECRET},redirect:'manual',
        signal:AbortSignal.timeout(20_000)});
      if(!response.ok)throw new Error(`test_review_runtime_version_read_failed:${response.status}:${await response.text()}`);
      const value=await response.json() as {sourceSha:string;compiledSha256:string;leaseId:string;versionId:string};
      if(value.sourceSha!==commit || value.compiledSha256!==runtime.compiledSha256 ||
          value.leaseId!==runtime.leaseId || !value.versionId || (version&&version!==value.versionId))
        throw new Error('test_review_runtime_version_changed');
      version=value.versionId;
    }
    await this.active(binding);
    await this.env.DB.prepare(`UPDATE test_review_runtimes SET version_id=?,verified_at=?
      WHERE lease_id=? AND candidate_commit=? AND compiled_sha256=?`)
      .bind(version!,new Date().toISOString(),runtime.leaseId,commit,runtime.compiledSha256).run();
    return runtime;
  }
  async saved(leaseId:string):Promise<Runtime> {
    const row=await this.env.DB.prepare(`SELECT run_id AS runId,attempt_id AS attemptId,lease_id AS leaseId,
      fence,candidate_commit AS candidateCommit,compiled_sha256 AS compiledSha256,
      worker_name AS workerName,workflow_name AS workflowName,hostname FROM test_review_runtimes WHERE lease_id=?`)
      .bind(leaseId).first<Runtime>();
    if(!row)throw new Error('test_review_runtime_missing');
    return row;
  }
  async cleanup(input:{runId:string;leaseId:string;cleanupFence:number}) {
    const exists=await this.env.DB.prepare('SELECT 1 AS found FROM test_review_runtimes WHERE lease_id=?')
      .bind(input.leaseId).first<{found:number}>();
    if(!exists)return;
    const runtime=await this.saved(input.leaseId);
    if(runtime.runId!==input.runId)throw new Error('test_review_runtime_cleanup_owner_changed');
    const owner=await this.env.DB.prepare(`SELECT 1 AS allowed FROM test_environment
      WHERE site_id=1 AND owner_run_id=? AND owner_lease_id=? AND fence=?
        AND state IN ('quiescing','cleaning')`)
      .bind(input.runId,input.leaseId,input.cleanupFence).first<{allowed:number}>();
    if(owner?.allowed!==1)throw new Error('test_review_runtime_cleanup_fenced');
    for(const kind of ['workflow','worker'] as const) {
      const plan=this.plan(runtime,kind),scope={resourceId:plan.resourceId,runId:input.runId,
        leaseId:input.leaseId,fence:input.cleanupFence};
      const guard=async()=>{await this.resources.cleanupScope(scope);};
      const planned=await this.env.DB.prepare('SELECT 1 AS found FROM test_resources WHERE resource_id=?')
        .bind(plan.resourceId).first<{found:number}>();
      if(!planned) {
        // A crash can save the runtime identity before either create plan. A
        // resource without its plan is never ours to delete.
        for(let read=0;read<2;read++) {
          const present=kind==='workflow'?await this.workflow(runtime)
            :await this.settings(runtime)||(await this.domains(runtime)).length;
          if(present)throw new Error(`test_review_runtime_unplanned_${kind}_present`);
        }
        continue;
      }
      const ledger=await this.resources.cleanupScope(scope);
      if(kind==='workflow') {
        if(await this.workflow(runtime)) {
          if(ledger.plan_state==='absent')throw new Error('test_review_runtime_workflow_reappeared');
          await guard();await this.api(`/workflows/${runtime.workflowName}`,{method:'DELETE'});
        }
        for(let read=0;read<2;read++)if(await this.workflow(runtime))
          throw new Error('test_review_runtime_workflow_still_present');
      } else {
        const settings=await this.settings(runtime);
        if(ledger.plan_state==='absent' && (settings || (await this.domains(runtime)).length))
          throw new Error('test_review_runtime_worker_reappeared');
        for(const domain of await this.domains(runtime)) {
          await guard();await this.api(`/workers/domains/${domain.id}`,{method:'DELETE'});
        }
        if(settings) {await guard();await this.api(`/workers/scripts/${runtime.workerName}`,{method:'DELETE'});}
        for(let read=0;read<2;read++)if(await this.settings(runtime) || (await this.domains(runtime)).length)
          throw new Error('test_review_runtime_worker_still_present');
      }
      await this.resources.absent({...scope,removeWorkId:`review-runtime-${kind}-remove:${runtime.leaseId}`,
        providerAbsent:true});
    }
    await this.env.DB.prepare('UPDATE test_review_runtimes SET absent_at=? WHERE lease_id=?')
      .bind(new Date().toISOString(),runtime.leaseId).run();
  }
}
