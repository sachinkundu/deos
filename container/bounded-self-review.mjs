import { checkAuthorSources, sourceSchema } from "./grounded-review.mjs";
import { originalErrorText, recordCaughtError } from './original-errors.mjs';
import { createHash } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, readdir, lstat, rm } from 'node:fs/promises';
import path from 'node:path';
import { runAuthorCompletionCheck, runDesignCompletionCheck } from './author-completion.mjs';
import { parseCodexFinalMessage } from './trace-review-proof.mjs';
import { createReviewCycle, reduceReviewCycle, REVIEW_SCHEMA } from './bounded-review.mjs';
const ROOT = '/deos/native-review';
const OUTPUT = '/deos/output';
const digest = value => createHash('sha256').update(value).digest('hex');
const save = async (file, value) => {
    await writeFile(`${file}.tmp`, JSON.stringify(value), { mode: 0o600 });
    await rename(`${file}.tmp`, file);
};
const load = async (file) => JSON.parse(await readFile(file, 'utf8'));
const deny = reason => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const block = reason => ({ decision: 'block', reason });
const snapshot = async (state) => {
    const root = `openspec/changes/${state.change}`;
    const files = [];
    const walk = async (relative) => {
        const full = path.join(state.cwd, relative);
        const info = await lstat(full);
        if (info.isSymbolicLink())
            throw new Error('candidate symlinks are forbidden');
        if (info.isDirectory()) {
            for (const name of (await readdir(full)).sort())
                await walk(`${relative}/${name}`);
        }
        else if (info.isFile())
            files.push({ path: relative, content: await readFile(full, 'utf8') });
        else
            throw new Error('unsupported candidate file');
    };
    await walk(state.phase === 'design' ? `${root}/design.md` : root);
    return { files, digest: digest(JSON.stringify(files)) };
};
const restore = async (state, checked) => {
    const target = path.join(state.cwd, `openspec/changes/${state.change}`, state.phase === 'design' ? 'design.md' : '');
    await rm(target, { recursive: true, force: true });
    for (const file of checked.files) {
        await mkdir(path.dirname(path.join(state.cwd, file.path)), { recursive: true });
        await writeFile(path.join(state.cwd, file.path), file.content);
    }
    if ((await snapshot(state)).digest !== checked.digest)
        throw new Error('checked candidate restoration failed');
    if (state.checkedSources)
        await save(`${OUTPUT}/author-sources.json`, state.checkedSources);
};
const journal = async (state, event) => {
    if (event) {
        state.cycle = reduceReviewCycle(state.cycle, event);
        state.events.push(event);
    }
    await save(`${ROOT}/state.json`, state);
    await save(`${OUTPUT}/review-progress.json`, {
        schema: REVIEW_SCHEMA, attemptId: state.attemptId, runId: state.runId, phase: state.phase,
        inputDigest: state.inputDigest, initialCandidate: state.initialCandidate,
        checkedCandidate: state.checkedCandidate, checkedSources: state.checkedSources, events: state.events, children: state.children,
    });
};
const prepareChild = async (state, slot) => {
    if (Date.parse(state.deadline) - Date.now() < 60000)
        throw new Error('nested_review_shutdown_reserve');
    state.stage = 'ready';
    state.slot = slot;
    const request = { schema: REVIEW_SCHEMA, slot, inputDigest: state.checkedCandidate.digest,
        resultSchema: {
            type: 'object', additionalProperties: false,
            required: [slot === 'discovery' ? 'findings' : 'ratings', 'sources', 'searchDisposition'],
            properties: {
                ...(slot === 'discovery' ? {
                    summary: { type: 'string' },
                    findings: { type: 'array', items: { type: 'object', additionalProperties: false,
                        required: ['id', 'summary', 'location'], properties: {
                            id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$' },
                            summary: { type: 'string' }, location: { type: 'string' },
                        } } },
                } : {
                    ratings: { type: 'object', additionalProperties: false,
                        required: state.cycle.findings.map(item => item.id),
                        properties: Object.fromEntries(state.cycle.findings.map(item => [item.id, { enum: ['fixed', 'open'] }])) },
                    claims: { type: 'object', additionalProperties: { type: 'string' } },
                }),
                sources: { type: 'array', items: sourceSchema },
                searchDisposition: { enum: ['sources_used', 'none_used', 'not_searched'] },
            },
        },
        context: state.materializedContext, candidate: state.checkedCandidate.files,
        findings: slot === 'recheck' ? state.cycle.findings : undefined,
        instructions: slot === 'discovery'
            ? 'Read the pinned skills and review the complete checked candidate against the supplied context. Use native web search for current outside facts. Return a summary and findings with stable id, summary, and location. Return sources and searchDisposition. Cite each used source URL in its finding summary or the overall summary. Use the finding ID or summary as claimLocator. Do not write files.'
            : 'Read the pinned skills and rate each original finding exactly once as fixed or open. Add no findings. Use native web search for current outside facts. Return ratings, claims, sources and searchDisposition. Cite each used source in claims keyed by original finding ID. Do not write files.',
    };
    const file = `${ROOT}/${slot}-request.json`;
    await save(file, request);
    state.requestPath = file;
    await journal(state, null);
    return block(`Start one native subagent with agent_type=deos_reviewer and fork_context=false. Tell it to read the complete request file ${file}. Await its result. Do not send context in tool arguments or change the candidate.`);
};
export async function initializeBoundedReview(job) {
    await mkdir(ROOT, { recursive: true });
    const state = { schema: REVIEW_SCHEMA, attemptId: job.attemptId, runId: job.runId, phase: job.nativeSelfReview.phase,
        model: job.model, reasoning: job.reasoning, deadline: job.deadline, cwd: job.cwd, change: job.openspecChange, materializedContext: job.materializedContext,
        inputDigest: digest(job.materializedContext), stage: 'writing', events: [], children: [], completionRepairs: 0 };
    if (job.reviewContinuationPath) {
        const continuation = await load(job.reviewContinuationPath);
        if (!continuation.eligible || continuation.inputDigest !== state.inputDigest)
            throw new Error('invalid bounded review continuation');
        Object.assign(state, { cycle: continuation.cycle, events: continuation.journal.events, children: continuation.journal.children,
            initialCandidate: continuation.journal.initialCandidate, checkedCandidate: continuation.journal.checkedCandidate,
            checkedSources: continuation.journal.checkedSources, authenticatedContinuation: true });
        await restore(state, state.checkedCandidate);
        if (continuation.slot === 'finalize') {
            state.stage = 'done';
            await journal(state, null);
        }
        else
            await prepareChild(state, continuation.slot);
    }
    await save(`${ROOT}/state.json`, state);
}
export async function executeBoundedHook(event) {
    const state = await load(`${ROOT}/state.json`);
    if (Date.now() >= Date.parse(state.deadline))
        throw new Error('nested_review_deadline_exceeded');
    const child = event.agent_type === 'deos_reviewer';
    if (event.hook_event_name === 'PreToolUse') {
        if (child) {
            if (event.agent_id !== state.activeChild)
                return deny('Unrecognized review child');
            // Same-Sandbox advisory review. Candidate snapshots detect writes; this is not physical isolation.
            if (/spawn_agent|followup_task|send_input/.test(event.tool_name))
                return deny('Reviewers cannot delegate or request another repair');
            return {};
        }
        if (event.tool_name.endsWith('spawn_agent')) {
            if (state.stage !== 'ready' || state.activeChild)
                return deny('No review slot is available');
            state.stage = 'launching';
            await save(`${ROOT}/state.json`, state);
            return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: {
                        agent_type: 'deos_reviewer', fork_context: false, message: `Read ${state.requestPath} and perform only the review specified in that file. Return the complete structured JSON result.`,
                    } } };
        }
        if (/followup_task|send_input/.test(event.tool_name))
            return deny('Review invocations are bounded and cannot be extended');
        if (!['writing', 'repairing', 'done'].includes(state.stage) && !/wait_agent|list_agents/.test(event.tool_name))
            return deny('Await the active self-review without changing the checked candidate');
        return {};
    }
    if (event.hook_event_name === 'SubagentStart') {
        if (!child || state.stage !== 'launching' || state.activeChild || event.model !== state.model)
            throw new Error('unobserved_child_invocation');
        state.activeChild = event.agent_id;
        state.stage = 'active';
        state.startEvent = event;
        await journal(state, { type: 'invoke', slot: state.slot, invocationId: event.agent_id, inputDigest: state.checkedCandidate.digest,
            ...(state.authenticatedContinuation ? { authenticatedContinuation: true } : {}) });
        return {};
    }
    if (event.hook_event_name === 'SubagentStop') {
        if (!child || state.activeChild !== event.agent_id || state.stage !== 'active')
            throw new Error('unobserved_child_invocation');
        const transcriptPath = event.agent_transcript_path;
        if (typeof transcriptPath !== 'string' || !transcriptPath.startsWith('/root/.codex/sessions/') || transcriptPath.split('/').includes('..'))
            throw new Error('invalid native child transcript path');
        const transcript = await readFile(transcriptPath, 'utf8');
        const records = transcript.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
        if (!records.length)
            throw new Error('missing native child events');
        const captured = { invocationId: event.agent_id, parentAttemptId: state.attemptId, slot: state.slot, start: state.startEvent, finish: event,
            inputDigest: state.checkedCandidate.digest, transcript, sha256: digest(transcript), eventCount: records.length };
        state.children.push(captured);
        let resultEvent;
        try {
            let candidateFault;
            try {
                if ((await snapshot(state)).digest !== state.checkedCandidate.digest)
                    candidateFault = new Error('native_review_candidate_modified');
            }
            catch (error) {
                candidateFault = error;
            }
            if (candidateFault) {
                try {
                    await restore(state, state.checkedCandidate);
                }
                catch (restorationError) {
                    throw new AggregateError([candidateFault, restorationError], 'Native review changed the candidate and restoration failed');
                }
                throw candidateFault;
            }
            const result = parseCodexFinalMessage(event.last_assistant_message ?? '');
            resultEvent = { type: 'result', slot: state.slot, invocationId: event.agent_id,
                inputDigest: state.checkedCandidate.digest, lifecycleVerified: true, result };
            reduceReviewCycle(state.cycle, resultEvent);
        }
        catch (error) {
            await journal(state, { type: 'failure', slot: state.slot, invocationId: event.agent_id,
                cause: { message: error.message, stack: error.stack, detail: originalErrorText(error) } });
            if (state.slot === 'recheck' && state.cycle.recheck.status === 'unavailable') {
                state.stage = 'done';
                state.activeChild = null;
                await restore(state, state.checkedCandidate);
                await save(`${ROOT}/state.json`, state);
                return {};
            }
            throw error;
        }
        await journal(state, resultEvent);
        state.stage = 'received';
        state.activeChild = null;
        await save(`${ROOT}/state.json`, state);
        return {};
    }
    if (!child && event.hook_event_name === 'Stop') {
        if (state.stage === 'ready')
            return block(`Start the one authorized native review child. Use agent_type=deos_reviewer, fork_context=false, and read ${state.requestPath}. Do not draft or repair the candidate.`);
        if (state.stage === 'done') {
            if ((await snapshot(state)).digest !== state.checkedCandidate.digest)
                throw new Error('author changed accepted review candidate');
            return {};
        }
        if (['writing', 'repairing'].includes(state.stage)) {
            const check = await checkAuthorSources(await (state.phase === 'design' ? runDesignCompletionCheck : runAuthorCompletionCheck)({ cwd: state.cwd, change: state.change }), { cwd: state.cwd, change: state.change });
            if (state.stage === 'writing') {
                if (!check.ok) {
                    if (state.completionRepairs++ >= 2)
                        throw new Error('author completion checks exhausted');
                    await save(`${ROOT}/state.json`, state);
                    return block(`Fix these deterministic check errors: ${JSON.stringify(check)}`);
                }
                state.initialCandidate = state.checkedCandidate = await snapshot(state);
                state.checkedSources = await load(`${OUTPUT}/author-sources.json`);
                state.cycle = createReviewCycle({ runId: state.runId, attemptId: state.attemptId, phase: state.phase, inputDigest: state.checkedCandidate.digest });
                return prepareChild(state, 'discovery');
            }
            if (check.ok) {
                state.checkedCandidate = await snapshot(state);
                state.checkedSources = await load(`${OUTPUT}/author-sources.json`);
            }
            else {
                recordCaughtError(new Error('One author repair failed deterministic checks', { cause: check }), 'bounded author repair');
                await restore(state, state.checkedCandidate);
            }
            await journal(state, { type: 'repair_finished', passed: check.ok, candidateDigest: state.checkedCandidate.digest });
            return prepareChild(state, 'recheck');
        }
        if (state.stage === 'received') {
            if (state.slot === 'discovery' && state.cycle.findings.length) {
                state.stage = 'repairing';
                await journal(state, { type: 'repair_started' });
                await save(`${ROOT}/repair-request.json`, { findings: state.cycle.findings });
                return block(`Use your one repair turn to address the complete fixed finding set in ${ROOT}/repair-request.json. Run deterministic checks and finish. There is no second semantic repair.`);
            }
            state.stage = 'done';
            await save(`${ROOT}/state.json`, state);
            return block('The bounded self-review is complete. Make no more candidate changes. Return the required completed author result.');
        }
        return block('Await the current native review child.');
    }
    return {};
}
// Called after the parent process stops and before artifact collection/cleanup.
// This records partial native bytes without accepting a result or granting a slot.
export async function captureInterruptedBoundedReview() {
    const state = await load(`${ROOT}/state.json`);
    if (!state.activeChild || state.children.some(child => child.invocationId === state.activeChild))
        return;
    const transcriptPath = state.startEvent?.transcript_path;
    if (typeof transcriptPath !== 'string' || !transcriptPath.startsWith('/root/.codex/sessions/') || transcriptPath.split('/').includes('..'))
        throw new Error('invalid interrupted child transcript path');
    const transcript = await readFile(transcriptPath, 'utf8');
    const records = transcript.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
    state.children.push({ invocationId: state.activeChild, parentAttemptId: state.attemptId, slot: state.slot,
        start: state.startEvent, finish: null, inputDigest: state.checkedCandidate.digest,
        transcript, sha256: digest(transcript), eventCount: records.length });
    await journal(state, null);
}
if (process.argv[2] === 'capture-interrupted')
    await captureInterruptedBoundedReview();
if (process.argv[2] === 'hook') {
    let input = '';
    for await (const chunk of process.stdin)
        input += chunk;
    const event = JSON.parse(input);
    try {
        process.stdout.write(JSON.stringify(await executeBoundedHook(event)));
    }
    catch (error) {
        recordCaughtError(error, 'bounded native review hook');
        const failure = { message: error.message, stack: error.stack, detail: originalErrorText(error), at: new Date().toISOString() };
        try {
            await save(`${OUTPUT}/native-review-fault.json`, failure);
            await save(`${ROOT}/fault.json`, failure);
        }
        catch (storageError) {
            recordCaughtError(new AggregateError([error, storageError], 'Could not persist native review failure'), 'bounded native review fault write');
        }
        process.stdout.write(JSON.stringify(event.hook_event_name === 'PreToolUse' ? deny(error.message) : { continue: false, stopReason: error.message }));
    }
}
