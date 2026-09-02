#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { DEFAULT_WORKFLOW_DEFINITION_ID } from "../src/workflow-default.ts";
import { loadWorkflowDefinition, type LoadedWorkflowDefinition } from "../src/workflow-definition.ts";
import { repositoryRouteDigest, type RepositoryRouteRecord } from "../src/repository-routes.ts";

interface WranglerConfig {
  account_id: string;
  vars: { LINEAR_PROJECT_ID: string };
  d1_databases: Array<{ binding: string; database_id: string }>;
}

interface D1Result<Row = Record<string, unknown>> {
  results: Row[];
  success: boolean;
  meta?: { changes?: number };
}

interface D1Envelope<Row = Record<string, unknown>> {
  success: boolean;
  result: D1Result<Row>[];
  errors?: Array<{ message?: string }>;
}

interface StoredDefinition {
  definition_id: string;
  version: number;
  digest: string;
}

export const assertDefinitionPreflight = (
  definition: LoadedWorkflowDefinition,
  stored: readonly StoredDefinition[],
): void => {
  const sameVersion = stored.find((candidate) => candidate.version === definition.version);
  if (sameVersion !== undefined && sameVersion.digest !== definition.digest) {
    throw new Error(
      `${definition.name} v${definition.version} already exists with another digest; increment the workflow version before deploying`,
    );
  }
  const latest = Math.max(0, ...stored.map((candidate) => candidate.version));
  if (sameVersion === undefined && definition.version <= latest) {
    throw new Error(
      `${definition.name} v${definition.version} is not newer than the registered v${latest}`,
    );
  }
};

const readDirectory = async (directory: string, prefix: string): Promise<Record<string, string>> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const result: Record<string, string> = {};
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    result[`${prefix}/${entry.name}`] = await readFile(resolve(directory, entry.name), "utf8");
  }
  return result;
};

const loadDefinitions = async (root: string): Promise<LoadedWorkflowDefinition[]> => {
  const prompts = await readDirectory(resolve(root, "config/prompts"), "prompts");
  const schemas = await readDirectory(resolve(root, "config/schemas"), "schemas");
  const sources = await Promise.all([
    "config/workflow.deos.yaml",
    "config/workflow.simple.yaml",
    "config/workflow.simple-traceability.yaml",
  ].map((path) => readFile(resolve(root, path), "utf8")));
  return Promise.all(sources.map((source) => loadWorkflowDefinition(source, { prompts, schemas })));
};

