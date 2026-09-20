import assert from "node:assert/strict";
import test from "node:test";

import type { GitHubAppCatalog } from "../src/github-capability.ts";
import type { LinearCapabilityAdapter } from "../src/linear-capability.ts";
import type { D1RepositoryRouteStore, RepositoryRouteView } from "../src/repository-routes.ts";
import { RouteAdminError, RouteAdminService } from "../src/route-admin.ts";
import type { LoadedWorkflowDefinition } from "../src/workflow-definition.ts";
import { ImplementationTestDatabase, seedRun } from './helpers/implementation-fixture.ts';

test('implementation selection before scheduled registration preserves frozen runs and rejects version reuse', async () => {
  const db = new ImplementationTestDatabase();
  try {
    seedRun(db);
    db.sqlite.prepare(`INSERT INTO project_workflow_policies
      (project_id,definition_id,definition_version,definition_digest,trial_repository,start_state_name,human_gate_state_id,dispatch_enabled,updated_at,linear_project_name,github_installation_id)
      VALUES ('project','implementation',25,?,'owner/repository','Todo','review',1,?,'Sample','123')`).run('d'.repeat(64),NOW);
    let definition = {name:'implementation',version:41,digest:'e'.repeat(64),implementationPolicy:{}} as LoadedWorkflowDefinition;
    const service = new RouteAdminService({...env,DB:db as unknown as D1Database},()=>new Date(NOW),{
      linear: {implementationUser:async()=>({id:'human',active:true,isMe:false})} as unknown as LinearCapabilityAdapter,
      loadDefinitions:async()=>({implementation:definition}),
    });
    const revision = Number(db.sqlite.prepare("SELECT route_revision FROM project_workflow_policies WHERE project_id='project'").get()!.route_revision);
    assert.equal(db.sqlite.prepare("SELECT * FROM workflow_definitions WHERE version=41").get(),undefined);
    const saved = await service.saveImplementation('operator@example.com',{projectId:'project',userId:'human',expectedRevision:revision});
    assert.equal(saved.definitionVersion,41);
    assert.equal(saved.dispatchEnabled,false);
    assert.equal(db.sqlite.prepare("SELECT definition_version FROM orchestration_runs WHERE run_id='run-1'").get()!.definition_version,25);
    definition = {...definition,digest:'f'.repeat(64)};
    await assert.rejects(service.saveImplementation('operator@example.com',{projectId:'project',userId:'human',expectedRevision:saved.routeRevision}),/another digest/);
    assert.equal(db.sqlite.prepare("SELECT definition_digest FROM project_workflow_policies WHERE project_id='project'").get()!.definition_digest,'e'.repeat(64));
  } finally {db.close();}
});

const NOW = "2026-08-31T09:00:00.000Z";
const route: RepositoryRouteView = {
  projectId: "project-1",
  projectName: "Sample project",
  repository: "owner/repository",
  githubInstallationId: "154095438",
  definitionId: "simple-traceability",
  definitionVersion: 13,
  definitionDigest: "a".repeat(64),
  startStateName: "Todo",
  humanGateStateId: "human-review",
  dispatchEnabled: false,
  repositoryRevision: 2,
  workflowRevision: 3,
  independentReviewProvider: "openrouter",
  independentReviewModel: "deepseek/deepseek-v4-pro",
  independentReviewRevision: 4,
  routeRevision: 5,
  routeDigest: "b".repeat(64),
  updatedBy: "operator@example.com",
  updatedAt: NOW,
  accessState: "passed",
  accessCheckedAt: NOW,
  accessPermissionsDigest: "c".repeat(64),
  githubSettingsUrl: "https://github.com/settings/installations/154095438",
  activeRuns: 2,
};

