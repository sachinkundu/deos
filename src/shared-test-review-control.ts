/** Trusted fixture setup around the exact candidate module. Only initial test
 * inputs are seeded. Reviews, permits, provider receipts, choices and traversals
 * are written by the candidate. This module is absent from production apps. */
export const sharedTestReviewControlSource=String.raw`
import {D1OrchestrationStore,loadWorkflowDefinition} from './candidate-runtime.js';
const bytes=value=>new TextEncoder().encode(value);
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const rows=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
const definition=()=>loadWorkflowDefinition(JSON.stringify({
  apiVersion:'deos.dev/v1alpha1',kind:'DeliveryWorkflow',
  metadata:{name:'lease-review-fixture',version:17},
  spec:{start:'review',execution:{attemptTimeout:'24h',heartbeatTimeout:'5m',codexSandboxMode:'danger-full-access'},jobs:{},
    nodes:{review:{type:'human_gate',linearState:'Human Review',
      decisions:{revision_requested:'In Progress',merge_authorized:'Merging',canceled:'Canceled'},
      edges:{revision_requested:'edited',merge_authorized:'approved',canceled:'canceled'}},
      edited:{type:'wait',deosStatus:'awaiting_capability',resumeEvent:{type:'linear.issue.state_changed',actorType:'user',toState:'Fixture finished'},cancelEvent:{type:'linear.issue.state_changed',actorType:'user',toState:'Canceled'},edges:{received:'canceled',canceled:'canceled'}},
      approved:{type:'wait',deosStatus:'awaiting_capability',resumeEvent:{type:'linear.issue.state_changed',actorType:'user',toState:'Fixture finished'},cancelEvent:{type:'linear.issue.state_changed',actorType:'user',toState:'Canceled'},edges:{received:'canceled',canceled:'canceled'}},
      canceled:{type:'terminal',deosStatus:'canceled',executorAction:'return'}}}
}),{prompts:{},schemas:{}});

async function evidence(env,runId) {
  const db=env.DB;
  return {claim:'Observed lease database facts; fixture setup is not review proof.',
    accounts:await rows(db,'SELECT project_id,policy_version,access_account,github_user_id,linear_user_id,status,route_revision FROM project_bettaview_accounts'),
    accountAudit:await rows(db,'SELECT audit_id,project_id,policy_version,event,safe_facts_json,created_at FROM bettaview_account_audit ORDER BY created_at,audit_id'),
    runs:await rows(db,'SELECT run_id,status,current_node,current_visit_sequence,frozen_access_account,frozen_github_user_id,frozen_linear_user_id,bettaview_account_policy_version,workflow_instance_id FROM orchestration_runs WHERE run_id=?',runId),
    gates:await rows(db,'SELECT * FROM human_gate_visits WHERE run_id=?',runId),
    intents:await rows(db,'SELECT * FROM review_intents WHERE run_id=?',runId),
    parts:await rows(db,'SELECT p.* FROM review_parts p JOIN review_intents r ON r.review_id=p.review_id WHERE r.run_id=?',runId),
    attempts:await rows(db,'SELECT a.* FROM review_attempts a JOIN review_intents r ON r.review_id=a.review_id WHERE r.run_id=?',runId),
    prepareFaults:await rows(db,"SELECT error_id,message AS public_code,occurred_at FROM workflow_errors WHERE run_id=? AND step_name='review.prepare' AND message IN ('page_identity_mismatch','identity_mismatch','invalid_service_assertion','expired_service_assertion','replayed_service_assertion') ORDER BY occurred_at,error_id",runId),
    idClashes:await rows(db,"SELECT f.fault_id,f.review_id,f.public_code,json_extract(f.safe_act_facts_json,'$.savedDigest') AS savedDigest,json_extract(f.safe_act_facts_json,'$.receivedDigest') AS receivedDigest FROM review_faults f JOIN review_intents r ON r.review_id=f.review_id WHERE r.run_id=? AND f.public_code='id_clash' ORDER BY f.created_at,f.fault_id",runId),
    leases:await rows(db,'SELECT a.* FROM review_continuation_leases a JOIN review_intents r ON r.review_id=a.review_id WHERE r.run_id=?',runId),
    inbox:await rows(db,'SELECT * FROM workflow_event_inbox WHERE run_id=?',runId),
    transitions:await rows(db,'SELECT * FROM workflow_transitions_v2 WHERE run_id=?',runId),
    repairs:await rows(db,'SELECT x.* FROM review_repairs x JOIN review_intents r ON r.review_id=x.review_id WHERE r.run_id=?',runId),
    opsItems:await rows(db,'SELECT x.* FROM review_ops_items x JOIN review_intents r ON r.review_id=x.review_id WHERE r.run_id=?',runId),
    operations:await rows(db,'SELECT * FROM provider_operations WHERE run_id=?',runId),
  };
}

export async function control(request,env) {
  if(request.method!=='POST')return new Response('method not allowed',{status:405});
  const raw=await request.text();
  if(raw.length>100000)return new Response('too large',{status:413});
  const signature=request.headers.get('X-Deos-Test-Control');
  if(!signature || !/^[a-f0-9]{64}$/.test(signature))return new Response('unauthorized',{status:401});
  const key=await crypto.subtle.importKey('raw',bytes(env.REVIEW_CONTINUATION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const valid=await crypto.subtle.verify('HMAC',key,Uint8Array.from(signature.match(/../g),s=>parseInt(s,16)),bytes('lease-test-control-v1:'+raw));
  if(!valid)return new Response('unauthorized',{status:401});
  await env.REVIEW_PROVIDER_TRANSPORT.assertActive();
  const value=JSON.parse(raw);
  if(value.leaseId!==env.TEST_LEASE_ID || !Number.isSafeInteger(value.at) || Math.abs(Date.now()-value.at)>60000 ||
      typeof value.nonce!=='string' || !/^[a-f0-9-]{36}$/.test(value.nonce))throw new Error('test_control_subject_invalid');
  const db=env.DB,f=JSON.parse(env.TEST_REVIEW_FIXTURE),now=new Date().toISOString();
  await db.exec('CREATE TABLE IF NOT EXISTS lease_test_control_nonces(nonce TEXT PRIMARY KEY,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS lease_test_scenarios(scenario_id TEXT PRIMARY KEY,run_id TEXT NOT NULL,created_at TEXT NOT NULL,archived_key TEXT);');
  await db.prepare('INSERT INTO lease_test_control_nonces VALUES (?,?)').bind(value.nonce,now).run();
  const spec=await definition();
  if(value.method==='bootstrap') {
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO workflow_definitions (definition_id,version,project_id,name,canonical_json,digest,enabled_at,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(spec.name,spec.version,f.profile.projectId,'Disposable review fixture',JSON.stringify(spec),spec.digest,now,now),
      db.prepare('INSERT OR IGNORE INTO project_workflow_policies (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,human_gate_state_id,dispatch_enabled,updated_at,linear_project_name,github_installation_id,route_revision,route_digest,allowed_access_email,allowed_linear_user_id) VALUES (?,?,?,?,?,?,?,1,?,?,?,?,?,?,?)').bind(f.profile.projectId,spec.name,spec.version,spec.digest,f.scope.repository,'Todo',f.profile.states.review,now,'Disposable review fixture','lease-provider-proxy',1,await digest(JSON.stringify(f.profile)),'reviewer@deos-test.invalid',f.linearUserId),
      db.prepare('INSERT OR IGNORE INTO linear_issue_index (issue_id,project_id,issue_key,title,linear_url,source_delivery_id,observed_at) VALUES (?,?,?,?,?,?,?)').bind(f.issueId,f.profile.projectId,f.issueKey,'Disposable review scenario',f.issueUrl,'fixture-input:'+env.TEST_LEASE_ID,now),
    ]);
    return Response.json({ready:true,projectId:f.profile.projectId,routeRevision:1,linearUserId:f.linearUserId,githubUserId:f.githubUserId});
  }
  const scenario=typeof value.scenario==='string'&&/^s(?:0[1-9]|1[0-2])(?:-[a-z0-9-]{1,40})?$/.test(value.scenario)?value.scenario:null;
  if(!scenario)throw new Error('test_control_scenario_invalid');
  let saved=await db.prepare('SELECT * FROM lease_test_scenarios WHERE scenario_id=?').bind(scenario).first();
  if(value.method==='prepare') {
    if(saved)return Response.json({scenario,runId:saved.run_id,evidence:await evidence(env,saved.run_id)});
    if(!/^s01(?:-|$)/.test(scenario) && !await db.prepare("SELECT 1 AS ready FROM project_bettaview_accounts WHERE project_id=? AND status='current'").bind(f.profile.projectId).first())
      throw new Error('test_review_account_not_connected: complete the visible Settings account form before preparing review scenarios');
    const active=await db.prepare('SELECT s.* FROM lease_test_scenarios s JOIN orchestration_runs r ON r.run_id=s.run_id WHERE s.archived_key IS NULL ORDER BY s.created_at DESC LIMIT 1').first();
    if(active) {
      const original=await evidence(env,active.run_id),text=JSON.stringify(original);
      const archiveKey='test-scenarios/'+active.scenario_id+'/'+await digest(text)+'.json';
      await env.ARTIFACTS.put(archiveKey,text);
      if(await (await env.ARTIFACTS.get(archiveKey)).text()!==text)throw new Error('test_scenario_archive_changed');
      const run=await new D1OrchestrationStore(db).findRun(active.run_id);
      if(!['succeeded','failed','canceled','blocked'].includes(run.status)) {
        const instance=await env.ORCHESTRATION_WORKFLOW.get(run.workflow_instance_id);
        const state=await instance.status();
        if(!['complete','errored','terminated'].includes(state.status))await instance.terminate();
        await db.prepare("UPDATE orchestration_runs SET status='canceled',terminal_at=?,updated_at=? WHERE run_id=?").bind(now,now,active.run_id).run();
      }
      await db.prepare('UPDATE lease_test_scenarios SET archived_key=? WHERE scenario_id=?').bind(archiveKey,active.scenario_id).run();
      // The single disposable PR now displays the new scenario. Historical run
      // facts remain, and the prior projection was captured above before reset.
      await db.prepare('DELETE FROM run_work_products WHERE run_id=?').bind(active.run_id).run();
    }
    const store=new D1OrchestrationStore(db),policy=await store.findPolicy(f.profile.projectId);
    const allocated=await store.allocateRun({projectId:f.profile.projectId,issueId:f.issueId,definition:spec,
      selection:{kind:'default',value:null,labelName:null,reason:'label_absent',evidenceJson:'{}',deliveryId:'fixture:'+scenario,observedAt:now,providerDigest:await digest(scenario)},
      sandboxTier:{tier:'basic',source:'legacy_basic',policy:'legacy-basic-v1'},routeRevision:policy.route_revision,routeDigest:policy.route_digest,now});
    if(!allocated?.created)throw new Error('test_scenario_run_not_created');
    const run=allocated.run;
    const pull=value.pull;
    if(pull?.number!==f.scope.pullRequestNumber || pull.base?.repo?.full_name!==f.scope.repository ||
        pull.head?.ref!==f.scope.branch || !/^[a-f0-9]{40}$/.test(pull.head?.sha??'') || pull.state!=='open')throw new Error('test_scenario_pull_changed');
    const inputDigest=await digest(JSON.stringify(pull)),operation='fixture-input:'+scenario;
    await db.batch([
      db.prepare("INSERT INTO provider_operations (operation_id,run_id,capability,action,sanitized_target,request_digest,state,provider_resource_id,started_at,updated_at,completed_at) VALUES (?,?,'fixture_input','read_existing_pull',?,?,'succeeded',?,?,?,?)").bind(operation,run.run_id,pull.html_url,inputDigest,String(pull.id),now,now,now),
      db.prepare('INSERT INTO run_work_products (run_id,repository,base_branch,remote_branch,change_id,pull_request_database_id,pull_request_number,pull_request_url,head_sha,planning_manifest_digest,planning_manifest_json,latest_publication_operation_id,created_at,updated_at) VALUES (?,?,\'main\',?,?,?,?,?,?,?,?,?,?,?)').bind(run.run_id,f.scope.repository,f.scope.branch,'lease-review-'+scenario,String(pull.id),pull.number,pull.html_url,pull.head.sha,inputDigest,JSON.stringify({fixtureInput:pull}),operation,now,now),
      db.prepare("INSERT INTO human_gate_visits (run_id,visit_sequence,node_id,gate_kind,work_type,work_product_kind,round,state,repository,pull_request_database_id,pull_request_number,pull_request_url,head_branch,base_branch,approved_head_sha,created_at) VALUES (?,1,'review','plan','proposal_and_specs','planning',1,'open',?,?,?,?,?,'main',?,?)").bind(run.run_id,f.scope.repository,String(pull.id),pull.number,pull.html_url,f.scope.branch,pull.head.sha,now),
      db.prepare("UPDATE orchestration_runs SET status='awaiting_human' WHERE run_id=?").bind(run.run_id),
      db.prepare('INSERT INTO lease_test_scenarios (scenario_id,run_id,created_at) VALUES (?,?,?)').bind(scenario,run.run_id,now),
    ]);
    await env.ORCHESTRATION_WORKFLOW.create({id:run.workflow_instance_id,params:{runId:run.run_id}});
    return Response.json({scenario,runId:run.run_id,workflowInstanceId:run.workflow_instance_id,evidence:await evidence(env,run.run_id)});
  }
  if(!saved)throw new Error('test_control_scenario_missing');
  if(value.method==='evidence')return Response.json(await evidence(env,saved.run_id));
  if(value.method==='shorten_delivery_deadline') {
    const changed=await db.prepare("UPDATE review_intents SET linear_delivery_deadline=? WHERE run_id=? AND outcome='active' AND linear_status='awaiting_delivery'").bind(new Date(Date.now()-1000).toISOString(),saved.run_id).run();
    if(changed.meta.changes!==1)throw new Error('test_deadline_requires_one_pending_delivery');
    return Response.json({synthetic:true,changedInput:'delivery deadline shortened in the disposable database',instructions:'Read the real app status to exercise its deadline decision.'});
  }
  if(value.method==='delivery') {
    const e=value.event;
    if(e?.issueId!==f.issueId || typeof e.deliveryId!=='string' || !/^[a-f0-9]{64}$/.test(e.payloadDigest??'') ||
        !e.actorId || !e.providerTime || !e.receivedAt || !Object.values(f.profile.states).includes(e.toStateId))throw new Error('test_control_delivery_invalid');
    const run=await new D1OrchestrationStore(db).findRun(saved.run_id);
    if(e.receivedAt<saved.created_at)throw new Error('test_control_delivery_predates_scenario');
    const names={[f.profile.states.review]:'Human Review',[f.profile.states.work]:'In Progress',[f.profile.states.merge]:'Merging',[f.profile.states.canceled]:'Canceled'};
    await db.prepare("INSERT OR IGNORE INTO workflow_event_inbox (delivery_id,run_id,correlation_id,event_kind,actor_id,actor_type,provider_time,from_state_id,from_state_name,to_state_id,to_state_name,payload_digest,state,created_at) VALUES (?,?,?,'Issue.update',?,?,?,?,?,?,?,?,'pending',?)").bind(e.deliveryId,run.run_id,run.correlation_id,e.actorId,e.actorType,e.providerTime,e.fromStateId,names[e.fromStateId]??null,e.toStateId,names[e.toStateId],e.payloadDigest,e.receivedAt).run();
    if(['succeeded','failed','canceled','blocked'].includes(run.status))return Response.json({deliveryId:e.deliveryId,stored:true,wake:'workflow_finished'});
    const instance=await env.ORCHESTRATION_WORKFLOW.get(run.workflow_instance_id);
    await instance.sendEvent({type:'linear-event',payload:{deliveryId:e.deliveryId}});
    return Response.json({deliveryId:e.deliveryId,forwarded:true});
  }
  throw new Error('test_control_method_denied');
}
`;
