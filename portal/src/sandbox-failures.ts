export interface SandboxStartupFailure {
  id: string;
  projectId: string;
  issueKey: string;
  sandboxTier: string;
  occurredAt: string;
  cause: string;
  message: string;
  detailUrl: string;
}

/** Reuse durable original errors so a retry never hides the provider refusal. */
export async function sandboxStartupFailures(db: D1Database): Promise<SandboxStartupFailure[]> {
  const rows = await db.prepare(`SELECT error.error_id AS id, run.project_id AS projectId,
    issue.issue_key AS issueKey, run.sandbox_tier AS sandboxTier,
    error.occurred_at AS occurredAt, error.location, error.message
    FROM workflow_errors error
    JOIN orchestration_runs run ON run.run_id = error.run_id
    JOIN linear_issue_index issue ON issue.issue_id = run.issue_id
    JOIN project_workflow_policies route ON route.project_id = run.project_id
    WHERE error.location IN ('sandbox.start.capacity', 'sandbox.start.quota',
      'sandbox.start.concurrency', 'sandbox.start.creation_failed')
    ORDER BY error.occurred_at DESC LIMIT 100`).all<{
      id: string; projectId: string; issueKey: string; sandboxTier: string;
      occurredAt: string; location: string; message: string;
    }>();
  return rows.results.map(({location, ...row}) => ({
    ...row,
    cause: location.slice('sandbox.start.'.length),
    detailUrl: `/failure-detail/${encodeURIComponent(row.id)}`,
  }));
}
