import { getSandbox, Sandbox } from "@cloudflare/sandbox";
import { requireSandboxTier, type SandboxTier } from "./sandbox-tier.ts";

import type { SandboxArtifactReader } from "./artifact-collector.ts";
import type { SandboxFactory, SandboxView } from "./sandbox-controller.ts";

export { Sandbox };
export class Standard2Sandbox extends Sandbox {}

export class CloudflareSandboxFactory implements SandboxFactory {
  private readonly namespace: DurableObjectNamespace<Sandbox<unknown>>;
  private readonly standard2: DurableObjectNamespace<Sandbox<unknown>>;

  constructor(namespace: DurableObjectNamespace<Sandbox<unknown>>, standard2: DurableObjectNamespace<Sandbox<unknown>>) {
    this.namespace = namespace;
    this.standard2 = standard2;
  }

  get(sandboxId: string, options: { keepAlive: boolean; tier: SandboxTier }): SandboxView {
    const tier = requireSandboxTier(options.tier);
    const namespace = tier === "basic" ? this.namespace : this.standard2;
    return getSandbox(namespace, sandboxId, {
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