const env = {
  DB: {} as D1Database,
  LINEAR_API_URL: "https://api.linear.test/graphql",
  LINEAR_APP_ACCESS_TOKEN: "linear-secret",
  GITHUB_API_URL: "https://api.github.test",
  GITHUB_APP_ID: "1234",
  GITHUB_APP_PRIVATE_KEY: "github-private-key",
  LINEAR_START_STATE_NAME: "Todo",
  LINEAR_HUMAN_APPROVAL_STATE_ID: "human-review",
  OPENROUTER_SUPPORTED_MODELS: "deepseek/deepseek-v4-pro",
  ROUTE_ADMIN_ALLOWED_EMAIL: "operator@example.com",
} as unknown as Env & { ROUTE_ADMIN_ALLOWED_EMAIL: string };

const project = {
  projectId: "project-1",
  name: "Sample project",
  url: "https://linear.app/test/project/sample",
  teams: [{ id: "team-1", name: "SAC", key: "SAC" }],
};
const installation = {
  installationId: "154095438",
  accountLogin: "owner",
  accountType: "User" as const,
  targetType: "User" as const,
  repositorySelection: "selected" as const,
  permissions: { metadata: "read", contents: "write", pull_requests: "write", checks: "write" },
  settingsUrl: "https://github.com/settings/installations/154095438",
  suspended: false,
  repositories: [{
    repositoryId: "123",
    fullName: "owner/repository",
    defaultBranch: "main",
    private: false,
    archived: false,
    disabled: false,
    installationId: "154095438",
    accountLogin: "owner",
    permissions: { metadata: "read", contents: "write", pull_requests: "write", checks: "write" },
    settingsUrl: "https://github.com/settings/installations/154095438",
    access: "ready" as const,
  }],
};

test("route overview keeps saved routes visible when both live catalogs fail", async () => {
  const routes = {
    listViews: async () => [route],
  } as unknown as D1RepositoryRouteStore;
  const linear = ({ listProjects: async () => { throw new Error("raw linear error"); } }) as unknown as LinearCapabilityAdapter;
  const github = ({ list: async () => { throw new Error("raw github error"); } }) as unknown as GitHubAppCatalog;
  const service = new RouteAdminService(env, () => new Date(NOW), { routes, linear, github });

  const overview = await service.overview("operator@example.com");
  assert.deepEqual(overview.routes, [route]);
  assert.equal(overview.linear.state, "unavailable");
  assert.equal(overview.github.state, "unavailable");
  assert.doesNotMatch(JSON.stringify(overview), /raw linear|raw github|linear-secret|private-key/);
});

test("route admin rejects another actor and extra RPC input before provider work", async () => {
  let providerCalls = 0;
  const service = new RouteAdminService(env, () => new Date(NOW), {
    routes: {} as D1RepositoryRouteStore,
    linear: { listProjects: async () => { providerCalls += 1; return [project]; } } as unknown as LinearCapabilityAdapter,
    github: { list: async () => { providerCalls += 1; return [installation]; } } as unknown as GitHubAppCatalog,
  });
  await assert.rejects(
    service.overview("attacker@example.com"),
    (error: unknown) => error instanceof RouteAdminError && error.code === "unauthorized_actor",
  );
  await assert.rejects(
    service.saveWorkflow("operator@example.com", {
      projectId: "project-1",
      dispatchEnabled: true,
      expectedRevision: 3,
      extra: true,
    } as never),
    (error: unknown) => error instanceof RouteAdminError && error.code === "invalid_input",
  );
  assert.equal(providerCalls, 0);
});

