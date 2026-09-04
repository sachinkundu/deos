import {
  GitHubAppCatalog,
  type GitHubInstallationChoice,
  type GitHubRepositoryAccessCheck,
  type GitHubRepositoryChoice,
} from "./github-capability.ts";
import { LinearCapabilityAdapter, type LinearProjectChoice } from "./linear-capability.ts";
import {
  D1RepositoryRouteStore,
  permissionsDigest,
  RepositoryRouteError,
  REQUIRED_GITHUB_PERMISSIONS,
  type RepositoryRouteView,
} from "./repository-routes.ts";
import { DEFAULT_WORKFLOW_DEFINITION_ID } from "./workflow-default.ts";
import type { LoadedWorkflowDefinition } from "./workflow-definition.ts";

export type RouteAdminErrorCode =
  | "unauthorized_actor"
  | "invalid_input"
  | "provider_unavailable"
  | "project_not_available"
  | "repository_not_available"
  | "github_access_not_ready"
  | "unsupported_review_model"
  | RepositoryRouteError["code"];

export class RouteAdminError extends Error {
  readonly code: RouteAdminErrorCode;

  constructor(code: RouteAdminErrorCode) {
    super(code);
    this.code = code;
  }
}

export interface RouteProviderCatalog<T> {
  state: "ready" | "unavailable";
  values: readonly T[];
  error: "provider_unavailable" | null;
}

export interface RouteAdminOverview {
  routes: readonly RepositoryRouteView[];
  linear: RouteProviderCatalog<LinearProjectChoice>;
  github: RouteProviderCatalog<GitHubInstallationChoice>;
  supportedReviewModels: readonly string[];
}

export interface RouteRepositoryInput {
  projectId: string;
  repository: string;
  githubInstallationId: string;
}

type RouteAdminRuntimeEnv = Pick<
  Env,
  | "DB"
  | "LINEAR_API_URL"
  | "LINEAR_APP_ACCESS_TOKEN"
  | "GITHUB_API_URL"
  | "GITHUB_APP_ID"
  | "GITHUB_APP_PRIVATE_KEY"
  | "LINEAR_START_STATE_NAME"
  | "LINEAR_HUMAN_APPROVAL_STATE_ID"
  | "OPENROUTER_SUPPORTED_MODELS"
> & { ROUTE_ADMIN_ALLOWED_EMAIL: string };

type DefinitionLoader = () => Promise<Readonly<Record<string, LoadedWorkflowDefinition>>>;

const normalizeIdentifier = (value: unknown): string => {
  if (typeof value !== "string") throw new RouteAdminError("invalid_input");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/.test(normalized)) {
    throw new RouteAdminError("invalid_input");
  }
  return normalized;
};

const exactInput = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const allowed = new Set(keys);
  const received = Object.keys(value);
  return received.length === keys.length && received.every((key) => allowed.has(key));
};

const normalizeRepository = (value: unknown): string => {
  if (typeof value !== "string") throw new RouteAdminError("invalid_input");
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized) || normalized.length > 200) {
    throw new RouteAdminError("invalid_input");
  }
  return normalized;
};

const normalizeInstallationId = (value: unknown): string => {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,19}$/.test(value)) {
    throw new RouteAdminError("invalid_input");
  }
  return value;
};

const normalizeRevision = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new RouteAdminError("invalid_input");
  }
  return Number(value);
};

const parseModels = (value: string): readonly string[] => {
  const models = value.split(",").map((model) => model.trim()).filter(Boolean).sort();
  if (
    models.length === 0 || new Set(models).size !== models.length ||
    models.some((model) => !/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(model))
  ) throw new Error("supported review model configuration is invalid");
  return Object.freeze(models);
};

const safeProviderError = <T>(): RouteProviderCatalog<T> => ({
  state: "unavailable",
  values: [],
  error: "provider_unavailable",
});

export class RouteAdminService {
  private readonly env: RouteAdminRuntimeEnv;
  private readonly routes: D1RepositoryRouteStore;
  private readonly linear: LinearCapabilityAdapter;
  private readonly github: GitHubAppCatalog;
  private readonly models: readonly string[];
  private readonly now: () => Date;
  private readonly loadDefinitions: DefinitionLoader;

