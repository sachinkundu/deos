import assert from "node:assert/strict";
import test from "node:test";
import { runClaudeFailure, credential, capability } from "./helpers/claude-runner-fixture.ts";

for (const status of ["401", "403"] as const) {
  test(`trusted process preserves HTTP ${status}, full provider error and stderr`, async () => {
    const { failure, processError, expectedMessage, expectedStderr } = await runClaudeFailure(status);
    assert.equal(processError.code, 1);
    assert.equal(processError.stdout, "");
    assert.equal(processError.stderr, "");
    assert.equal(failure.cause, "auth_failure");
    assert.equal(failure.providerStatus, Number(status));
    assert.equal(failure.providerMessage, expectedMessage);
    assert.equal(failure.providerEvents[1].error.request_id, "req-original-42");
    assert.equal(failure.providerEvents[1].error.cause.detail, "Provider explanation retained exactly");
    assert.equal(failure.stderr, expectedStderr);
    assert.equal(JSON.parse(failure.stdout.trim().split("\n")[1]).result, expectedMessage);
    assert.match(failure.originalError.stack, /validateClaudeTurn/);
    assert.equal(JSON.stringify(failure).includes(JSON.stringify(credential).slice(1, -1)), false);
    assert.equal(JSON.stringify(failure).includes(capability), false);
  });
}
test("trusted process retains malformed output and its original parser exception", async () => {
  const { failure, processError } = await runClaudeFailure("malformed");
  assert.equal(processError.code, 1);
  assert.equal(failure.originalError.cause.name, "SyntaxError");
  assert.match(failure.originalError.cause.stack, /JSON.parse/);
  assert.equal(failure.stdout, "{broken provider JSON\n");
});
test("trusted process retains exit status and complete stderr", async () => {
  const { failure, processError, expectedStderr } = await runClaudeFailure("exit");
  assert.equal(processError.code, 1);
  assert.equal(failure.originalError.cause.code, 17);
  assert.equal(failure.stderr, expectedStderr);
});
test("trusted process retains spawn ENOENT and attempted executable", async () => {
  const { failure, processError } = await runClaudeFailure("spawn");
  assert.equal(processError.code, 1);
  assert.equal(failure.originalError.cause.code, "ENOENT");
  assert.equal(failure.originalError.cause.path, "claude");
  assert.match(failure.originalError.cause.stack, /ENOENT/);
});
test("trusted process retains broker failure causes", async () => {
  const { failure, processError } = await runClaudeFailure("broker");
  assert.equal(processError.code, 1);
  assert.equal(failure.brokerFailure.originalError.message, "repository transport disconnected");
  assert.equal(failure.brokerFailure.originalError.cause.code, "ECONNRESET");
});
test("failure-file write errors retain both failures and redact fallback diagnostics", async () => {
  const { processError, expectedMessage } = await runClaudeFailure("storage");
  assert.equal(processError.code, 1);
  const diagnostic = JSON.parse(processError.stderr);
  assert.equal(diagnostic.failure.providerMessage, expectedMessage);
  assert.equal(diagnostic.failure.providerStatus, 403);
  assert.equal(diagnostic.storageError.code, "EISDIR");
  assert.equal(processError.stderr.includes(JSON.stringify(credential).slice(1, -1)), false);
  assert.equal(processError.stderr.includes(capability), false);
});
