const escape = (value = "") => String(value).replace(/[&<>\"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);

export function continuationBlocked(link) {
  return ["unlinked", "closed", "stale_head", "legacy_draft"].includes(link?.readiness);
}

export function restoredContinuationStatus(link) {
  return link?.status || null;
}

const step = (label, value, complete) => `
  <li class="continuation-step ${complete ? "complete" : value === "host_check_required" ? "warning" : ""}">
    <span class="continuation-step-icon">${complete ? "✓" : value === "host_check_required" ? "!" : "·"}</span>
    <div><strong>${escape(label)}</strong><small>${escape(String(value || "not started").replaceAll("_", " "))}</small></div>
  </li>`;

export function renderContinuationStatus(link, status = null) {
  if (!link || link.readiness === "feature_disabled") return "";
  if (continuationBlocked(link)) return `
    <section class="continuation-card blocked" aria-label="Review continuation unavailable">
      <span class="eyebrow">Workflow continuation</span>
      <h3>Review remains readable</h3>
      <p>${escape(link.reason || "No open workflow gate can continue from this pull request.")}</p>
      <button class="button ghost" data-continuation-action="reload">Reload current head</button>
    </section>`;
  const view = status || link.status || {
    goalState: link.goalState || "Waiting for review",
    github: { label: "GitHub review", status: "not_started", complete: false },
    linear: { label: `Linear · ${link.goalState || "next state"}`, status: "not_started", complete: false },
    outcome: "active",
    actions: [],
  };
  return `
    <section class="continuation-card" aria-label="Review continuation status">
      <span class="eyebrow">Continue linked workflow</span>
      <h3>Goal: ${escape(view.goalState)}</h3>
      <ol>${step(view.github.label, view.github.status, view.github.complete)}${step(view.linear.label, view.linear.status, view.linear.complete)}</ol>
      <p class="continuation-outcome">${view.continued ? "The linked workflow continued." : `Outcome: ${escape(view.outcome)}`}</p>
      ${view.safeError ? `<p class="continuation-error">${escape(view.safeError.message)} <code>${escape(view.safeError.code)}</code></p>` : ""}
      <div class="continuation-actions">${(view.actions || []).map((action) => `<button class="button ghost" data-continuation-action="${escape(action)}">${escape(action[0].toUpperCase() + action.slice(1))}</button>`).join("")}</div>
    </section>`;
}

export function renderAccountSettings(account = null) {
  return `<section class="settings-shell">
    <header><span class="eyebrow">Project settings</span><h1>Checked BettaView account</h1>
      <p>Connect one Access, GitHub, and Linear identity for future runs. This correlation does not grant GitHub repository permission.</p></header>
    <div class="settings-readiness">
      <div><span>Cloudflare Access</span><strong>${account ? "Verified" : "Ready to verify"}</strong></div>
      <div><span>GitHub user</span><strong>${account ? `ID ${escape(account.githubUserId)}` : "Uses this signed-in session"}</strong></div>
      <div><span>Linear user</span><strong>${account ? escape(account.linearUserId) : "Private app read required"}</strong></div>
    </div>
    <form id="account-link-form" class="account-link-form">
      <label>Project ID<input name="projectId" required autocomplete="off"></label>
      <label>Linear user ID<input name="linearUserId" required autocomplete="off"></label>
      <label>Route revision<input name="expectedRouteRevision" type="number" min="1" required></label>
      <button class="button primary" type="submit">${account ? "Rotate checked account" : "Connect checked account"}</button>
    </form>
    <footer><strong>Policy version ${account?.policyVersion || "not enabled"}</strong><span>Required states: Human Review · In Progress · Merging</span></footer>
  </section>`;
}
