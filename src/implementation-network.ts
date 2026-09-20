import type { ImplementationPolicy } from "./implementation-contract.ts";

export interface ImplementationNetworkSandbox {
  setOutboundHandler(name: string, params: object): Promise<void>;
  setAllowedHosts(hosts: string[]): Promise<void>;
}

export function implementationAllowedHosts(policy: ImplementationPolicy, capabilityBaseUrl: string, browserHosts: string[] = []) {
  return [...new Set([...policy.packageHosts,'chatgpt.com','auth.openai.com',new URL(capabilityBaseUrl).hostname,...browserHosts])];
}

export async function configureImplementationNetwork(
  sandbox: ImplementationNetworkSandbox,
  policy: ImplementationPolicy,
  capabilityBaseUrl: string,
  identity: { runId: string; attemptId: string },
): Promise<void> {
  // ContainerProxy checks allowedHosts before invoking the saved policy handler.
  // Install the handler first so opening the host filter never permits unchecked traffic.
  await sandbox.setOutboundHandler("implementation", identity);
  await sandbox.setAllowedHosts(implementationAllowedHosts(policy,capabilityBaseUrl));
}
