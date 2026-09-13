// Local image probe: no network, credentials, model calls or provider mutations.
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await mkdir('/deos/claude', { recursive: true });
const child = spawn('node', ['--experimental-strip-types', '/deos/bin/claude-trusted-runner.mjs'], {
  env: { PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'],
});
let stdout = '', stderr = '';
child.stdout.on('data', chunk => stdout += chunk);
child.stderr.on('data', chunk => stderr += chunk);
await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
const failure = JSON.parse(await readFile('/deos/claude/failure.json', 'utf8'));
assert.equal(child.exitCode, 1);
assert.equal(failure.originalError.cause.message, 'Claude runner config.json is missing');
assert.deepEqual(JSON.parse(stderr), failure);
assert.equal(stdout, '');
console.log(JSON.stringify({ evidence: 'local built image, real runner process, network disabled',
  exitCode: child.exitCode, cause: failure.originalError.cause.message,
  fileMatchesStderr: true, originalStackRetained: !!failure.originalError.cause.stack }, null, 2));
