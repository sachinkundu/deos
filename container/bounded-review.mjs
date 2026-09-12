/** Versioned pure contracts shared by the supervisor and trusted collector. */
export const REVIEW_SCHEMA = 'deos-bounded-review-v1';
const record = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid ${label}`);
  return value;
};
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`invalid ${label}`);
  return value;
};
export const checkedDigest = value => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('invalid candidate digest');
  return value;
};
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const size = value => new TextEncoder().encode(value).length;
const citesUrl = (claim, expected) => {
  if (typeof claim !== 'string') return false;
  return [...claim.matchAll(/https:\/\/[^\s<>"`]+/g)].some(match => {
    let candidate = match[0];
    for (;;) {
      try { if (new URL(candidate).href === expected) return true; }
      catch (error) { if (!(error instanceof TypeError)) throw error; }
      if (!/[)\].,;:!?]$/.test(candidate)) return false;
      candidate = candidate.slice(0, -1);
    }
  });
};

export function validateSources(result, claims, captured = []) {
  record(result, 'source result');
  if (!['sources_used', 'none_used', 'not_searched'].includes(result.searchDisposition) || !Array.isArray(result.sources)) {
    throw new Error('uncited_search_result: invalid search disposition');
  }
  if ((result.searchDisposition === 'sources_used') !== (result.sources.length > 0)) {
    throw new Error('uncited_search_result: source inventory disagrees with disposition');
  }
  const ids = new Set();
  return result.sources.map(raw => {
    const source = record(raw, 'source record');
    const id = text(source.id, 'source id');
    const title = text(source.title, 'source title');
    const url = text(source.url, 'source URL');
    if (ids.has(id) || controls.test(title) || controls.test(url) || size(title) > 300 || size(url) > 2048) {
      throw new Error('invalid_source_record: duplicate identity or unsafe source fields');
    }
    ids.add(id);
    let parsed;
    try { parsed = new URL(url); } catch (cause) { throw new Error('invalid_source_record: malformed URL', { cause }); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) {
      throw new Error('invalid_source_record: expected credential-free HTTPS');
    }
    const claim = claims[source.claimLocator];
    if (!citesUrl(claim, parsed.href)) {
      throw new Error('uncited_search_result: source must be cited by an existing claim');
    }
    const event = captured.find(item => item.url === parsed.href && typeof item.id === 'string' &&
      typeof item.observedAt === 'string' && Number.isFinite(Date.parse(item.observedAt)));
    return { id, title, url: parsed.href, claimLocator: source.claimLocator,
      provenance: event ? 'captured' : 'declared',
      ...(event ? { searchEventId: event.id, observedAt: event.observedAt } : {}) };
  });
}

export function validateDiscovery(value) {
  const result = record(value, 'discovery');
  if (!Array.isArray(result.findings)) throw new Error('invalid discovery findings');
  const ids = new Set();
  const findings = result.findings.map(raw => {
    const item = record(raw, 'finding');
    const id = text(item.id, 'finding id');
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || ids.has(id)) throw new Error('duplicate or invalid finding id');
    ids.add(id);
    return { id, summary: text(item.summary, 'finding summary'), location: text(item.location, 'finding location') };
  });
  const sources = validateSources(result, Object.fromEntries(findings.map(item => [item.id, item.summary])));
  return { findings, sources, searchDisposition: result.searchDisposition };
}

export function validateRecheck(value, findings) {
  const result = record(value, 'recheck');
  const ratings = record(result.ratings, 'ratings');
  const ids = new Set(findings.map(item => item.id));
  const violations = Object.keys(ratings).filter(id => !ids.has(id));
  // Unknown ratings never enter the accepted inventory; malformed or absent ratings stay open.
  const accepted = Object.fromEntries(findings.map(item => [item.id, ratings[item.id] === 'fixed' ? 'fixed' : 'open']));
  const claims = record(result.claims ?? {}, 'recheck claims');
  if (Object.keys(claims).some(id => !ids.has(id))) throw new Error('invalid recheck claim locator');
  return { ratings: accepted, violations, sources: validateSources(result, claims), searchDisposition: result.searchDisposition };
}

