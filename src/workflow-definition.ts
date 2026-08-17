import { parse } from "yaml";

export const WORKFLOW_API_VERSION = "deos.dev/v1alpha1" as const;
export const WORKFLOW_KIND = "DeliveryWorkflow" as const;

export type WorkflowNodeType = "agent" | "system_action" | "human_gate" | "terminal";
export type TerminalOutcome = "succeeded" | "blocked" | "failed" | "canceled";

export interface WorkflowExecutionPolicy {
  attemptTimeout: string;
  heartbeatTimeout: string;
  codexSandboxMode: "danger-full-access";
}

export interface WorkflowJob {
  id: string;
  promptFile: string;
  prompt: string;
  inputs: readonly string[];
  context: readonly string[];
  resultSchemaFile: string;
  resultSchema: Readonly<Record<string, unknown>>;
  requiredOutputs: readonly string[];
}

interface WorkflowNodeBase {
  id: string;
  type: WorkflowNodeType;
  edges: Readonly<Record<string, string>>;
}

export interface AgentWorkflowNode extends WorkflowNodeBase {
  type: "agent";
  job: string;
}

export interface SystemActionWorkflowNode extends WorkflowNodeBase {
  type: "system_action";
  action: string;
}

export interface HumanGateWorkflowNode extends WorkflowNodeBase {
  type: "human_gate";
  linearState: string;
}

export interface TerminalWorkflowNode extends WorkflowNodeBase {
  type: "terminal";
  outcome: TerminalOutcome;
}

export type WorkflowNode =
  | AgentWorkflowNode
  | SystemActionWorkflowNode
  | HumanGateWorkflowNode
  | TerminalWorkflowNode;

export interface LoadedWorkflowDefinition {
  apiVersion: typeof WORKFLOW_API_VERSION;
  kind: typeof WORKFLOW_KIND;
  name: string;
  version: number;
  start: string;
  execution: WorkflowExecutionPolicy;
  jobs: Readonly<Record<string, WorkflowJob>>;
  nodes: Readonly<Record<string, WorkflowNode>>;
  digest: string;
}

export interface WorkflowBundleSources {
  prompts: Readonly<Record<string, string>>;
  schemas: Readonly<Record<string, string>>;
}

const SYSTEM_ACTIONS = new Set([
  "openspec.create_proposal_and_requirements",
  "openspec.create_delta_specs",
  "openspec.create_tasks",
  "openspec.verify",
  "release.deploy",
  "openspec.sync_and_archive",
]);
const TERMINAL_OUTCOMES = new Set<TerminalOutcome>([
  "succeeded",
  "blocked",
  "failed",
  "canceled",
]);
const DURATION = /^\d+(?:\.\d+)?(?:ms|s|m|h|d)$/;

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return Object.fromEntries(Object.entries(value));
};