const loadDotEnv = async (root: string): Promise<void> => {
  let source: string;
  try {
    source = await readFile(resolve(root, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match === null || process.env[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
};

class D1Api {
  private readonly accountId: string;
  private readonly databaseId: string;
  private readonly token: string;

  constructor(
    accountId: string,
    databaseId: string,
    token: string,
  ) {
    this.accountId = accountId;
    this.databaseId = databaseId;
    this.token = token;
  }

  async query<Row = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<D1Result<Row>> {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
      },
    );
    const envelope = await response.json() as D1Envelope<Row>;
    if (!response.ok || !envelope.success || envelope.result?.[0]?.success !== true) {
      const detail = envelope.errors?.map((error) => error.message).filter(Boolean).join("; ");
      throw new Error(`D1 query failed${detail === undefined || detail.length === 0 ? "" : `: ${detail}`}`);
    }
    return envelope.result[0];
  }
}

const stageDefinitions = async (
  database: D1Api,
  definitions: readonly LoadedWorkflowDefinition[],
  projectId: string,
  now: string,
): Promise<void> => {
  for (const definition of definitions) {
    const registered = await database.query<StoredDefinition>(
      "SELECT definition_id, version, digest FROM workflow_definitions WHERE definition_id = ? ORDER BY version",
      [definition.name],
    );
    assertDefinitionPreflight(definition, registered.results);
  }
  for (const definition of definitions) {
    await database.query(
      `INSERT OR IGNORE INTO workflow_definitions
       (definition_id, version, project_id, name, canonical_json, digest, enabled_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        definition.name,
        definition.version,
        projectId,
        definition.name,
        JSON.stringify(definition),
        definition.digest,
        now,
      ],
    );
    const stored = await database.query<StoredDefinition>(
      "SELECT definition_id, version, digest FROM workflow_definitions WHERE definition_id = ? AND version = ?",
      [definition.name, definition.version],
    );
    if (stored.results.length !== 1 || stored.results[0].digest !== definition.digest) {
      throw new Error(`staged definition read-back failed for ${definition.name} v${definition.version}`);
    }
  }
};

const expectedRouteClause = (alias = ""): string => {
  const prefix = alias.length === 0 ? "" : `${alias}.`;
  return `(${prefix}project_id = ? AND ${prefix}definition_id = ? AND ${prefix}definition_version = ? AND ${prefix}definition_digest = ? AND ${prefix}workflow_revision = ? AND ${prefix}route_revision = ? AND ${prefix}route_digest = ?)`;
};

const expectedRouteParams = (route: RepositoryRouteRecord): unknown[] => [
  route.project_id,
  route.definition_id,
  route.definition_version,
  route.definition_digest,
  route.workflow_revision,
  route.route_revision,
  route.route_digest,
];

const activateDefinition = async (
  database: D1Api,
  definition: LoadedWorkflowDefinition,
  now: string,
): Promise<number> => {
  const policies = (await database.query<RepositoryRouteRecord>(
    "SELECT * FROM project_workflow_policies WHERE definition_id = ? ORDER BY project_id",
    [definition.name],
  )).results;
  if (policies.length === 0) throw new Error(`no project policies select ${definition.name}`);

  const enabledSelectors = (await database.query<{ count: number }>(
    "SELECT COUNT(*) AS count FROM workflow_definition_selectors WHERE definition_id = ? AND enabled = 1",
    [definition.name],
  )).results[0]?.count ?? 0;
  if (enabledSelectors !== 0) {
    throw new Error(`cannot atomically activate ${definition.name} while ${enabledSelectors} enabled selectors pin it`);
  }

  const nextDigests = await Promise.all(policies.map((policy) => repositoryRouteDigest({
    ...policy,
    definition_version: definition.version,
    definition_digest: definition.digest,
    workflow_revision: policy.workflow_revision + 1,
  })));
  const expected = policies.map(() => expectedRouteClause()).join(" OR ");
  const globalExpected = policies.map(() => expectedRouteClause("current")).join(" OR ");
  const digestCases = policies.map(() => "WHEN ? THEN ?").join(" ");
  const sql = `UPDATE project_workflow_policies
    SET definition_version = ?,
        definition_digest = ?,
        workflow_revision = workflow_revision + 1,
        workflow_updated_by = ?,
        workflow_updated_at = ?,
        route_revision = route_revision + 1,
        route_digest = CASE project_id ${digestCases} ELSE route_digest END,
        route_updated_by = ?,
        route_updated_at = ?,
        updated_at = ?
    WHERE (${expected})
      AND (SELECT COUNT(*) FROM project_workflow_policies AS current WHERE ${globalExpected}) = ?`;
  const result = await database.query(sql, [
    definition.version,
    definition.digest,
    "workflow-release",
    now,
    ...policies.flatMap((policy, index) => [policy.project_id, nextDigests[index]]),
    "workflow-release",
    now,
    now,
    ...policies.flatMap(expectedRouteParams),
    ...policies.flatMap(expectedRouteParams),
    policies.length,
  ]);
  if (result.meta?.changes !== policies.length) {
    throw new Error(`atomic policy activation changed ${result.meta?.changes ?? 0} of ${policies.length} rows`);
  }

  const activated = (await database.query<RepositoryRouteRecord>(
    "SELECT * FROM project_workflow_policies WHERE definition_id = ? ORDER BY project_id",
    [definition.name],
  )).results;
  for (const [index, policy] of policies.entries()) {
    const actual = activated.find((candidate) => candidate.project_id === policy.project_id);
    if (
      actual?.definition_version !== definition.version ||
      actual.definition_digest !== definition.digest ||
      actual.workflow_revision !== policy.workflow_revision + 1 ||
      actual.route_revision !== policy.route_revision + 1 ||
      actual.route_digest !== nextDigests[index]
    ) throw new Error(`activation read-back failed for project ${policy.project_id}`);
  }

  await database.query(
    "UPDATE workflow_definition_selectors SET definition_version = ?, definition_digest = ?, updated_at = ? WHERE definition_id = ? AND enabled = 0",
    [definition.version, definition.digest, now, definition.name],
  );
  await database.query(
    "UPDATE workflow_definitions SET enabled_at = COALESCE(enabled_at, ?) WHERE definition_id = ? AND version = ? AND digest = ?",
    [now, definition.name, definition.version, definition.digest],
  );
  return policies.length;
};

const runWrangler = (args: string[], capture = false): string => {
  const result = spawnSync("npx", ["wrangler", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
  });
  if (result.status !== 0) throw new Error(`wrangler ${args[0]} failed with exit code ${result.status ?? "unknown"}`);
  return capture ? result.stdout : "";
};

const assertDeploymentActive = (source: string): string => {
  const status = JSON.parse(source) as { id?: string; versions?: Array<{ version_id?: string; percentage?: number }> };
  if (status.versions?.length !== 1 || status.versions[0].percentage !== 100 || !status.versions[0].version_id) {
    throw new Error("deployment read-back did not show one Worker version at 100% traffic");
  }
  return status.versions[0].version_id;
};

export const main = async (): Promise<void> => {
  const root = process.cwd();
  const configPath = process.argv[2] ?? "wrangler.queue-consumer-ts.jsonc";
  await loadDotEnv(root);
  if (process.env.CLOUDFLARE_API_TOKEN === undefined && process.env.CLOUDFLARE_TOKEN !== undefined) {
    process.env.CLOUDFLARE_API_TOKEN = process.env.CLOUDFLARE_TOKEN;
  }
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (token === undefined || token.length === 0) throw new Error("CLOUDFLARE_API_TOKEN is required");

  const config = JSON.parse(await readFile(resolve(root, configPath), "utf8")) as WranglerConfig;
  const binding = config.d1_databases.find((candidate) => candidate.binding === "DB");
  if (binding === undefined) throw new Error("DB binding is missing from Wrangler config");
  const database = new D1Api(config.account_id, binding.database_id, token);
  const definitions = await loadDefinitions(root);
  const active = definitions.find((definition) => definition.name === DEFAULT_WORKFLOW_DEFINITION_ID);
  if (active === undefined) throw new Error(`default workflow ${DEFAULT_WORKFLOW_DEFINITION_ID} is missing`);
  const now = new Date().toISOString();

  await stageDefinitions(database, definitions, config.vars.LINEAR_PROJECT_ID, now);
  process.stdout.write(`Staged ${definitions.map((definition) => `${definition.name} v${definition.version}`).join(", ")}\n`);
  runWrangler([
    "deploy",
    "--config",
    configPath,
    "--containers-rollout",
    "immediate",
    "--message",
    `Release ${active.name} v${active.version}`,
  ]);
  const versionId = assertDeploymentActive(runWrangler([
    "deployments",
    "status",
    "--config",
    configPath,
    "--json",
  ], true));
  const activatedPolicies = await activateDefinition(database, active, now);
  process.stdout.write(
    `Activated ${active.name} v${active.version} (${active.digest}) for ${activatedPolicies} policies after Worker ${versionId} reached 100% traffic\n`,
  );
};

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
