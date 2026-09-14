import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

test("both implementation tiers register their handlers in the real Container SDK", async () => {
  const bundle = await build({
    stdin: { contents: `
      import { ImplementationSandbox, ImplementationStandard2Sandbox } from './src/sandbox-platform.ts';
      import { Container } from '@cloudflare/containers';
      import { ContainerProxy } from '@cloudflare/sandbox';
      export default { async fetch() {
        const results = [];
        for (const sandboxClass of [ImplementationSandbox, ImplementationStandard2Sandbox]) {
          Container.prototype.validateOutboundHandlerMethodName.call({constructor: sandboxClass}, 'implementation');
          const ctx = { props: {className:sandboxClass.name, containerId:'test', enableInternet:false, interceptAll:true,
            allowedHosts:['chatgpt.com'], outboundHandlerOverride:{method:'implementation',params:{runId:'run',attemptId:'attempt'}}} };
          const env = {DB:{prepare(){return {bind(){return {first:async()=>null}}}}}};
          const inactive = await ContainerProxy.prototype.fetch.call({ctx,env}, new Request('https://chatgpt.com/backend-api/codex/responses'));
          delete ctx.props.outboundHandlerOverride;
          const unconfigured = await ContainerProxy.prototype.fetch.call({ctx,env}, new Request('https://chatgpt.com/backend-api/codex/responses'));
          results.push({name:sandboxClass.name,inactive:await inactive.text(),inactiveStatus:inactive.status,
            unconfigured:await unconfigured.text(),unconfiguredStatus:unconfigured.status});
        }
        return Response.json(results);
      }};`, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, format: "esm", platform: "node", target: "es2022",
    external: ["cloudflare:workers", "cloudflare:sockets", "node:*"],
  });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: "implementation-network-registration", modules: true,
    compatibilityDate: "2026-08-26", compatibilityFlags: ["nodejs_compat"],
    script: bundle.outputFiles[0]!.text,
  }] }));
  try {
    const response = await mf.dispatchFetch("https://test.example/");
    assert.equal(response.status, 200, await response.clone().text());
    const results = await response.json() as {name:string;inactive:string;inactiveStatus:number;unconfigured:string;unconfiguredStatus:number}[];
    assert.equal(results.length, 2);
    for (const result of results) {
      assert.equal(result.inactiveStatus, 403, result.name);
      assert.equal(result.inactive, "Attempt is inactive");
      assert.equal(result.unconfiguredStatus, 403, result.name);
      assert.equal(result.unconfigured, "Implementation outbound policy is not configured");
    }
  } finally {
    await mf.dispose();
  }
});
