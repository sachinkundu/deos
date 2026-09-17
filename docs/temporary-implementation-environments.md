# Temporary implementation environments

The implementation agent requests a small remote environment through the existing
DEOS tool broker. DEOS chooses resource identities and holds Cloudflare credentials.
The app receives its own D1/R2 bindings, never DEOS storage or provider credentials.
Initial scope: one bundled JavaScript Worker, optional static build output, at
most one D1 binding and one R2 binding. No routes, custom domains, cron, queues,
account selection, secrets, production deployments or extra bindings.

An environment belongs to one implementation attempt. Its allocation intent,
provider identities, submitted bundle, migrations, deployment and cleanup receipts
are durable. Repeated identical requests reconcile the same identities. Conflicting
concurrent operations are rejected and uncertain operations are read back before
retry. Agent SQL runs only on its allocated database; migration identities are
saved in that database with the schema change. Storage inspection uses trusted
operations and preserves its output as evidence.

Tests and browser demonstrations reach the deployed Worker and real storage.
Remote deployment is a separate target from local workerd. The app bundle executes
without account credentials. A reserved authenticated control route supports
health/readback and bounded R2 cleanup; it never forwards arbitrary provider calls.

Environment lifetimes cover cloud review and author response. After the final
candidate and screenshots have been published and read back from GitHub, DEOS
retires every environment of that run. It first stops app writes, empties its R2
bucket, then deletes storage and Worker, recording confirmed absence. Cleanup
failure remains visible and retryable. Failed/abandoned attempts are reconciled
separately; active attempts are never swept. Evidence and DEOS storage survive.
The human PR has screenshots and receipts, with an explicit retired-preview note.

Validate provider contracts and a small real resource lifecycle before activating
the workflow capability. Then use the text-snippet shelf canary to validate the
cloud agents, browser evidence, PR publication and final cleanup together.

Provider contracts checked: [D1 creation](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/create/),
[R2 bucket creation](https://developers.cloudflare.com/api/resources/r2/subresources/buckets/methods/create/),
and [Worker multipart uploads and deployments](https://developers.cloudflare.com/workers/platform/infrastructure-as-code/).
The real adapter probe and failure record are under
[`docs/evidence/temporary-environments/`](evidence/temporary-environments/).
