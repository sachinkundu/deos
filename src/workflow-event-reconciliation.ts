import { captureWorkflowErrors } from './error-context.ts';
import { D1OrchestrationStore } from './orchestration-store.ts';

/** A successful provider send is not an acknowledgement from the workflow.
 * Retry the saved wake only; the workflow still claims and interprets the event.
 */
export async function reconcileWorkflowEvents(
  env: Pick<Env, 'DB' | 'ARTIFACTS' | 'ORCHESTRATION_WORKFLOW'>,
  now = new Date(),
): Promise<void> {
  const cutoff = new Date(now.getTime() - 2 * 60_000).toISOString();
  const pending = await env.DB.prepare(`SELECT inbox.delivery_id, inbox.run_id, inbox.sent_at, run.workflow_instance_id
    FROM workflow_event_inbox inbox JOIN orchestration_runs run ON run.run_id=inbox.run_id
    WHERE inbox.state='sent' AND inbox.sent_at<=?
      AND run.status IN ('active','awaiting_human','awaiting_capability')
    ORDER BY inbox.sent_at LIMIT 50`).bind(cutoff)
    .all<{ delivery_id: string; run_id: string; sent_at: string; workflow_instance_id: string }>();
  const store = new D1OrchestrationStore(env.DB);
  const failures: unknown[] = [];
  for (const event of pending.results) {
    try {
      await captureWorkflowErrors(env.DB, env.ARTIFACTS, event.run_id, 'reconcile workflow wake', async () => {
        const instance = await env.ORCHESTRATION_WORKFLOW.get(event.workflow_instance_id);
        const { status } = await instance.status();
        if (!['running', 'waiting', 'queued'].includes(status)) return;
        // Recheck after the provider call; a normal wake may have won meanwhile.
        const [inbox, run] = await Promise.all([store.findInboxEvent(event.delivery_id), store.findRun(event.run_id)]);
        if (inbox?.state !== 'sent' || !run || run.workflow_instance_id !== event.workflow_instance_id ||
            !['active','awaiting_human','awaiting_capability'].includes(run.status)) return;
        await instance.sendEvent({ type: 'linear-event', payload: { deliveryId: event.delivery_id } });
        await store.markInboxState(event.delivery_id, 'sent', 'sent', now.toISOString());
        console.log(JSON.stringify({ event: 'workflow.wake_retried', runId: event.run_id,
          deliveryId: event.delivery_id, previousSentAt: event.sent_at, sentAt: now.toISOString() }));
      });
    } catch (error) {
      // captureWorkflowErrors retained the original before continuing other runs.
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Workflow wake reconciliation failed', { cause: failures[0] });
}
