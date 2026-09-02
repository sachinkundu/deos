import assert from "node:assert/strict";
import test from "node:test";

import { assertDefinitionPreflight } from "../scripts/release-orchestration.ts";
import { loadWorkflowDefinition } from "../src/workflow-definition.ts";

const definition = await loadWorkflowDefinition(
  `apiVersion: deos.dev/v1alpha1
kind: DeliveryWorkflow
metadata: { name: release-test, version: 3 }
spec:
  start: done
  execution: { attemptTimeout: 24h, heartbeatTimeout: 5m, codexSandboxMode: danger-full-access }
  jobs: {}
  nodes:
    done: { type: terminal, outcome: succeeded }
`,
  { prompts: {}, schemas: {} },
);

test("release preflight accepts an identical registered version", () => {
  assert.doesNotThrow(() => assertDefinitionPreflight(definition, [{
    definition_id: definition.name,
    version: definition.version,
    digest: definition.digest,
  }]));
});

test("release preflight rejects changed content at an existing version", () => {
  assert.throws(
    () => assertDefinitionPreflight(definition, [{
      definition_id: definition.name,
      version: definition.version,
      digest: "0".repeat(64),
    }]),
    /increment the workflow version/,
  );
});

test("release preflight rejects a new definition behind the latest version", () => {
  assert.throws(
    () => assertDefinitionPreflight(definition, [{
      definition_id: definition.name,
      version: definition.version + 1,
      digest: "1".repeat(64),
    }]),
    /is not newer/,
  );
});
