import {SharedTestDecisionStore} from './shared-test-decision-store.ts';

const sha40=/^[a-f0-9]{40}$/;

interface Decision {
  manifest_id:string;
  manifest_revision:number;
  choice:'test_required'|'test_not_required';
}

interface SavedLink {
  release_commit_sha:string;
  run_id:string;
  candidate_commit_sha:string;
  tested_base_sha:string;
  tree_sha:string;
  patch_sha256:string;
  manifest_id:string;
  manifest_revision:number;
  choice:string;
  pull_request_number:number;
}

export class SharedTestReleaseLinkStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async record(input:{runId:string;candidateCommit:string;releaseCommit:string;
    testedBase:string;treeSha:string;patchSha256:string;pullRequestNumber:number;
    mergeParents:readonly string[];mergeTreeSha:string},at=new Date()):Promise<boolean> {
    if (![input.candidateCommit,input.releaseCommit,input.testedBase,input.treeSha,
        input.mergeTreeSha].every(sha=>sha40.test(sha)) ||
        !/^[a-f0-9]{64}$/.test(input.patchSha256) || !input.runId ||
        !Number.isSafeInteger(input.pullRequestNumber) || input.pullRequestNumber<1)
      throw new Error('invalid_test_release_subject');
    if (input.mergeParents.length!==2 || input.mergeParents[0]!==input.testedBase ||
        input.mergeParents[1]!==input.candidateCommit ||
        input.mergeTreeSha!==input.treeSha)
      throw new Error('test_release_merge_tree_or_parents_changed');
    const decision=await this.db.prepare(`SELECT manifest_id,manifest_revision,choice
      FROM test_task_decisions WHERE run_id=? AND candidate_commit=? AND patch_sha256=?
      ORDER BY manifest_revision DESC LIMIT 1`)
      .bind(input.runId,input.candidateCommit,input.patchSha256).first<Decision>();
    if (!decision) return false;
    await this.db.prepare(`INSERT OR IGNORE INTO test_release_commit_links
      (release_commit_sha,run_id,candidate_commit_sha,tested_base_sha,tree_sha,
       patch_sha256,manifest_id,manifest_revision,choice,pull_request_number,recorded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(input.releaseCommit,input.runId,input.candidateCommit,input.testedBase,
        input.treeSha,input.patchSha256,decision.manifest_id,decision.manifest_revision,
        decision.choice,input.pullRequestNumber,at.toISOString()).run();
    const row=await this.db.prepare(`SELECT * FROM test_release_commit_links
      WHERE release_commit_sha=?`).bind(input.releaseCommit).first<SavedLink>();
    if (!row || row.run_id!==input.runId || row.candidate_commit_sha!==input.candidateCommit ||
        row.tested_base_sha!==input.testedBase || row.tree_sha!==input.treeSha ||
        row.patch_sha256!==input.patchSha256 || row.manifest_id!==decision.manifest_id ||
        row.manifest_revision!==decision.manifest_revision || row.choice!==decision.choice ||
        row.pull_request_number!==input.pullRequestNumber)
      throw new Error('test_release_link_conflict');
    return true;
  }

  async check(releaseCommit:string,changedPaths:readonly string[]):Promise<{
    allowed:boolean;choice:string|null;candidateCommit:string|null}> {
    const link=await this.db.prepare(`SELECT * FROM test_release_commit_links
      WHERE release_commit_sha=?`).bind(releaseCommit).first<SavedLink>();
    if (!link) return {allowed:false,choice:null,candidateCommit:null};
    const result=await new SharedTestDecisionStore(this.db).releaseCheck({
      runId:link.run_id,candidateCommit:link.candidate_commit_sha,
      patchSha256:link.patch_sha256,manifestId:link.manifest_id,
      manifestRevision:link.manifest_revision,changedPaths});
    return {...result,candidateCommit:link.candidate_commit_sha};
  }
}