const stringValue = (record: Record<string, unknown>, key: string, label: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string`);
  }
  return value;
};

const stringArray = (
  record: Record<string, unknown>,
  key: string,
  label: string,
  required = true,
): readonly string[] => {
  const value = record[key];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.length === 0)) {
    throw new Error(`${label}.${key} must be an array of non-empty strings`);
  }
  return [...value] as string[];
};

const positiveInteger = (record: Record<string, unknown>, key: string, label: string): number => {
  const value = record[key];
  if (!Number.isInteger(value) || Number(value) < 1) {
    throw new Error(`${label}.${key} must be a positive integer`);
  }
  return Number(value);
};

const assertAllowedKeys = (
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void => {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).find((key) => !allowedSet.has(key));
  if (unknown !== undefined) throw new Error(`${label}.${unknown} is not supported`);
};

const parseEdges = (record: Record<string, unknown>, label: string): Readonly<Record<string, string>> => {
  const raw = record.edges;
  if (raw === undefined) return {};
  const edges = asRecord(raw, `${label}.edges`);
  for (const [outcome, target] of Object.entries(edges)) {
    if (outcome.length === 0 || typeof target !== "string" || target.length === 0) {
      throw new Error(`${label}.edges must map outcomes to node ids`);
    }
  }
  return Object.freeze(Object.fromEntries(Object.entries(edges).map(([key, value]) => [key, String(value)])));
};

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, canonicalize(nested)]),
  );
};

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const parseSchema = (source: string, path: string): Readonly<Record<string, unknown>> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`schema ${path} is not valid JSON`);
  }
  const schema = asRecord(parsed, `schema ${path}`);
  if (schema.type !== "object" || typeof schema.$id !== "string") {
    throw new Error(`schema ${path} must identify an object result`);
  }
  return Object.freeze(schema);
};

export const loadWorkflowDefinition = async (
  source: string,
  bundle: WorkflowBundleSources,
): Promise<LoadedWorkflowDefinition> => {
  let parsed: unknown;
  try {
    parsed = parse(source);
  } catch {
    throw new Error("workflow definition is not valid YAML");
  }
  const root = asRecord(parsed, "workflow");
  assertAllowedKeys(root, ["apiVersion", "kind", "metadata", "spec"], "workflow");
  if (root.apiVersion !== WORKFLOW_API_VERSION) throw new Error("unsupported workflow apiVersion");
  if (root.kind !== WORKFLOW_KIND) throw new Error("unsupported workflow kind");

  const metadata = asRecord(root.metadata, "workflow.metadata");
  assertAllowedKeys(metadata, ["name", "version"], "workflow.metadata");
  const name = stringValue(metadata, "name", "workflow.metadata");
  const version = positiveInteger(metadata, "version", "workflow.metadata");

  const spec = asRecord(root.spec, "workflow.spec");
  assertAllowedKeys(spec, ["start", "execution", "jobs", "nodes"], "workflow.spec");
  const start = stringValue(spec, "start", "workflow.spec");
  const executionRecord = asRecord(spec.execution, "workflow.spec.execution");
  assertAllowedKeys(
    executionRecord,
    ["attemptTimeout", "heartbeatTimeout", "codexSandboxMode"],
    "workflow.spec.execution",
  );
  const attemptTimeout = stringValue(executionRecord, "attemptTimeout", "workflow.spec.execution");
  const heartbeatTimeout = stringValue(executionRecord, "heartbeatTimeout", "workflow.spec.execution");
  if (!DURATION.test(attemptTimeout) || !DURATION.test(heartbeatTimeout)) {
    throw new Error("workflow execution timeouts must be simple durations");
  }
  if (executionRecord.codexSandboxMode !== "danger-full-access") {
    throw new Error("the controlled trial requires danger-full-access inside Sandbox");
  }
  const execution: WorkflowExecutionPolicy = {
    attemptTimeout,
    heartbeatTimeout,
    codexSandboxMode: "danger-full-access",
  };

  const jobsRecord = asRecord(spec.jobs, "workflow.spec.jobs");
  const jobs: Record<string, WorkflowJob> = {};
  for (const [id, value] of Object.entries(jobsRecord)) {
    const label = `workflow.spec.jobs.${id}`;
    const job = asRecord(value, label);
    assertAllowedKeys(job, ["promptFile", "inputs", "context", "resultSchema", "requiredOutputs"], label);
    const promptFile = stringValue(job, "promptFile", label);
    const resultSchemaFile = stringValue(job, "resultSchema", label);
    const prompt = bundle.prompts[promptFile];
    const schemaSource = bundle.schemas[resultSchemaFile];
    if (prompt === undefined || prompt.trim().length === 0) throw new Error(`missing prompt ${promptFile}`);
    if (schemaSource === undefined) throw new Error(`missing schema ${resultSchemaFile}`);
    jobs[id] = Object.freeze({
      id,
      promptFile,
      prompt,
      inputs: stringArray(job, "inputs", label),
      context: stringArray(job, "context", label, false),
      resultSchemaFile,
      resultSchema: parseSchema(schemaSource, resultSchemaFile),
      requiredOutputs: stringArray(job, "requiredOutputs", label),
    });
  }

  const nodesRecord = asRecord(spec.nodes, "workflow.spec.nodes");
  const nodes: Record<string, WorkflowNode> = {};
  for (const [id, value] of Object.entries(nodesRecord)) {
    const label = `workflow.spec.nodes.${id}`;
    const node = asRecord(value, label);
    const type = stringValue(node, "type", label);
    const edges = parseEdges(node, label);
    if (type === "agent") {
      assertAllowedKeys(node, ["type", "job", "edges"], label);
      const job = stringValue(node, "job", label);
      if (jobs[job] === undefined) throw new Error(`${label} references unknown job ${job}`);
      nodes[id] = Object.freeze({ id, type, job, edges });
    } else if (type === "system_action") {
      assertAllowedKeys(node, ["type", "action", "edges"], label);
      const action = stringValue(node, "action", label);
      if (!SYSTEM_ACTIONS.has(action)) throw new Error(`${label} uses unsupported action ${action}`);
      nodes[id] = Object.freeze({ id, type, action, edges });
    } else if (type === "human_gate") {
      assertAllowedKeys(node, ["type", "linearState", "edges"], label);
      nodes[id] = Object.freeze({
        id,
        type,
        linearState: stringValue(node, "linearState", label),
        edges,
      });
    } else if (type === "terminal") {
      assertAllowedKeys(node, ["type", "outcome"], label);
      const outcome = stringValue(node, "outcome", label) as TerminalOutcome;
      if (!TERMINAL_OUTCOMES.has(outcome)) throw new Error(`${label} has unsupported outcome ${outcome}`);
      nodes[id] = Object.freeze({ id, type, outcome, edges: Object.freeze({}) });
    } else {
      throw new Error(`${label} has unsupported type ${type}`);
    }
  }

  if (nodes[start] === undefined) throw new Error(`start node ${start} does not exist`);
  for (const node of Object.values(nodes)) {
    for (const target of Object.values(node.edges)) {
      if (nodes[target] === undefined) throw new Error(`${node.id} references unknown node ${target}`);
    }
  }

  const digestPayload = canonicalize({
    apiVersion: WORKFLOW_API_VERSION,
    kind: WORKFLOW_KIND,
    metadata: { name, version },
    spec: { start, execution, jobs, nodes },
  });
  const digest = await sha256Hex(JSON.stringify(digestPayload));
  return Object.freeze({
    apiVersion: WORKFLOW_API_VERSION,
    kind: WORKFLOW_KIND,
    name,
    version,
    start,
    execution,
    jobs: Object.freeze(jobs),
    nodes: Object.freeze(nodes),
    digest,
  });
};

export const restoreWorkflowDefinition = async (
  source: string,
  expectedDigest: string,
): Promise<LoadedWorkflowDefinition> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error("stored workflow definition is not valid JSON");
  }
  const stored = asRecord(parsed, "stored workflow");
  assertAllowedKeys(
    stored,
    ["apiVersion", "kind", "name", "version", "start", "execution", "jobs", "nodes", "digest"],
    "stored workflow",
  );
  if (stored.apiVersion !== WORKFLOW_API_VERSION) throw new Error("unsupported stored workflow apiVersion");
  if (stored.kind !== WORKFLOW_KIND) throw new Error("unsupported stored workflow kind");
  const name = stringValue(stored, "name", "stored workflow");
  const version = positiveInteger(stored, "version", "stored workflow");
  const start = stringValue(stored, "start", "stored workflow");
  const storedDigest = stringValue(stored, "digest", "stored workflow");
  if (storedDigest !== expectedDigest) throw new Error("stored workflow definition digest mismatch");

  const execution = asRecord(stored.execution, "stored workflow.execution");
  const storedJobs = asRecord(stored.jobs, "stored workflow.jobs");
  const jobs: Record<string, unknown> = {};
  const prompts: Record<string, string> = {};
  const schemas: Record<string, string> = {};
  for (const [id, value] of Object.entries(storedJobs)) {
    const label = `stored workflow.jobs.${id}`;
    const job = asRecord(value, label);
    assertAllowedKeys(
      job,
      ["id", "promptFile", "prompt", "inputs", "context", "resultSchemaFile", "resultSchema", "requiredOutputs"],
      label,
    );
    if (job.id !== id) throw new Error(`${label}.id must match its map key`);
    const promptFile = stringValue(job, "promptFile", label);
    const resultSchemaFile = stringValue(job, "resultSchemaFile", label);
    prompts[promptFile] = stringValue(job, "prompt", label);
    schemas[resultSchemaFile] = JSON.stringify(asRecord(job.resultSchema, `${label}.resultSchema`));
    jobs[id] = {
      promptFile,
      inputs: stringArray(job, "inputs", label),
      context: stringArray(job, "context", label, false),
      resultSchema: resultSchemaFile,
      requiredOutputs: stringArray(job, "requiredOutputs", label),
    };
  }

  const storedNodes = asRecord(stored.nodes, "stored workflow.nodes");
  const nodes: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(storedNodes)) {
    const label = `stored workflow.nodes.${id}`;
    const node = asRecord(value, label);
    if (node.id !== id) throw new Error(`${label}.id must match its map key`);
    const { id: _id, ...sourceNode } = node;
    if (sourceNode.type === "terminal") delete sourceNode.edges;
    nodes[id] = sourceNode;
  }

  const restored = await loadWorkflowDefinition(
    JSON.stringify({
      apiVersion: WORKFLOW_API_VERSION,
      kind: WORKFLOW_KIND,
      metadata: { name, version },
      spec: { start, execution, jobs, nodes },
    }),
    { prompts, schemas },
  );
  if (restored.digest !== expectedDigest) throw new Error("restored workflow definition digest mismatch");
  return restored;
};