export function validateDispositions(value, findings) {
  if (!Array.isArray(value)) throw new Error('invalid_author_response: missing disposition set');
  const ids = new Set(findings.map(item => item.id));
  const seen = new Set();
  const result = value.map(raw => {
    const item = record(raw, 'disposition');
    if (!ids.has(item.id) || seen.has(item.id) || !['applied', 'declined', 'no_change'].includes(item.disposition)) {
      throw new Error('invalid_author_response: unexpected or duplicate disposition');
    }
    seen.add(item.id);
    return { id: item.id, disposition: item.disposition, response: text(item.response, 'author response') };
  });
  if (seen.size !== ids.size) throw new Error('invalid_author_response: incomplete disposition set');
  return result;
}

function validateIndependent(value) {
  record(value, 'independent result');
  if (!Array.isArray(value.findings)) throw new Error('invalid independent findings');
  const seen = new Set();
  const findings = value.findings.map(item => {
    record(item, 'independent finding');
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,299}$/.test(item.id) || seen.has(item.id)) throw new Error('invalid independent finding id');
    seen.add(item.id);
    return { id: item.id, summary: text(item.summary, 'independent finding summary'), location: text(item.location, 'independent finding location') };
  });
  if (!Array.isArray(value.sourceEvidence)) throw new Error('missing independent source evidence');
  // Source evidence is validated against each original provider result by the collector.
  return { findings, sourceEvidence: value.sourceEvidence };
}

export function createReviewCycle({ runId, phase, attemptId, inputDigest }) {
  if (!['planning', 'design'].includes(phase)) throw new Error('invalid review phase');
  return { schema: REVIEW_SCHEMA, runId: text(runId, 'run id'), phase, originAttemptId: text(attemptId, 'attempt id'),
    initialDigest: checkedDigest(inputDigest), currentDigest: inputDigest, publicationDigest: null,
    discovery: { status: 'pending', invocations: [] }, repair: { started: false, outcome: null },
    recheck: { status: 'pending', invocations: [] }, findings: [], openIds: [],
    independent: { invalidCount: 0, result: null }, response: { invalidCount: 0, result: null },
    reviewedHead: null, currentHead: null, status: 'active' };
}

