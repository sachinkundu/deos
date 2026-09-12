// Run in the built DEOS image with --network none. No credentials are supplied.
// Scripted local Responses events exercise the pinned runtime and production hooks.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { setupNativeReview } from '/deos/bin/native-review-setup.mjs';
import { verifyReviewJournal } from '/deos/bin/bounded-review.mjs';
import { createHash } from 'node:crypto';
const repo = '/deos/workspace/repository';
const root = '/deos/native-review';
const prefix = 'openspec/changes/native-loop-test';
const model = 'gpt-5.6-sol';
const requests = [];
const save = (file, value) => writeFile(file, JSON.stringify(value));
const load = async (file) => JSON.parse(await readFile(file, 'utf8'));
const digest = text => createHash('sha256').update(text).digest('hex');
for (const dir of [`${repo}/${prefix}/specs/review-step`, '/deos/run', '/deos/output', '/root/.codex', '/evidence'])
    await mkdir(dir, { recursive: true });
await writeFile(`${repo}/${prefix}/.openspec.yaml`, 'schema: spec-driven\n');
await writeFile(`${repo}/${prefix}/proposal.md`, '## Why\n\nPeople need a clear plan.\n\n## What Changes\n\n- Add a review step.\n\n## Capabilities\n\n### New Capabilities\n\n- `review-step`: Check a plan.\n\n## Impact\n\nThe app checks plans.\n');
await writeFile(`${repo}/${prefix}/specs/review-step/spec.md`, '## ADDED Requirements\n\n### Requirement: Check the plan\n\nThe system SHALL check the plan.\n\n#### Scenario: Plan is ready\n\n- **WHEN** the plan is complete\n- **THEN** the system checks it\n');
for (const args of [['init'], ['add', '.'], ['-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-m', 'fixture']])
    execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
await writeFile(`${repo}/${prefix}/design.md`, '## Component diagram\n\nThe app checks the plan.\n\n## Event flow\n\nA person sends a plan.\n\n## Minimal data model\n\nStore a plan.\n\n## Failure modes\n\nShow an error if the check fails.\n');
await writeFile('/deos/run/prompt.md', 'PARENT_PRIVATE_MARKER: finish the design, then follow trusted review hooks.');
await save('/deos/output/author-sources.json', { sources: [], searchDisposition: 'not_searched' });
const job = { runId: 'probe-run', attemptId: 'probe-author', nativeSelfReview: { phase: 'design', schema: 'deos-bounded-review-v1' },
    deadline: new Date(Date.now() + 240000).toISOString(), openspecChange: 'native-loop-test', promptPath: '/deos/run/prompt.md', materializedContext: '{}',
    model, reasoning: 'high', cwd: repo };
await save('/deos/run/job.json', job);
await save('/root/.codex/models_cache.json', { models: [{ slug: model, display_name: model, description: 'Local runtime fixture',
            base_instructions: 'Follow the supplied task and tools.', default_reasoning_level: 'high', supported_reasoning_levels: [{ effort: 'high', description: 'Review' }],
            shell_type: 'shell_command', visibility: 'list', supported_in_api: true, priority: 1, availability_nux: null, upgrade: null,
            support_verbosity: true, default_verbosity: 'low', apply_patch_tool_type: 'freeform', truncation_policy: { mode: 'tokens', limit: 10000 },
            supports_parallel_tool_calls: true, experimental_supported_tools: [], tool_mode: 'code_mode_only', multi_agent_version: 'v2', context_window: 272000 }] });