  constructor(
    env: RouteAdminRuntimeEnv,
    now: () => Date = () => new Date(),
    dependencies: {
      routes?: D1RepositoryRouteStore;
      linear?: LinearCapabilityAdapter;
      github?: GitHubAppCatalog;
      loadDefinitions?: DefinitionLoader;
    } = {},
  ) {
    this.env = env;
    this.now = now;
    this.routes = dependencies.routes ?? new D1RepositoryRouteStore(env.DB);
    this.linear = dependencies.linear ?? new LinearCapabilityAdapter(env.LINEAR_API_URL, env.LINEAR_APP_ACCESS_TOKEN);
    this.github = dependencies.github ?? new GitHubAppCatalog({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
    });
    this.loadDefinitions = dependencies.loadDefinitions ?? (async () =>
      (await import("./workflow-bundle.ts")).loadBundledWorkflowDefinitionRegistry());
    this.models = parseModels(env.OPENROUTER_SUPPORTED_MODELS);
  }

  async overview(actorEmail: string): Promise<RouteAdminOverview> {
    this.actor(actorEmail);
    const routes = await this.routes.listViews();
    const [linear, github] = await Promise.allSettled([
      this.linear.listProjects(),
      this.github.list(),
    ]);
    if (github.status === "fulfilled") await this.observeInstallations(github.value);
    return {
      routes,
      linear: linear.status === "fulfilled"
        ? { state: "ready", values: linear.value, error: null }
        : safeProviderError(),
      github: github.status === "fulfilled"
        ? { state: "ready", values: github.value, error: null }
        : safeProviderError(),
      supportedReviewModels: this.models,
    };
  }

  async createRoute(actorEmail: string, input: RouteRepositoryInput): Promise<RepositoryRouteView> {
    this.actor(actorEmail);
    const normalized = this.repositoryInput(input);
    const [projects, installations, definitions] = await Promise.all([
      this.projects(),
      this.installations(),
      this.loadDefinitions(),
    ]);
    const project = projects.find((value) => value.projectId === normalized.projectId);
    if (project === undefined) throw new RouteAdminError("project_not_available");
    const repository = this.repositoryChoice(installations, normalized);
    const definition = definitions[DEFAULT_WORKFLOW_DEFINITION_ID];
    if (definition === undefined) throw new Error("default workflow definition is unavailable");
    const requiredDigest = await permissionsDigest(REQUIRED_GITHUB_PERMISSIONS);
    const observedDigest = await permissionsDigest(repository.permissions);
    return this.routes.create({
      projectId: project.projectId,
      projectName: project.name,
      repository: repository.fullName,
      githubInstallationId: repository.installationId,
      definitionId: definition.name,
      definitionVersion: definition.version,
      definitionDigest: definition.digest,
      startStateName: this.env.LINEAR_START_STATE_NAME,
      humanGateStateId: this.env.LINEAR_HUMAN_APPROVAL_STATE_ID,
      independentReviewModel: this.models[0] ?? null,
      actorEmail,
      now: this.now().toISOString(),
      access: {
        checkId: crypto.randomUUID(),
        requiredPermissionsDigest: requiredDigest,
        observedPermissionsDigest: observedDigest,
        settingsUrl: repository.settingsUrl,
      },
    }).catch((error: unknown) => { throw this.storeError(error); });
  }

  async saveRepository(
    actorEmail: string,
    input: RouteRepositoryInput & { expectedRevision: number },
  ): Promise<RepositoryRouteView> {
    this.actor(actorEmail);
    if (!exactInput(input, ["projectId", "repository", "githubInstallationId", "expectedRevision"])) {
      throw new RouteAdminError("invalid_input");
    }
    const normalized = {
      ...this.repositoryInput(input, true),
      expectedRevision: normalizeRevision(input.expectedRevision),
    };
    const repository = this.repositoryChoice(await this.installations(), normalized);
    return this.routes.saveRepository({
      projectId: normalized.projectId,
      repository: repository.fullName,
      githubInstallationId: repository.installationId,
      expectedRevision: normalized.expectedRevision,
      actorEmail,
      now: this.now().toISOString(),
      access: {
        checkId: crypto.randomUUID(),
        requiredPermissionsDigest: await permissionsDigest(REQUIRED_GITHUB_PERMISSIONS),
        observedPermissionsDigest: await permissionsDigest(repository.permissions),
        settingsUrl: repository.settingsUrl,
      },
    }).catch((error: unknown) => { throw this.storeError(error); });
  }

