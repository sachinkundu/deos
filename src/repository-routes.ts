export const REQUIRED_GITHUB_PERMISSIONS = Object.freeze({
  checks: "write",
  contents: "write",
  metadata: "read",
  pull_requests: "write",
} as const);

export type GitHubAccessState =
  | "unchecked"
  | "passed"
  | "missing"
  | "weak_permissions"
  | "unavailable";

export interface RepositoryRouteRecord {
  project_id: string;
  linear_project_name: string | null;
  definition_id: string;
  definition_version: number;
  definition_digest: string;
  trial_repository: string;
  github_installation_id: string | null;
  start_state_name: string;
  human_gate_state_id: string;
  dispatch_enabled: number;
  repository_revision: number;
  workflow_revision: number;
  independent_review_provider: "openrouter";
  independent_review_model: string | null;
  independent_review_revision: number;
  route_revision: number;
  route_digest: string | null;
  route_updated_by: string;
  route_updated_at: string;
  github_access_state: GitHubAccessState;
  github_access_checked_at: string | null;
  github_access_permissions_digest: string | null;
  github_settings_url: string | null;
}

export interface CompleteRepositoryRoute extends RepositoryRouteRecord {
  linear_project_name: string;
  github_installation_id: string;
  route_digest: string;
}

export interface FrozenRunRouteRecord {
  run_id: string;
  project_id: string;
  route_project_name: string | null;
  route_repository: string | null;
  route_github_installation_id: string | null;
  route_revision: number | null;
  route_digest: string | null;
  route_start_state_name: string | null;
  route_human_gate_state_id: string | null;
  route_repository_revision: number | null;
  route_workflow_revision: number | null;
  route_review_revision: number | null;
}

export interface RepositoryRouteView {
  projectId: string;
  projectName: string;
  repository: string;
  githubInstallationId: string;
  definitionId: string;
  definitionVersion: number;
  definitionDigest: string;
  startStateName: string;
  humanGateStateId: string;
  dispatchEnabled: boolean;
  repositoryRevision: number;
  workflowRevision: number;
  independentReviewProvider: "openrouter";
  independentReviewModel: string | null;
  independentReviewRevision: number;
  routeRevision: number;
  routeDigest: string;
  updatedBy: string;
  updatedAt: string;
  accessState: GitHubAccessState;
  accessCheckedAt: string | null;
  accessPermissionsDigest: string | null;
  githubSettingsUrl: string | null;
  activeRuns: number;
}

export type RepositoryRouteErrorCode =
  | "route_not_found"
  | "route_exists"
  | "stale_repository_revision"
  | "stale_workflow_revision"
  | "stale_review_revision"
  | "route_read_back_failed";

export class RepositoryRouteError extends Error {
  readonly code: RepositoryRouteErrorCode;

