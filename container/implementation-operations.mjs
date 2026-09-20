import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { originalErrorText } from './original-errors.mjs';

const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const terminal = state => ['completed', 'failed', 'canceled', 'interrupted'].includes(state);

// These are execution receipts, not quality judgments. Client disconnect never
// starts, retries, or cancels work. Explicit IDs make ambiguous replies readable.
export class ImplementationOperations {
  entries = new Map();
  constructor(directory, queue, deadline, record = async () => {}) {
    this.directory = directory; this.queue = queue; this.deadline = deadline; this.record = record;
  }
  async initialize() {
    if (!Number.isFinite(Date.parse(this.deadline))) throw new Error('Operation attempt deadline is required');
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const name of await readdir(this.directory)) {
      if (!name.endsWith('.json')) continue;
      const record = JSON.parse(await readFile(join(this.directory, name), 'utf8'));
      const entry = { record, writes: Promise.resolve(), controller: new AbortController() };
      this.entries.set(record.requestId, entry);
      if (!terminal(record.state)) {
        record.state = 'interrupted';
        record.error = { message: 'Runtime restarted before the operation completed; inspect retained progress before an explicit new attempt.' };
        record.finishedAt = new Date().toISOString();
        await this.persist(entry);
      }
    }
  }
  persist(entry) {
    const bytes = JSON.stringify(entry.record);
    const path = join(this.directory, `${entry.record.requestId}.json`);
    entry.writes = entry.writes.then(async () => {
      await writeFile(path + '.tmp', bytes, { mode: 0o600 });
      await rename(path + '.tmp', path);
      await this.record(JSON.parse(bytes));
    });
    return entry.writes;
  }
  status(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown operation: ${id}. Submission is not recorded yet. Await the original submission or resubmit the identical saved request with this same requestId; do not create another ID to recover missing acknowledgement.`);
    if (entry.storageError) throw entry.storageError;
    const record = structuredClone(entry.record);
    record.observedAt = new Date().toISOString();
    record.inactiveForMs = Date.now() - Date.parse(record.lastActivityAt);
    return record;
  }
  list() { return [...this.entries.keys()].map(id => { const { result, ...summary } = this.status(id); return summary; }); }
  async submit(request, work) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(request.requestId ?? ''))
      throw new Error('check and demo require a stable requestId. Reuse it to retrieve the same operation; use a new ID only for intentional new work.');
    const fingerprint = createHash('sha256').update(canonical(request)).digest('hex');
    const frozen = structuredClone(request);
    const previous = this.entries.get(request.requestId);
    if (previous) {
      if (previous.record.fingerprint !== fingerprint) throw new Error(`Operation ${request.requestId} already exists with different input`);
      await previous.writes;
      return this.status(request.requestId);
    }
    const now = new Date().toISOString();
    const entry = { record: { requestId: request.requestId, action: request.action, fingerprint,
      state: 'queued', createdAt: now, lastActivityAt: now, deadline: this.deadline },
      writes: Promise.resolve(), controller: new AbortController() };
    // Register before the first await so simultaneous identical requests coalesce.
    this.entries.set(request.requestId, entry);
    await this.persist(entry);
    entry.running = this.queue.run(request.action, async () => {
      if (entry.record.state === 'canceled') return;
      entry.record.state = 'running';
      entry.record.startedAt = entry.record.lastActivityAt = new Date().toISOString();
      if (request.action === 'check') entry.record.commandDeadline = new Date(Math.min(Date.now() + 600_000, Date.parse(this.deadline))).toISOString();
      await this.persist(entry);
      try {
        if (Date.now() >= Date.parse(this.deadline)) throw new Error('Attempt deadline elapsed before operation execution');
        if (frozen.dependsOn !== undefined && (!Array.isArray(frozen.dependsOn) || frozen.dependsOn.some(id => typeof id !== 'string')))
          throw new Error('dependsOn must list completed operation IDs');
        for (const id of frozen.dependsOn ?? []) {
          const dependency = this.status(id);
          if (dependency.state !== 'completed') throw new Error(`Dependency ${id} is ${dependency.state}; command was not started`);
        }
        const activity = async progress => {
          entry.record.progress = progress;
          entry.record.lastActivityAt = new Date().toISOString();
          await this.persist(entry);
        };
        const output = bytes => {
          entry.record.lastActivityAt = new Date().toISOString();
          entry.record.progress = { event: 'command_output', outputBytes: (entry.record.progress?.outputBytes ?? 0) + bytes };
        };
        entry.record.result = await work(frozen, { signal: entry.controller.signal, activity, output,
          timeout: Math.max(1, Math.min(600_000, Date.parse(this.deadline) - Date.now())) });
        entry.record.state = request.action === 'check' && entry.record.result.exitCode !== 0 ? 'failed' : 'completed';
      } catch (error) {
        entry.record.state = entry.controller.signal.aborted ? 'canceled' : 'failed';
        entry.record.error = { message: error.message, stack: error.stack, detail: originalErrorText(error), result: error.result };
      }
      entry.record.finishedAt = entry.record.lastActivityAt = new Date().toISOString();
      await this.persist(entry);
    });
    // Keep storage failures observable to status and drain, never an unhandled rejection.
    entry.running.catch(error => { entry.storageError = error; });
    return this.status(request.requestId);
  }
  async cancel(id) {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Unknown operation: ${id}`);
    if (entry.record.state === 'running' && ['demo','publish_environment','storage'].includes(entry.record.action))
      throw new Error('A running demo may have an in-flight browser action. Inspect progress; it cannot be canceled or replayed by closing a client.');
    if (entry.record.state === 'queued') {
      entry.record.state = 'canceled';
      entry.record.finishedAt = entry.record.lastActivityAt = new Date().toISOString();
      await this.persist(entry);
    } else if (entry.record.state === 'running') entry.controller.abort(new Error('Operation explicitly canceled by author'));
    return this.status(id);
  }
  async drain() {
    await Promise.all([...this.entries.values()].map(entry => entry.running));
    await Promise.all([...this.entries.values()].map(entry => entry.writes));
  }
}
