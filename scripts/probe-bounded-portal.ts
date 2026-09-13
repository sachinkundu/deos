// Local D1/R2 replay and browser demo; no production bindings or provider calls.
// Run: node --experimental-strip-types scripts/probe-bounded-portal.ts
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { boundedPortalFixture } from '../portal/tests/helpers/bounded-portal-fixture.ts';

const fixture = await boundedPortalFixture();
await fixture.db.prepare("UPDATE agent_attempts SET cleanup_state='destroyed' WHERE attempt_id=?")
  .bind(fixture.journal.attemptId).run();
await fixture.store.acceptJournal(fixture.acceptance);
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  configFile: false, root: `${root}scripts/fixtures`,
  server: { host: '127.0.0.1', port: 4780, strictPort: true, fs: { allow: [root] } },
  plugins: [{ name: 'local-review-replay', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/api/')) return next();
      void fixture.request(req.url).then(async response => {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(await response.text());
      }).catch(error => {
        console.error(error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(error instanceof Error ? error.stack : String(error));
      });
    });
  } }],
});
await server.listen();
console.log('Local captured-native-stream replay: http://127.0.0.1:4780/');
console.log('Authentication uses a local test identity. All SQL and artifact readers are production code.');
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  if (stopping) return;
  stopping = true;
  void Promise.allSettled([server.close(), fixture.mf.dispose()]).then(results => {
    for (const result of results) if (result.status === 'rejected') console.error(result.reason);
    process.exitCode = results.some(result => result.status === 'rejected') ? 1 : 0;
  });
});
