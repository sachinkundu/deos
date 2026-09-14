import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { requireSandboxTier, type SandboxTier } from "./sandbox-tier.ts";
import { sandboxProviderIdentity } from "./orchestration-identity.ts";

import type { SandboxArtifactReader } from "./artifact-collector.ts";
import type { SandboxFactory, SandboxView } from "./sandbox-controller.ts";

export { Sandbox };
export class Standard2Sandbox extends Sandbox {}

export class ImplementationSandbox extends Sandbox<Env> {
  enableInternet = false;
  interceptHttps = true;
  // The trusted controller installs the frozen policy before starting the author.
  allowedHosts: string[] | undefined = [];
}
export class ImplementationStandard2Sandbox extends ImplementationSandbox {}

// These assignments invoke Container's static setters. Class fields would shadow
// those setters and leave ContainerProxy's per-class registry empty.
for (const sandboxClass of [ImplementationSandbox, ImplementationStandard2Sandbox]) {
  sandboxClass.outbound = async () => new Response('Implementation outbound policy is not configured',{status:403});
  sandboxClass.outboundHandlers = { implementation: async (request: Request, env: Env, context: {params?:unknown}) => {
    const {runId,attemptId}=context.params as {runId:string;attemptId:string};
    const row=await env.DB.prepare(`SELECT a.state,r.input_key,r.input_sha FROM agent_attempts a
      JOIN implementation_runs r ON r.run_id=a.run_id WHERE a.attempt_id=? AND r.run_id=?`)
      .bind(attemptId,runId).first<{state:string;input_key:string;input_sha:string}>();
    if(!row||!['starting','running'].includes(row.state))return new Response('Attempt is inactive',{status:403});
    const {ImplementationStore}=await import('./implementation-store.ts');
    const input=await new ImplementationStore(env.DB,env.ARTIFACTS).read<import('./implementation-store.ts').ImplementationInput>(row.input_key,row.input_sha);
    const url=new URL(request.url), capability=new URL(env.CAPABILITY_BASE_URL);
    const packageRead=['GET','HEAD'].includes(request.method)&&input.policy.packageHosts.includes(url.hostname);
    const model=(url.hostname==='chatgpt.com'&&url.pathname.startsWith('/backend-api/codex/')) ||
      (url.hostname==='auth.openai.com'&&url.pathname==='/oauth/token');
    const broker=url.origin===capability.origin&&url.pathname.startsWith(`${capability.pathname}/`);
    const tunnel=url.hostname==='api.trycloudflare.com'&&url.pathname==='/tunnel'&&request.method==='POST';
    if(url.protocol!=='https:'||url.username||url.password||!(packageRead||model||broker||tunnel))return new Response('Destination is outside the saved implementation policy',{status:403});
    return fetch(request,{redirect:'manual'});
  }};
}


export class CloudflareSandboxFactory implements SandboxFactory {
  private readonly namespace: DurableObjectNamespace<Sandbox<unknown>>;
  private readonly standard2: DurableObjectNamespace<Sandbox<unknown>>;

  private readonly implementation?: DurableObjectNamespace<ImplementationSandbox>;
private readonly implementationStandard2?: DurableObjectNamespace<ImplementationStandard2Sandbox>;
constructor(namespace: DurableObjectNamespace<Sandbox<unknown>>, standard2: DurableObjectNamespace<Sandbox<unknown>>,
    implementation?: DurableObjectNamespace<ImplementationSandbox>,
    implementationStandard2?: DurableObjectNamespace<ImplementationStandard2Sandbox>) {
this.implementation=implementation;
this.implementationStandard2=implementationStandard2;

    this.namespace = namespace;
    this.standard2 = standard2;
  }

  get(sandboxId: string, options: { keepAlive: boolean; tier: SandboxTier }): SandboxView {
    const tier = requireSandboxTier(options.tier);
    const namespace = sandboxId.startsWith('impl-')
      ? tier==='basic' ? this.implementation : this.implementationStandard2
      : tier === "basic" ? this.namespace : this.standard2;
    if(!namespace)throw new Error('Implementation Sandbox namespace is missing');
    return getSandbox(namespace as unknown as DurableObjectNamespace<Sandbox<unknown>>, sandboxProviderIdentity(sandboxId), {
      keepAlive: options.keepAlive,
      normalizeId: true,
      sleepAfter: "10m",
    }) as unknown as SandboxView;
  }
}

export class SandboxArtifactReaderAdapter implements SandboxArtifactReader {
  private readonly sandbox: SandboxView;

  constructor(sandbox: SandboxView) {
    this.sandbox = sandbox;
  }

  async exists(path: string): Promise<boolean> {
    return (await this.sandbox.exists(path)).exists;
  }

  async read(path: string): Promise<{ content: Uint8Array; mediaType: string }> {
    const result = await this.sandbox.readFile(path, { encoding: "utf8" });
    return {
      content: new TextEncoder().encode(result.content),
      mediaType: result.mimeType ?? (path.endsWith(".json") || path.endsWith(".jsonl")
        ? "application/json"
        : "text/plain"),
    };
  }
}
