import { parse } from "yaml";

export const WORKFLOW_API_VERSION = "deos.dev/v1alpha1" as const;
export const WORKFLOW_KIND = "DeliveryWorkflow" as const;

export type WorkflowNodeType =
  | "agent"
  | "system_action"
  | "human_gate"
  | "wait"
  | "terminal"
  | "failure";
export type FinalOutcome = "succeeded" | "denied" | "canceled";
export type TerminalOutcome = FinalOutcome | "blocked" | "failed";
export type ResumableStatus = "awaiting_capability" | "manual_reconciliation_required";

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
  capabilities?: readonly string[];
  agentRole?: "author" | "reviewer";
  modelProvider?: "codex" | "openrouter";
  model?: string;
  reasoning?: string;
  permissionProfile?: "repository_write" | "review_read_only";
  providerAccess?: readonly "model.openrouter_review"[];
  reviewMode?: "discovery" | "recheck";
  operation: OpenSpecJobOperation | null;
}

export const OPENSPEC_INSTRUCTIONS = [
  "/opsx:continue",
  "/opsx:apply",
  "/opsx:verify",
  "/opsx:archive",
] as const;

export type OpenSpecInstruction = typeof OPENSPEC_INSTRUCTIONS[number];

export interface OpenSpecJobOperation {
  kind: "openspec";
  instruction: OpenSpecInstruction;
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
  decisions?: Readonly<Record<string, string>>;
}

export interface TerminalWorkflowNode extends WorkflowNodeBase {
  type: "terminal";
  outcome: TerminalOutcome;
  executorAction?: "return";
}

export interface WorkflowEventDescriptor {
  type: "linear.issue.state_changed";
  actorType: "user";
  toState: string;
  action?: string;
}

export interface WaitWorkflowNode extends WorkflowNodeBase {
  type: "wait";
  deosStatus: ResumableStatus;
  resumeEvent: Readonly<WorkflowEventDescriptor>;
  cancelEvent: Readonly<WorkflowEventDescriptor>;
}

export interface FailureWorkflowNode extends WorkflowNodeBase {
  type: "failure";
  deosStatus: "failed";
  executorAction: "throw";
  cause: string;
}

export type WorkflowNode =
  | AgentWorkflowNode
  | SystemActionWorkflowNode
  | HumanGateWorkflowNode
  | WaitWorkflowNode
  | TerminalWorkflowNode
  | FailureWorkflowNode;

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
  "linear.delegate_and_start",
  "github.merge_planning_pull_request",
  "github.verify_planning_merge",
  "github.publish_planning_candidate",
  "traceability.start_new_round",
  "traceability.publish_author_response",
]);
const AGENT_CAPABILITY_ACTIONS = new Set([
  "github.publish_planning_work_product",
]);
const TERMINAL_OUTCOMES = new Set<TerminalOutcome>([
  "succeeded",
  "blocked",
  "failed",
  "canceled",
  "denied",
]);
const FINAL_OUTCOMES = new Set<FinalOutcome>(["succeeded", "denied", "canceled"]);
const RESUMABLE_STATUSES = new Set<ResumableStatus>([
  "awaiting_capability",
  "manual_reconciliation_required",
]);
const DURATION = /^\d+(?:\.\d+)?(?:ms|s|m|h|d)$/;
const EXPLICIT_LIFECYCLE_REQUIRED_VERSION = 11;
const OPEN_SPEC_INSTRUCTION_SET = new Set<string>(OPENSPEC_INSTRUCTIONS);
const SAFE_CAUSE = /^[a-z][a-z0-9_]{2,63}$/;
const SAFE_DECISION = /^[a-z][a-z0-9_]{2,63}$/;

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

const parseDecisions = (
  value: unknown,
  edges: Readonly<Record<string, string>>,
  label: string,
): Readonly<Record<string, string>> | null => {
  if (value === undefined) return null;
  const decisions = asRecord(value, `${label}.decisions`);
  if (Object.keys(decisions).length === 0) throw new Error(`${label}.decisions must not be empty`);
  const states = new Set<string>();
  for (const [outcome, state] of Object.entries(decisions)) {
    if (!SAFE_DECISION.test(outcome)) {
      throw new Error(`${label}.decisions has unsupported outcome ${outcome}`);
    }
    if (typeof state !== "string" || state.length === 0) {
      throw new Error(`${label}.decisions must map outcomes to exact state names`);
    }
    if (edges[outcome] === undefined) {
      throw new Error(`${label}.decisions outcome ${outcome} has no edge`);
    }
    if (states.has(state)) throw new Error(`${label}.decisions state names must be unique`);
    states.add(state);
  }
  assertExactEdges(edges, Object.keys(decisions), label);
  return Object.freeze(Object.fromEntries(Object.entries(decisions).map(([key, state]) => [key, String(state)])));
};