  async saveWorkflow(actorEmail: string, input: {
    projectId: string;
    dispatchEnabled: boolean;
    expectedRevision: number;
  }): Promise<RepositoryRouteView> {
    this.actor(actorEmail);
    if (!exactInput(input, ["projectId", "dispatchEnabled", "expectedRevision"])) {
      throw new RouteAdminError("invalid_input");
    }
    const projectId = normalizeIdentifier(input.projectId);
    if (typeof input.dispatchEnabled !== "boolean") throw new RouteAdminError("invalid_input");
    const expectedRevision = normalizeRevision(input.expectedRevision);
    if (!input.dispatchEnabled) {
      return this.routes.saveWorkflow({
        projectId,
        dispatchEnabled: false,
        expectedRevision,
        actorEmail,
        now: this.now().toISOString(),
      }).catch((error: unknown) => { throw this.storeError(error); });
    }
    const route = await this.routes.read(projectId);
    if (route?.github_installation_id === null || route === null) {
      throw new RouteAdminError("route_not_found");
    }
    const access = await this.liveAccess(
      projectId,
      route.trial_repository,
      route.github_installation_id,
      actorEmail,
      false,
    );
    if (access.state !== "passed" || access.repository === null || access.permissions === null) {
      await this.persistAccess(projectId, route, access, actorEmail);
      throw new RouteAdminError("github_access_not_ready");
    }
    return this.routes.saveWorkflow({
      projectId,
      dispatchEnabled: true,
      expectedRevision,
      actorEmail,
      now: this.now().toISOString(),
      access: {
        repository: route.trial_repository,
        installationId: route.github_installation_id,
        checkId: crypto.randomUUID(),
        requiredPermissionsDigest: await permissionsDigest(REQUIRED_GITHUB_PERMISSIONS),
        observedPermissionsDigest: await permissionsDigest(access.permissions),
        settingsUrl: access.settingsUrl ?? access.repository.settingsUrl,
      },
    }).catch((error: unknown) => { throw this.storeError(error); });
  }

  async saveReview(actorEmail: string, input: {
    projectId: string;
    model: string;
    expectedRevision: number;
  }): Promise<RepositoryRouteView> {
    this.actor(actorEmail);
    if (!exactInput(input, ["projectId", "model", "expectedRevision"])) {
      throw new RouteAdminError("invalid_input");
    }
    const projectId = normalizeIdentifier(input.projectId);
    if (typeof input.model !== "string" || !this.models.includes(input.model)) {
      throw new RouteAdminError("unsupported_review_model");
    }
    return this.routes.saveReview({
      projectId,
      model: input.model,
      expectedRevision: normalizeRevision(input.expectedRevision),
      actorEmail,
      now: this.now().toISOString(),
    }).catch((error: unknown) => { throw this.storeError(error); });
  }

  async recheck(actorEmail: string, input: { projectId: string }): Promise<RepositoryRouteView> {
    this.actor(actorEmail);
    if (!exactInput(input, ["projectId"])) throw new RouteAdminError("invalid_input");
    const projectId = normalizeIdentifier(input.projectId);
    const route = await this.routes.read(projectId);
    if (route === null || route.github_installation_id === null) {
      throw new RouteAdminError("route_not_found");
    }
    const access = await this.liveAccess(
      projectId,
      route.trial_repository,
      route.github_installation_id,
      actorEmail,
      true,
    );
    return this.persistAccess(projectId, route, access, actorEmail);
  }

  private actor(value: string): void {
    if (typeof value !== "string" || value.toLowerCase() !== this.env.ROUTE_ADMIN_ALLOWED_EMAIL.toLowerCase()) {
      throw new RouteAdminError("unauthorized_actor");
    }
  }

