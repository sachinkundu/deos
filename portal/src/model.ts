import { restoreWorkflowDefinition } from "../../src/workflow-definition.ts";
import { presentationStagesForDefinition, validatePresentationManifest } from "./manifests.ts";

interface IssueRow {
  issue_id: string;
  project_id: string;
  issue_key: string;
  title: string;
  linear_url: string;
  observed_at: string;
}

interface RunRow {
  run_id: string;
  run_sequence: number;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  current_node: string;
  current_visit_sequence: number;
  status: string;
  created_at: string;
  updated_at: string;
  terminal_at: string | null;
}

interface DefinitionRow { canonical_json: string; digest: string }
interface TransitionRow {
  transition_id: string;
  from_node: string;
  to_node: string;
  from_visit_sequence: number;
  to_visit_sequence: number;
  cause_type: string;
  occurred_at: string;
}
interface AttemptRow {
  attempt_id: string;
  visit_sequence: number | null;
  node_id: string;
  state: string;
  result_class: string | null;
  created_at: string;
  ended_at: string | null;
  transcript_available: number;
  transcript_byte_size: number | null;
  transcript_sha256: string | null;
}
interface WaitRow {
  visit_sequence: number | null;
  node_id: string;
  status: string;
  created_at: string;
  consumed_at: string | null;
}
interface LinkRow {
  visit_sequence: number;
  kind: string;
  label: string;
  url: string;
  created_at: string;
}

interface SimpleIssueRow extends IssueRow {
  run_id: string;
  run_sequence: number;
  status: string;
  updated_at: string;
}

interface WorkProductRow {
  repository: string;
  pull_request_number: number | null;
  pull_request_url: string | null;
  merge_commit_sha: string | null;
  verified_at: string | null;
}

