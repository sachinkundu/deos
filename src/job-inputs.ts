import type { OrchestrationRunRecord } from "./orchestration-store.ts";
import type { WorkflowJob } from "./workflow-definition.ts";

interface LinearIssueContext {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { id: string; name: string };
  project: { id: string; name: string } | null;
  comments: { nodes: Array<{ id: string; body: string; updatedAt: string }> };
}

interface PriorAttemptRow {
  node_id: string;
  attempt_id: string;
  result_class: string | null;
  manifest_id: string;
  r2_key: string;
  completed_at: string;
}

interface JobInputDependencies {
  fetch: typeof fetch;
}

const bounded = (value: string, maximum: number): string =>
  value.length <= maximum ? value : `${value.slice(0, maximum)}\n[truncated by trusted input materializer]`;

const asObject = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("prior agent result is not an object");
  }
  return value as Record<string, unknown>;
};

export class JobInputMaterializer {
  private readonly database: D1Database;
  private readonly artifacts: R2Bucket;
  private readonly linearApiUrl: string;
  private readonly linearAccessToken: string;
  private readonly request: typeof fetch;

  constructor(
    database: D1Database,
    artifacts: R2Bucket,
    linearApiUrl: string,
    linearAccessToken: string,
    dependencies: Partial<JobInputDependencies> = {},
  ) {
    this.database = database;
    this.artifacts = artifacts;
    this.linearApiUrl = linearApiUrl;
    this.linearAccessToken = linearAccessToken;
    this.request = dependencies.fetch ?? ((input, init) => fetch(input, init));
  }

  async materialize(run: OrchestrationRunRecord, job: WorkflowJob): Promise<string> {
    const issue = await this.linearIssue(run.issue_id);
    if (issue.project?.id !== run.project_id) {
      throw new Error("Linear issue project does not match the workflow run");
    }
    const priorAttempts = await this.priorAttempts(run.run_id);
    const bundle = {
      version: 1,
      declaredInputs: job.inputs,
      declaredContext: job.context,
      linearIssue: {
        id: issue.id,
        identifier: issue.identifier,
        title: bounded(issue.title, 500),
        description: issue.description === null ? null : bounded(issue.description, 20_000),
        url: issue.url,
        state: issue.state,
        project: issue.project,
      },
      sharedWorkingNotes: issue.comments.nodes
        .filter((comment) => comment.body.includes("<!-- deos-operation:"))
        .slice(-20)
        .map((comment) => ({
          id: comment.id,
          body: bounded(comment.body, 4_000),
          updatedAt: comment.updatedAt,
        })),
      priorAttempts,
      repository: {
        checkout: "/deos/workspace/repository",
        branch: "deos/{attemptId}",
      },
    };
    const encoded = JSON.stringify(bundle);
    if (encoded.length > 128_000) throw new Error("materialized job inputs exceed the trusted limit");
    return encoded;
  }

  private async linearIssue(issueId: string): Promise<LinearIssueContext> {
    const response = await this.request(this.linearApiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.linearAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `query DeosJobIssue($id: String!) {
          issue(id: $id) {
            id identifier title description url
            state { id name }
            project { id name }
            comments { nodes { id body updatedAt } }
          }
        }`,
        variables: { id: issueId },
      }),
    });
    if (!response.ok) throw new Error("Linear job input request failed");
    const payload = await response.json() as {
      data?: { issue?: LinearIssueContext | null };
      errors?: unknown[];
    };
    if (payload.errors?.length || payload.data?.issue === null || payload.data?.issue === undefined) {
      throw new Error("Linear job input GraphQL response is invalid");
    }
    return payload.data.issue;
  }

  private async priorAttempts(runId: string): Promise<Array<Record<string, unknown>>> {
    const result = await this.database.prepare(
      `SELECT a.node_id, a.attempt_id, a.result_class, a.manifest_id,
              m.r2_key, m.completed_at
       FROM agent_attempts a
       JOIN artifact_manifests m ON m.manifest_id = a.manifest_id
       WHERE a.run_id = ? AND m.state = 'complete'
       ORDER BY m.completed_at ASC, a.attempt_id ASC
       LIMIT 20`,
    ).bind(runId).all<PriorAttemptRow>();
    const attempts: Array<Record<string, unknown>> = [];
    for (const row of result.results) {
      const resultKey = row.r2_key.replace(/\/manifest\.json$/, "/result.json");
      const object = await this.artifacts.get(resultKey);
      if (object === null) throw new Error("prior agent result artifact is missing");
      const text = await object.text();
      if (text.length > 20_000) throw new Error("prior agent result exceeds the trusted limit");
      attempts.push({
        nodeId: row.node_id,
        attemptId: row.attempt_id,
        outcome: row.result_class,
        manifestId: row.manifest_id,
        completedAt: row.completed_at,
        result: asObject(JSON.parse(text)),
      });
    }
    return attempts;
  }
}
