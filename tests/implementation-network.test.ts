import assert from "node:assert/strict";
import test from "node:test";
import { implementationPolicy } from "../src/implementation-contract.ts";
import { configureImplementationNetwork,configureSharedTestNetwork } from "../src/implementation-network.ts";

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

test('shared test agent can reach only its broker and model sign-in hosts',async()=>{
  let configured=false;
  await configureSharedTestNetwork({
    async setOutboundHandler(name){assert.equal(name,'implementation');configured=true;},
    async setAllowedHosts(hosts){
      assert.equal(configured,true);
      assert.deepEqual(hosts,['chatgpt.com','auth.openai.com','broker.example']);
    },
  },'https://broker.example/capabilities',{runId:'run',attemptId:'attempt'});
});

test("a failed handler installation leaves outbound hosts closed and preserves the error", async () => {
  const error = new Error("provider policy installation failed");
  await assert.rejects(configureImplementationNetwork({
    async setOutboundHandler() { throw error; },
    async setAllowedHosts() { assert.fail("hosts must remain closed"); },
  }, implementationPolicy, "https://broker.example/capability", { runId: "run", attemptId: "attempt" }),
  actual => actual === error);
});