export const PORTAL_SELECTS = Object.freeze({
  simpleIssues: `SELECT issue.issue_id, issue.project_id, issue.issue_key, issue.title,
    issue.linear_url, issue.observed_at, run.run_id, run.run_sequence, run.status, run.updated_at
    FROM linear_issue_index issue
    JOIN orchestration_runs run
      ON run.issue_id = issue.issue_id AND run.project_id = issue.project_id
    WHERE issue.project_id = ? AND run.definition_id = 'simple'
      AND run.run_sequence = (
        SELECT MAX(latest.run_sequence) FROM orchestration_runs latest
        WHERE latest.issue_id = run.issue_id AND latest.project_id = run.project_id
          AND latest.definition_id = 'simple'
      )
    ORDER BY run.updated_at DESC, issue.issue_key LIMIT 50`,
  issueSearch: `SELECT issue_id, project_id, issue_key, title, linear_url, observed_at
    FROM linear_issue_index WHERE project_id = ? AND issue_key LIKE ? ESCAPE '\\'
    ORDER BY observed_at DESC LIMIT 20`,
  issueByKey: `SELECT issue_id, project_id, issue_key, title, linear_url, observed_at
    FROM linear_issue_index WHERE project_id = ? AND issue_key = ? LIMIT 1`,
  runs: `SELECT run_id, run_sequence, definition_id, definition_version, definition_digest,
    current_node, current_visit_sequence, status, created_at, updated_at, terminal_at
    FROM orchestration_runs WHERE project_id = ? AND issue_id = ?
    ORDER BY run_sequence DESC`,
  run: `SELECT run_id, run_sequence, definition_id, definition_version, definition_digest,
    current_node, current_visit_sequence, status, created_at, updated_at, terminal_at
    FROM orchestration_runs WHERE run_id = ? AND project_id = ? LIMIT 1`,
  definition: `SELECT canonical_json, digest FROM workflow_definitions
    WHERE definition_id = ? AND version = ? LIMIT 1`,
  transitions: `SELECT transition_id, from_node, to_node, from_visit_sequence,
    to_visit_sequence, cause_type, occurred_at FROM workflow_transitions_v2
    WHERE run_id = ? ORDER BY from_visit_sequence, transition_id`,
  attempts: `SELECT attempt.attempt_id, attempt.visit_sequence, attempt.node_id,
    attempt.state, attempt.result_class, attempt.created_at, attempt.ended_at,
    EXISTS (
      SELECT 1 FROM artifact_manifests manifest
      JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
      WHERE manifest.attempt_id = attempt.attempt_id
        AND manifest.run_id = attempt.run_id
        AND manifest.state = 'complete'
        AND artifact.logical_name = 'transcript.jsonl'
        AND artifact.policy_outcome = 'accepted'
    ) AS transcript_available,
    (SELECT artifact.byte_size FROM artifact_manifests manifest
      JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
      WHERE manifest.attempt_id = attempt.attempt_id
        AND manifest.run_id = attempt.run_id
        AND manifest.state = 'complete'
        AND artifact.logical_name = 'transcript.jsonl'
        AND artifact.policy_outcome = 'accepted' LIMIT 1) AS transcript_byte_size,
    (SELECT artifact.sha256 FROM artifact_manifests manifest
      JOIN artifacts artifact ON artifact.manifest_id = manifest.manifest_id
      WHERE manifest.attempt_id = attempt.attempt_id
        AND manifest.run_id = attempt.run_id
        AND manifest.state = 'complete'
        AND artifact.logical_name = 'transcript.jsonl'
        AND artifact.policy_outcome = 'accepted' LIMIT 1) AS transcript_sha256
    FROM agent_attempts attempt WHERE attempt.run_id = ?
    ORDER BY attempt.created_at, attempt.attempt_id`,
  waits: `SELECT visit_sequence, node_id, status, created_at, consumed_at
    FROM workflow_waits WHERE run_id = ? ORDER BY created_at, wait_id`,
  links: `SELECT visit_sequence, kind, label, url, created_at FROM governed_work_links
    WHERE run_id = ? ORDER BY visit_sequence, created_at, link_id`,
  issueForRun: `SELECT issue.issue_id, issue.project_id, issue.issue_key, issue.title,
    issue.linear_url, issue.observed_at
    FROM orchestration_runs run
    JOIN linear_issue_index issue
      ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
    WHERE run.run_id = ? AND run.project_id = ? LIMIT 1`,
  workProduct: `SELECT repository, pull_request_number, pull_request_url,
    merge_commit_sha, verified_at FROM run_work_products WHERE run_id = ? LIMIT 1`,
  transcript: `SELECT attempt.attempt_id, attempt.run_id, attempt.node_id,
    run.run_sequence, issue.issue_key, artifact.r2_key, artifact.media_type,
    artifact.byte_size, artifact.sha256
    FROM agent_attempts attempt
    JOIN orchestration_runs run ON run.run_id = attempt.run_id
    JOIN linear_issue_index issue
      ON issue.issue_id = run.issue_id AND issue.project_id = run.project_id
    JOIN artifact_manifests manifest
      ON manifest.manifest_id = attempt.manifest_id
      AND manifest.attempt_id = attempt.attempt_id
      AND manifest.run_id = attempt.run_id
      AND manifest.state = 'complete'
    JOIN artifacts artifact
      ON artifact.manifest_id = manifest.manifest_id
      AND artifact.logical_name = 'transcript.jsonl'
      AND artifact.policy_outcome = 'accepted'
    WHERE attempt.attempt_id = ? AND run.project_id = ? LIMIT 1`,
});

export interface PortalIssue {
  key: string;
  title: string;
  url: string;
  observedAt: string;
}

const issueDto = (row: IssueRow): PortalIssue => ({
  key: row.issue_key,
  title: row.title,
  url: row.linear_url,
  observedAt: row.observed_at,
});

const keyPattern = /^[A-Z][A-Z0-9]+-[1-9][0-9]*$/;
const escapeLike = (value: string): string => value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");

export class PortalReadStore {
  private readonly db: D1Database;
  private readonly projectId: string;

  constructor(db: D1Database, projectId: string) {
    this.db = db;
    this.projectId = projectId;
  }

