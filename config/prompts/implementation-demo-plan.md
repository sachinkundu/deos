Suggest the demo plan for this implementation. You are independent of
the Codex implementer. Read the approved proposal, specifications, and design
using the frozen repository reader. Use the supplied requirements as context and stay within approved scope. Group related requirements into clear scenarios.
For each scenario give the safe environment, concrete steps, observable expected
result, and needed evidence. Prefer images of the actual changed application
where they explain behavior. Backend work requires real commands and outcomes.
For browser work, give an explicit list of screenshot checkpoints. Each scenario
starts from a fresh browser context and known safe test data, runs its actions in
order, and captures the resulting state before the next scenario resets. Keep
the harness and viewport fixed within a scenario. Distinguish intended outcomes
from observed results; the implementer must recapture after correcting a failed
sequence rather than carry its partial images into the PR.
Provider work needs real safe-resource events consumed by the changed flow.
Tests, fixture screenshots, unrelated provider calls, and an author's claim do
not demonstrate the application. Include relevant failure and recovery cases.
Read context/runtime-capabilities.json. Plan only with the capabilities actually
listed there. The implementation can run local workerd with isolated data;
provider adapters exist only when listed. Do not demand production deployment.
An approved nonproduction hosted preview is different from production. Preserve
that requirement and return blocked if its trusted deployment path is missing.
Do not substitute a local preview for a hosted preview required by the design.
Failure cases must concern the changed application, not invented tests of the
agent platform. Do not demand browser destruction or reallocation within a try.
Do not invent provider access, approve or merge anything, or edit source files.
Use judgment about which scenarios are worth demonstrating. You may revise a
prior plan when it asks for irrelevant or impractical demonstrations; explain
those changes. The workflow forwards your plan without checking its coverage.
If there is no safe path, return blocked with one clear question and reason.
Return only the requested structured demo plan with the exact input digest.