const assertExactEdges = (
  edges: Readonly<Record<string, string>>,
  expected: readonly string[],
  label: string,
): void => {
  const actual = Object.keys(edges).sort();
  const required = [...expected].sort();
  if (actual.length !== required.length || actual.some((value, index) => value !== required[index])) {
    throw new Error(`${label}.edges must contain exactly ${required.join(" and ")}`);
  }
};

const parseEventDescriptor = (
  value: unknown,
  label: string,
  allowAction: boolean,
): Readonly<WorkflowEventDescriptor> => {
  const event = asRecord(value, label);
  assertAllowedKeys(event, allowAction ? ["type", "actorType", "toState", "action"] : ["type", "actorType", "toState"], label);
  if (event.type !== "linear.issue.state_changed") {
    throw new Error(`${label}.type must be linear.issue.state_changed`);
  }
  if (event.actorType !== "user") throw new Error(`${label}.actorType must be user`);
  const descriptor: WorkflowEventDescriptor = {
    type: "linear.issue.state_changed",
    actorType: "user",
    toState: stringValue(event, "toState", label),
  };
  if (allowAction && event.action !== undefined) {
    descriptor.action = stringValue(event, "action", label);
  }
  return Object.freeze(descriptor);
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

const parseJobOperation = (value: unknown, label: string): OpenSpecJobOperation | null => {
  if (value === undefined) return null;
  const operation = asRecord(value, `${label}.operation`);
  assertAllowedKeys(operation, ["kind", "instruction"], `${label}.operation`);
  if (operation.kind !== "openspec") {
    throw new Error(`${label}.operation.kind must be openspec`);
  }
  const instruction = stringValue(operation, "instruction", `${label}.operation`);
  if (!OPEN_SPEC_INSTRUCTION_SET.has(instruction)) {
    throw new Error(`${label}.operation.instruction is not supported`);
  }
  return Object.freeze({ kind: "openspec", instruction: instruction as OpenSpecInstruction });
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
  const supportsExplicitLifecycle = version >= 4 || name === "simple";

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
    assertAllowedKeys(
      job,
      [
        "promptFile", "inputs", "context", "resultSchema", "requiredOutputs", "capabilities",
        "agentRole", "modelProvider", "model", "reasoning", "permissionProfile",
        "providerAccess", "reviewMode", "operation",
      ],
      label,
    );
    const promptFile = stringValue(job, "promptFile", label);
    const resultSchemaFile = stringValue(job, "resultSchema", label);
    const prompt = bundle.prompts[promptFile];
    const schemaSource = bundle.schemas[resultSchemaFile];
    if (prompt === undefined || prompt.trim().length === 0) throw new Error(`missing prompt ${promptFile}`);
    if (schemaSource === undefined) throw new Error(`missing schema ${resultSchemaFile}`);
    const capabilities = stringArray(job, "capabilities", label, false);
    const unsupportedCapability = capabilities.find((capability) => !AGENT_CAPABILITY_ACTIONS.has(capability));
    if (unsupportedCapability !== undefined) {
      throw new Error(`${label}.capabilities uses unsupported action ${unsupportedCapability}`);
    }
    if (new Set(capabilities).size !== capabilities.length) {
      throw new Error(`${label}.capabilities must not contain duplicates`);
    }
    const explicitAgent = job.agentRole !== undefined || job.modelProvider !== undefined ||
      job.model !== undefined || job.reasoning !== undefined || job.permissionProfile !== undefined ||
      job.providerAccess !== undefined;
    let agentConfiguration: Pick<WorkflowJob,
      "agentRole" | "modelProvider" | "model" | "reasoning" | "permissionProfile" | "providerAccess"
    > = {};
    if (explicitAgent) {
      if (!(["author", "reviewer"] as const).includes(job.agentRole as "author" | "reviewer")) {
        throw new Error(`${label}.agentRole is invalid`);
      }
      if (!(["codex", "openrouter"] as const).includes(job.modelProvider as "codex" | "openrouter")) {
        throw new Error(`${label}.modelProvider is invalid`);
      }
      const model = stringValue(job, "model", label);
      const reasoning = stringValue(job, "reasoning", label);
      if (model.length > 240 || reasoning.length > 80) throw new Error(`${label} model settings are invalid`);
      if (!(["repository_write", "review_read_only"] as const).includes(
        job.permissionProfile as "repository_write" | "review_read_only",
      )) throw new Error(`${label}.permissionProfile is invalid`);
      const providerAccess = stringArray(job, "providerAccess", label, false);
      if (
        providerAccess.some((access) => access !== "model.openrouter_review") ||
        new Set(providerAccess).size !== providerAccess.length
      ) throw new Error(`${label}.providerAccess is invalid`);
      if (job.agentRole === "reviewer" && job.permissionProfile !== "review_read_only") {
        throw new Error(`${label} reviewer must use the read-only permission profile`);
      }
      if (job.agentRole === "author" && job.modelProvider !== "codex") {
        throw new Error(`${label} author must use Codex`);
      }
      if (job.agentRole === "reviewer" && capabilities.length > 0) {
        throw new Error(`${label} reviewer cannot have provider mutation capabilities`);
      }
      if (
        (job.modelProvider === "openrouter") !== providerAccess.includes("model.openrouter_review")
      ) throw new Error(`${label} OpenRouter access does not match its model provider`);
      if (job.agentRole === "reviewer") {
        if (!(job.reviewMode === "discovery" || job.reviewMode === "recheck")) {
          throw new Error(`${label}.reviewMode is required for a reviewer`);
        }
      } else if (job.reviewMode !== undefined) {
        throw new Error(`${label}.reviewMode is only valid for a reviewer`);
      }
      agentConfiguration = {
        agentRole: job.agentRole as "author" | "reviewer",
        modelProvider: job.modelProvider as "codex" | "openrouter",
        model,
        reasoning,
        permissionProfile: job.permissionProfile as "repository_write" | "review_read_only",
        providerAccess: Object.freeze(providerAccess as "model.openrouter_review"[]),
      };
    }
    jobs[id] = Object.freeze({
      id,
      promptFile,
      prompt,
      inputs: stringArray(job, "inputs", label),
      context: stringArray(job, "context", label, false),
      resultSchemaFile,
      resultSchema: parseSchema(schemaSource, resultSchemaFile),
      requiredOutputs: stringArray(job, "requiredOutputs", label),
      ...(capabilities.length === 0 ? {} : { capabilities: Object.freeze([...capabilities]) }),
      ...agentConfiguration,
      ...(job.reviewMode === undefined ? {} : { reviewMode: job.reviewMode as "discovery" | "recheck" }),
      operation: parseJobOperation(job.operation, label),
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
      assertAllowedKeys(node, ["type", "linearState", "decisions", "edges"], label);
      nodes[id] = Object.freeze({
        id,
        type,
        linearState: stringValue(node, "linearState", label),
        ...(node.decisions === undefined ? {} : {
          decisions: parseDecisions(node.decisions, edges, label) ?? undefined,
        }),
        edges,
      });
    } else if (type === "wait") {
      if (!supportsExplicitLifecycle) throw new Error(`${label} requires explicit lifecycle support`);
      assertAllowedKeys(node, ["type", "deosStatus", "resumeEvent", "cancelEvent", "edges"], label);
      const deosStatus = stringValue(node, "deosStatus", label) as ResumableStatus;
      if (!RESUMABLE_STATUSES.has(deosStatus)) {
        throw new Error(`${label} has unsupported resumable status ${deosStatus}`);
      }
      assertExactEdges(edges, ["received", "canceled"], label);
      nodes[id] = Object.freeze({
        id,
        type,
        deosStatus,
        resumeEvent: parseEventDescriptor(node.resumeEvent, `${label}.resumeEvent`, true),
        cancelEvent: parseEventDescriptor(node.cancelEvent, `${label}.cancelEvent`, false),
        edges,
      });
    } else if (type === "terminal") {
      const typedLifecycle = node.deosStatus !== undefined || node.executorAction !== undefined;
      if (typedLifecycle) {
        if (!supportsExplicitLifecycle) throw new Error(`${label} requires explicit lifecycle support`);
        assertAllowedKeys(node, ["type", "deosStatus", "executorAction"], label);
        const outcome = stringValue(node, "deosStatus", label) as FinalOutcome;
        if (!FINAL_OUTCOMES.has(outcome)) {
          throw new Error(`${label} has unsupported final outcome ${outcome}`);
        }
        if (node.executorAction !== "return") {
          throw new Error(`${label}.executorAction must be return`);
        }
        nodes[id] = Object.freeze({
          id,
          type,
          outcome,
          executorAction: "return",
          edges: Object.freeze({}),
        });
      } else {
        if (version >= EXPLICIT_LIFECYCLE_REQUIRED_VERSION) {
          throw new Error(`${label} must use the explicit lifecycle terminal contract`);
        }
        assertAllowedKeys(node, ["type", "outcome"], label);
        const outcome = stringValue(node, "outcome", label) as TerminalOutcome;
        if (!TERMINAL_OUTCOMES.has(outcome)) {
          throw new Error(`${label} has unsupported outcome ${outcome}`);
        }
        nodes[id] = Object.freeze({ id, type, outcome, edges: Object.freeze({}) });
      }
    } else if (type === "failure") {
      if (!supportsExplicitLifecycle) throw new Error(`${label} requires explicit lifecycle support`);
      assertAllowedKeys(node, ["type", "deosStatus", "executorAction", "cause"], label);
      if (node.deosStatus !== "failed") throw new Error(`${label}.deosStatus must be failed`);
      if (node.executorAction !== "throw") throw new Error(`${label}.executorAction must be throw`);
      const cause = stringValue(node, "cause", label);
      if (!SAFE_CAUSE.test(cause)) throw new Error(`${label}.cause must be a bounded safe category`);
      nodes[id] = Object.freeze({
        id,
        type,
        deosStatus: "failed",
        executorAction: "throw",
        cause,
        edges: Object.freeze({}),
      });
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
  if (supportsExplicitLifecycle) {
    for (const node of Object.values(nodes)) {
      if (node.type === "agent" && (node.edges.blocked === undefined || node.edges.failed === undefined)) {
        throw new Error(`workflow.spec.nodes.${node.id} must classify blocked and failed outcomes`);
      }
      if (node.type === "system_action" && node.edges.failed === undefined) {
        throw new Error(`workflow.spec.nodes.${node.id} must classify failed outcomes`);
      }
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
      [
        "id", "promptFile", "prompt", "inputs", "context", "resultSchemaFile",
        "resultSchema", "requiredOutputs", "capabilities", "agentRole", "modelProvider",
        "model", "reasoning", "permissionProfile", "providerAccess", "reviewMode", "operation",
      ],
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
      ...(job.capabilities === undefined ? {} : {
        capabilities: stringArray(job, "capabilities", label, false),
      }),
      ...(job.agentRole === undefined ? {} : {
        agentRole: stringValue(job, "agentRole", label),
        modelProvider: stringValue(job, "modelProvider", label),
        model: stringValue(job, "model", label),
        reasoning: stringValue(job, "reasoning", label),
        permissionProfile: stringValue(job, "permissionProfile", label),
        providerAccess: stringArray(job, "providerAccess", label, false),
        ...(job.reviewMode === undefined ? {} : { reviewMode: stringValue(job, "reviewMode", label) }),
      }),
      ...(job.operation === null ? {} : { operation: asRecord(job.operation, `${label}.operation`) }),
    };
  }

  const storedNodes = asRecord(stored.nodes, "stored workflow.nodes");
  const nodes: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(storedNodes)) {
    const label = `stored workflow.nodes.${id}`;
    const node = asRecord(value, label);
    if (node.id !== id) throw new Error(`${label}.id must match its map key`);
    const { id: _id, ...sourceNode } = node;
    if (sourceNode.type === "terminal") {
      delete sourceNode.edges;
      if (sourceNode.executorAction === "return") {
        sourceNode.deosStatus = sourceNode.outcome;
        delete sourceNode.outcome;
      }
    }
    if (sourceNode.type === "failure") delete sourceNode.edges;
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
