import assert from "node:assert/strict";
import test from "node:test";

import type { ArtifactCollectionResult, ArtifactCollector } from "../src/artifact-collector.ts";
import type { CredentialLease, CredentialVault } from "../src/credential-vault.ts";
import type { OrchestrationRunRecord } from "../src/orchestration-store.ts";
import {
  SandboxAgentController,
  type AgentAttemptRecord,
  type AgentAttemptState,
  type AgentAttemptStore,
  type SandboxFactory,
  type SandboxProcessView,
  type SandboxView,
} from "../src/sandbox-controller.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";

const NOW = new Date("2026-08-16T10:00:00.000Z");
const definition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: sandbox-test, version: 1 }
spec:
  start: work
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs:
    work:
      promptFile: prompts/work.md
      inputs: [issue]
      context: [workpad]
      resultSchema: schemas/result.json
      requiredOutputs: [transcript.jsonl, result.json]
  nodes:
    work: { type: agent, job: work, edges: { completed: done, blocked: blocked, failed: blocked } }
    done: { type: terminal, outcome: succeeded }
    blocked: { type: terminal, outcome: blocked }
`,
  {
    prompts: { "prompts/work.md": "Implement the bounded task." },
    schemas: {
      "schemas/result.json": JSON.stringify({
        $id: "https://deos.dev/sandbox-test.json",
        type: "object",
      }),
    },
  },
);

const run = {
  run_id: "workflow:project-1:issue-1:run:1",
  issue_id: "issue-1",
  updated_at: "2026-08-16T09:59:00.000Z",
} as OrchestrationRunRecord;

class AttemptStore implements AgentAttemptStore {
  latest: AgentAttemptRecord | null = null;
  cleanup: string | null = null;

  findLatest() {
    return Promise.resolve(this.latest);
  }

  create(input: {
    attemptId: string;
    sandboxId: string;
    runId: string;
    nodeId: string;
    jobSpecJson: string;
    jobSpecDigest: string;
    absoluteDeadline: string;
    now: string;
  }) {
    this.latest = {
      attempt_id: input.attemptId,
      sandbox_id: input.sandboxId,
      run_id: input.runId,
      node_id: input.nodeId,
      job_spec_json: input.jobSpecJson,
      job_spec_digest: input.jobSpecDigest,
      process_id: null,
      process_runtime_id: null,
      state: "pending",
      started_at: null,
      heartbeat_at: null,
      absolute_deadline: input.absoluteDeadline,
      ended_at: null,
      result_class: null,
      manifest_id: null,
      cleanup_state: "pending",
      cleanup_error_category: null,
      created_at: input.now,
      updated_at: input.now,
    };
    return Promise.resolve(this.latest);
  }

  markStarted(attemptId: string, processId: string, runtimeId: string, now: string) {
    assert.equal(this.latest?.attempt_id, attemptId);
    Object.assign(this.latest ?? {}, {
      process_id: processId,
      process_runtime_id: runtimeId,
      state: "running",
      started_at: now,
      heartbeat_at: now,
      updated_at: now,
    });
    return Promise.resolve();
  }

  touchHeartbeat(_attempt: string, _run: string, observedAt: string, now: string) {
    if (this.latest !== null) {
      this.latest.heartbeat_at = observedAt;
      this.latest.updated_at = now;
    }
    return Promise.resolve();
  }

  setState(_attempt: string, expected: AgentAttemptState, next: AgentAttemptState, now: string) {
    if (this.latest?.state !== expected) return Promise.resolve(false);
    this.latest.state = next;
    this.latest.updated_at = now;
    return Promise.resolve(true);
  }

  finish(input: {
    expected: AgentAttemptState;
    state: "completed" | "blocked" | "failed" | "interrupted" | "absolute_timeout" | "canceled";
    resultClass: string;
    manifestId: string | null;
    now: string;
  }) {
    assert.equal(this.latest?.state, input.expected);
    if (this.latest !== null) {
      this.latest.state = input.state;
      this.latest.result_class = input.resultClass;
      this.latest.manifest_id = input.manifestId;
      this.latest.ended_at = input.now;
    }
    return Promise.resolve();
  }

  markCleanup(_attempt: string, state: "destroyed" | "failed") {
    this.cleanup = state;
    if (this.latest !== null) this.latest.cleanup_state = state;
    return Promise.resolve();
  }
}

class Process implements SandboxProcessView {
  readonly id: string;
  readonly pid: number;
  state: "running" | "exited" | "error" = "running";
  exitCode = 0;
  killed = false;

  constructor(id: string, pid: number) {
    this.id = id;
    this.pid = pid;
  }

  status() {
    return Promise.resolve(this.state === "running"
      ? { state: "running" as const }
      : { state: this.state, exit: { code: this.exitCode, timedOut: false } });
  }

  waitForExit() {
    return Promise.resolve({ code: this.exitCode, timedOut: false });
  }

  kill() {
    this.killed = true;
    this.state = "exited";
    this.exitCode = 143;
    return Promise.resolve();
  }
}

class Sandbox implements SandboxView {
  readonly files = new Map<string, string>();
  readonly commands: Array<{ command: readonly string[]; env?: Record<string, string> }> = [];
  readonly supervisor = new Process("process-supervisor", 44);
  keepAlive = false;
  destroyed = false;

  mkdir() { return Promise.resolve({}); }

  writeFile(path: string, content: string) {
    this.files.set(path, content);
    return Promise.resolve({});
  }

  readFile(path: string) {
    const content = this.files.get(path);
    if (content === undefined) return Promise.reject(new Error("missing file"));
    return Promise.resolve({ content, mimeType: "application/json" });
  }

  deleteFile(path: string) {
    this.files.delete(path);
    return Promise.resolve({});
  }

  exec(command: readonly [string, ...string[]], options?: { env?: Record<string, string> }) {
    this.commands.push({ command, env: options?.env });
    if (command[0] === "node") return Promise.resolve(this.supervisor);
    const process = new Process(`process-${this.commands.length}`, 40 + this.commands.length);
    process.state = "exited";
    return Promise.resolve(process);
  }

  getProcess(id: string) {
    return Promise.resolve(id === this.supervisor.id ? this.supervisor : null);
  }

  setKeepAlive(value: boolean) {
    this.keepAlive = value;
    return Promise.resolve();
  }

  destroy() {
    this.destroyed = true;
    return Promise.resolve();
  }
}

class Factory implements SandboxFactory {
  readonly sandbox = new Sandbox();
  get() { return this.sandbox; }
}

class Credentials {
  acquired = 0;
  replaced = 0;
  released = 0;
  readonly lease: CredentialLease = {
    profileId: "trial",
    attemptId: "attempt-1",
    objectKey: "credentials/trial/auth.v1.enc",
    sourceEtag: "etag-1",
    sourceVersion: "1",
    plaintext: '{"auth":"secret-seed"}',
  };

  acquire() {
    this.acquired += 1;
    return Promise.resolve(this.lease);
  }

  resume() { return Promise.resolve({ ...this.lease, plaintext: "" }); }

  replaceAndRelease() {
    this.replaced += 1;
    return Promise.resolve();
  }

  release() {
    this.released += 1;
    return Promise.resolve();
  }
}

class Collector {
  verified = 0;
  collect(): Promise<ArtifactCollectionResult> {
    return Promise.resolve({
      manifestId: "manifest:attempt-1",
      aggregateDigest: "aggregate",
      objectCount: 2,
      totalBytes: 100,
      result: { outcome: "completed", providerReceipts: [] },
      manifestKey: "runs/run/attempt/manifest.json",
      manifestSha256: "manifest-digest",
    });
  }

  verifyAfterCleanup() {
    this.verified += 1;
    return Promise.resolve();
  }
}

const setup = (clock = () => NOW) => {
  const attempts = new AttemptStore();
  const factory = new Factory();
  const credentials = new Credentials();
  const collector = new Collector();
  const controller = new SandboxAgentController(
    attempts,
    factory,
    credentials as unknown as CredentialVault,
    {
      repository: "sachinkundu/deos",
      authProfileId: "trial",
      absoluteTimeoutMs: 24 * 60 * 60_000,
      heartbeatTimeoutMs: 5 * 60_000,
    },
    {
      now: clock,
      attemptId: () => "00000000-0000-7000-8000-000000000001",
      materializeContext: async () => JSON.stringify({
        linearIssue: { id: "issue-1", title: "Bounded test task" },
        repository: { branch: "deos/{attemptId}" },
      }),
      capabilityGrant: async () => ({ url: "https://worker.example/capabilities", token: "grant-token" }),
      collector: () => collector as unknown as ArtifactCollector,
    },
  );
  return { attempts, factory, credentials, collector, controller };
};

test("controller stages fixed paths and starts the argv supervisor without provider credentials", async () => {
  const { controller, factory, attempts, credentials } = setup();
  const observation = await controller.execute(run, "work", "work", definition);
  assert.equal(observation.state, "running");
  assert.equal(attempts.latest?.state, "running");
  assert.equal(credentials.acquired, 1);
  assert.equal(factory.sandbox.files.has("/root/.codex/auth.json"), true);
  assert.deepEqual(factory.sandbox.commands.at(-1)?.command, ["node", "/deos/bin/supervisor.mjs"]);
  assert.equal(JSON.stringify(factory.sandbox.commands).includes("secret-seed"), false);
  assert.equal(JSON.parse(factory.sandbox.files.get("/deos/run/job.json") ?? "{}").capabilityToken, "grant-token");
  const prompt = factory.sandbox.files.get("/deos/run/prompt.md") ?? "";
  assert.match(prompt, /Bounded test task/);
  assert.match(prompt, /deos\/00000000-0000-7000-8000-000000000001/);
  assert.match(prompt, /publish_work_product/);
  assert.match(prompt, /\^\[a-z0-9\]\[a-z0-9\._-\]\{0,79\}\$/);
  assert.match(prompt, /requirements-publish-v1/);
});

test("running process reconciles the exact process and fresh supervisor heartbeat", async () => {
  const { controller, factory, attempts } = setup();
  await controller.execute(run, "work", "work", definition);
  factory.sandbox.files.set("/deos/output/heartbeat.json", JSON.stringify({
    attemptId: attempts.latest?.attempt_id,
    observedAt: NOW.toISOString(),
  }));
  const observation = await controller.execute(run, "work", "work", definition);
  assert.equal(observation.state, "running");
  assert.equal(attempts.latest?.heartbeat_at, NOW.toISOString());
});

test("successful completion refreshes auth, removes it, collects, destroys, then verifies R2", async () => {
  const { controller, factory, attempts, credentials, collector } = setup();
  await controller.execute(run, "work", "work", definition);
  factory.sandbox.supervisor.state = "exited";
  factory.sandbox.supervisor.exitCode = 0;
  factory.sandbox.files.set("/root/.codex/auth.json", '{"auth":"refreshed"}');
  const observation = await controller.execute(run, "work", "work", definition);

  assert.equal(observation.state, "completed");
  assert.equal(observation.state === "completed" ? observation.outcome.outcome : null, "completed");
  assert.equal(credentials.replaced, 1);
  assert.equal(factory.sandbox.files.has("/root/.codex/auth.json"), false);
  assert.equal(factory.sandbox.destroyed, true);
  assert.equal(attempts.cleanup, "destroyed");
  assert.equal(collector.verified, 1);
  assert.equal(attempts.latest?.manifest_id, "manifest:attempt-1");
});

test("expired heartbeat kills the process, destroys the Sandbox, and fails closed", async () => {
  const later = new Date(NOW.getTime() + 6 * 60_000);
  let clock = NOW;
  const setupResult = setup(() => clock);
  await setupResult.controller.execute(run, "work", "work", definition);
  setupResult.factory.sandbox.files.set("/deos/output/heartbeat.json", JSON.stringify({
    attemptId: setupResult.attempts.latest?.attempt_id,
    observedAt: NOW.toISOString(),
  }));
  clock = later;
  const result = await setupResult.controller.execute(run, "work", "work", definition);
  assert.equal(result.state === "completed" ? result.outcome.outcome : null, "failed");
  assert.equal(setupResult.factory.sandbox.supervisor.killed, true);
  assert.equal(setupResult.factory.sandbox.destroyed, true);
  assert.equal(setupResult.attempts.latest?.state, "interrupted");
});

test("a replay after terminal persistence returns the same attempt without relaunching", async () => {
  const { controller, factory, attempts } = setup();
  await controller.execute(run, "work", "work", definition);
  factory.sandbox.supervisor.state = "exited";
  factory.sandbox.files.set("/root/.codex/auth.json", '{"auth":"refreshed"}');
  await controller.execute(run, "work", "work", definition);
  const commandCount = factory.sandbox.commands.length;
  const replay = await controller.execute(run, "work", "work", definition);
  assert.equal(replay.state === "completed" ? replay.attemptId : null, attempts.latest?.attempt_id);
  assert.equal(factory.sandbox.commands.length, commandCount);
});

test("a categorized terminal failure replays through the configured failed edge", async () => {
  const { controller, attempts } = setup();
  await controller.execute(run, "work", "work", definition);
  if (attempts.latest === null) throw new Error("attempt was not allocated");
  attempts.latest.state = "failed";
  attempts.latest.result_class = "startup_failed";
  attempts.latest.ended_at = NOW.toISOString();
  const replay = await controller.execute(run, "work", "work", definition);
  assert.equal(replay.state === "completed" ? replay.outcome.outcome : null, "failed");
  assert.equal(replay.state === "completed" ? replay.outcome.providerReceiptsComplete : true, false);
});
