import { ImplementationError, type ProofKind, type ProofSubject } from './implementation-contract.ts';

export type DemoKind = 'plan' | 'gate';
export type DemoVerdict = 'pass' | 'needs_work' | 'blocked';
export interface DemoSource { path: string; content: string; sha256: string }
export interface DemoRequirement { id: string; path: string; line: number; title: string }
export interface DemoScenario {
  id: string; title: string; requirementIds: string[]; environment: string;
  steps: string[]; expected: string; evidenceKinds: ProofKind[];
}
export interface DemoQuestion { blockKey: string; question: string; reason: string }
export interface DemoCorrectionRequest { planSha256: string; scenarioIds: string[]; reason: string }
export interface DemoCorrection extends DemoCorrectionRequest { upgradeDigest: string; requestedBy: string }
export interface DemoPlan {
  version: 1; inputSha256: string; outcome: 'ready' | 'blocked'; summary: string;
  scenarios: DemoScenario[]; question: DemoQuestion | null;
  corrections?: { scenarioId: string; reason: string }[];
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
  priorPlanSha256?: string | null;
  correction?: DemoCorrection | null;
  feedback: DemoResult | null;
}

const error = (message: string): never => { throw new ImplementationError('demo_contract', message); };
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const id = (value: unknown): value is string => text(value) && /^[a-z0-9][a-z0-9._-]{0,119}$/.test(value);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const kinds = new Set<ProofKind>(['browser_image', 'showboat', 'provider_originated']);

export function validateDemoCorrectionRequest(value: DemoCorrectionRequest): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !['planSha256', 'scenarioIds', 'reason'].includes(key)) ||
      !/^[a-f0-9]{64}$/.test(value.planSha256) || !text(value.reason) ||
      !Array.isArray(value.scenarioIds) || !value.scenarioIds.length ||
      !unique(value.scenarioIds) || !value.scenarioIds.every(id)) error('Invalid demo correction request');
}

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

// Decode only the message shape used by the state machine. Claude owns scope,
// scenario coverage and whether the supplied work is sufficient.
export function validateDemoPlan(plan: DemoPlan, _context: DemoContext): void {
  if (!plan || !['ready', 'blocked'].includes(plan.outcome) ||
      typeof plan.summary !== 'string' || !Array.isArray(plan.scenarios))
    error('Demo plan routing message is invalid');
  validateQuestion(plan.outcome, plan.question);
}

// Only validate the routing envelope. The independent reviewer owns its findings,
// scenario judgments and citations; the workflow does not review that review.
// Historical evidence is passed through so the reviewer can assess its relevance.
export function validateDemoResult(result: DemoResult, _context: DemoContext): void {
  if (!result || !['pass', 'needs_work', 'blocked'].includes(result.outcome) ||
      !text(result.summary) || !Array.isArray(result.scenarios)) error('Demo verdict envelope is invalid');
  validateQuestion(result.outcome, result.question);
  for (const scenario of result.scenarios) {
    if (!scenario || !text(scenario.id) || !['pass', 'needs_work', 'blocked'].includes(scenario.outcome) ||
        !text(scenario.reason) || !Array.isArray(scenario.evidenceIds) || !scenario.evidenceIds.every(text))
      error('Demo scenario response format is invalid');
  }
}

const string = { type: 'string', minLength: 1 };
const list = (items: object, minItems = 0) => ({ type: 'array', items, minItems });
const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const question = { anyOf: [{ type: 'null' }, object({ blockKey: string, question: string, reason: string })] };
export const demoPlanSchema = object({ version: { const: 1 }, inputSha256: string, outcome: { enum: ['ready', 'blocked'] }, summary: string,
  scenarios: list(object({ id: string, title: string, requirementIds: list(string, 1), environment: string, steps: list(string, 1), expected: string,
    evidenceKinds: list({ enum: [...kinds] }, 1) })), corrections: list(object({ scenarioId: string, reason: string })), question });
export const demoResultSchema = object({ version: { const: 1 }, inputSha256: string, planSha256: string,
  outcome: { enum: ['pass', 'needs_work', 'blocked'] }, summary: string,
  scenarios: list(object({ id: string, outcome: { enum: ['pass', 'needs_work', 'blocked'] }, reason: string, evidenceIds: list(string) })), question });
