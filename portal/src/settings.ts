export interface RepositorySettings {
  projectId: string;
  repository: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  selectorEnabled: boolean;
  activeRuns: number;
}

interface SettingsRow {
  project_id: string;
  trial_repository: string;
  repository_revision: number;
  repository_updated_by: string;
  repository_updated_at: string;
  selector_enabled: number;
  active_runs: number;
}

export type RepositorySettingsErrorCode =
  | "invalid_repository"
  | "settings_not_found"
  | "active_run"
  | "stale_revision"
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
  selectorEnabled: row.selector_enabled === 1,
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
              COALESCE((SELECT MAX(s.enabled) FROM workflow_definition_selectors s
                WHERE s.project_id = p.project_id
                  AND s.repository = p.trial_repository
                  AND s.label_name = 'simple-workflow'), 0) AS selector_enabled,
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
         SET trial_repository = ?, repository_revision = repository_revision + 1,
             repository_updated_by = ?, repository_updated_at = ?, updated_at = ?
         WHERE project_id = ? AND repository_revision = ?`,
      ).bind(repository, input.actorEmail, input.now, input.now, input.projectId, input.expectedRevision),
      this.db.prepare(
        `UPDATE workflow_definition_selectors SET enabled = 0, updated_at = ?
         WHERE project_id = ? AND repository != (
           SELECT trial_repository FROM project_workflow_policies WHERE project_id = ?
         )`,
      ).bind(input.now, input.projectId, input.projectId),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      throw new RepositorySettingsError("stale_revision");
    }
    const saved = await this.read(input.projectId);
    if (
      saved === null || saved.repository !== repository ||
      saved.revision !== input.expectedRevision + 1 || saved.updatedBy !== input.actorEmail
    ) throw new RepositorySettingsError("settings_read_back_failed");
    return saved;
  }
}
