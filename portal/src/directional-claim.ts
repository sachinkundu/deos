export interface DirectionalClaimDetail {
  label: "Proposal" | "Requirement" | null;
  rationale: string;
}

export interface DirectionalClaimPresentation {
  label: string;
  details: DirectionalClaimDetail[];
}

function rationale(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : "No rationale";
}

export function directionalClaimPresentation(claim: Record<string, unknown>): DirectionalClaimPresentation {
  const status = String(claim.status ?? "unknown");
  const proposal = claim.proposalFirst as Record<string, unknown> | undefined;
  const requirement = claim.requirementFirst as Record<string, unknown> | undefined;

  if (status === "proposal_only") return {
    label: "Only in proposal",
    details: [{ label: null, rationale: rationale(proposal?.rationale) }],
  };
  if (status === "requirement_only") return {
    label: "Only in requirement",
    details: [{ label: null, rationale: rationale(requirement?.rationale) }],
  };
  return {
    label: status === "confirmed" ? "In proposal and requirement" : "Relationship evidence",
    details: [
      { label: "Proposal", rationale: rationale(proposal?.rationale) },
      { label: "Requirement", rationale: rationale(requirement?.rationale) },
    ],
  };
}
