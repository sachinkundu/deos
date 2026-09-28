import assert from 'node:assert/strict';
import test from 'node:test';
import {ImplementationTestBucket,ImplementationTestDatabase} from './helpers/implementation-fixture.ts';
import {SharedTestRunHandoff} from '../src/shared-test-run-handoff.ts';
import {implementationPolicy} from '../src/implementation-contract.ts';
import type {ImplementationInput,ImplementationRun} from '../src/implementation-store.ts';
import type {OrchestrationRunRecord} from '../src/orchestration-store.ts';
import type {LoadedWorkflowDefinition} from '../src/workflow-definition.ts';

test('guarded handoff atomically creates one new run at the test decision and retains source failure',async()=>{
  const db=new ImplementationTestDatabase(),bucket=new ImplementationTestBucket();
  const sourceId='workflow:project:issue:run:1',targetId='workflow:project:issue:run:2';
  const now='2026-09-28T10:00:00.000Z';
  try {
    for(const [version,digest] of [[43,'a'.repeat(64)],[44,'b'.repeat(64)]] as const)
      db.sqlite.prepare(`INSERT INTO workflow_definitions
        (definition_id,version,project_id,name,canonical_json,digest,created_at)
        VALUES ('implementation',?,'project','implementation','{}',?,?)`)
        .run(version,digest,now);
    db.sqlite.prepare(`INSERT INTO orchestration_runs
      (run_id,correlation_id,run_sequence,project_id,issue_id,definition_id,
       definition_version,definition_digest,workflow_instance_id,current_node,
       current_visit_sequence,status,terminal_cause,allowed_linear_user_id,
       human_binding_revision,created_at,updated_at)
      VALUES (?,?,1,'project','issue','implementation',43,?,
        'wf-v1-source','implementation_clarification_wait',91,'failed',
        'workflow_executor_timeout','human',1,?,?)`)
      .run(sourceId,'workflow:project:issue','a'.repeat(64),now,now);
    const source=db.sqlite.prepare('SELECT * FROM orchestration_runs WHERE run_id=?')
      .get(sourceId) as unknown as OrchestrationRunRecord;
    const work={linear_identifier:'SAC-182',change_id:'sac-182',
      approved_design_sha:'c'.repeat(40),branch:'deos/agent/SAC-182/run-1',
      allowed_linear_user_id:'human',human_binding_revision:1,
      approved_files_json:'[]',requirements_json:'{"kinds":[],"reasons":[],"blockedProviders":[]}',
      pr_number:137,pr_url:'https://github.com/sachinkundu/deos/pull/137',
    } as ImplementationRun;
    const approved={version:1,runId:sourceId,repository:'sachinkundu/deos',
      change:'sac-182',branch:work.branch,approvedDesignSha:work.approved_design_sha,
      testedBaseSha:'d'.repeat(40),policy:implementationPolicy,approvedFiles:[],
      issue:{id:'issue'},receipts:{},requirements:JSON.parse(work.requirements_json),
    } as ImplementationInput;
    const plan={sourceRunId:sourceId,targetRunId:targetId,
      sourceWorkflowInstanceId:'wf-v1-source',targetWorkflowInstanceId:'wf-v1-target',
      sourceDefinitionDigest:'a'.repeat(64),targetDefinitionDigest:'b'.repeat(64),
      sourceCandidateCommit:'e'.repeat(40),targetCandidateCommit:'f'.repeat(40),
      sourcePatchSha256:'1'.repeat(64),targetPatchSha256:'2'.repeat(64),
      sourceCandidateSha256:'3'.repeat(64),targetCandidateSha256:'4'.repeat(64),
      targetBaseCommit:'5'.repeat(40),targetTreeSha:'6'.repeat(40),
      pullRequestNumber:137,planningMergeCommit:'7'.repeat(40),
      designMergeCommit:'c'.repeat(40),issueId:'issue',projectId:'project',
      branch:work.branch,humanUserId:'human',humanBindingRevision:1,
      targetSequence:2,sourceErrorId:'error',
      targetPatchKey:`implementation/${targetId}/2/patch.diff`,
      targetCandidateKey:`implementation/${targetId}/4/candidate.json`};
    const controller=new SharedTestRunHandoff({DB:db,ARTIFACTS:bucket} as unknown as Env,
      {name:'implementation',version:44,digest:'b'.repeat(64),
        implementationPolicy} as LoadedWorkflowDefinition);
    await (controller as unknown as {admit:(...args:unknown[])=>Promise<void>})
      .admit(plan,source,work,approved,JSON.stringify(plan),'8'.repeat(64));
    const old=db.sqlite.prepare('SELECT status,terminal_cause FROM orchestration_runs WHERE run_id=?')
      .get(sourceId) as {status:string;terminal_cause:string};
    const next=db.sqlite.prepare(`SELECT current_node,status,definition_version,
      selection_value FROM orchestration_runs WHERE run_id=?`)
      .get(targetId) as {current_node:string;status:string;definition_version:number;selection_value:string};
    const candidate=db.sqlite.prepare(`SELECT pr_number,pr_head_sha,patch_sha,status
      FROM implementation_runs WHERE run_id=?`).get(targetId) as
      {pr_number:number;pr_head_sha:string;patch_sha:string;status:string};
    assert.deepEqual({...old},{status:'failed',terminal_cause:'workflow_executor_timeout'});
    assert.deepEqual({...next},{current_node:'shared_test_decide',status:'pending_dispatch',
      definition_version:44,selection_value:'guarded_handoff'});
    assert.deepEqual({...candidate},{pr_number:137,pr_head_sha:'f'.repeat(40),
      patch_sha:'2'.repeat(64),status:'test_pending'});
    assert.equal(db.sqlite.prepare(`SELECT state FROM shared_test_run_handoffs
      WHERE source_run_id=?`).get(sourceId)?.state,'admitted');
  }finally{db.close();}
});