/** Returns a new state; callers must CAS against the durable prior state. */
export function reduceReviewCycle(prior, event) {
  const state = structuredClone(prior);
  if (state.schema !== REVIEW_SCHEMA) throw new Error('unsupported review schema');
  const slot = event.slot && state[event.slot];
  if (event.type === 'invoke') {
    if (!['discovery', 'recheck'].includes(event.slot) || state.status !== 'active') throw new Error('invalid review invocation');
    if (slot.status === 'accepted' || slot.status === 'unavailable' || slot.invocations.length >= 2 ||
        slot.invocations.some(item => item.status === 'started')) throw new Error('review slot is consumed');
    if (event.slot === 'recheck' && (!state.repair.started || state.discovery.status !== 'accepted')) throw new Error('recheck before repair');
    const expected = event.slot === 'discovery' ? state.initialDigest : state.currentDigest;
    if (event.inputDigest !== expected || (slot.invocations.length && event.authenticatedContinuation !== true)) {
      throw new Error('review continuation input or authorization mismatch');
    }
    if (state.discovery.invocations.concat(state.recheck.invocations).some(item => item.id === event.invocationId)) {
      throw new Error('duplicate native child identity');
    }
    slot.invocations.push({ id: text(event.invocationId, 'invocation id'), inputDigest: expected, status: 'started' });
    slot.status = 'running';
  } else if (event.type === 'result' || event.type === 'failure') {
    if (!['discovery', 'recheck'].includes(event.slot)) throw new Error('invalid result slot');
    const invocation = slot.invocations.at(-1);
    if (!invocation || invocation.id !== event.invocationId || invocation.status !== 'started') throw new Error('unobserved_child_invocation');
    if (event.type === 'failure') {
      invocation.status = 'failed'; invocation.cause = record(event.cause, 'original failure');
      text(invocation.cause.message, 'original error message');
      slot.status = 'failed';
      if (slot.invocations.length === 2) {
        if (event.slot === 'discovery') state.status = 'manual_reconciliation_required';
        else { slot.status = 'unavailable'; state.openIds = state.findings.map(item => item.id); }
      }
    } else {
      if (event.inputDigest !== invocation.inputDigest || !event.lifecycleVerified) throw new Error('unobserved_child_invocation');
      invocation.status = 'accepted';
      slot.status = 'accepted';
      slot.result = event.slot === 'discovery' ? validateDiscovery(event.result) : validateRecheck(event.result, state.findings);
      if (event.slot === 'discovery') {
        state.findings = slot.result.findings;
        state.openIds = state.findings.map(item => item.id);
        if (!state.findings.length) { state.recheck.status = 'not_required'; state.repair.outcome = 'not_required'; }
      } else state.openIds = state.findings.filter(item => slot.result.ratings[item.id] !== 'fixed').map(item => item.id);
    }
  } else if (event.type === 'repair_started') {
    if (state.discovery.status !== 'accepted' || !state.findings.length || state.repair.started || state.status !== 'active') {
      throw new Error('repair opportunity is consumed or unavailable');
    }
    state.repair.started = true;
  } else if (event.type === 'repair_finished') {
    if (!state.repair.started || state.repair.outcome !== null || state.recheck.invocations.length) throw new Error('invalid repair completion');
    state.repair.outcome = event.passed ? 'checked' : 'failed';
    if (event.passed) state.currentDigest = checkedDigest(event.candidateDigest);
  } else if (event.type === 'published') {
    if (state.discovery.status !== 'accepted' || !['accepted', 'unavailable', 'not_required'].includes(state.recheck.status) ||
        event.candidateDigest !== state.currentDigest || state.status !== 'active') throw new Error('incomplete review publication');
    state.publicationDigest ??= state.currentDigest;
    state.currentHead = text(event.head, 'published head');
  } else if (event.type === 'independent_result') {
    if (!state.currentHead || state.independent.result || event.head !== state.currentHead || state.status !== 'active') throw new Error('independent slot mismatch');
    state.independent.result = validateIndependent(event.result);
    state.reviewedHead = event.head;
    if (!state.independent.result.findings.length) state.response.result = [];
  } else if (event.type === 'author_response') {
    if (!state.independent.result || state.response.result || state.status !== 'active') throw new Error('author response slot mismatch');
    state.response.result = validateDispositions(event.result, state.independent.result.findings);
  } else if (event.type === 'invalid_result') {
    if (!['independent', 'response'].includes(event.slot) || slot.result || state.status !== 'active') throw new Error('invalid result slot');
    slot.invalidCount++;
    slot.causes = [...(slot.causes ?? []), record(event.cause, 'invalid result cause')];
    if (slot.invalidCount >= 2) state.status = 'manual_reconciliation_required';
  } else if (event.type === 'head_updated') {
    if (!state.independent.result || !state.response.result || state.status !== 'active') throw new Error('revision before initial review');
    state.currentHead = text(event.head, 'current head');
  } else throw new Error('unknown review cycle event');
  return state;
}

export function reviewGateEvidence(state) {
  if (state.status !== 'active' || !state.currentHead || !state.independent.result || !state.response.result) throw new Error('incomplete human gate evidence');
  return { reviewedHead: state.reviewedHead, currentHead: state.currentHead, openIds: state.openIds,
    stale: state.reviewedHead !== state.currentHead, recheckUnavailable: state.recheck.status === 'unavailable',
    noNewReviewReason: state.reviewedHead !== state.currentHead ? 'Later edits return to human review without a new semantic review.' : null };
}

