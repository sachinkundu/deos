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
  if (continuationBlocked(link) && !status && !link.status) return `
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
      ${view.supersedesReviewId ? `<p>Replaces review ${escape(view.supersedesReviewId)}.</p>` : ''}
      ${view.parts?.length ? `<ul>${view.parts.map(part=>`<li>${escape(part.partId)}: ${escape(part.status)}${part.url ? ` · <a href="${escape(part.url)}" target="_blank" rel="noreferrer">Published on GitHub</a>` : ''}</li>`).join('')}</ul>` : ''}
      ${view.safeError ? `<p class="continuation-error">${escape(view.safeError.message)} <code>${escape(view.safeError.code)}</code></p>` : ""}
      <div class="continuation-actions">${(view.actions || []).map((action) => `<button class="button ghost" data-continuation-action="${escape(action)}">${escape(action[0].toUpperCase() + action.slice(1))}</button>`).join("")}</div>
    </section>`;
}

export function renderAccountSettings(account = null, settings = null, selectedProject = null) {
  const projects = settings?.projects || [];
  const project = projects.find(item => item.projectId === selectedProject) || projects[0];
  return `<section class="settings-shell">
    <header><span class="eyebrow">Project settings</span><h1>Checked BettaView account</h1>
      <p>Connect one Access, GitHub, and Linear identity for future runs. This correlation does not grant GitHub repository permission.</p></header>
    <div class="settings-readiness">
      <div><span>Cloudflare Access</span><strong>${escape(settings?.accessAccount || account?.accessAccount || "Ready to verify")}</strong></div>
      <div><span>GitHub user</span><strong>${settings || account ? `ID ${escape(settings?.githubUserId || account.githubUserId)}` : "Uses this signed-in session"}</strong></div>
      <div><span>Linear user</span><strong>${account ? escape(account.linearUserId) : "Private app read required"}</strong></div>
    </div>
    <form id="account-link-form" class="account-link-form">
      <label>Project<select name="projectId" required>${projects.map(item => `<option value="${escape(item.projectId)}" ${item.projectId === project?.projectId ? "selected" : ""}>${escape(item.name)}</option>`).join("")}</select></label>
      <label>Linear account<select name="linearUserId" required>${(project?.linearUsers || []).map(user => `<option value="${escape(user.id)}">${escape(user.label)} · ${escape(user.id)}</option>`).join("")}</select></label>
      <input name="expectedRouteRevision" type="hidden" value="${escape(project?.routeRevision || "")}">
      <button class="button primary" type="submit" ${project ? "" : "disabled"}>${account ? "Rotate checked account" : "Connect checked account"}</button>
    </form>
    <footer><strong>Policy version ${account?.policyVersion || "not enabled"}</strong><span>Required states: Human Review · In Progress · Merging</span></footer>
  </section>`;
}
