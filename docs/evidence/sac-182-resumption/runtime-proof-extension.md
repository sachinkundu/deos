# Required runner support for the SAC-182 demo

Status: verified capability gap, not implemented. This is workflow support; Cloudflare authors retain ownership of application code and proof.

The D1/R2 canary exercised one temporary Worker with storage. SAC-182 needs an application spanning service calls, authenticated sessions, durable Workflow events and provider callbacks. The current publisher rejects configuration keys other than D1/R2, exports only its default management wrapper, and passes only those storage bindings plus assets to application code. A broader API key alone cannot change that contract.

The scoped provider adapter independently operates one task-owned PR/issue. It cannot currently act as the actual deployed application's transport, route a provider-signed callback into the temporary ingress, advance a task-owned head, or create an unlinked comparison PR. Its genuine provider receipts are not proof that the application performed those operations.

## Proposed extension boundary

- A versioned, explicitly granted temporary application manifest: separately named Worker modules, service entrypoints, session Durable Object classes, and Workflow bindings. Resolve every target to resources owned by this run/attempt. Never bind application code to production storage or production service entrypoints.
- Environment-owned signing/session secrets and a scoped provider gateway. Keep broad GitHub/Linear credentials in trusted runner support. Check the frozen profile, repository, owned PRs/issues and operation identity on every request. No arbitrary secret names, production credentials, arbitrary GraphQL or general proxy target URLs exposed to authors.
- Provider-originated webhook routing for the owned fixture, preserving original signed bytes, timestamp, delivery identity, original failure and replay deduplication. A re-signed synthetic event must never be called provider-originated proof. Choose and validate the concrete authentication and callback contract before shipping.
- Safe fixture operations for head advance and a separate unlinked PR. Persist allocation/write intent, reconcile uncertain responses, bound retries and read back cleanup. Support resource reuse only when ownership and identity are established.
- Broker-managed initial session/account/gate data is setup, explicitly labeled as such. Subsequent success states, review receipts, gate choices and traversal must be created by the application and real workflow. Never insert those outcomes to manufacture a demo.
- Preserve all work and immutable diagnostics at capability failure. The author returns needs_human without marking unsupported demo scenarios complete. Keep the existing one-review/one-repair policy and delegated human review.

## Before resuming the blocked run

Validate isolation and cross-run denial, exact module/binding deployment readback, app-to-provider ordering, signed callback arrival, duplicate/retry behavior, interrupted provisioning and complete owned-resource cleanup. Exercise the generic runner contract without writing substitute SAC-182 proof. Deploy only with no active attempts globally, verify backend and affected container versions, and rematerialize the active run's capability context through supported APIs. Then answer the existing clarification with the actual capability contract and let the cloud author produce all twelve real-app demonstrations.

The clarification must remain unanswered until those capabilities exist. A comment claiming they are available would only restart the same blocked work. No runtime extension, feature edit, deployment, credential grant or new retry was made during this diagnosis.