  constructor(code: RepositoryRouteErrorCode) {
    super(code);
    this.code = code;
  }
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

export const canonicalRouteJson = (
  route: Omit<RepositoryRouteRecord, "route_digest">,
): string => JSON.stringify({
  projectId: route.project_id,
  projectName: route.linear_project_name,
  repository: route.trial_repository,
  githubInstallationId: route.github_installation_id,
  definition: {
    id: route.definition_id,
    version: route.definition_version,
    digest: route.definition_digest,
  },
  startStateName: route.start_state_name,
  humanGateStateId: route.human_gate_state_id,
  dispatchEnabled: route.dispatch_enabled === 1,
  revisions: {
    repository: route.repository_revision,
    workflow: route.workflow_revision,
    independentReview: route.independent_review_revision,
  },
  independentReview: {
    provider: route.independent_review_provider,
    model: route.independent_review_model,
  },
});

export const repositoryRouteDigest = (
  route: Omit<RepositoryRouteRecord, "route_digest">,
): Promise<string> => sha256Hex(canonicalRouteJson(route));

export const permissionsDigest = (
  permissions: Readonly<Record<string, string>>,
): Promise<string> => sha256Hex(JSON.stringify(
  Object.fromEntries(Object.entries(permissions).sort(([left], [right]) => left.localeCompare(right))),
));

export const requireCompleteRoute = (
  route: RepositoryRouteRecord,
): CompleteRepositoryRoute => {
  if (
    route.linear_project_name === null || route.linear_project_name.trim().length === 0 ||
    route.github_installation_id === null || route.github_installation_id.trim().length === 0 ||
    route.route_digest === null || !/^[a-f0-9]{64}$/.test(route.route_digest)
  ) throw new Error("repository route is incomplete");
  return route as CompleteRepositoryRoute;
};

const activeStatuses = "('pending_dispatch', 'active', 'awaiting_human', 'awaiting_capability', 'manual_reconciliation_required')";

interface RepositoryRouteViewRow extends RepositoryRouteRecord {
  active_runs: number;
}

const view = (row: RepositoryRouteViewRow): RepositoryRouteView => {
  const route = requireCompleteRoute(row);
  return {
    projectId: route.project_id,
    projectName: route.linear_project_name,
    repository: route.trial_repository,
    githubInstallationId: route.github_installation_id,
    definitionId: route.definition_id,
    definitionVersion: route.definition_version,
    definitionDigest: route.definition_digest,
    startStateName: route.start_state_name,
    humanGateStateId: route.human_gate_state_id,
    dispatchEnabled: route.dispatch_enabled === 1,
    repositoryRevision: route.repository_revision,
    workflowRevision: route.workflow_revision,
    independentReviewProvider: route.independent_review_provider,
    independentReviewModel: route.independent_review_model,
    independentReviewRevision: route.independent_review_revision,
    routeRevision: route.route_revision,
    routeDigest: route.route_digest,
    updatedBy: route.route_updated_by,
    updatedAt: route.route_updated_at,
    accessState: route.github_access_state,
    accessCheckedAt: route.github_access_checked_at,
    accessPermissionsDigest: route.github_access_permissions_digest,
    githubSettingsUrl: route.github_settings_url,
    activeRuns: row.active_runs,
  };
};

export class D1RepositoryRouteStore {
  private readonly database: D1Database;

  constructor(database: D1Database) {
    this.database = database;
  }

  read(projectId: string): Promise<RepositoryRouteRecord | null> {
    return this.database.prepare(
      "SELECT * FROM project_workflow_policies WHERE project_id = ?",
    ).bind(projectId).first<RepositoryRouteRecord>();
  }

  async list(): Promise<RepositoryRouteRecord[]> {
    const result = await this.database.prepare(
      "SELECT * FROM project_workflow_policies ORDER BY linear_project_name, project_id",
    ).all<RepositoryRouteRecord>();
    return result.results;
  }

