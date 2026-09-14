import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { recoverCaptures } from '../container/supervisor-capture.mjs';

test('SIGKILL preserves the exact parent transcript for failure collection and replay', async () => {
    const root = await mkdtemp(join(tmpdir(), 'deos-capture-proof-'));
    try {
        const capture = join(root, 'capture');
        const output = join(root, 'output');
        const script = join(root, 'writer.mjs');
        await writeFile(script, `import { trustedCapture } from ${JSON.stringify(new URL('../container/supervisor-capture.mjs', import.meta.url).href)};
const transcript = await trustedCapture('transcript.jsonl', process.argv[2]);
const stderr = await trustedCapture('stderr.txt', process.argv[2]);
await new Promise(resolve => transcript.stream.write('Original parent event\\nFinal captured event\\n', resolve));
await new Promise(resolve => stderr.stream.write('Original stderr failure\\n', resolve));
console.log('captured');
setInterval(() => {}, 1000);
`);
        const child = spawn(process.execPath, [script, capture], { stdio: ['ignore', 'pipe', 'pipe'] });
        await once(child.stdout, 'data');
        const exited = once(child, 'exit');
        child.kill('SIGKILL');
        await exited;
        await recoverCaptures(capture, output);
        assert.equal(await readFile(join(output, 'transcript.jsonl'), 'utf8'), 'Original parent event\nFinal captured event\n');
        assert.equal(await readFile(join(output, 'validation.txt'), 'utf8'), 'Original stderr failure\n');
        await writeFile(join(output, 'validation.txt'), 'Existing validation');
        await recoverCaptures(capture, output);
        assert.equal(await readFile(join(output, 'validation.txt'), 'utf8'), 'Existing validation');
        assert.equal(await readFile(join(output, 'supervisor-stderr.txt'), 'utf8'), 'Original stderr failure\n');
        assert.equal(await readFile(join(capture, 'transcript.jsonl'), 'utf8'), await readFile(join(output, 'transcript.jsonl'), 'utf8'));
        // A failed publication leaves the source available for another attempt.
        const badOutput = join(root, 'not-a-directory');
        await writeFile(badOutput, 'occupied');
        await assert.rejects(recoverCaptures(capture, badOutput));
        assert.match(await readFile(join(capture, 'transcript.jsonl'), 'utf8'), /Final captured event/);
    } finally { await rm(root, { recursive: true, force: true }); }
});