  private repositoryInput(input: RouteRepositoryInput, withRevision = false): RouteRepositoryInput {
    const keys = withRevision
      ? ["projectId", "repository", "githubInstallationId", "expectedRevision"]
      : ["projectId", "repository", "githubInstallationId"];
    if (!exactInput(input, keys)) {
      throw new RouteAdminError("invalid_input");
    }
    return {
      projectId: normalizeIdentifier(input.projectId),
      repository: normalizeRepository(input.repository),
      githubInstallationId: normalizeInstallationId(input.githubInstallationId),
    };
  }

  private async projects(): Promise<LinearProjectChoice[]> {
    try {
      return await this.linear.listProjects();
    } catch {
      throw new RouteAdminError("provider_unavailable");
    }
  }

  private async installations(): Promise<GitHubInstallationChoice[]> {
    try {
      const installations = await this.github.list();
      await this.observeInstallations(installations);
      return installations;
    } catch {
      throw new RouteAdminError("provider_unavailable");
    }
  }

  private repositoryChoice(
    installations: readonly GitHubInstallationChoice[],
    input: RouteRepositoryInput,
  ): GitHubRepositoryChoice {
    const installation = installations.find((value) => value.installationId === input.githubInstallationId);
    const repository = installation?.repositories.find((value) => value.fullName === input.repository);
    if (repository === undefined) throw new RouteAdminError("repository_not_available");
    if (repository.access !== "ready") throw new RouteAdminError("github_access_not_ready");
    return repository;
  }

  private async liveAccess(
    _projectId: string,
    repository: string,
    installationId: string,
    _actorEmail: string,
    _persist: boolean,
  ): Promise<GitHubRepositoryAccessCheck | { state: "unavailable"; repository: null; settingsUrl: null; permissions: null }> {
    try {
      return await this.github.checkRepository(installationId, repository);
    } catch {
      return { state: "unavailable", repository: null, settingsUrl: null, permissions: null };
    }
  }

  private async persistAccess(
    projectId: string,
    route: {
      trial_repository: string;
      github_installation_id: string | null;
      route_revision: number;
      route_digest: string | null;
      github_settings_url: string | null;
    },
    access: GitHubRepositoryAccessCheck | {
      state: "unavailable";
      repository: null;
      settingsUrl: null;
      permissions: null;
    },
    actorEmail: string,
  ): Promise<RepositoryRouteView> {
    if (route.github_installation_id === null || route.route_digest === null) {
      throw new RouteAdminError("route_not_found");
    }
    const observedPermissionsDigest = access.permissions === null
      ? null
      : await permissionsDigest(access.permissions);
    return this.routes.saveAccessResult({
      projectId,
      repository: route.trial_repository,
      installationId: route.github_installation_id,
      expectedRouteRevision: route.route_revision,
      expectedRouteDigest: route.route_digest,
      checkId: crypto.randomUUID(),
      requiredPermissionsDigest: await permissionsDigest(REQUIRED_GITHUB_PERMISSIONS),
      observedPermissionsDigest,
      result: access.state,
      settingsUrl: access.settingsUrl ?? route.github_settings_url,
      safeErrorCategory: access.state === "unavailable" ? "provider_unavailable" : null,
      actorEmail,
      now: this.now().toISOString(),
    }).catch((error: unknown) => { throw this.storeError(error); });
  }

  private async observeInstallations(installations: readonly GitHubInstallationChoice[]): Promise<void> {
    const observedAt = this.now().toISOString();
    await this.routes.saveInstallationObservations(await Promise.all(installations.map(async (value) => ({
      installationId: value.installationId,
      accountLogin: value.accountLogin,
      accountType: value.accountType,
      targetType: value.targetType,
      repositorySelection: value.repositorySelection,
      permissionsDigest: await permissionsDigest(value.permissions),
      settingsUrl: value.settingsUrl,
      suspended: value.suspended,
      observedAt,
    }))));
  }

  private storeError(error: unknown): Error {
    return error instanceof RepositoryRouteError ? new RouteAdminError(error.code) :
      error instanceof Error ? error : new Error("route admin operation failed");
  }
}
