import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const database = "deos-sample-project";
const config = "wrangler.queue-consumer-ts.jsonc";
const token = process.env.LINEAR_API_KEY ?? process.env.LINEAR_APP_ACCESS_TOKEN;
if (!token) throw new Error("LINEAR_API_KEY or LINEAR_APP_ACCESS_TOKEN is required");

const wrangler = (args) => {
  const result = spawnSync("npx", ["wrangler", ...args], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "wrangler command failed");
  return result.stdout;
};

const inventorySql = `SELECT run.issue_id, run.project_id,
  COALESCE((SELECT inbox.delivery_id FROM workflow_event_inbox inbox
    WHERE inbox.correlation_id = run.correlation_id
    ORDER BY inbox.provider_time DESC, inbox.delivery_id DESC LIMIT 1),
    'backfill:linear-api:' || run.issue_id) AS source_delivery_id,
  MAX(run.updated_at) AS observed_at
FROM orchestration_runs run
GROUP BY run.issue_id, run.project_id, run.correlation_id
ORDER BY observed_at DESC`;

const raw = wrangler(["d1", "execute", database, "--remote", "--config", config, "--command", inventorySql, "--json"]);
const payload = JSON.parse(raw);
const rows = payload.flatMap((entry) => Array.isArray(entry.results) ? entry.results : []);

const linearIssue = async (id) => {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: "query PortalIssue($id: String!) { issue(id: $id) { id identifier title url project { id } } }",
      variables: { id },
    }),
  });
  if (!response.ok) throw new Error(`Linear lookup failed with HTTP ${response.status}`);
  const body = await response.json();
  if (body.errors || !body.data?.issue) throw new Error("Linear issue lookup returned no issue");
  return body.data.issue;
};

const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = [];
for (const row of rows) {
  const issue = await linearIssue(row.issue_id);
  if (issue.id !== row.issue_id || issue.project?.id !== row.project_id) {
    throw new Error("Linear issue identity disagrees with the durable run");
  }
  if (!/^[A-Z][A-Z0-9]+-[1-9][0-9]*$/.test(issue.identifier) ||
      typeof issue.title !== "string" || issue.title.length < 1 || issue.title.length > 300 ||
      typeof issue.url !== "string" || !issue.url.startsWith("https://linear.app/") ||
      !issue.url.includes(`/issue/${issue.identifier}/`)) {
    throw new Error("Linear returned unsafe issue metadata");
  }
  statements.push(`INSERT INTO linear_issue_index
    (issue_id, project_id, issue_key, title, linear_url, source_delivery_id, observed_at)
    VALUES (${quote(issue.id)}, ${quote(row.project_id)}, ${quote(issue.identifier)}, ${quote(issue.title.trim())},
      ${quote(issue.url)}, ${quote(row.source_delivery_id)}, ${quote(row.observed_at)})
    ON CONFLICT(issue_id) DO UPDATE SET
      project_id = excluded.project_id, issue_key = excluded.issue_key,
      title = excluded.title, linear_url = excluded.linear_url,
      source_delivery_id = excluded.source_delivery_id, observed_at = excluded.observed_at
    WHERE excluded.observed_at >= linear_issue_index.observed_at;`);
}

const directory = mkdtempSync(join(tmpdir(), "deos-portal-index-"));
const file = join(directory, "backfill.sql");
try {
  writeFileSync(file, `${statements.join("\n")}\n`, { mode: 0o600 });
  if (statements.length > 0) wrangler(["d1", "execute", database, "--remote", "--config", config, "--file", file]);
} finally {
  rmSync(directory, { recursive: true, force: true });
}
process.stdout.write(JSON.stringify({ durableIssues: rows.length, indexedIssues: statements.length }));
