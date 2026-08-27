export interface RepositorySettings {
  projectId: string;
  repository: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  dispatchEnabled: boolean;
  workflowRevision: number;
  workflowUpdatedBy: string;
  workflowUpdatedAt: string;
  activeRuns: number;
}

interface SettingsRow {
  project_id: string;
  trial_repository: string;
  repository_revision: number;
  repository_updated_by: string;
  repository_updated_at: string;
  dispatch_enabled: number;
  workflow_revision: number;
  workflow_updated_by: string;
  workflow_updated_at: string;
  active_runs: number;
}

export type RepositorySettingsErrorCode =
  | "invalid_repository"
  | "settings_not_found"
  | "active_run"
  | "stale_revision"
  | "stale_workflow_revision"
  | "settings_read_back_failed";

export class RepositorySettingsError extends Error {
  readonly code: RepositorySettingsErrorCode;

  constructor(code: RepositorySettingsErrorCode) {
    super(code);
    this.code = code;
  }
}

export const normalizeRepository = (value: string): string => {
  const repository = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || repository.length > 200) {
    throw new RepositorySettingsError("invalid_repository");
  }
  return repository;
};

const dto = (row: SettingsRow): RepositorySettings => ({
  projectId: row.project_id,
  repository: row.trial_repository,
  revision: row.repository_revision,
  updatedBy: row.repository_updated_by,
  updatedAt: row.repository_updated_at,
  dispatchEnabled: row.dispatch_enabled === 1,
  workflowRevision: row.workflow_revision,
  workflowUpdatedBy: row.workflow_updated_by,
  workflowUpdatedAt: row.workflow_updated_at,
  activeRuns: row.active_runs,
});

export class RepositorySettingsStore {
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  async read(projectId: string): Promise<RepositorySettings | null> {
    const row = await this.db.prepare(
      `SELECT p.project_id, p.trial_repository, p.repository_revision,
              p.repository_updated_by, p.repository_updated_at,
              p.dispatch_enabled, p.workflow_revision,
              p.workflow_updated_by, p.workflow_updated_at,
              (SELECT COUNT(*) FROM orchestration_runs r
                WHERE r.project_id = p.project_id
                  AND r.status IN ('pending_dispatch', 'active', 'awaiting_human',
                    'awaiting_capability', 'manual_reconciliation_required')) AS active_runs
       FROM project_workflow_policies p WHERE p.project_id = ? LIMIT 1`,
    ).bind(projectId).first<SettingsRow>();
    return row === null ? null : dto(row);
  }

  async save(input: {
    projectId: string;
    repository: string;
    expectedRevision: number;
    actorEmail: string;
    now: string;
  }): Promise<RepositorySettings> {
    const repository = normalizeRepository(input.repository);
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositorySettingsError("settings_not_found");
    if (current.revision !== input.expectedRevision) {
      throw new RepositorySettingsError("stale_revision");
    }
    if (current.repository === repository) return current;
    if (current.activeRuns > 0) throw new RepositorySettingsError("active_run");

    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE project_workflow_policies
         SET trial_repository = ?, dispatch_enabled = 0,
             repository_revision = repository_revision + 1,
             repository_updated_by = ?, repository_updated_at = ?,
             workflow_revision = workflow_revision + 1,
             workflow_updated_by = ?, workflow_updated_at = ?, updated_at = ?
         WHERE project_id = ? AND repository_revision = ?
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs r
             WHERE r.project_id = project_workflow_policies.project_id
               AND r.status IN ('pending_dispatch', 'active', 'awaiting_human',
                 'awaiting_capability', 'manual_reconciliation_required'))`,
      ).bind(
        repository, input.actorEmail, input.now, input.actorEmail, input.now,
        input.now, input.projectId, input.expectedRevision,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const latest = await this.read(input.projectId);
      throw new RepositorySettingsError(latest !== null && latest.activeRuns > 0 ? "active_run" : "stale_revision");
    }
    const saved = await this.read(input.projectId);
    if (
      saved === null || saved.repository !== repository ||
      saved.revision !== input.expectedRevision + 1 || saved.updatedBy !== input.actorEmail ||
      saved.dispatchEnabled
    ) throw new RepositorySettingsError("settings_read_back_failed");
    return saved;
  }

  async saveWorkflowControls(input: {
    projectId: string;
    dispatchEnabled: boolean;
    expectedRevision: number;
    actorEmail: string;
    now: string;
  }): Promise<RepositorySettings> {
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositorySettingsError("settings_not_found");
    if (current.workflowRevision !== input.expectedRevision) {
      throw new RepositorySettingsError("stale_workflow_revision");
    }
    if (current.dispatchEnabled === input.dispatchEnabled) return current;
    if (current.activeRuns > 0) throw new RepositorySettingsError("active_run");

    const results = await this.db.batch([
      this.db.prepare(
        `UPDATE project_workflow_policies
         SET dispatch_enabled = ?, workflow_revision = workflow_revision + 1,
             workflow_updated_by = ?, workflow_updated_at = ?, updated_at = ?
         WHERE project_id = ? AND workflow_revision = ?
           AND NOT EXISTS (SELECT 1 FROM orchestration_runs r
             WHERE r.project_id = project_workflow_policies.project_id
               AND r.status IN ('pending_dispatch', 'active', 'awaiting_human',
                 'awaiting_capability', 'manual_reconciliation_required'))`,
      ).bind(
        input.dispatchEnabled ? 1 : 0, input.actorEmail, input.now, input.now,
        input.projectId, input.expectedRevision,
      ),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      const latest = await this.read(input.projectId);
      throw new RepositorySettingsError(
        latest !== null && latest.activeRuns > 0 ? "active_run" : "stale_workflow_revision",
      );
    }
    const saved = await this.read(input.projectId);
    if (
      saved === null || saved.dispatchEnabled !== input.dispatchEnabled ||
      saved.workflowRevision !== input.expectedRevision + 1 ||
      saved.workflowUpdatedBy !== input.actorEmail
    ) throw new RepositorySettingsError("settings_read_back_failed");
    return saved;
  }
}
