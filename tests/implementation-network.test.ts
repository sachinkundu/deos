import assert from "node:assert/strict";
import test from "node:test";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { configureImplementationNetwork } from "../src/implementation-network.ts";

test("model, saved package hosts and broker pass the outer filter only after policy installation", async () => {
  let configured = false;
  let hosts: string[] = [];
  const identity = { runId: "run", attemptId: "attempt" };
  await configureImplementationNetwork({
    async setOutboundHandler(name, params) {
      assert.equal(name, "implementation");
      assert.deepEqual(params, identity);
      configured = true;
    },
    async setAllowedHosts(value) {
      assert.ok(configured);
      hosts = value;
    },
  }, { ...implementationPolicy, packageHosts: ["custom-packages.example", "registry.npmjs.org"] },
  "https://broker.example/capability", identity);
  for (const host of ["chatgpt.com", "auth.openai.com", "broker.example", "custom-packages.example", "registry.npmjs.org"]) {
    assert.ok(hosts.includes(host), `${host} must reach the method/path policy`);
  }
  assert.ok(!hosts.includes("*"));
  assert.ok(!hosts.includes("api.trycloudflare.com"), "tunnels run only in the trusted preview relay");
  assert.ok(!hosts.includes("pypi.org"), "use the frozen package policy");
});

test("a failed handler installation leaves outbound hosts closed and preserves the error", async () => {
  const error = new Error("provider policy installation failed");
  await assert.rejects(configureImplementationNetwork({
    async setOutboundHandler() { throw error; },
    async setAllowedHosts() { assert.fail("hosts must remain closed"); },
  }, implementationPolicy, "https://broker.example/capability", { runId: "run", attemptId: "attempt" }),
  actual => actual === error);
});
