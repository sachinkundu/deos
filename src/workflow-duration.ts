export type CloudflareWorkflowDuration =
  `${number} ${"seconds" | "minutes" | "hours" | "days"}`;

const COMPACT_DURATION = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/;

export const normalizeWorkflowDuration = (
  value: string | number | undefined,
): CloudflareWorkflowDuration | number | undefined => {
  if (typeof value !== "string") return value;
  const match = value.match(COMPACT_DURATION);
  if (match === null) throw new Error("Workflow event timeout is invalid");
  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "ms") {
    if (amount < 1_000) throw new Error("Workflow event timeout must be at least one second");
    return `${amount / 1_000} seconds`;
  }
  const labels = { s: "seconds", m: "minutes", h: "hours", d: "days" } as const;
  return `${amount} ${labels[unit as keyof typeof labels]}`;
};
