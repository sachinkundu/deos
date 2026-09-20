export interface EvidenceChecklistItem {
  id: string;
  title: string;
  state: 'pending' | 'complete' | 'not_applicable';
  evidenceIds: string[];
  reason: string;
}
export interface EvidenceChecklist {
  version: 1;
  planSha256: string;
  items: EvidenceChecklistItem[];
  history: Array<EvidenceChecklistItem & {planSha256: string; attemptId: string; treeSha: string; occurredAt: string}>;
}
export interface ChecklistPlan {sha256: string; value: {scenarios: Array<{id: string; title: string}>}}
export interface ChecklistProof {id: string; kind: string; audience?: string}
export function createEvidenceChecklist(plan: ChecklistPlan | null, previous?: EvidenceChecklist | null): EvidenceChecklist | null;
export function updateEvidenceChecklist(checklist: EvidenceChecklist | null, updates: Array<Omit<EvidenceChecklistItem, 'title'>>, proof: ChecklistProof[], context: {attemptId: string; treeSha: string; occurredAt: string}): EvidenceChecklist;
export function evidenceChecklistProblems(checklist: EvidenceChecklist | null, plan: ChecklistPlan | null, selectedProof: ChecklistProof[]): string[];
export function requireEvidenceChecklist(checklist: EvidenceChecklist | null, plan: ChecklistPlan | null, selectedProof: ChecklistProof[]): void;
export function evidenceChecklistMarkdown(checklist: EvidenceChecklist, evidenceLink: (id: string) => string): string;