  async searchIssues(query: string): Promise<PortalIssue[]> {
    const normalized = query.trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,32}$/.test(normalized)) return [];
    const result = await this.db.prepare(PORTAL_SELECTS.issueSearch)
      .bind(this.projectId, `${escapeLike(normalized)}%`).all<IssueRow>();
    return result.results.map(issueDto);
  }

  async simpleIssues(): Promise<Array<PortalIssue & {
    runId: string;
    runSequence: number;
    status: string;
    updatedAt: string;
  }>> {
    const result = await this.db.prepare(PORTAL_SELECTS.simpleIssues).bind(this.projectId).all<SimpleIssueRow>();
    return result.results.map((row) => ({
      ...issueDto(row),
      runId: row.run_id,
      runSequence: row.run_sequence,
      status: row.status,
      updatedAt: row.updated_at,
    }));
  }

  private issue(key: string): Promise<IssueRow | null> {
    if (!keyPattern.test(key)) return Promise.resolve(null);
    return this.db.prepare(PORTAL_SELECTS.issueByKey).bind(this.projectId, key).first<IssueRow>();
  }

  async runs(key: string): Promise<{ issue: PortalIssue; runs: Array<Record<string, unknown>> } | null> {
    const issue = await this.issue(key);
    if (issue === null) return null;
    const result = await this.db.prepare(PORTAL_SELECTS.runs).bind(issue.project_id, issue.issue_id).all<RunRow>();
    return {
      issue: issueDto(issue),
      runs: result.results.map((run) => ({
        id: run.run_id,
        sequence: run.run_sequence,
        status: run.status,
        definitionVersion: run.definition_version,
        startedAt: run.created_at,
        updatedAt: run.updated_at,
        endedAt: run.terminal_at,
      })),
    };
  }

  async projection(runId: string): Promise<Record<string, unknown> | null> {
    if (!/^workflow:[0-9a-f-]+:[0-9a-f-]+:run:[1-9][0-9]*$/i.test(runId)) return null;
    const run = await this.db.prepare(PORTAL_SELECTS.run).bind(runId, this.projectId).first<RunRow>();
    if (run === null) return null;
    const [definitionRow, transitionResult, attemptResult, waitResult, linkResult, issueRow, workProduct] = await Promise.all([
      this.db.prepare(PORTAL_SELECTS.definition).bind(run.definition_id, run.definition_version).first<DefinitionRow>(),
      this.db.prepare(PORTAL_SELECTS.transitions).bind(runId).all<TransitionRow>(),
      this.db.prepare(PORTAL_SELECTS.attempts).bind(runId).all<AttemptRow>(),
      this.db.prepare(PORTAL_SELECTS.waits).bind(runId).all<WaitRow>(),
      this.db.prepare(PORTAL_SELECTS.links).bind(runId).all<LinkRow>(),
      this.db.prepare(PORTAL_SELECTS.issueForRun).bind(runId, this.projectId).first<IssueRow>(),
      this.db.prepare(PORTAL_SELECTS.workProduct).bind(runId).first<WorkProductRow>(),
    ]);
    if (definitionRow === null || definitionRow.digest !== run.definition_digest || issueRow === null) {
      throw new Error("workflow definition unavailable");
    }
    const definition = await restoreWorkflowDefinition(definitionRow.canonical_json, run.definition_digest);
    const mapping = validatePresentationManifest(definition);
    const transitions = transitionResult.results;
    const safeLinks = linkResult.results.filter((link) => {
      if (!["pull_request", "openspec_artifact"].includes(link.kind)) return false;
      let destination: URL;
      try {
        destination = new URL(link.url);
      } catch {
        return false;
      }
      const governedRepository = workProduct?.repository;
      return destination.origin === "https://github.com" &&
        (governedRepository === undefined || destination.pathname.startsWith(`/${governedRepository}/`)) &&
        link.label.length > 0 && link.label.length <= 500;
    });
    const visits = [{
      sequence: 1,
      nodeId: definition.start,
      enteredAt: run.created_at,
      leftAt: transitions.find((item) => item.from_visit_sequence === 1)?.occurred_at ?? null,
    }, ...transitions.map((transition) => ({
      sequence: transition.to_visit_sequence,
      nodeId: transition.to_node,
      enteredAt: transition.occurred_at,
      leftAt: transitions.find((item) => item.from_visit_sequence === transition.to_visit_sequence)?.occurred_at ?? null,
    }))].sort((left, right) => left.sequence - right.sequence);

    const cycleCounts = new Map<string, number>();
    const history = visits.map((visit) => {
      const cycle = (cycleCounts.get(visit.nodeId) ?? 0) + 1;
      cycleCounts.set(visit.nodeId, cycle);
      return {
        sequence: visit.sequence,
        nodeId: visit.nodeId,
        label: visit.nodeId.replaceAll("_", " "),
        stageId: mapping.get(visit.nodeId),
        cycle,
        state: visit.sequence === run.current_visit_sequence ? run.status : "completed",
        enteredAt: visit.enteredAt,
        leftAt: visit.leftAt,
        attempts: attemptResult.results.filter((attempt) => attempt.visit_sequence === visit.sequence).map((attempt) => ({
          id: attempt.attempt_id,
          state: attempt.state,
          outcome: attempt.result_class,
          startedAt: attempt.created_at,
          endedAt: attempt.ended_at,
          transcriptAvailable: attempt.transcript_available === 1,
          transcriptByteSize: attempt.transcript_byte_size,
          transcriptSha256: attempt.transcript_sha256,
        })),
        waits: waitResult.results.filter((wait) => wait.visit_sequence === visit.sequence).map((wait) => ({
          state: wait.status,
          startedAt: wait.created_at,
          endedAt: wait.consumed_at,
        })),
        links: safeLinks.filter((link) => link.visit_sequence === visit.sequence).map((link) => ({
          kind: link.kind,
          label: link.label,
          url: link.url,
          createdAt: link.created_at,
        })),
      };
    });
    const visitedStages = new Set(history.map((visit) => visit.stageId));
    const currentStage = mapping.get(run.current_node);
    const terminalRun = ["blocked", "succeeded", "denied", "failed", "canceled"].includes(run.status);
    const presentationStages = presentationStagesForDefinition(definition);
    const stages = presentationStages.map((stage) => ({
      ...stage,
      state: stage.id === currentStage && !terminalRun ? "active" : visitedStages.has(stage.id) ? "complete" : "upcoming",
      visits: history.filter((visit) => visit.stageId === stage.id).length,
    }));
    const connections = Object.values(definition.nodes).flatMap((node) =>
      Object.entries(node.edges).map(([outcome, target]) => ({
        from: mapping.get(node.id),
        to: mapping.get(target),
        outcome,
      })));
    return {
      issue: issueDto(issueRow),
      run: {
        id: run.run_id,
        sequence: run.run_sequence,
        status: run.status,
        definitionVersion: run.definition_version,
        definitionDigest: run.definition_digest,
        definitionName: definition.name,
        currentNode: run.current_node,
        currentVisitSequence: run.current_visit_sequence,
        startedAt: run.created_at,
        updatedAt: run.updated_at,
        endedAt: run.terminal_at,
        freshness: run.updated_at,
      },
      stages,
      connections,
      history,
      pullRequest: workProduct !== null &&
          workProduct.pull_request_number !== null &&
          workProduct.pull_request_url ===
            `https://github.com/${workProduct.repository}/pull/${workProduct.pull_request_number}`
        ? {
            number: workProduct.pull_request_number,
            url: workProduct.pull_request_url,
            status: workProduct.merge_commit_sha === null ? "Open" : "Merged",
            verified: workProduct.verified_at !== null,
          }
        : null,
      unlinked: {
        attempts: attemptResult.results.filter((attempt) => attempt.visit_sequence === null).length,
        waits: waitResult.results.filter((wait) => wait.visit_sequence === null).length,
      },
    };
  }
}
