import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

for (const mode of ["retry-success", "retry-exhausted", "start", "invalid-json", "provider-failure"] as const) {
  test(`Claude adapter preserves original response and retries only safe reads: ${mode}`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "claude-adapter-"));
    const originalFetch = globalThis.fetch;
    const previousRoot = process.env.DEOS_ERROR_OUTPUT_ROOT;
    try {
      process.env.DEOS_ERROR_OUTPUT_ROOT = dir;
      const source = (await readFile("container/claude-review-adapter.mjs", "utf8"))
        .replaceAll('"./grounded-review.mjs"', JSON.stringify(pathToFileURL(resolve("container/grounded-review.mjs")).href))
        .replaceAll('"./original-errors.mjs"', JSON.stringify(pathToFileURL(resolve("container/original-errors.mjs")).href))
        .replaceAll('"/deos/bin/error-details.ts"', JSON.stringify(pathToFileURL(resolve("src/error-details.ts")).href));
      const file = join(dir, "adapter.mjs");
      await writeFile(file, source);
      const { invokeClaudeReview } = await import(pathToFileURL(file).href);
      let requests = 0;
      globalThis.fetch = async () => {
        requests++;
        if (mode === "start") throw new Error("connection reset after request was sent", { cause: new Error("ECONNRESET") });
        if (mode === "invalid-json") return new Response("<html>proxy failure body</html>", { status: 400 });
        if (mode === "provider-failure") return Response.json({ error: "auth_failure", errorId: "original-record", retryNotBefore: null }, { status: 409 });
        if (mode === "retry-success" && requests === 2) return Response.json({ receipt: { result: "done" } });
        return new Response(`proxy failure number ${requests}`, { status: 503 });
      };
      const job = { capabilityUrl: "https://service/capabilities", capabilityToken: "test-token", attemptId: "test",
        deadline: new Date(Date.now() + 10000).toISOString() };
      if (mode === "retry-success") {
        assert.deepEqual(await invokeClaudeReview(job, "status", { ordinal: 0 }), { receipt: { result: "done" } });
        assert.equal(requests, 2);
      } else {
        await assert.rejects(invokeClaudeReview(job, mode === "start" ? "review" : "status", { ordinal: 0 }), (error: any) => {
          if (mode === "retry-exhausted") {
            assert.equal(error.errors.length, 3);
            assert.equal(error.cause.responseBody, "proxy failure number 1");
            assert.equal(error.errors[2].responseBody, "proxy failure number 3");
          } else if (mode === "start") assert.equal(error.cause.cause.message, "ECONNRESET");
          else if (mode === "invalid-json") {
            assert.equal(error.responseBody, "<html>proxy failure body</html>");
            assert.equal(error.cause.name, "SyntaxError");
          } else assert.equal(error.originalErrorId, "original-record");
          return true;
        });
        assert.equal(requests, mode === "retry-exhausted" ? 3 : 1);
      }
      const saved = await readFile(join(dir, "original-errors.jsonl"), "utf8");
      assert.ok(saved.includes("Claude"));
      if (mode.startsWith("retry")) assert.ok(saved.includes("proxy failure number 1"));
    } finally {
      globalThis.fetch = originalFetch;
      if (previousRoot === undefined) delete process.env.DEOS_ERROR_OUTPUT_ROOT;
      else process.env.DEOS_ERROR_OUTPUT_ROOT = previousRoot;
      await rm(dir, { recursive: true, force: true });
    }
  });
}
