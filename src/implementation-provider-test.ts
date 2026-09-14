import { ImplementationStore, type ImplementationResource } from "./implementation-store.ts";
import { ImplementationGitHub, implementationGitHub, type ImplementationPull } from "./implementation-github.ts";
import { D1OrchestrationStore } from "./orchestration-store.ts";
import { sha256Hex } from "./implementation-hash.ts";
import { responseError } from "./error-details.ts";

export const REVIEW_TEST_ADAPTER = "github-linear-review-v1";
export interface ReviewTestProfile {
  repository: string; projectId: string; teamId: string; githubUserId: number;
  states: { review: string; work: string; merge: string; canceled: string };
}
export interface ReviewTestProfileRow {
  run_id: string; adapter_binding: string; profile_json: string; profile_sha: string;
}
interface Fixture {
  profile: ReviewTestProfile; branch: string; head: string; heads: string[];
  pullNumber: number; pullUrl: string; issueId: string; issueUrl: string;
}
type TestEnv = Env & { IMPLEMENTATION_TEST_GITHUB_TOKEN?: string };
const jsonInit = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_provider_test_request");
  return value as Record<string, unknown>;
};
const note = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 16000 || /@[a-z\d_-]/i.test(value)) throw new Error("invalid_provider_test_note");
  return value;
};

