import assert from "node:assert/strict";
import test from "node:test";
import { captureErrors } from "../src/error-context.ts";
import { confirmGitHubReadback, GitHubReadbackMismatchError } from "../src/github-readback.ts";

const context = {
  message: "GitHub design pull-request read-back mismatch",
  repository: "acme/sample", operationId: "publication-1", phase: "design-publication",
};

test("readback recovers stale observations and retains each exact mismatch before success", async () => {
  const saved: unknown[] = [];
  const pauses: number[] = [];
  let reads = 0;
  const result = await captureErrors(async (errors) => { saved.push(...errors); }, () =>
    confirmGitHubReadback(context, { headSha: "new", body: "one\ntwo" }, async () => {
      reads += 1;
      return { value: "receipt", actual: { headSha: reads < 3 ? "old" : "new", body: "one\ntwo" } };
    }, async (ms) => { pauses.push(ms); }));
  assert.equal(result, "receipt");
  assert.equal(reads, 3);
  assert.deepEqual(pauses, [250, 1000]);
  assert.equal(saved.length, 2);
  for (const [index, entry] of saved.entries()) {
    const error = (entry as { error: GitHubReadbackMismatchError }).error;
    assert.equal(error.message, context.message);
    assert.equal(error.attempt, index + 1);
    assert.deepEqual(error.context, context);
    assert.deepEqual(error.mismatches, { headSha: { expected: "new", actual: "old" } });
    assert.match(error.stack!, /GitHubReadbackMismatchError/);
  }
});

test("persistent changes fail after four reads with full values and the original error", async () => {
  const expected = "## Design\n" + "full context \"|$\"\n".repeat(10_000);
  const actual = expected + "changed\n";
  let reads = 0;
  let thrown: GitHubReadbackMismatchError | undefined;
  let saved: unknown[] = [];
  await assert.rejects(captureErrors(async (errors) => { saved = errors; }, () =>
    confirmGitHubReadback(context, { content: expected, state: "open" }, async () => {
      reads += 1;
      return { value: "must not succeed", actual: { content: actual, state: "closed" } };
    }, async () => {})), (error: unknown) => {
      assert.ok(error instanceof GitHubReadbackMismatchError);
      thrown = error;
      return true;
    });
  assert.equal(reads, 4);
  assert.equal(saved.length, 4); // The final catch does not duplicate its already captured error.
  assert.equal(thrown?.attempt, 4);
  assert.deepEqual(thrown?.mismatches, {
    content: { expected, actual }, state: { expected: "open", actual: "closed" },
  });
});

test("unexpected read errors propagate unchanged without retrying", async () => {
  const original = new Error("GitHub HTTP 403: exact provider response", { cause: new Error("original cause") });
  let reads = 0;
  await assert.rejects(captureErrors(async () => {}, () =>
    confirmGitHubReadback(context, { headSha: "expected" }, async () => {
      reads += 1;
      throw original;
    }, async () => { assert.fail("must not retry unexpected errors"); })), (error: unknown) => error === original);
  assert.equal(reads, 1);
});
