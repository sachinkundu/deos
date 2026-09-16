import type { ImplementationPolicy } from './implementation-contract.ts';

// Describe the frozen run's capabilities to every phase, before design commits
// the implementer to a deployment path. This is context, not a quality gate.
export function implementationRuntimeContext(policy: ImplementationPolicy) {
  return {
    scope: 'Capabilities of the later implementation stage; planning and review do not deploy.',
    planningGuidance: 'Use these capabilities and relevant later human feedback when choosing or reviewing a preview path. Do not introduce a CI workflow, account setup or infrastructure demonstration when the declared publisher meets the approved application outcome. Explain a missing capability before committing to an unsupported deployment path.',
    execution: 'Local workerd inside an isolated Cloudflare Sandbox',
    documentationHosts: policy.documentationHosts,
    safeAdapters: policy.safeAdapters,
    deployment: policy.safeAdapters.includes('static-preview-v1')
      ? 'publish_preview accepts a finished static build directory and publishes it to a run-owned nonproduction Cloudflare Pages project. It returns an immutable review URL that remains available after Sandbox cleanup. No agent credentials, GitHub Actions workflow, repository Pages setup, backend deployment, or production release is needed. Use local workerd for backend tests.'
      : 'No hosted deployment capability is declared. Do not assume GitHub Actions, GitHub Pages, provider credentials, or production access. If hosted delivery is required, identify the missing capability before committing to that path.',
    demonstrations: 'Claude chooses useful application scenarios and their count. Sol captures them in one ordered collection, with a fresh browser context and known data per scenario. Keep the application and harness fixed while collecting. Capture each observed result before the next scenario resets.',
  };
}
