import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// Exercise the production hook state machine with real candidate files and the
// real completion validator. Only command execution and container paths vary.
async function fixture() {
    const root = await mkdtemp(join(tmpdir(), 'bounded-hook-'));
    const output = join(root, 'output');
    const stateRoot = join(root, 'native');
    const cwd = join(root, 'work');
    const sessions = join(root, 'sessions');
    const relative = 'openspec/changes/test/design.md';
    for (const dir of [output, stateRoot, sessions, join(cwd, 'openspec/changes/test')])
        await mkdir(dir, { recursive: true });
    const candidate = ['## Component diagram', 'A calls B.', '## Event flow', 'The event is saved.',
        '## Minimal data model', 'One row stores one review.', '## Failure modes', 'A wrong head fails closed.', ''].join('\n');
    await writeFile(join(cwd, relative), candidate);
    await writeFile(join(output, 'author-sources.json'), JSON.stringify({ sources: [], searchDisposition: 'not_searched' }));
    const checkModule = `import { runAuthorCompletionCheck as plan, runDesignCompletionCheck as design } from ${JSON.stringify(pathToFileURL(resolve('container/author-completion.mjs')).href)};
    const execute=async(args)=>({code:0,signal:null,truncated:false,stdout:args[0]==='git'?${JSON.stringify(`?? ${relative}\0`)}:'Change is valid',stderr:''});
    export const runAuthorCompletionCheck=options=>plan({...options,execute});
    export const runDesignCompletionCheck=options=>design({...options,execute});`;
    await writeFile(join(root, 'check.mjs'), checkModule);
    const grounding = (await readFile('container/grounded-review.mjs', 'utf8'))
        .replaceAll("'./bounded-review.mjs'", JSON.stringify(pathToFileURL(resolve('container/bounded-review.mjs')).href))
        .replaceAll('/deos/output', output);
    await writeFile(join(root, 'grounded.mjs'), grounding);
    let source = await readFile('container/bounded-self-review.mjs', 'utf8');
    source = source.replaceAll('/deos/native-review', stateRoot).replaceAll('/deos/output', output)
        .replaceAll('/root/.codex/sessions/', sessions + '/');
    for (const file of ['original-errors.mjs', 'trace-review-proof.mjs', 'bounded-review.mjs']) {
        source = source.replaceAll(`'./${file}'`, JSON.stringify(pathToFileURL(resolve('container', file)).href));
    }
    source = source.replaceAll("'./author-completion.mjs'", "'./check.mjs'")
        .replaceAll('"./grounded-review.mjs"', "'./grounded.mjs'");
    await writeFile(join(root, 'hook.mjs'), source);
    const hook = await import(pathToFileURL(join(root, 'hook.mjs')).href);
    await hook.initializeBoundedReview({ attemptId: 'attempt', runId: 'run', nativeSelfReview: { phase: 'design' },
        model: 'model', reasoning: 'high', deadline: new Date(Date.now() + 300000).toISOString(), cwd,
        openspecChange: 'test', materializedContext: '{}' });
    const readState = async () => JSON.parse(await readFile(join(stateRoot, 'state.json'), 'utf8'));
    const stop = () => hook.executeBoundedHook({ hook_event_name: 'Stop' });
    const child = async (id: string, result: unknown, write = false) => {
        const spawn = await hook.executeBoundedHook({ hook_event_name: 'PreToolUse', tool_name: 'multi_agent_v1.spawn_agent' });
        assert.equal(spawn.hookSpecificOutput.updatedInput.fork_context, false);
        const identity = { agent_type: 'deos_reviewer', agent_id: id, model: 'model', session_id: 'parent' };
        await hook.executeBoundedHook({ ...identity, hook_event_name: 'SubagentStart' });
        if (write)
            await writeFile(join(cwd, relative), 'Unauthorized change.\n');
        const transcript = join(sessions, `${id}.jsonl`);
        await writeFile(transcript, JSON.stringify({ type: 'message', result }) + '\n');
        return hook.executeBoundedHook({ ...identity, hook_event_name: 'SubagentStop', agent_transcript_path: transcript,
            last_assistant_message: JSON.stringify(result) });
    };
    return { root, cwd, relative, candidate, hook, readState, stop, child };
}
test('native hook runs discovery, one repair, and only the original closed recheck', async () => {
    const f = await fixture();
    try {
        assert.match((await f.stop()).reason, /Start one native subagent/);
        await f.child('discovery', { findings: [{ id: 'F1', summary: 'Explain the output', location: 'design.md:1' }], sources: [], searchDisposition: 'none_used' });
        assert.match((await f.stop()).reason, /one repair turn/);
        assert.equal((await f.readState()).cycle.repair.started, true);
        await writeFile(join(f.cwd, f.relative), f.candidate + 'The output is saved.\n');
        assert.match((await f.stop()).reason, /Start one native subagent/);
        await f.child('recheck', { ratings: { F1: 'fixed', new: 'open' }, sources: [], searchDisposition: 'not_searched' });
        assert.match((await f.stop()).reason, /complete/);
        assert.deepEqual(await f.stop(), {});
        const state = await f.readState();
        assert.deepEqual(state.cycle.openIds, []);
        assert.deepEqual(state.cycle.recheck.result.violations, ['new']);
        assert.equal(state.children.length, 2);
        const extra = await f.hook.executeBoundedHook({ hook_event_name: 'PreToolUse', tool_name: 'multi_agent_v1.spawn_agent' });
        assert.equal(extra.hookSpecificOutput.permissionDecision, 'deny');
    }
    finally {
        await rm(f.root, { recursive: true, force: true });
    }
});
test('native child writes restore the checked candidate and preserve the failed transcript', async () => {
    const f = await fixture();
    try {
        await f.stop();
        await assert.rejects(f.child('writer', { findings: [], sources: [], searchDisposition: 'none_used' }, true), /candidate_modified/);
        assert.equal(await readFile(join(f.cwd, f.relative), 'utf8'), f.candidate);
        const state = await f.readState();
        assert.equal(state.cycle.discovery.status, 'failed');
        assert.equal(state.children[0].parentAttemptId, 'attempt');
        assert.match(state.cycle.discovery.invocations[0].cause.stack, /candidate_modified/);
    }
    finally {
        await rm(f.root, { recursive: true, force: true });
    }
});