await setupNativeReview(job);
const server = createServer(async (request, response) => {
    try {
        let text = '';
        for await (const chunk of request)
            text += chunk;
        const body = JSON.parse(text);
        requests.push(body);
        const ordinal = requests.length;
        const child = !JSON.stringify(body.input).includes('PARENT_PRIVATE_MARKER');
        const state = await load(`${root}/state.json`);
        const outputs = body.input.filter(item => ['function_call_output', 'custom_tool_call_output'].includes(item.type));
        const call = (name, args) => ({ id: `f${ordinal}`, type: 'function_call', namespace: 'multi_agent_v1', name, call_id: `c${ordinal}`, arguments: JSON.stringify(args) });
        const shell = cmd => ({ id: `f${ordinal}`, type: 'custom_tool_call', namespace: 'functions', name: 'exec', call_id: `c${ordinal}`,
            input: `text(await tools.exec_command(${JSON.stringify({ cmd, max_output_tokens: 10000 })}));` });
        const message = value => ({ id: `m${ordinal}`, type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: JSON.stringify(value), annotations: [] }] });
        let item;
        if (child && !outputs.length)
            item = shell(`cat ${state.requestPath}`);
        else if (child)
            item = message(state.slot === 'discovery'
                ? { findings: [{ id: 'F1', summary: 'Name the error shown to a person.', location: `${prefix}/design.md:15` }], sources: [], searchDisposition: 'not_searched' }
                : { ratings: { F1: 'fixed' }, sources: [], searchDisposition: 'not_searched' });
        else if (state.stage === 'ready')
            item = call('spawn_agent', { agent_type: 'deos_reviewer', fork_context: false, message: `Read ${state.requestPath}.` });
        else if (state.stage === 'active' && state.activeChild)
            item = call('wait_agent', { targets: [state.activeChild], timeout_ms: 10000 });
        else if (state.stage === 'repairing' && !(await readFile(`${repo}/${prefix}/design.md`, 'utf8')).includes('Error: plan check failed.')) {
            item = shell(`printf '\\nError: plan check failed.\\n' >> ${prefix}/design.md`);
        }
        else
            item = message({ outcome: 'completed' });
        const result = { id: `r${ordinal}`, object: 'response', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } };
        const events = [
            { type: 'response.created', response: { ...result, status: 'in_progress', output: [] } },
            { type: 'response.output_item.added', output_index: 0, item },
            { type: 'response.output_item.done', output_index: 0, item },
            { type: 'response.completed', response: result },
        ];
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''));
    }
    catch (error) {
        response.writeHead(500);
        response.end(error.stack);
    }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const config = '/root/.codex/config.toml';
await writeFile(config, 'model_provider = "probe"\n' + await readFile(config, 'utf8') + `\n[model_providers.probe]\nname="Scripted local probe"\nbase_url="http://127.0.0.1:${server.address().port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\n`);
const process = spawn('codex', ['exec', '--json', '--model', model, '--dangerously-bypass-approvals-and-sandbox', '-'], { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] });
process.stdin.end(await readFile('/deos/run/prompt.md'));
let stdout = '', stderr = '';
process.stdout.on('data', bytes => { stdout += bytes; });
process.stderr.on('data', bytes => { stderr += bytes; });
const timer = setTimeout(() => process.kill('SIGKILL'), 240000);
const code = await new Promise((resolve, reject) => { process.once('error', reject); process.once('exit', resolve); });
clearTimeout(timer);
server.close();
const state = await load(`${root}/state.json`);
const journal = await load('/deos/output/review-progress.json');
let verificationError = null;
try {
    await verifyReviewJournal(journal, { attemptId: job.attemptId, runId: job.runId, inputDigest: digest(job.materializedContext),
        candidateFiles: journal.checkedCandidate.files, parentTranscript: stdout, hash: async (text) => digest(text), model });
}
catch (error) {
    verificationError = error.stack;
}
const checks = { exitSuccess: code === 0, loopCompleted: state.stage === 'done',
    twoFreshChildren: state.children.length === 2 && new Set(state.children.map(child => child.invocationId)).size === 2,
    oneRepair: state.cycle?.repair.started && state.cycle.repair.outcome === 'checked',
    closedRecheck: state.cycle?.recheck.status === 'accepted' && !state.cycle.openIds.length,
    sameAuthor: state.children.every(child => child.parentAttemptId === job.attemptId),
    nativeTranscripts: state.children.every(child => child.eventCount > 0), trustedJournalVerified: verificationError === null };
const evidence = { evidenceClass: 'local-scripted-production-hook-integration', checks, passed: Object.values(checks).every(Boolean), verificationError };
for (const [name, value] of Object.entries({ 'result.json': evidence, 'state.json': state, 'journal.json': journal, 'requests.json': requests }))
    await save(`/evidence/${name}`, value);
await writeFile('/evidence/stdout.jsonl', stdout);
await writeFile('/evidence/stderr.txt', stderr);
console.log(JSON.stringify(evidence, null, 2));
globalThis.process.exitCode = evidence.passed ? 0 : 1;