export async function verifyReviewJournal(journal, { attemptId, runId, inputDigest, candidateFiles, parentTranscript, hash, continuation = null }) {
  if (journal.schema !== REVIEW_SCHEMA || journal.attemptId !== attemptId || journal.runId !== runId || journal.inputDigest !== inputDigest) {
    throw new Error('author_completion_verification_mismatch: journal identity');
  }
  for (const candidate of [journal.initialCandidate, journal.checkedCandidate]) {
    if (!candidate || !Array.isArray(candidate.files) || await hash(JSON.stringify(candidate.files)) !== candidate.digest) {
      throw new Error('author_completion_verification_mismatch: candidate hash');
    }
    const paths = new Set();
    for (const file of candidate.files) {
      if (typeof file.path !== 'string' || !file.path.startsWith('openspec/changes/') || file.path.split('/').some(part => part === '..' || part === '.') || paths.has(file.path) || typeof file.content !== 'string') {
        throw new Error('author_completion_verification_mismatch: candidate paths');
      }
      paths.add(file.path);
    }
  }
  if (JSON.stringify(candidateFiles) !== JSON.stringify(journal.checkedCandidate.files)) throw new Error('author_completion_verification_mismatch: final candidate');
  if (!Array.isArray(journal.events) || !Array.isArray(journal.children)) throw new Error('invalid review journal');
  const prefixEvents = continuation?.journal.events ?? [];
  const prefixChildren = continuation?.journal.children ?? [];
  if (continuation && (JSON.stringify(journal.events.slice(0, prefixEvents.length)) !== JSON.stringify(prefixEvents) ||
      JSON.stringify(journal.children.slice(0, prefixChildren.length)) !== JSON.stringify(prefixChildren) ||
      JSON.stringify(journal.initialCandidate) !== JSON.stringify(continuation.journal.initialCandidate))) throw new Error('review continuation journal prefix changed');
  const parentEvents = parentTranscript.split('\n').filter(line => line.trim()).map(line => JSON.parse(line));
  let state = createReviewCycle({ runId, phase: journal.phase, attemptId, inputDigest: journal.initialCandidate.digest });
  const observed = new Set();
  for (const [index, event] of journal.events.entries()) {
    if (index < prefixEvents.length) {
      state = reduceReviewCycle(state, event);
      continue;
    }
    if (event.type === 'invoke') {
      if (event.authenticatedContinuation && !continuation) throw new Error('unauthenticated review continuation');
      if (!parentEvents.some(item => item.type === 'item.completed' && item.item?.type === 'collab_tool_call' && item.item.tool === 'spawn_agent' && item.item.status === 'completed' && item.item.receiver_thread_ids?.includes(event.invocationId))) throw new Error('unobserved_child_invocation');
    }
    if (event.type === 'result') {
      const children = journal.children.filter(child => child.invocationId === event.invocationId);
      if (children.length !== 1 || observed.has(event.invocationId)) throw new Error('unobserved_child_invocation');
      const child = children[0];
      if (child.start?.hook_event_name !== 'SubagentStart' || child.finish?.hook_event_name !== 'SubagentStop' ||
          child.start.agent_id !== event.invocationId || child.finish.agent_id !== event.invocationId ||
          child.start.session_id !== child.finish.session_id || child.inputDigest !== event.inputDigest ||
          child.start.agent_type !== 'deos_reviewer' || child.finish.agent_type !== 'deos_reviewer') throw new Error('unobserved_child_invocation');
      if (await hash(child.transcript) !== child.sha256 || child.transcript.split('\n').filter(line => line.trim()).length !== child.eventCount || !child.eventCount) {
        throw new Error('invalid child transcript');
      }
      // The author stream must independently record the native tool's child identity.
      if (!parentEvents.some(eventItem => eventItem.type === 'item.completed' && eventItem.item?.type === 'collab_tool_call' && eventItem.item.tool === 'spawn_agent' && eventItem.item.status === 'completed' && eventItem.item.receiver_thread_ids?.includes(event.invocationId))) throw new Error('unobserved_child_invocation');
      let last = child.finish.last_assistant_message;
      if (typeof last === 'string') {
        try { last = JSON.parse(last.replace(/^```(?:json)?\s*\n|\n```$/g, '')); }
        catch (cause) { throw new Error('invalid native child result', { cause }); }
      }
      if (JSON.stringify(last) !== JSON.stringify(event.result)) throw new Error('native child result differs from completion event');
      observed.add(event.invocationId);
    }
    state = reduceReviewCycle(state, event);
  }
  if (state.currentDigest !== journal.checkedCandidate.digest) throw new Error('checked candidate differs from review journal');
  return state;
}
