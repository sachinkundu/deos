import { getSandbox, Sandbox } from "@cloudflare/sandbox";

import type { SandboxArtifactReader } from "./artifact-collector.ts";
import type { SandboxFactory, SandboxView } from "./sandbox-controller.ts";

export { Sandbox };

export class CloudflareSandboxFactory implements SandboxFactory {
  private readonly namespace: DurableObjectNamespace<Sandbox<unknown>>;

  constructor(namespace: DurableObjectNamespace<Sandbox<unknown>>) {
    this.namespace = namespace;
  }

  get(sandboxId: string, options: { keepAlive: boolean }): SandboxView {
    return getSandbox(this.namespace, sandboxId, {
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