test("enabling a route checks its frozen install and saves despite active runs", async () => {
  const saved: Array<Record<string, unknown>> = [];
  const routes = {
    read: async () => ({
      project_id: "project-1",
      trial_repository: "owner/repository",
      github_installation_id: "154095438",
      github_settings_url: installation.settingsUrl,
    }),
    saveWorkflow: async (input: Record<string, unknown>) => {
      saved.push(input);
      return { ...route, dispatchEnabled: true, workflowRevision: 4, routeRevision: 6 };
    },
  } as unknown as D1RepositoryRouteStore;
  const github = {
    checkRepository: async (installationId: string, repository: string) => {
      assert.equal(installationId, "154095438");
      assert.equal(repository, "owner/repository");
      return {
        state: "passed" as const,
        repository: installation.repositories[0],
        settingsUrl: installation.settingsUrl,
        permissions: installation.permissions,
      };
    },
  } as unknown as GitHubAppCatalog;
  const service = new RouteAdminService(env, () => new Date(NOW), {
    routes,
    github,
    linear: {} as LinearCapabilityAdapter,
  });

  const updated = await service.saveWorkflow("operator@example.com", {
    projectId: "project-1",
    dispatchEnabled: true,
    expectedRevision: 3,
  });
  assert.equal(updated.dispatchEnabled, true);
  assert.equal(updated.activeRuns, 2);
  assert.equal(saved[0]?.projectId, "project-1");
  assert.equal((saved[0]?.access as { settingsUrl: string }).settingsUrl, installation.settingsUrl);
});

test("implementation dispatch checks the bound account id independently of its email", async () => {
  const binding = {project_id: "project-1", trial_repository: "owner/repository",
    github_installation_id: "154095438", github_settings_url: installation.settingsUrl,
    definition_id: "implementation", allowed_access_email: "operator@example.com",
    allowed_linear_user_id: "human-1", human_binding_revision: 1};
  let human = {id: "human-1", active: true, isMe: false, email: "different@linear.example"};
  let saves = 0;
  const service = new RouteAdminService(env, () => new Date(NOW), {
    routes: {read: async () => binding, saveWorkflow: async () => {
      saves += 1; return {...route, dispatchEnabled: true};
    }} as unknown as D1RepositoryRouteStore,
    linear: {implementationUser: async (id: string) => {
      assert.equal(id, "human-1"); return human;
    }} as unknown as LinearCapabilityAdapter,
    github: {checkRepository: async () => ({state: "passed", repository: installation.repositories[0],
      settingsUrl: installation.settingsUrl, permissions: installation.permissions})} as unknown as GitHubAppCatalog,
  });
  const enable = () => service.saveWorkflow("operator@example.com", {
    projectId: "project-1", dispatchEnabled: true, expectedRevision: 3,
  });
  assert.equal((await enable()).dispatchEnabled, true);
  for (const invalid of [{...human, id: "another-human"}, {...human, active: false}, {...human, isMe: true}]) {
    human = invalid;
    await assert.rejects(enable(), (error: unknown) => error instanceof RouteAdminError && error.code === "unauthorized_actor");
  }
  human = {id: "human-1", active: true, isMe: false, email: "operator@example.com"};
  binding.allowed_access_email = "another@example.com";
  await assert.rejects(enable(), (error: unknown) => error instanceof RouteAdminError && error.code === "unauthorized_actor");
  assert.equal(saves, 1);
});

test("creating a route pairs only provider-listed ids and records a disabled route", async () => {
  const created: Array<Record<string, unknown>> = [];
  const routes = {
    create: async (input: Record<string, unknown>) => {
      created.push(input);
      return route;
    },
    saveInstallationObservations: async () => undefined,
  } as unknown as D1RepositoryRouteStore;
  const service = new RouteAdminService(env, () => new Date(NOW), {
    routes,
    linear: { listProjects: async () => [project] } as unknown as LinearCapabilityAdapter,
    github: { list: async () => [installation] } as unknown as GitHubAppCatalog,
    loadDefinitions: async () => ({
      "simple-traceability-claude": {
        name: "simple-traceability-claude",
        version: 13,
        digest: "a".repeat(64),
      } as LoadedWorkflowDefinition,
    }),
  });
  await service.createRoute("operator@example.com", {
    projectId: "project-1",
    repository: "owner/repository",
    githubInstallationId: "154095438",
  });
  assert.equal(created[0]?.projectName, "Sample project");
  assert.equal(created[0]?.repository, "owner/repository");
  assert.equal(created[0]?.githubInstallationId, "154095438");
});
