import type {CapabilityClaims} from './capability-auth.ts';
import {mintCapabilityToken} from './capability-auth.ts';
import type {LinearTestIssue} from './linear-capability.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';
import {SharedTestMarkerStore} from './shared-test-marker-store.ts';
import {markerIsStandalone,testIssueMarker} from './shared-test-marker.ts';

interface LeaseScope {
  run_id:string;
  attempt_id:string;
  task_id:string;
  team_id:string;
  repository:string;
  fence:number;
  state:string;
}

type LinearMarkerClient={
  readTestIssue(id:string):Promise<LinearTestIssue>;
  updateTestIssueDescription(id:string,description:string):Promise<LinearTestIssue>;
  testActorId():Promise<string>;
};

/** Agent input names only an expectation; all provider scope comes from D1. */
export class SharedTestMarkerAction {
  readonly db:D1Database;
  readonly linear:LinearMarkerClient;
  readonly markerKey:string;
  constructor(db:D1Database,linear:LinearMarkerClient,markerKey:string) {
    this.db=db;this.linear=linear;this.markerKey=markerKey;
  }

  private async scope(claims:CapabilityClaims):Promise<LeaseScope> {
    if (!claims.actions.includes('test_issue_marker_patch') ||
        !claims.leaseId || !claims.fence)
      throw new Error('shared_test_marker_capability_missing');
    await new SharedTestLeaseStore(this.db).assertWrite(claims.runId,
      claims.attemptId,claims.leaseId,claims.fence);
    const agent=await this.db.prepare(`SELECT 1 AS active FROM agent_attempts a
      JOIN orchestration_runs o ON o.run_id=a.run_id
      WHERE a.attempt_id=? AND a.run_id=? AND a.node_id='shared_test_demo'
        AND a.state='running' AND a.cleanup_state='pending'
        AND a.absolute_deadline>? AND o.current_node='shared_test_demo'
        AND o.status='active' AND o.issue_id=?`)
      .bind(claims.attemptId,claims.runId,new Date().toISOString(),claims.issueId)
      .first<{active:number}>();
    if (agent?.active!==1) throw new Error('shared_test_marker_agent_inactive');
    const lease=await this.db.prepare(`SELECT run_id,attempt_id,task_id,team_id,
      repository,fence,state FROM test_leases WHERE lease_id=?`)
      .bind(claims.leaseId).first<LeaseScope>();
    if (!lease || lease.run_id!==claims.runId ||
        lease.attempt_id!==claims.attemptId || lease.task_id!==claims.issueId ||
        lease.repository!==claims.repository || lease.fence!==claims.fence ||
        lease.state!=='active')
      throw new Error('shared_test_marker_scope_changed');
    return lease;
  }

  async handle(claims:CapabilityClaims,value:unknown):Promise<Response> {
    if (!value || typeof value!=='object' || Array.isArray(value))
      return Response.json({error:'invalid_test_marker_action'},{status:400});
    const request=value as Record<string,unknown>;
    if (Object.keys(request).sort().join(',')!=='action,expectationId,version' ||
        request.version!==1 ||
        (request.action!=='insert' && request.action!=='find') ||
        typeof request.expectationId!=='string' ||
        !/^[a-zA-Z0-9._:-]{8,120}$/.test(request.expectationId))
      return Response.json({error:'invalid_test_marker_action'},{status:400});
    const lease=await this.scope(claims);
    const subject={expectationId:request.expectationId,runId:claims.runId,
      leaseId:claims.leaseId!,taskId:lease.task_id,fence:claims.fence!};
    if (request.action==='insert') {
      const result=await new SharedTestMarkerStore(this.db,this.linear,this.markerKey)
        .insert({...subject,attemptId:claims.attemptId,teamId:lease.team_id});
      return Response.json({workId:result.workId,reconciled:result.reconciled});
    }
    const issue=await this.linear.readTestIssue(lease.task_id);
    if (issue.id!==lease.task_id || issue.teamId!==lease.team_id)
      throw new Error('test_issue_team_changed');
    const marker=await testIssueMarker(subject,this.markerKey);
    if (issue.description.includes(marker) && !markerIsStandalone(issue.description,marker))
      throw new Error('test_marker_ambiguous');
    return Response.json({present:markerIsStandalone(issue.description,marker)});
  }

  async grant(input:{runId:string;attemptId:string;leaseId:string;fence:number;
    repository:string;issueId:string},secret:string,now=new Date()):Promise<string> {
    await new SharedTestLeaseStore(this.db).assertWrite(input.runId,
      input.attemptId,input.leaseId,input.fence,now);
    // The Sandbox controller mints its capability while the attempt is
    // starting. Provider actions remain unavailable until it is running.
    const starting=await this.db.prepare(`SELECT 1 AS allowed FROM agent_attempts a
      JOIN orchestration_runs o ON o.run_id=a.run_id
      JOIN test_leases l ON l.run_id=a.run_id AND l.attempt_id=a.attempt_id
      WHERE a.attempt_id=? AND a.run_id=? AND a.node_id='shared_test_demo'
        AND a.state IN ('starting','running') AND a.cleanup_state='pending'
        AND a.absolute_deadline>? AND o.current_node='shared_test_demo'
        AND o.status='active' AND o.issue_id=?
        AND l.lease_id=? AND l.fence=? AND l.state='active'
        AND l.repository=? AND l.task_id=?`)
      .bind(input.attemptId,input.runId,now.toISOString(),input.issueId,
        input.leaseId,input.fence,input.repository,input.issueId)
      .first<{allowed:number}>();
    if (starting?.allowed!==1) throw new Error('shared_test_marker_agent_inactive');
    const claims:CapabilityClaims={version:1,issuer:'deos',
      audience:'sandbox-capabilities',runId:input.runId,attemptId:input.attemptId,
      leaseId:input.leaseId,fence:input.fence,repository:input.repository,
      issueId:input.issueId,actions:['github.clone_repository',
        'test_issue_marker_patch','test_app_browser'],changeId:null,
      planningBranch:null,expiresAt:Math.floor(now.getTime()/1000)+15*60};
    return mintCapabilityToken(claims,secret);
  }
}