  async readView(projectId: string): Promise<RepositoryRouteView | null> {
    const row = await this.database.prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM orchestration_runs r
               WHERE r.project_id = p.project_id AND r.status IN ${activeStatuses}) AS active_runs
       FROM project_workflow_policies p WHERE p.project_id = ?`,
    ).bind(projectId).first<RepositoryRouteViewRow>();
    return row === null ? null : view(row);
  }

  async listViews(): Promise<RepositoryRouteView[]> {
    const result = await this.database.prepare(
      `SELECT p.*,
              (SELECT COUNT(*) FROM orchestration_runs r
               WHERE r.project_id = p.project_id AND r.status IN ${activeStatuses}) AS active_runs
       FROM project_workflow_policies p
       ORDER BY p.linear_project_name, p.project_id`,
    ).all<RepositoryRouteViewRow>();
    return result.results.map(view);
  }

  async create(input: {
    projectId: string;
    projectName: string;
    repository: string;
    githubInstallationId: string;
    definitionId: string;
    definitionVersion: number;
    definitionDigest: string;
    startStateName: string;
    humanGateStateId: string;
    independentReviewModel: string | null;
    actorEmail: string;
    now: string;
    access: {
      checkId: string;
      requiredPermissionsDigest: string;
      observedPermissionsDigest: string;
      settingsUrl: string;
    };
  }): Promise<RepositoryRouteView> {
    const candidate: RepositoryRouteRecord = {
      project_id: input.projectId,
      linear_project_name: input.projectName,
      definition_id: input.definitionId,
      definition_version: input.definitionVersion,
      definition_digest: input.definitionDigest,
      trial_repository: input.repository,
      github_installation_id: input.githubInstallationId,
      start_state_name: input.startStateName,
      human_gate_state_id: input.humanGateStateId,
      dispatch_enabled: 0,
      repository_revision: 1,
      workflow_revision: 1,
      independent_review_provider: "openrouter",
      independent_review_model: input.independentReviewModel,
      independent_review_revision: 1,
      route_revision: 1,
      route_digest: null,
      route_updated_by: input.actorEmail,
      route_updated_at: input.now,
      github_access_state: "passed",
      github_access_checked_at: input.now,
      github_access_permissions_digest: input.access.observedPermissionsDigest,
      github_settings_url: input.access.settingsUrl,
    };
    const digest = await repositoryRouteDigest(candidate);
    try {
      const results = await this.database.batch([
        this.database.prepare(
          `INSERT INTO project_workflow_policies
           (project_id, linear_project_name, definition_id, definition_version,
            definition_digest, trial_repository, github_installation_id,
            start_state_name, human_gate_state_id, dispatch_enabled,
            repository_revision, repository_updated_by, repository_updated_at,
            workflow_revision, workflow_updated_by, workflow_updated_at,
            independent_review_provider, independent_review_model,
            independent_review_revision, independent_review_updated_by,
            independent_review_updated_at, route_revision, route_digest,
            route_updated_by, route_updated_at, github_access_state,
            github_access_checked_at, github_access_permissions_digest,
            github_settings_url, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, 1, ?, ?, 'openrouter', ?,
                   1, ?, ?, 1, ?, ?, ?, 'passed', ?, ?, ?, ?)`,
        ).bind(
          input.projectId,
          input.projectName,
          input.definitionId,
          input.definitionVersion,
          input.definitionDigest,
          input.repository,
          input.githubInstallationId,
          input.startStateName,
          input.humanGateStateId,
          input.actorEmail,
          input.now,
          input.actorEmail,
          input.now,
          input.independentReviewModel,
          input.actorEmail,
          input.now,
          digest,
          input.actorEmail,
          input.now,
          input.now,
          input.access.observedPermissionsDigest,
          input.access.settingsUrl,
          input.now,
        ),
        this.accessCheckStatement({
          checkId: input.access.checkId,
          projectId: input.projectId,
          repository: input.repository,
          installationId: input.githubInstallationId,
          requiredPermissionsDigest: input.access.requiredPermissionsDigest,
          observedPermissionsDigest: input.access.observedPermissionsDigest,
          result: "passed",
          settingsUrl: input.access.settingsUrl,
          safeErrorCategory: null,
          actorEmail: input.actorEmail,
          checkedAt: input.now,
        }),
      ]);
      if ((results[0]?.meta.changes ?? 0) !== 1) throw new RepositoryRouteError("route_exists");
    } catch (error) {
      if (error instanceof RepositoryRouteError) throw error;
      if (await this.read(input.projectId) !== null) throw new RepositoryRouteError("route_exists");
      throw error;
    }
    const saved = await this.readView(input.projectId);
    if (saved === null || saved.routeDigest !== digest || saved.repository !== input.repository) {
      throw new RepositoryRouteError("route_read_back_failed");
    }
    return saved;
  }

  async saveRepository(input: {
    projectId: string;
    repository: string;
    githubInstallationId: string;
    expectedRevision: number;
    actorEmail: string;
    now: string;
    access: {
      checkId: string;
      requiredPermissionsDigest: string;
      observedPermissionsDigest: string;
      settingsUrl: string;
    };
  }): Promise<RepositoryRouteView> {
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositoryRouteError("route_not_found");
    if (current.repository_revision !== input.expectedRevision) {
      throw new RepositoryRouteError("stale_repository_revision");
    }
    const changed = current.trial_repository !== input.repository ||
      current.github_installation_id !== input.githubInstallationId;
    const candidate: RepositoryRouteRecord = {
      ...current,
      trial_repository: input.repository,
      github_installation_id: input.githubInstallationId,
      dispatch_enabled: changed ? 0 : current.dispatch_enabled,
      repository_revision: changed ? current.repository_revision + 1 : current.repository_revision,
      workflow_revision: changed ? current.workflow_revision + 1 : current.workflow_revision,
      route_revision: changed ? current.route_revision + 1 : current.route_revision,
      route_digest: null,
      route_updated_by: changed ? input.actorEmail : current.route_updated_by,
      route_updated_at: changed ? input.now : current.route_updated_at,
      github_access_state: "passed",
      github_access_checked_at: input.now,
      github_access_permissions_digest: input.access.observedPermissionsDigest,
      github_settings_url: input.access.settingsUrl,
    };
    const digest = await repositoryRouteDigest(candidate);
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE project_workflow_policies
         SET trial_repository = ?, github_installation_id = ?, dispatch_enabled = ?,
             repository_revision = ?, repository_updated_by = ?, repository_updated_at = ?,
             workflow_revision = ?, workflow_updated_by = ?, workflow_updated_at = ?,
             route_revision = ?, route_digest = ?, route_updated_by = ?, route_updated_at = ?,
             github_access_state = 'passed', github_access_checked_at = ?,
             github_access_permissions_digest = ?, github_settings_url = ?, updated_at = ?
         WHERE project_id = ? AND repository_revision = ?`,
      ).bind(
        candidate.trial_repository,
        candidate.github_installation_id,
        candidate.dispatch_enabled,
        candidate.repository_revision,
        changed ? input.actorEmail : current.route_updated_by,
        changed ? input.now : current.route_updated_at,
        candidate.workflow_revision,
        changed ? input.actorEmail : current.route_updated_by,
        changed ? input.now : current.route_updated_at,
        candidate.route_revision,
        digest,
        candidate.route_updated_by,
        candidate.route_updated_at,
        input.now,
        input.access.observedPermissionsDigest,
        input.access.settingsUrl,
        input.now,
        input.projectId,
        input.expectedRevision,
      ),
      this.accessCheckStatement({
        checkId: input.access.checkId,
        projectId: input.projectId,
        repository: input.repository,
        installationId: input.githubInstallationId,
        requiredPermissionsDigest: input.access.requiredPermissionsDigest,
        observedPermissionsDigest: input.access.observedPermissionsDigest,
        result: "passed",
        settingsUrl: input.access.settingsUrl,
        safeErrorCategory: null,
        actorEmail: input.actorEmail,
        checkedAt: input.now,
      }),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      throw new RepositoryRouteError("stale_repository_revision");
    }
    const saved = await this.readView(input.projectId);
    if (
      saved === null || saved.routeDigest !== digest ||
      saved.repository !== input.repository || saved.githubInstallationId !== input.githubInstallationId
    ) throw new RepositoryRouteError("route_read_back_failed");
    return saved;
  }

  async saveWorkflow(input: {
    projectId: string;
    dispatchEnabled: boolean;
    expectedRevision: number;
    actorEmail: string;
    now: string;
    access?: {
      repository: string;
      installationId: string;
      checkId: string;
      requiredPermissionsDigest: string;
      observedPermissionsDigest: string;
      settingsUrl: string;
    };
  }): Promise<RepositoryRouteView> {
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositoryRouteError("route_not_found");
    if (
      input.access !== undefined &&
      (current.trial_repository !== input.access.repository ||
        current.github_installation_id !== input.access.installationId)
    ) {
      await this.recordAccessCheck({
        checkId: input.access.checkId,
        projectId: input.projectId,
        repository: input.access.repository,
        installationId: input.access.installationId,
        requiredPermissionsDigest: input.access.requiredPermissionsDigest,
        observedPermissionsDigest: input.access.observedPermissionsDigest,
        result: "passed",
        settingsUrl: input.access.settingsUrl,
        safeErrorCategory: null,
        actorEmail: input.actorEmail,
        checkedAt: input.now,
      });
      throw new RepositoryRouteError("stale_workflow_revision");
    }
    if (current.workflow_revision !== input.expectedRevision) {
      throw new RepositoryRouteError("stale_workflow_revision");
    }
    if (current.dispatch_enabled === (input.dispatchEnabled ? 1 : 0)) {
      if (input.access !== undefined) {
        if (current.github_installation_id === null || current.route_digest === null) {
          throw new RepositoryRouteError("route_not_found");
        }
        return this.saveAccessResult({
          projectId: input.projectId,
          repository: current.trial_repository,
          installationId: current.github_installation_id,
          expectedRouteRevision: current.route_revision,
          expectedRouteDigest: current.route_digest,
          checkId: input.access.checkId,
          requiredPermissionsDigest: input.access.requiredPermissionsDigest,
          observedPermissionsDigest: input.access.observedPermissionsDigest,
          result: "passed",
          settingsUrl: input.access.settingsUrl,
          safeErrorCategory: null,
          actorEmail: input.actorEmail,
          now: input.now,
        });
      }
      const unchanged = await this.readView(input.projectId);
      if (unchanged === null) throw new RepositoryRouteError("route_read_back_failed");
      return unchanged;
    }
    const candidate: RepositoryRouteRecord = {
      ...current,
      dispatch_enabled: input.dispatchEnabled ? 1 : 0,
      workflow_revision: current.workflow_revision + 1,
      route_revision: current.route_revision + 1,
      route_digest: null,
      route_updated_by: input.actorEmail,
      route_updated_at: input.now,
      ...(input.access === undefined ? {} : {
        github_access_state: "passed" as const,
        github_access_checked_at: input.now,
        github_access_permissions_digest: input.access.observedPermissionsDigest,
        github_settings_url: input.access.settingsUrl,
      }),
    };
    const digest = await repositoryRouteDigest(candidate);
    const statements = [this.database.prepare(
      `UPDATE project_workflow_policies
       SET dispatch_enabled = ?, workflow_revision = ?, workflow_updated_by = ?,
           workflow_updated_at = ?, route_revision = ?, route_digest = ?,
           route_updated_by = ?, route_updated_at = ?,
           github_access_state = ?, github_access_checked_at = ?,
           github_access_permissions_digest = ?, github_settings_url = ?, updated_at = ?
       WHERE project_id = ? AND workflow_revision = ?`,
    ).bind(
      candidate.dispatch_enabled,
      candidate.workflow_revision,
      input.actorEmail,
      input.now,
      candidate.route_revision,
      digest,
      input.actorEmail,
      input.now,
      candidate.github_access_state,
      candidate.github_access_checked_at,
      candidate.github_access_permissions_digest,
      candidate.github_settings_url,
      input.now,
      input.projectId,
      input.expectedRevision,
    )];
    if (input.access !== undefined) statements.push(this.accessCheckStatement({
      checkId: input.access.checkId,
      projectId: input.projectId,
      repository: input.access.repository,
      installationId: input.access.installationId,
      requiredPermissionsDigest: input.access.requiredPermissionsDigest,
      observedPermissionsDigest: input.access.observedPermissionsDigest,
      result: "passed",
      settingsUrl: input.access.settingsUrl,
      safeErrorCategory: null,
      actorEmail: input.actorEmail,
      checkedAt: input.now,
    }));
    const results = await this.database.batch(statements);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      throw new RepositoryRouteError("stale_workflow_revision");
    }
    const saved = await this.readView(input.projectId);
    if (saved === null || saved.routeDigest !== digest || saved.dispatchEnabled !== input.dispatchEnabled) {
      throw new RepositoryRouteError("route_read_back_failed");
    }
    return saved;
  }

  async saveReview(input: {
    projectId: string;
    model: string;
    expectedRevision: number;
    actorEmail: string;
    now: string;
  }): Promise<RepositoryRouteView> {
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositoryRouteError("route_not_found");
    if (current.independent_review_revision !== input.expectedRevision) {
      throw new RepositoryRouteError("stale_review_revision");
    }
    if (current.independent_review_model === input.model) {
      const unchanged = await this.readView(input.projectId);
      if (unchanged === null) throw new RepositoryRouteError("route_read_back_failed");
      return unchanged;
    }
    const candidate: RepositoryRouteRecord = {
      ...current,
      independent_review_model: input.model,
      independent_review_revision: current.independent_review_revision + 1,
      route_revision: current.route_revision + 1,
      route_digest: null,
      route_updated_by: input.actorEmail,
      route_updated_at: input.now,
    };
    const digest = await repositoryRouteDigest(candidate);
    const result = await this.database.prepare(
      `UPDATE project_workflow_policies
       SET independent_review_provider = 'openrouter', independent_review_model = ?,
           independent_review_revision = ?, independent_review_updated_by = ?,
           independent_review_updated_at = ?, route_revision = ?, route_digest = ?,
           route_updated_by = ?, route_updated_at = ?, updated_at = ?
       WHERE project_id = ? AND independent_review_revision = ?`,
    ).bind(
      input.model,
      candidate.independent_review_revision,
      input.actorEmail,
      input.now,
      candidate.route_revision,
      digest,
      input.actorEmail,
      input.now,
      input.now,
      input.projectId,
      input.expectedRevision,
    ).run();
    if ((result.meta.changes ?? 0) !== 1) throw new RepositoryRouteError("stale_review_revision");
    const saved = await this.readView(input.projectId);
    if (saved === null || saved.routeDigest !== digest || saved.independentReviewModel !== input.model) {
      throw new RepositoryRouteError("route_read_back_failed");
    }
    return saved;
  }

  async saveAccessResult(input: {
    projectId: string;
    repository: string;
    installationId: string;
    expectedRouteRevision: number;
    expectedRouteDigest: string;
    checkId: string;
    requiredPermissionsDigest: string;
    observedPermissionsDigest: string | null;
    result: Exclude<GitHubAccessState, "unchecked">;
    settingsUrl: string | null;
    safeErrorCategory: string | null;
    actorEmail: string;
    now: string;
  }): Promise<RepositoryRouteView> {
    const current = await this.read(input.projectId);
    if (current === null) throw new RepositoryRouteError("route_not_found");
    if (
      current.trial_repository !== input.repository ||
      current.github_installation_id !== input.installationId ||
      current.route_revision !== input.expectedRouteRevision ||
      current.route_digest !== input.expectedRouteDigest
    ) {
      await this.recordAccessCheck({
        checkId: input.checkId,
        projectId: input.projectId,
        repository: input.repository,
        installationId: input.installationId,
        requiredPermissionsDigest: input.requiredPermissionsDigest,
        observedPermissionsDigest: input.observedPermissionsDigest,
        result: input.result,
        settingsUrl: input.settingsUrl,
        safeErrorCategory: input.safeErrorCategory,
        actorEmail: input.actorEmail,
        checkedAt: input.now,
      });
      throw new RepositoryRouteError("stale_repository_revision");
    }
    const disable = input.result !== "passed" && current.dispatch_enabled === 1;
    const candidate: RepositoryRouteRecord = {
      ...current,
      dispatch_enabled: disable ? 0 : current.dispatch_enabled,
      workflow_revision: disable ? current.workflow_revision + 1 : current.workflow_revision,
      route_revision: disable ? current.route_revision + 1 : current.route_revision,
      route_digest: null,
      route_updated_by: disable ? input.actorEmail : current.route_updated_by,
      route_updated_at: disable ? input.now : current.route_updated_at,
      github_access_state: input.result,
      github_access_checked_at: input.now,
      github_access_permissions_digest: input.observedPermissionsDigest,
      github_settings_url: input.settingsUrl ?? current.github_settings_url,
    };
    const digest = await repositoryRouteDigest(candidate);
    const results = await this.database.batch([
      this.database.prepare(
        `UPDATE project_workflow_policies
         SET dispatch_enabled = ?, workflow_revision = ?,
             workflow_updated_by = CASE WHEN ? = 1 THEN ? ELSE workflow_updated_by END,
             workflow_updated_at = CASE WHEN ? = 1 THEN ? ELSE workflow_updated_at END,
             route_revision = ?, route_digest = ?,
             route_updated_by = ?, route_updated_at = ?, github_access_state = ?,
             github_access_checked_at = ?, github_access_permissions_digest = ?,
             github_settings_url = ?, updated_at = ?
         WHERE project_id = ? AND route_revision = ? AND route_digest = ?
           AND trial_repository = ? AND github_installation_id = ?`,
      ).bind(
        candidate.dispatch_enabled,
        candidate.workflow_revision,
        disable ? 1 : 0,
        input.actorEmail,
        disable ? 1 : 0,
        input.now,
        candidate.route_revision,
        digest,
        candidate.route_updated_by,
        candidate.route_updated_at,
        input.result,
        input.now,
        input.observedPermissionsDigest,
        candidate.github_settings_url,
        input.now,
        input.projectId,
        input.expectedRouteRevision,
        input.expectedRouteDigest,
        input.repository,
        input.installationId,
      ),
      this.accessCheckStatement({
        checkId: input.checkId,
        projectId: input.projectId,
        repository: input.repository,
        installationId: input.installationId,
        requiredPermissionsDigest: input.requiredPermissionsDigest,
        observedPermissionsDigest: input.observedPermissionsDigest,
        result: input.result,
        settingsUrl: input.settingsUrl,
        safeErrorCategory: input.safeErrorCategory,
        actorEmail: input.actorEmail,
        checkedAt: input.now,
      }),
    ]);
    if ((results[0]?.meta.changes ?? 0) !== 1) {
      throw new RepositoryRouteError("stale_repository_revision");
    }
    const saved = await this.readView(input.projectId);
    if (
      saved === null || saved.routeDigest !== digest || saved.accessState !== input.result ||
      (disable && saved.dispatchEnabled)
    ) throw new RepositoryRouteError("route_read_back_failed");
    return saved;
  }

  async activeRuns(projectId?: string): Promise<FrozenRunRouteRecord[]> {
    const statement = projectId === undefined
      ? this.database.prepare(
        `SELECT run_id, project_id, route_project_name, route_repository,
                route_github_installation_id, route_revision, route_digest,
                route_start_state_name, route_human_gate_state_id,
                route_repository_revision, route_workflow_revision, route_review_revision
         FROM orchestration_runs WHERE status IN ${activeStatuses}
         ORDER BY run_id`,
      )
      : this.database.prepare(
        `SELECT run_id, project_id, route_project_name, route_repository,
                route_github_installation_id, route_revision, route_digest,
                route_start_state_name, route_human_gate_state_id,
                route_repository_revision, route_workflow_revision, route_review_revision
         FROM orchestration_runs WHERE project_id = ? AND status IN ${activeStatuses}
         ORDER BY run_id`,
      ).bind(projectId);
    return (await statement.all<FrozenRunRouteRecord>()).results;
  }

  async saveInstallationObservations(input: readonly {
    installationId: string;
    accountLogin: string;
    accountType: "User" | "Organization";
    targetType: "User" | "Organization";
    repositorySelection: "all" | "selected";
    permissionsDigest: string;
    settingsUrl: string;
    suspended: boolean;
    observedAt: string;
  }[]): Promise<void> {
    if (input.length === 0) return;
    await this.database.batch(input.map((installation) => this.database.prepare(
      `INSERT INTO github_app_installations
       (installation_id, account_login, account_type, target_type,
        repository_selection, permissions_digest, settings_url, suspended, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(installation_id) DO UPDATE SET
         account_login = excluded.account_login,
         account_type = excluded.account_type,
         target_type = excluded.target_type,
         repository_selection = excluded.repository_selection,
         permissions_digest = excluded.permissions_digest,
         settings_url = excluded.settings_url,
         suspended = excluded.suspended,
         observed_at = excluded.observed_at`,
    ).bind(
      installation.installationId,
      installation.accountLogin,
      installation.accountType,
      installation.targetType,
      installation.repositorySelection,
      installation.permissionsDigest,
      installation.settingsUrl,
      installation.suspended ? 1 : 0,
      installation.observedAt,
    )));
  }

  async backfillLegacyRoute(input: {
    projectId: string;
    projectName: string;
    githubInstallationId: string;
    actorEmail: string;
    now: string;
  }): Promise<{ route: CompleteRepositoryRoute; activeRuns: FrozenRunRouteRecord[] }> {
    const current = await this.read(input.projectId);
    if (current === null) throw new Error("legacy route is missing");
    const candidate: RepositoryRouteRecord = {
      ...current,
      linear_project_name: current.linear_project_name ?? input.projectName,
      github_installation_id: current.github_installation_id ?? input.githubInstallationId,
      route_updated_by: current.route_digest === null ? input.actorEmail : current.route_updated_by,
      route_updated_at: current.route_digest === null ? input.now : current.route_updated_at,
      route_digest: null,
    };
    const digest = await repositoryRouteDigest(candidate);
    const update = await this.database.prepare(
      `UPDATE project_workflow_policies
       SET linear_project_name = ?, github_installation_id = ?, route_digest = ?,
           route_updated_by = ?, route_updated_at = ?
       WHERE project_id = ?
         AND (linear_project_name IS NULL OR github_installation_id IS NULL OR route_digest IS NULL)`,
    ).bind(
      candidate.linear_project_name,
      candidate.github_installation_id,
      digest,
      candidate.route_updated_by,
      candidate.route_updated_at,
      input.projectId,
    ).run();
    if ((update.meta.changes ?? 0) > 1) throw new Error("legacy route backfill changed several rows");
    const route = requireCompleteRoute((await this.read(input.projectId)) ?? candidate);
    if (route.route_digest !== await repositoryRouteDigest(route)) {
      throw new Error("legacy route digest read-back failed");
    }

    await this.database.prepare(
      `UPDATE orchestration_runs
       SET route_project_name = COALESCE(route_project_name, ?),
           route_repository = COALESCE(route_repository, ?),
           route_github_installation_id = COALESCE(route_github_installation_id, ?),
           route_revision = COALESCE(route_revision, ?),
           route_digest = COALESCE(route_digest, ?),
           route_start_state_name = COALESCE(route_start_state_name, ?),
           route_human_gate_state_id = COALESCE(route_human_gate_state_id, ?),
           route_repository_revision = COALESCE(route_repository_revision, ?),
           route_workflow_revision = COALESCE(route_workflow_revision, ?),
           route_review_revision = COALESCE(route_review_revision, ?)
       WHERE project_id = ? AND status IN ${activeStatuses}`,
    ).bind(
      route.linear_project_name,
      route.trial_repository,
      route.github_installation_id,
      route.route_revision,
      route.route_digest,
      route.start_state_name,
      route.human_gate_state_id,
      route.repository_revision,
      route.workflow_revision,
      route.independent_review_revision,
      route.project_id,
    ).run();
    const activeRuns = await this.activeRuns(route.project_id);
    if (activeRuns.some((run) =>
      run.route_repository === null || run.route_github_installation_id === null ||
      run.route_revision === null || run.route_digest === null
    )) throw new Error("active run route backfill read-back failed");
    return { route, activeRuns };
  }

  async recordAccessCheck(input: {
    checkId: string;
    projectId: string;
    repository: string;
    installationId: string;
    requiredPermissionsDigest: string;
    observedPermissionsDigest: string | null;
    result: Exclude<GitHubAccessState, "unchecked">;
    settingsUrl: string | null;
    safeErrorCategory: string | null;
    actorEmail: string;
    checkedAt: string;
  }): Promise<void> {
    await this.accessCheckStatement(input).run();
  }

  private accessCheckStatement(input: {
    checkId: string;
    projectId: string;
    repository: string;
    installationId: string;
    requiredPermissionsDigest: string;
    observedPermissionsDigest: string | null;
    result: Exclude<GitHubAccessState, "unchecked">;
    settingsUrl: string | null;
    safeErrorCategory: string | null;
    actorEmail: string;
    checkedAt: string;
  }): D1PreparedStatement {
    return this.database.prepare(
      `INSERT INTO route_access_checks
       (check_id, project_id, repository, installation_id, required_permissions_digest,
        observed_permissions_digest, result, settings_url, safe_error_category,
        actor_email, checked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.checkId,
      input.projectId,
      input.repository,
      input.installationId,
      input.requiredPermissionsDigest,
      input.observedPermissionsDigest,
      input.result,
      input.settingsUrl,
      input.safeErrorCategory,
      input.actorEmail,
      input.checkedAt,
    );
  }

  async recordDispatchResult(input: {
    resultId: string;
    deliveryId: string;
    projectId: string;
    queuedRouteRevision: number | null;
    queuedRouteDigest: string | null;
    outcome: "stale_route" | "missing_route" | "disabled_route" | "access_denied";
    safeErrorCategory: string | null;
    recordedAt: string;
  }): Promise<void> {
    await this.database.prepare(
      `INSERT OR IGNORE INTO route_dispatch_results
       (result_id, delivery_id, project_id, queued_route_revision, queued_route_digest,
        outcome, safe_error_category, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      input.resultId,
      input.deliveryId,
      input.projectId,
      input.queuedRouteRevision,
      input.queuedRouteDigest,
      input.outcome,
      input.safeErrorCategory,
      input.recordedAt,
    ).run();
  }
}
