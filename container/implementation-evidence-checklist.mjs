// Validate bookkeeping only. Agents judge the meaning and sufficiency of proof.
const text = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => new Set(values).size === values.length;

export function createEvidenceChecklist(plan, previous = null) {
  if (!plan) return null;
  const scenarios = plan.value.scenarios;
  if (!Array.isArray(scenarios) || scenarios.some(s => !text(s.id)) || !unique(scenarios.map(s => s.id)))
    throw new Error('Evidence checklist needs distinct scenario IDs in the saved demo plan');
  const prior = previous?.planSha256 === plan.sha256 ? previous : null;
  return {
    version: 1, planSha256: plan.sha256,
    items: scenarios.map(scenario => {
      const saved = prior?.items.find(item => item.id === scenario.id);
      return { id: scenario.id, title: scenario.title,
        state: saved?.state ?? 'pending', evidenceIds: [...(saved?.evidenceIds ?? [])],
        reason: saved?.reason ?? '' };
    }),
    history: structuredClone(previous?.history ?? []),
  };
}

export function updateEvidenceChecklist(checklist, updates, proof, context) {
  if (!checklist) throw new Error('This job has no saved demo checklist');
  if (!Array.isArray(updates) || !updates.length || !unique(updates.map(item => item?.id)))
    throw new Error('Provide distinct evidence checklist items');
  const known = new Set(checklist.items.map(item => item.id));
  const available = new Set(proof.map(item => item.id));
  for (const item of updates) {
    if (!known.has(item?.id) || !['pending', 'complete', 'not_applicable'].includes(item.state) ||
        !Array.isArray(item.evidenceIds) || !unique(item.evidenceIds) ||
        item.evidenceIds.some(id => !available.has(id)) || !text(item.reason) ||
        (item.state === 'complete' && !item.evidenceIds.length))
      throw new Error(`Invalid evidence checklist item ${item?.id ?? '(missing ID)'}: use a saved item ID, state, reason and known evidence IDs; complete needs evidence`);
  }
  const next = structuredClone(checklist);
  for (const update of updates) {
    const item = next.items.find(item => item.id === update.id);
    Object.assign(item, { state: update.state, evidenceIds: [...update.evidenceIds], reason: update.reason });
    next.history.push({ ...context, planSha256: checklist.planSha256, ...structuredClone(item) });
  }
  return next;
}

export function evidenceChecklistProblems(checklist, plan, selectedProof) {
  if (!checklist || checklist.version !== 1 || !Array.isArray(checklist.items))
    return ['Evidence checklist is missing or invalid'];
  if (!plan || checklist.planSha256 !== plan.sha256)
    return ['Evidence checklist does not match the saved demo plan'];
  const problems = [];
  const expected = plan.value.scenarios.map(item => item.id);
  const ids = checklist.items.map(item => item?.id);
  if (!unique(ids) || ids.length !== expected.length || expected.some(id => !ids.includes(id)))
    problems.push('Evidence checklist must account for every saved scenario exactly once');
  const available = new Set(selectedProof.filter(item => item.kind === 'browser_image' ||
    (item.kind === 'showboat' && item.audience === 'review')).map(item => item.id));
  for (const item of checklist.items) {
    if (!item || !['complete', 'not_applicable'].includes(item.state))
      problems.push(`${item?.id ?? '(missing ID)'}: evidence is still pending`);
    if (!text(item?.reason)) problems.push(`${item?.id}: record the agent's explanation`);
    if (!Array.isArray(item?.evidenceIds) || !unique(item.evidenceIds) ||
        (item.state === 'complete' && !item.evidenceIds.length)) {
      problems.push(`${item?.id}: completed items need distinct evidence links`);
    } else for (const id of item.evidenceIds) {
      if (!available.has(id)) problems.push(`${item.id}: ${id} is not selected publishable evidence`);
    }
  }
  return problems;
}

export function requireEvidenceChecklist(checklist, plan, selectedProof) {
  const problems = evidenceChecklistProblems(checklist, plan, selectedProof);
  if (problems.length) throw new Error(`Evidence checklist is not ready:\n${problems.join('\n')}`);
}

export function evidenceChecklistMarkdown(checklist, evidenceLink) {
  const escape = value => String(value).replace(/[\\\[\]<>]/g, '\\$&').replace(/[\r\n]+/g, ' ');
  return ['## Evidence checklist', '', ...checklist.items.flatMap(item => [
    `- [x] ${escape(item.title)}${item.state === 'not_applicable' ? ' (not applicable)' : ''}: ${escape(item.reason)}`,
    ...item.evidenceIds.map(id => `  - [Evidence](${evidenceLink(id)})`),
  ])].join('\n');
}
