import { ImplementationError, subjectMatches, type ProofKind, type ProofSubject } from './implementation-contract.ts';

export type DemoKind = 'plan' | 'gate';
export type DemoVerdict = 'pass' | 'needs_work' | 'blocked';
export interface DemoSource { path: string; content: string; sha256: string }
export interface DemoRequirement { id: string; path: string; line: number; title: string }
export interface DemoScenario {
  id: string; title: string; requirementIds: string[]; environment: string;
  steps: string[]; expected: string; evidenceKinds: ProofKind[];
}
export interface DemoQuestion { blockKey: string; question: string; reason: string }
export interface DemoPlan {
  version: 1; inputSha256: string; outcome: 'ready' | 'blocked'; summary: string;
  scenarios: DemoScenario[]; question: DemoQuestion | null;
}
export interface DemoResult {
  version: 1; inputSha256: string; planSha256: string; outcome: DemoVerdict; summary: string;
  scenarios: { id: string; outcome: DemoVerdict; reason: string; evidenceIds: string[] }[];
  question: DemoQuestion | null;
}
export interface DemoEvidence extends ProofSubject {
  id: string; kind: ProofKind; caption: string; sha256: string; r2Key: string; contentType: string;
}
export interface DemoContext {
  version: 1; kind: DemoKind; runId: string; inputSha256: string; approvedInputSha: string;
  subject: ProofSubject; candidateSha: string | null; requirements: DemoRequirement[];
  sources: DemoSource[]; evidence: DemoEvidence[];
  plan: { sha256: string; value: DemoPlan } | null;
  priorPlan: DemoPlan | null;
  feedback: DemoResult | null;
}

const error = (message: string): never => { throw new ImplementationError('demo_contract', message); };
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const id = (value: unknown): value is string => text(value) && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(value);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const kinds = new Set<ProofKind>(['browser_image', 'showboat', 'provider_originated']);

export function demoRequirements(sources: readonly DemoSource[]): DemoRequirement[] {
  const requirements = sources.flatMap(source => source.path.startsWith('approved/') && source.path.includes('/specs/')
    ? source.content.split('\n').flatMap((line, index) => /^### Requirement:/.test(line)
      ? [{ id: `${source.path}:${index + 1}`, path: source.path, line: index + 1, title: line.replace(/^### Requirement:\s*/, '') }] : []) : []);
  if (requirements.length) return requirements;
  const proposal = sources.find(source => source.path.endsWith('/proposal.md'));
  if (!proposal) return error('Approved proposal and requirements are missing');
  return [{ id: `${proposal.path}:1`, path: proposal.path, line: 1, title: 'Demonstrate the approved proposal and design' }];
}

function validateQuestion(outcome: string, question: DemoQuestion | null) {
  if (outcome === 'blocked') {
    if (!question || !id(question.blockKey) || !text(question.question) || !text(question.reason))
      error('A blocked demo needs one clear question, reason and stable block key');
  } else if (question !== null) error('Only a blocked demo may request clarification');
}

export function validateDemoPlan(plan: DemoPlan, context: DemoContext): void {
  if (!plan || plan.version !== 1 || plan.inputSha256 !== context.inputSha256 ||
      !['ready', 'blocked'].includes(plan.outcome) || !text(plan.summary) || !Array.isArray(plan.scenarios))
    error('Demo plan identity or result is invalid');
  validateQuestion(plan.outcome, plan.question);
  const seen = new Set<string>();
  const covered = new Set<string>();
  for (const scenario of plan.scenarios) {
    if (!scenario || !id(scenario.id) || seen.has(scenario.id) || !text(scenario.title) ||
        !text(scenario.environment) || !text(scenario.expected) || !Array.isArray(scenario.steps) ||
        !scenario.steps.length || !scenario.steps.every(text) || !Array.isArray(scenario.requirementIds) ||
        !scenario.requirementIds.length || !unique(scenario.requirementIds) ||
        !scenario.requirementIds.every(value => context.requirements.some(requirement => requirement.id === value)) ||
        !Array.isArray(scenario.evidenceKinds) || !scenario.evidenceKinds.length || !unique(scenario.evidenceKinds) ||
        !scenario.evidenceKinds.every(value => kinds.has(value))) error('Invalid demo scenario or approved requirement reference');
    seen.add(scenario.id);
    scenario.requirementIds.forEach(value => covered.add(value));
  }
  if (plan.outcome === 'ready' && (!plan.scenarios.length || context.requirements.some(requirement => !covered.has(requirement.id))))
    error('Ready demo plan must cover every approved requirement');
  for (const prior of context.priorPlan?.scenarios ?? []) {
    const current = plan.scenarios.find(scenario => scenario.id === prior.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(prior))
      error(`Saved demo requirement cannot be removed or rewritten: ${prior.id}`);
  }
}

export function validateDemoResult(result: DemoResult, context: DemoContext, accessedIds: readonly string[]): void {
  const plan = context.plan;
  if (!plan || !result || result.version !== 1 || result.inputSha256 !== context.inputSha256 ||
      result.planSha256 !== plan.sha256 || !['pass', 'needs_work', 'blocked'].includes(result.outcome) ||
      !text(result.summary) || !Array.isArray(result.scenarios) || result.scenarios.length !== plan.value.scenarios.length ||
      !unique(result.scenarios.map(scenario => scenario.id))) error('Demo verdict does not match its plan and evidence input');
  validateQuestion(result.outcome, result.question);
  for (const scenario of result.scenarios) {
    const required = plan!.value.scenarios.find(item => item.id === scenario.id);
    if (!required || !['pass', 'needs_work', 'blocked'].includes(scenario.outcome) || !text(scenario.reason) ||
        !Array.isArray(scenario.evidenceIds) || !unique(scenario.evidenceIds)) error('Invalid per-demo verdict');
    const evidence = scenario.evidenceIds.map(value => {
      const item = context.evidence.find(proof => proof.id === value);
      if (!item || !subjectMatches(item, context.subject) || !accessedIds.includes(value))
        return error(`Reviewer has not inspected current evidence: ${value}`);
      return item;
    });
    if (scenario.outcome === 'pass' && required!.evidenceKinds.some(kind => !evidence.some(item => item.kind === kind)))
      error(`Passed demo lacks required inspected evidence: ${scenario.id}`);
  }
  const derived = result.scenarios.some(scenario => scenario.outcome === 'blocked') ? 'blocked'
    : result.scenarios.some(scenario => scenario.outcome === 'needs_work') ? 'needs_work' : 'pass';
  if (result.outcome !== derived) error('Demo verdict contradicts its scenario decisions');
}

const string = { type: 'string', minLength: 1 };
const list = (items: object, minItems = 0) => ({ type: 'array', items, minItems });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const question = { anyOf: [{ type: 'null' }, object({ blockKey: string, question: string, reason: string })] };
export const demoPlanSchema = object({ version: { const: 1 }, inputSha256: string, outcome: { enum: ['ready', 'blocked'] }, summary: string,
  scenarios: list(object({ id: string, title: string, requirementIds: list(string, 1), environment: string, steps: list(string, 1), expected: string,
    evidenceKinds: list({ enum: [...kinds] }, 1) })), question });
export const demoResultSchema = object({ version: { const: 1 }, inputSha256: string, planSha256: string,
  outcome: { enum: ['pass', 'needs_work', 'blocked'] }, summary: string,
  scenarios: list(object({ id: string, outcome: { enum: ['pass', 'needs_work', 'blocked'] }, reason: string, evidenceIds: list(string) })), question });
