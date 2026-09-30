import {sha256Hex} from './implementation-hash.ts';
import {REVIEW_TEST_ADAPTER,type ReviewTestProfile,
  type ReviewTestProfileRow} from './implementation-provider-test.ts';
import type {SharedTestGitHubScope} from './shared-test-github-scope.ts';

/** A handoff inherits the frozen test profile, never a caller-selected account. */
export async function sharedTestReviewProfile(db:D1Database,runId:string) {
  const handoff=await db.prepare(`SELECT source_run_id FROM shared_test_run_handoffs
    WHERE target_run_id=? AND state='dispatched'`).bind(runId)
    .first<{source_run_id:string}>();
  const row=await db.prepare(`SELECT * FROM implementation_test_profiles WHERE run_id=?`)
    .bind(handoff?.source_run_id??runId).first<ReviewTestProfileRow>();
  if(!row || await sha256Hex(row.profile_json)!==row.profile_sha ||
      row.adapter_binding!==`${REVIEW_TEST_ADAPTER}@${row.profile_sha}`)
    throw new Error('test_reviewer_profile_missing_or_changed');
  const profile=JSON.parse(row.profile_json) as ReviewTestProfile;
  if(!Number.isSafeInteger(profile.githubUserId) || profile.githubUserId<=0)
    throw new Error('test_reviewer_identity_invalid');
  return {row,profile};
}

export async function sharedTestReviewFixture(db:D1Database,
  live:{run_id:string;attempt_id:string},resourceId?:string|null):Promise<{
    resourceId:string;scope:SharedTestGitHubScope;githubUserId:number;
    issueId:string;profile:ReviewTestProfile}> {
  const {profile}=await sharedTestReviewProfile(db,live.run_id);
  const row=await db.prepare(`SELECT resource_id,metadata_json FROM test_review_fixtures
    WHERE run_id=? AND attempt_id=? AND kind='safe_test' AND provider=? AND status='ready'`)
    .bind(live.run_id,live.attempt_id,REVIEW_TEST_ADAPTER)
    .first<{resource_id:string;metadata_json:string}>();
  if(!row || (resourceId && row.resource_id!==resourceId))
    throw new Error('test_reviewer_fixture_unavailable');
  const fixture=JSON.parse(row.metadata_json) as {
    profile:ReviewTestProfile;branch:string;head:string;pullNumber:number;issueId:string;
    unlinkedPull?:{branch:string;head:string;pullNumber:number|null;pullUrl:string|null}};
  if(JSON.stringify(fixture.profile)!==JSON.stringify(profile) ||
      fixture.branch!==`deos/canary/${live.attempt_id}` ||
      !/^[a-f0-9]{40}$/.test(fixture.head) ||
      !Number.isSafeInteger(fixture.pullNumber) || fixture.pullNumber<=0)
    throw new Error('test_reviewer_fixture_changed');
  const extra=fixture.unlinkedPull;
  if(extra && (extra.branch!==`${fixture.branch}-unlinked` || !/^[a-f0-9]{40}$/.test(extra.head) ||
      !Number.isSafeInteger(extra.pullNumber) || !extra.pullNumber || extra.pullNumber<=0 || extra.pullNumber===fixture.pullNumber))
    throw new Error('test_reviewer_unlinked_fixture_changed');
  return {resourceId:row.resource_id,githubUserId:profile.githubUserId,
    issueId:fixture.issueId,profile,
    scope:{repository:profile.repository,branch:fixture.branch,
      pullRequestNumber:fixture.pullNumber,candidateCommit:fixture.head,
      ...(extra?{readOnlyPull:{pullRequestNumber:extra.pullNumber!,candidateCommit:extra.head}}:{})}};
}