/** Test credentials and provider resource selection never enter the author process. */
export class ImplementationProviderTest {
  readonly store: ImplementationStore;
  readonly env: TestEnv;
  constructor(env: TestEnv) { this.env = env; this.store = new ImplementationStore(env.DB, env.ARTIFACTS); }
  async profile(runId: string) {
    const row = await this.env.DB.prepare("SELECT * FROM implementation_test_profiles WHERE run_id=?")
      .bind(runId).first<ReviewTestProfileRow>();
    if (!row || await sha256Hex(row.profile_json) !== row.profile_sha ||
      row.adapter_binding !== `${REVIEW_TEST_ADAPTER}@${row.profile_sha}`) throw new Error("provider_test_profile_missing_or_changed");
    return { row, profile: JSON.parse(row.profile_json) as ReviewTestProfile };
  }
  async graphql(query: string, variables: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(this.env.LINEAR_API_URL, { method: "POST", redirect: "manual",
      headers: { Authorization: this.env.LINEAR_APP_ACCESS_TOKEN, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }) });
    if (!response.ok) throw await responseError("Linear isolated test", response);
    const payload = object(await response.json());
    if (payload.errors) throw new Error(`Linear isolated test GraphQL errors: ${JSON.stringify(payload.errors)}`);
    return object(payload.data);
  }
  private async github(runId: string, profile: ReviewTestProfile, reviewer = false) {
    const run = await new D1OrchestrationStore(this.env.DB).findRun(runId);
    if (!run) throw new Error("provider_test_run_missing");
    if (!reviewer) return implementationGitHub(this.env, { ...run, route_repository: profile.repository });
    const token = this.env.IMPLEMENTATION_TEST_GITHUB_TOKEN;
    if (!token) throw new Error("provider_test_github_reviewer_not_connected");
    return new ImplementationGitHub(this.env.GITHUB_API_URL, profile.repository, { token: async () => token });
  }
  async checkedReviewer(): Promise<{ id: number; login: string }> {
    const token = this.env.IMPLEMENTATION_TEST_GITHUB_TOKEN;
    if (!token) throw new Error("provider_test_github_reviewer_not_connected");
    const response = await fetch(`${this.env.GITHUB_API_URL}/user`, { redirect: "manual", headers: {
      Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "User-Agent": "deos-isolated-test",
    } });
    if (!response.ok) throw await responseError("GitHub isolated test reviewer", response);
    const user = await response.json() as { id: number; login: string; type: string };
    if (!Number.isSafeInteger(user.id) || user.type !== "User") throw new Error("provider_test_reviewer_not_human");
    return user;
  }
  async configure(runId: string, input: ReviewTestProfile, requestedBy: string) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(input.repository) || !Number.isSafeInteger(input.githubUserId))
      throw new Error("invalid_provider_test_profile");
    const reviewer = await this.checkedReviewer();
    if (reviewer.id !== input.githubUserId) throw new Error("provider_test_reviewer_changed");
    const app = await this.github(runId, input);
    const repo = await app.json<{ full_name: string }>("");
    if (repo.full_name !== input.repository) throw new Error("provider_test_repository_changed");
    const data = await this.graphql(`query ReviewTestSetup($project: String!, $team: String!) {
      project(id:$project) { id teams { nodes { id } } }
      team(id:$team) { id states { nodes { id name } } }
    }`, { project: input.projectId, team: input.teamId });
    const project = data.project as { id: string; teams: { nodes: { id: string }[] } };
    const team = data.team as { id: string; states: { nodes: { id: string; name: string }[] } };
    if (project?.id !== input.projectId || team?.id !== input.teamId || !project.teams.nodes.some(t => t.id === input.teamId))
      throw new Error("provider_test_project_changed");
    for (const [key, name] of Object.entries({ review: "Human Review", work: "In Progress", merge: "Merging", canceled: "Canceled" }))
      if (!team.states.nodes.some(s => s.id === input.states[key as keyof ReviewTestProfile["states"]] && s.name === name))
        throw new Error(`provider_test_state_changed:${key}`);
    const profileJson = JSON.stringify(input), digest = await sha256Hex(profileJson);
    const adapter = `${REVIEW_TEST_ADAPTER}@${digest}`;
    await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_test_profiles
      (run_id,adapter_binding,profile_json,profile_sha,checked_at,checked_by) VALUES (?,?,?,?,?,?)`)
      .bind(runId, adapter, profileJson, digest, new Date().toISOString(), requestedBy).run();
    const saved = await this.profile(runId);
    if (saved.row.profile_sha !== digest) throw new Error("provider_test_profile_is_frozen");
    return saved.row;
  }
  private async save(resource: ImplementationResource, fixture: Partial<Fixture>) {
    await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=?,updated_at=? WHERE resource_id=? AND status='allocating'")
      .bind(JSON.stringify(fixture), new Date().toISOString(), resource.resource_id).run();
  }
  async fixture(runId: string, attemptId: string, allowedAdapters: readonly string[]) {
    const { row, profile } = await this.profile(runId);
    if (!allowedAdapters.includes(row.adapter_binding)) throw new Error("provider_test_adapter_not_frozen");
    const resource = await this.store.allocateResource(runId, attemptId, "safe_test", REVIEW_TEST_ADAPTER);
    if (resource.status === "ready") return { resource, fixture: JSON.parse(resource.metadata_json) as Fixture };
    if (resource.status !== "allocating") throw new Error("provider_test_allocation_quarantined");
    const operation = `${resource.resource_id}:allocate`;
    const reserved = await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_test_operations
      (operation_id,resource_id,request_sha,request_json,state,started_at) VALUES (?,?,?,?,'started',?)`)
      .bind(operation, resource.resource_id, row.profile_sha, row.profile_json, new Date().toISOString()).run();
    if (reserved.meta.changes !== 1) throw new Error("provider_test_allocation_pending_readback");
    const fixture: Partial<Fixture> = { profile, branch: `deos/canary/${attemptId}`, issueId: crypto.randomUUID() };
    await this.save(resource, fixture);
    try {
      const app = await this.github(runId, profile), base = await app.ref("main");
      const parent = await app.json<{ tree: { sha: string } }>(`/git/commits/${base}`);
      const tree = await app.json<{ sha: string }>("/git/trees", jsonInit({ base_tree: parent.tree.sha,
        tree: [{ path: "canary-review.txt", mode: "100644", type: "blob", content: "Review canary\nA test note goes here.\n" }] }));
      const commit = await app.json<{ sha: string }>("/git/commits", jsonInit({ message: "Prepare isolated review test", tree: tree.sha, parents: [base] }));
      fixture.head = commit.sha; fixture.heads = [commit.sha]; await this.save(resource, fixture);
      await app.json("/git/refs", jsonInit({ ref: `refs/heads/${fixture.branch}`, sha: commit.sha }));
      if (await app.ref(fixture.branch!) !== commit.sha) throw new Error("provider_test_branch_readback_failed");
      const pull = await app.json<ImplementationPull>("/pulls", jsonInit({ title: "Canary: test review choices", head: fixture.branch,
        base: "main", body: "Isolated review test for the SAC-182 implementation canary. This pull request is never merged." }));
      if (pull.head.sha !== commit.sha || pull.base.repo.full_name !== profile.repository) throw new Error("provider_test_pull_readback_failed");
      fixture.pullNumber = pull.number; fixture.pullUrl = pull.html_url; await this.save(resource, fixture);
      const created = await this.graphql(`mutation CreateReviewTest($input: IssueCreateInput!) {
        issueCreate(input:$input) { success issue { id url state { id } } }
      }`, { input: { id: fixture.issueId, teamId: profile.teamId, projectId: profile.projectId, stateId: profile.states.review,
        title: "Canary: test review choices", description: "## What?\n\nTest review choices on a spare task.\n\n## Why?\n\nKeep tests apart from real work.\n\n## Done when\n\n- Review choices move this test task as planned.\n- The test leaves real work unchanged." } });
      const issue = created.issueCreate as { success: boolean; issue: { id: string; url: string; state: { id: string } } };
      if (!issue?.success || issue.issue?.id !== fixture.issueId || issue.issue.state.id !== profile.states.review)
        throw new Error("provider_test_issue_readback_failed");
      fixture.issueUrl = issue.issue.url; await this.save(resource, fixture);
      await this.env.DB.prepare(`UPDATE implementation_resources SET status='ready',provider_resource_id=?,namespace=?,updated_at=?
        WHERE resource_id=? AND status='allocating'`).bind(fixture.issueId, `${profile.repository}:${pull.number}`,
          new Date().toISOString(), resource.resource_id).run();
      await this.env.DB.prepare("UPDATE implementation_test_operations SET state='completed',response_json=?,completed_at=? WHERE operation_id=?")
        .bind(JSON.stringify(fixture), new Date().toISOString(), operation).run();
      const ready = await this.store.resource(attemptId, "safe_test");
      if (!ready || ready.status !== "ready") throw new Error("provider_test_resource_readback_failed");
      return { resource: ready, fixture: fixture as Fixture };
    } catch (error) {
      try {
        await this.env.DB.prepare("UPDATE implementation_resources SET status='quarantined' WHERE resource_id=?")
          .bind(resource.resource_id).run();
      } catch (secondary) { throw new AggregateError([error, secondary], "Provider test allocation and quarantine failed", { cause: error }); }
      throw error;
    }
  }

  async call(runId: string, attemptId: string, allowedAdapters: readonly string[], value: Record<string, unknown>) {
    if (value.operation !== "fixture") {
      const allocated = await this.store.resource(attemptId, "safe_test");
      if (!allocated || allocated.resource_id !== value.resourceId) throw new Error("provider_test_resource_mismatch");
    }
    const { resource, fixture } = await this.fixture(runId, attemptId, allowedAdapters);
    await this.store.assertResource(runId, attemptId, resource.resource_id, fixture.issueId);
    if (value.operation === "fixture") return { resourceId: resource.resource_id, ...fixture };
    if (value.resourceId !== resource.resource_id) throw new Error("provider_test_resource_mismatch");
    if (value.operation === "events") return this.events(resource, fixture);
    if (value.operation === "proof") return this.proof(resource, fixture, value);
    if (value.operation === "github.read") {
      const github = await this.github(runId, fixture.profile);
      const suffix = String(value.path ?? "");
      if (!/^\/(?:reviews(?:\/\d+(?:\/comments)?)?|comments|files)(?:\?per_page=100&page=\d+)?$/.test(suffix) && suffix !== "")
        throw new Error("provider_test_github_path_denied");
      return { response: await github.json(`/pulls/${fixture.pullNumber}${suffix}`) };
    }
    if (value.operation === "linear.read") return { response: await this.readIssue(fixture) };
    if (!["github.review", "github.reply", "linear.move"].includes(String(value.operation))) throw new Error("provider_test_operation_denied");
    if (typeof value.operationId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(value.operationId)) throw new Error("provider_test_operation_id_missing");
    const operationId = `${resource.resource_id}:${value.operationId}`, encoded = JSON.stringify(value), digest = await sha256Hex(encoded);
    const before = await this.env.DB.prepare("SELECT * FROM implementation_test_operations WHERE operation_id=?")
      .bind(operationId).first<{ request_sha: string; state: string; response_json: string | null }>();
    if (before) {
      if (before.request_sha !== digest) throw new Error("provider_test_operation_identity_mismatch");
      if (before.state !== "completed") throw new Error("provider_test_operation_uncertain");
      return { response: JSON.parse(before.response_json!) };
    }
    const now = new Date().toISOString();
    const reserve = await this.env.DB.prepare(`INSERT OR IGNORE INTO implementation_test_operations
      (operation_id,resource_id,request_sha,request_json,state,started_at) VALUES (?,?,?,?,'started',?)`)
      .bind(operationId, resource.resource_id, digest, encoded, now).run();
    if (reserve.meta.changes !== 1) throw new Error("provider_test_operation_pending");
    try {
      let response: unknown;
      if (value.operation === "linear.move") {
        if (value.issueId !== fixture.issueId || !Object.values(fixture.profile.states).includes(String(value.stateId)))
          throw new Error("provider_test_linear_target_denied");
        const prior = await this.readIssue(fixture) as { issue: { id: string; state: { id: string } } };
        if (prior.issue?.id !== fixture.issueId) throw new Error("provider_test_issue_changed");
        await this.env.DB.prepare("UPDATE implementation_test_operations SET prior_state_id=? WHERE operation_id=? AND state='started'")
          .bind(prior.issue.state.id, operationId).run();
        response = await this.graphql(`mutation MoveReviewTest($id: String!, $state: String!) {
          issueUpdate(id:$id,input:{stateId:$state}) { success issue { id state { id name } } }
        }`, { id: fixture.issueId, state: value.stateId });
        const updated = (response as { issueUpdate: { success: boolean; issue: { id: string; state: { id: string } } } }).issueUpdate;
        if (!updated?.success || updated.issue?.id !== fixture.issueId || updated.issue.state.id !== value.stateId)
          throw new Error("provider_test_linear_move_readback_failed");
      } else {
        if ((await this.checkedReviewer()).id !== fixture.profile.githubUserId) throw new Error("provider_test_reviewer_changed");
        const github = await this.github(runId, fixture.profile, true);
        if (value.operation === "github.review") {
          const body = object(value.body);
          if (!fixture.heads.includes(String(body.commit_id)) || !["COMMENT", "REQUEST_CHANGES", "APPROVE"].includes(String(body.event)) ||
            Object.keys(body).some(k => !["commit_id", "event", "body", "comments"].includes(k))) throw new Error("provider_test_review_denied");
          note(body.body ?? "");
          if (body.comments !== undefined) {
            if (!Array.isArray(body.comments) || body.comments.length > 20) throw new Error("provider_test_comments_denied");
            for (const c of body.comments.map(object)) {
              if (c.path !== "canary-review.txt" || Object.keys(c).some(k => !["path", "body", "line", "side", "start_line", "start_side"].includes(k)))
                throw new Error("provider_test_comment_target_denied");
              note(c.body);
            }
          }
          response = await github.json(`/pulls/${fixture.pullNumber}/reviews`, jsonInit(body));
          const review = response as { id: number; user: { id: number }; commit_id: string };
          if (!review.id || review.user?.id !== fixture.profile.githubUserId || review.commit_id !== body.commit_id)
            throw new Error("provider_test_review_readback_failed");
        } else {
          if (!Number.isSafeInteger(value.commentId)) throw new Error("provider_test_parent_invalid");
          const parent = await github.json<{ pull_request_url: string; in_reply_to_id?: number }>(`/pulls/comments/${value.commentId}`);
          if (parent.pull_request_url !== `${this.env.GITHUB_API_URL}/repos/${fixture.profile.repository}/pulls/${fixture.pullNumber}` || parent.in_reply_to_id)
            throw new Error("provider_test_parent_outside_pull");
          response = await github.json(`/pulls/${fixture.pullNumber}/comments/${value.commentId}/replies`, jsonInit({ body: note(value.body) }));
        }
      }
      await this.env.DB.prepare("UPDATE implementation_test_operations SET state='completed',response_json=?,completed_at=? WHERE operation_id=? AND state='started'")
        .bind(JSON.stringify(response), new Date().toISOString(), operationId).run();
      return { response };
    } catch (error) {
      try {
        await this.env.DB.prepare("UPDATE implementation_test_operations SET state='uncertain' WHERE operation_id=? AND state='started'")
          .bind(operationId).run();
      } catch (secondary) { throw new AggregateError([error, secondary], "Provider test and operation recording failed", { cause: error }); }
      throw error;
    }
  }
  private async readIssue(fixture: Fixture) {
    return this.graphql(`query ReadReviewTest($id: String!) {
      issue(id:$id) { id identifier title url archivedAt state { id name } }
    }`, { id: fixture.issueId });
  }
  private async events(resource: ImplementationResource, fixture: Fixture) {
    const events = await this.env.DB.prepare(`SELECT * FROM implementation_test_events WHERE resource_id=? AND issue_id=? ORDER BY received_at`)
      .bind(resource.resource_id, fixture.issueId).all();
    const operations = await this.env.DB.prepare("SELECT operation_id,request_json,response_json,started_at,completed_at FROM implementation_test_operations WHERE resource_id=? AND state='completed' ORDER BY started_at")
      .bind(resource.resource_id).all();
    return { resourceId: resource.resource_id, fixture, events: events.results, operations: operations.results };
  }
  private async proof(resource: ImplementationResource, fixture: Fixture, request: Record<string, unknown>) {
    const find = async (key: unknown) => {
      if (typeof key !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(key)) throw new Error("provider_test_proof_operation_invalid");
      const row = await this.env.DB.prepare("SELECT * FROM implementation_test_operations WHERE resource_id=? AND operation_id=? AND state='completed'")
        .bind(resource.resource_id, `${resource.resource_id}:${key}`)
        .first<{ operation_id: string; request_json: string; response_json: string; started_at: string; prior_state_id: string | null }>();
      if (!row) throw new Error("provider_test_proof_operation_missing");
      return { ...row, request: object(JSON.parse(row.request_json)), response: object(JSON.parse(row.response_json)) };
    };
    const github = await find(request.githubOperationId), linear = await find(request.linearOperationId);
    if (github.request.operation !== "github.review" || linear.request.operation !== "linear.move")
      throw new Error("provider_test_proof_operations_differ");
    const subject = object(request.subject), githubSubject = object(github.request.subject), linearSubject = object(linear.request.subject);
    for (const key of ["change", "approvedDesignSha", "testedBaseSha", "treeSha"])
      if (subject[key] !== githubSubject[key] || subject[key] !== linearSubject[key]) throw new Error("provider_test_proof_subject_changed");
    const receipt = github.response as { id: number; user: { id: number }; commit_id: string; state: string };
    const app = await this.github(resource.run_id, fixture.profile);
    const readback = await app.json<typeof receipt>(`/pulls/${fixture.pullNumber}/reviews/${receipt.id}`);
    if (readback.id !== receipt.id || readback.user.id !== fixture.profile.githubUserId ||
      readback.commit_id !== receipt.commit_id || readback.state !== receipt.state)
      throw new Error("provider_test_proof_review_changed");
    const event = await this.env.DB.prepare(`SELECT * FROM implementation_test_events
      WHERE resource_id=? AND issue_id=? AND actor_id=? AND to_state_id=? AND from_state_id=? AND julianday(received_at)>=julianday(?)
      ORDER BY received_at LIMIT 1`).bind(resource.resource_id, fixture.issueId, this.env.LINEAR_APP_ACTOR_ID,
        linear.request.stateId, linear.prior_state_id, linear.started_at)
      .first<{ delivery_id: string; payload_sha: string }>();
    if (!event) throw new Error("provider_test_signed_delivery_pending");
    return { providerDeliveryId: event.delivery_id, evidence: { resourceId: resource.resource_id,
      fixture, github: { operationId: github.operation_id, receipt, readback },
      linear: { operationId: linear.operation_id, receipt: linear.response, signedEvent: event } } };
  }
  async cleanup(resource: ImplementationResource) {
    if (resource.status === "destroyed") return;
    const fixture = JSON.parse(resource.metadata_json) as Partial<Fixture>;
    if (!fixture.profile || !fixture.pullNumber || !fixture.issueId || !fixture.heads)
      throw new Error("provider_test_cleanup_needs_reconciliation");
    const complete = fixture as Fixture, app = await this.github(resource.run_id, complete.profile);
    if (complete.branch !== `deos/canary/${resource.attempt_id}`) throw new Error("provider_test_cleanup_branch_changed");
    const pull = await app.json<ImplementationPull>(`/pulls/${complete.pullNumber}`);
    if (pull.base.repo.full_name !== complete.profile.repository || pull.head.ref !== complete.branch ||
      !complete.heads.includes(pull.head.sha) || pull.merged) throw new Error("provider_test_cleanup_pull_changed");
    if (pull.state !== "closed") await app.json(`/pulls/${complete.pullNumber}`, {
      method: "PATCH", body: JSON.stringify({ state: "closed" }),
    });
    const before = await this.readIssue(complete) as { issue: { id: string; state: { id: string } } };
    if (before.issue?.id !== complete.issueId) throw new Error("provider_test_cleanup_issue_changed");
    if (before.issue.state.id !== complete.profile.states.canceled) await this.graphql(`mutation CloseReviewTest($id: String!, $state: String!) {
      issueUpdate(id:$id,input:{stateId:$state}) { success issue { id state { id } } }
    }`, { id: complete.issueId, state: complete.profile.states.canceled });
    const closed = await app.json<ImplementationPull>(`/pulls/${complete.pullNumber}`);
    const issue = await this.readIssue(complete) as { issue: { id: string; state: { id: string } } };
    if (closed.state !== "closed" || issue.issue?.id !== complete.issueId || issue.issue.state.id !== complete.profile.states.canceled)
      throw new Error("provider_test_cleanup_readback_failed");
    const branch = await app.ref(complete.branch, true);
    if (branch !== null) {
      if (!complete.heads.includes(branch)) throw new Error("provider_test_cleanup_ref_changed");
      await app.json(`/git/refs/heads/${complete.branch}`, { method: "DELETE" });
    }
    if (await app.ref(complete.branch, true) !== null) throw new Error("provider_test_cleanup_ref_still_present");
    await this.env.DB.prepare("UPDATE implementation_resources SET status='destroyed',cleanup_receipt=?,updated_at=? WHERE resource_id=?")
      .bind(JSON.stringify({ pullClosed: complete.pullNumber, issueCanceled: complete.issueId }), new Date().toISOString(), resource.resource_id).run();
  }
}
