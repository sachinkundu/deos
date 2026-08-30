import mermaid from "mermaid";
import { toPng } from "html-to-image";
import { request } from "./api.js";
import { annotationSvgAttributes, circleSvgGeometry, startDrawing } from "./annotation-geometry.js";
import { MIN_FILE_RAIL_WIDTH, clampFileRailWidth, defaultFileRailWidth, maxFileRailWidth } from "./file-rail.js";
import { selectPortalView } from "./portal-view.js";
import { highlightCodeBlocks } from "./syntax-highlighting.js";
import {
  canRestoreRecentPullRequest,
  clearRecentPullRequest,
  getRecentPullRequest,
  saveRecentPullRequest,
} from "./recent-pull-request.js";
import { buildReviewFileTree, commentCloseNeedsConfirmation, decorateScenarioKeywords } from "./review-ui.js";
import {
  reviewStoryArtifactVisible,
  reviewStoryContentEntries,
  reviewStoryStage,
} from "./review-story-view.js";
import { applyTheme, getInitialTheme, nextTheme } from "./theme.js";
import { activeThreadReferences, draftReferenceKey, threadReferenceKey } from "./thread-links.js";
import {
  MIN_THREAD_RAIL_WIDTH,
  clampThreadRailWidth,
  defaultThreadRailWidth,
  maxThreadRailWidth,
  threadRailFontScale,
} from "./thread-rail.js";
import {
  buildTraceabilityQuality,
  buildTraceabilityView,
  directionalClaimPresentation,
  requirementJudgmentIsSatisfied,
  sourceRangeLabel,
} from "./traceability-view.js";
import "./styles.css";

function layoutWidth() {
  return document.body.clientWidth || document.documentElement.clientWidth;
}

const linkedPullRequestUrl = new URLSearchParams(window.location.search).get("pr")?.trim() || "";

const state = {
  prUrl: linkedPullRequestUrl || getRecentPullRequest(),
  data: null,
  activePath: null,
  activeQualityPath: null,
  activeCitationId: null,
  activeCitationMarker: null,
  traceabilityRun: null,
  selectedText: "",
  selectionRange: null,
  drafts: [],
  reviewEvent: "COMMENT",
  activeView: "pr",
  theme: getInitialTheme(),
  fileRailWidth: defaultFileRailWidth(layoutWidth()),
  threadRailWidth: defaultThreadRailWidth(layoutWidth()),
  fileRailCustomized: false,
  threadRailCustomized: false,
};

applyTheme(state.theme, { persist: false });

mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: "neutral", fontFamily: "Inter, ui-sans-serif, system-ui" });

const app = document.querySelector("#app");

function id() {
  return crypto.randomUUID();
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function shortSha(value) {
  return value?.slice(0, 7) || "unknown";
}

function setNotice(message, tone = "info") {
  const notice = document.querySelector("#notice");
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.tone = tone;
  notice.hidden = false;
  window.clearTimeout(setNotice.timeout);
  setNotice.timeout = window.setTimeout(() => { notice.hidden = true; }, tone === "error" ? 8000 : 4000);
}

function shell() {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#" aria-label="BettaView home">
        <span class="brand-mark">β</span>
        <span><strong>BettaView</strong><small>Rendered Markdown PR reviews</small></span>
      </a>
      <div class="topbar-center">
        <form id="pr-form" class="pr-form" hidden>
          <label for="header-pr-url">Pull request</label>
          <input id="header-pr-url" name="url" type="url" value="${escapeHtml(state.prUrl)}" required />
          <button type="submit" class="button primary">Open</button>
        </form>
        <nav id="portal-tabs" class="portal-tabs" aria-label="Pull request views" hidden>
          <button type="button" data-portal-view="pr">PR</button>
          <button type="button" data-portal-view="review">Review</button>
        </nav>
      </div>
      <button id="theme-toggle" class="theme-toggle" type="button">
        <span class="theme-toggle-icon" aria-hidden="true"></span>
        <span class="theme-toggle-label"></span>
      </button>
    </header>
    <div id="notice" class="notice" hidden></div>
    <main id="workspace" class="empty-state"></main>
    <aside id="selection-composer" class="selection-composer" role="dialog" aria-label="Add review comment" hidden>
      <button class="composer-close" aria-label="Close">×</button>
      <span class="eyebrow">Selected rendered text</span>
      <blockquote id="selection-preview"></blockquote>
      <textarea id="selection-comment" rows="4" placeholder="What should change?"></textarea>
      <button id="submit-selection" class="button primary">Add comment</button>
    </aside>
    <aside id="traceability-citation-popover" class="traceability-citation-popover" role="dialog" aria-label="Traceability citation" hidden></aside>
    <div id="pending-review-bar" class="pending-review-bar" hidden>
      <div><strong id="pending-review-count"></strong><small>Held locally until you publish</small></div>
      <button id="publish-review" class="button primary">Publish review</button>
    </div>
  `;
  document.querySelector("#pr-form").addEventListener("submit", openPullRequest);
  document.querySelectorAll("[data-portal-view]").forEach((button) => button.addEventListener("click", () => {
    Object.assign(state, selectPortalView(button.dataset.portalView));
    renderWorkspace();
  }));
  const composer = document.querySelector("#selection-composer");
  document.querySelector(".composer-close").addEventListener("click", requestCloseSelectionComposer);
  composer.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    requestCloseSelectionComposer();
  });
  document.querySelector("#submit-selection").addEventListener("click", stageSelectionComment);
  document.querySelector("#publish-review").addEventListener("click", publishReview);
  document.querySelector("#theme-toggle").addEventListener("click", () => {
    state.theme = applyTheme(nextTheme(state.theme));
    updateThemeToggle();
  });
  updateThemeToggle();
  window.addEventListener("beforeunload", (event) => {
    if (!state.drafts.length) return;
    event.preventDefault();
    event.returnValue = "";
  });
  window.addEventListener("resize", () => {
    const width = layoutWidth();
    if (!state.fileRailCustomized) state.fileRailWidth = defaultFileRailWidth(width);
    if (!state.threadRailCustomized) state.threadRailWidth = defaultThreadRailWidth(width);
    setThreadRailWidth(state.threadRailWidth);
    setFileRailWidth(state.fileRailWidth);
    positionCitationPopover();
  });
  window.addEventListener("scroll", positionCitationPopover, true);
  document.addEventListener("click", (event) => {
    if (event.target.closest(".traceability-citation-marker, .traceability-citation-popover")) return;
    closeCitationPopover();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const fullscreenDiagram = document.querySelector(".diagram-review.is-fullscreen");
    if (fullscreenDiagram) {
      event.preventDefault();
      setDiagramFullscreen(fullscreenDiagram, false);
    } else if (state.activeCitationId) {
      closeCitationPopover(true);
    }
  });
}

async function openPullRequest(event) {
  event.preventDefault();
  if (!confirmDraftDiscard("Opening another pull request")) return;
  state.prUrl = new FormData(event.currentTarget).get("url").trim();
  await loadPullRequest({ preservePath: false });
}

function syncPullRequestForm() {
  const form = document.querySelector("#pr-form");
  const tabs = document.querySelector("#portal-tabs");
  if (!form) return;
  form.hidden = !state.data;
  if (tabs) {
    tabs.hidden = !state.data;
    tabs.querySelectorAll("[data-portal-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.portalView === state.activeView);
      button.setAttribute("aria-current", button.dataset.portalView === state.activeView ? "page" : "false");
    });
  }
  form.elements.url.value = state.prUrl;
}

function renderAuthorizationPrompt(message, loginUrl) {
  state.data = null;
  syncPullRequestForm();
  const workspace = document.querySelector("#workspace");
  workspace.className = "empty-state";
  workspace.innerHTML = `
    <section class="open-pr-card auth-card">
      <span class="eyebrow">GitHub authorization</span>
      <h1>Continue with your GitHub identity</h1>
      <p>${escapeHtml(message || "BettaView uses your GitHub access so reads and review actions keep your permissions and identity.")}</p>
      <a class="button primary" href="${escapeHtml(loginUrl || "/auth/github")}">Authorize GitHub</a>
    </section>
  `;
}

function renderOpenPrompt(message = "") {
  state.data = null;
  state.activePath = null;
  state.activeQualityPath = null;
  state.activeCitationId = null;
  state.activeCitationMarker = null;
  syncPullRequestForm();
  const workspace = document.querySelector("#workspace");
  workspace.className = "empty-state";
  workspace.innerHTML = `
    <section class="open-pr-card">
      <span class="eyebrow">Open pull request</span>
      <h1>Review rendered Markdown</h1>
      <p>${escapeHtml(message || "Paste the URL of a GitHub pull request to begin.")}</p>
      <form id="empty-pr-form" class="empty-pr-form">
        <label class="sr-only" for="empty-pr-url">GitHub pull request URL</label>
        <input id="empty-pr-url" name="url" type="url" value="${escapeHtml(state.prUrl)}" placeholder="https://github.com/owner/repository/pull/123" autocomplete="url" autofocus required />
        <button type="submit" class="button primary">Open pull request</button>
      </form>
    </section>
  `;
  document.querySelector("#empty-pr-form").addEventListener("submit", openPullRequest);
}

function updateThemeToggle() {
  const toggle = document.querySelector("#theme-toggle");
  if (!toggle) return;
  const next = nextTheme(state.theme);
  toggle.querySelector(".theme-toggle-icon").textContent = next === "light" ? "☀" : "☾";
  toggle.querySelector(".theme-toggle-label").textContent = `${next === "light" ? "Light" : "Dark"} mode`;
  toggle.setAttribute("aria-label", `Switch to ${next} theme`);
  toggle.title = `Switch to ${next} theme`;
}

function confirmDraftDiscard(action) {
  if (!state.drafts.length) return true;
  if (!window.confirm(`${action} will discard ${state.drafts.length} unpublished comment${state.drafts.length === 1 ? "" : "s"}. Continue?`)) return false;
  state.drafts = [];
  state.reviewEvent = "COMMENT";
  updateDraftUI();
  return true;
}

async function loadPullRequest({ preservePath = true, restoreRecent = false } = {}) {
  const workspace = document.querySelector("#workspace");
  workspace.className = "empty-state";
  workspace.innerHTML = `<div class="loader"></div><p>Loading rendered Markdown and native threads from GitHub…</p>`;
  try {
    const data = await request(`/api/pr?url=${encodeURIComponent(state.prUrl)}`);
    if (restoreRecent && !canRestoreRecentPullRequest(data)) {
      clearRecentPullRequest();
      state.prUrl = "";
      renderOpenPrompt();
      return;
    }
    state.data = data;
    state.traceabilityRun = null;
    state.prUrl = data.url;
    const shareableUrl = new URL(window.location.href);
    shareableUrl.searchParams.set("pr", state.prUrl);
    window.history.replaceState(null, "", shareableUrl);
    saveRecentPullRequest(state.prUrl);
    syncPullRequestForm();
    const traceabilityReview = data.traceabilityReviews?.find((review) => review.manifest);
    if (!preservePath) state.activeQualityPath = null;
    else if (!data.traceabilityReviews?.some((review) => review.path === state.activeQualityPath && review.manifest)) state.activeQualityPath = null;
    if (!preservePath || !data.files.some((file) => file.path === state.activePath)) {
      const proposalPath = traceabilityReview
        ? buildTraceabilityView(traceabilityReview).statements.find((statement) => statement.proposal.path)?.proposal.path
        : null;
      state.activePath = data.files.find((file) => file.path === proposalPath)?.path
        || data.files.find((file) => file.mermaidBlocks.length > 0)?.path
        || data.files[0]?.path;
    }
    renderWorkspace();
  } catch (error) {
    if (restoreRecent) {
      clearRecentPullRequest();
      state.prUrl = "";
      renderOpenPrompt();
      return;
    }
    if (error.code === "github_authorization_required" || error.code === "github_reauthorization_required") {
      renderAuthorizationPrompt("Authorize the DEOS BettaView GitHub App to open this pull request and preserve human review attribution.", error.loginUrl);
      return;
    }
    renderOpenPrompt(`Could not open that pull request: ${error.message}`);
  }
}

function prettyJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function reviewEventOutcome(event) {
  return event.data.review?.overall_outcome || event.data.result_class || event.data.state;
}

function reviewEventTitle(event, authorWorkIndex) {
  const stage = reviewStoryStage(event);
  if (stage === "self_review") return `Self-review · ${event.data.review.mode}`;
  if (stage === "external_review") return `External review · ${event.data.review.mode}`;
  if (stage === "author_response") {
    return String(event.data.node_id).includes("independent")
      ? "Author response to external review"
      : "Author response to self-review";
  }
  return authorWorkIndex === 0 ? "Author started the planning work" : "Author updated the planning work";
}

function reviewStageLabel(stage) {
  if (stage === "self_review") return "Self-review";
  if (stage === "external_review") return "External review";
  if (stage === "author_response") return "Author response";
  return "Author work";
}

function renderExactReviewRecord(name, value) {
  return `<details class="review-exact-record"><summary>Exact ${escapeHtml(name)}</summary><pre>${prettyJson(value)}</pre></details>`;
}

function renderAuthorCompletion(value) {
  if (!value || typeof value !== "object" || value.unavailable) return renderExactReviewRecord("author record", value);
  const rounds = Array.isArray(value.rounds) ? value.rounds : [];
  const latest = rounds.at(-1) || {};
  const changedPaths = Array.isArray(latest.changedPaths) ? latest.changedPaths : [];
  const checks = [
    ["Allowed paths", latest.allowedPaths],
    ["OpenSpec", latest.strictOpenSpec],
    ["Whitespace", latest.whitespace],
    ["Readability", latest.readability],
  ].filter(([, outcome]) => outcome);
  return `<section class="review-record author-record">
    <header><strong>Author result</strong><span class="review-record-state">${escapeHtml(String(value.outcome || "recorded").replaceAll("_", " "))}</span></header>
    ${changedPaths.length ? `<div class="review-changed-files"><span class="eyebrow">Changed files</span>${changedPaths.map((path) => `<code>${escapeHtml(path)}</code>`).join("")}</div>` : ""}
    ${checks.length ? `<div class="review-checks">${checks.map(([label, outcome]) => `<span><b>${escapeHtml(label)}</b>${escapeHtml(String(outcome))}</span>`).join("")}</div>` : ""}
    ${renderExactReviewRecord("author-completion.json", value)}
  </section>`;
}

function renderNormalizedReview(value) {
  if (!value || typeof value !== "object" || value.unavailable) return renderExactReviewRecord("review record", value);
  const review = value.review || {};
  const findings = Array.isArray(value.findings) ? value.findings : [];
  return `<section class="review-record reviewer-record">
    <header><strong>Review output</strong><span class="review-record-state">${escapeHtml(String(review.overall || "recorded").replaceAll("_", " "))}</span></header>
    ${value.passingJudgment?.rationale ? `<p>${escapeHtml(value.passingJudgment.rationale)}</p>` : ""}
    ${findings.length ? `<div class="review-findings">${findings.map((finding) => `<article><strong>${escapeHtml(finding.id || String(finding.type || "Finding").replaceAll("_", " "))}</strong><p>${escapeHtml(finding.message || "")}</p></article>`).join("")}</div>` : `<p class="review-no-findings">No semantic findings were recorded.</p>`}
    ${renderExactReviewRecord("normalized-review.json", value)}
  </section>`;
}

function renderReviewDispositions(value) {
  if (!Array.isArray(value)) return renderExactReviewRecord("review-dispositions.json", value);
  return `<section class="review-record disposition-record">
    <header><strong>Author decisions</strong><span class="review-record-state">${value.length} item${value.length === 1 ? "" : "s"}</span></header>
    <div class="review-dispositions">${value.map((item) => `<article><span>${escapeHtml(String(item.status || "recorded").replaceAll("_", " "))}</span><div><strong>${escapeHtml(item.itemId || "Review item")}</strong><p>${escapeHtml(item.reason || "No reason retained.")}</p></div></article>`).join("")}</div>
    ${renderExactReviewRecord("review-dispositions.json", value)}
  </section>`;
}

function renderReviewRecord(name, value) {
  if (name === "author-completion.json") return renderAuthorCompletion(value);
  if (name === "normalized-review.json") return renderNormalizedReview(value);
  if (name === "review-dispositions.json") return renderReviewDispositions(value);
  return renderExactReviewRecord(name, value);
}

function renderReviewArtifacts(artifacts = []) {
  const visible = artifacts.filter(reviewStoryArtifactVisible);
  if (!visible.length) return "";
  return `<div class="review-artifacts"><span class="eyebrow">Evidence files</span><div>${visible.map((artifact) => `<a href="${escapeHtml(artifact.url)}" target="_blank" rel="noreferrer">${escapeHtml(artifact.name)} <small>${escapeHtml(String(artifact.sha256).slice(0, 10))}</small></a>`).join("")}</div></div>`;
}

function renderReviewEvent(event, authorWorkIndex) {
  const stage = reviewStoryStage(event);
  const records = reviewStoryContentEntries(event)
    .filter(([name]) => name !== "result.json" || reviewStoryContentEntries(event).length === 1);
  return `<article class="review-card review-${escapeHtml(reviewEventOutcome(event))}">
    <header><div><span class="eyebrow">${escapeHtml(reviewStageLabel(stage))} · ${escapeHtml(new Date(event.time).toLocaleString())}</span><h2>${escapeHtml(reviewEventTitle(event, authorWorkIndex))}</h2></div><span class="review-outcome">${escapeHtml(String(reviewEventOutcome(event)).replaceAll("_", " "))}</span></header>
    ${event.data.review ? `<p class="review-provenance">${escapeHtml(event.data.review.reviewer_provider)} · ${escapeHtml(event.data.review.reviewer_model)} · ${escapeHtml(event.data.review.agent_harness || "unknown harness")}</p>` : ""}
    ${records.map(([name, value]) => renderReviewRecord(name, value)).join("")}
    ${renderReviewArtifacts(event.data.artifacts)}
  </article>`;
}

function renderReviewTraceSummary(view) {
  if (!view) return `<div class="review-missing"><strong>Trace unavailable</strong><p>No accepted, hash-verified trace is available for this pull request.</p></div>`;
  const quality = buildTraceabilityQuality(view);
  return `<div class="review-trace-summary">
    <header><div><span class="eyebrow">Final trace</span><h3>${quality.needsAttention ? "Needs attention" : "Trace satisfied"}</h3></div><span class="review-record-state">${quality.evidenceCurrent ? "Current" : "Stale"}</span></header>
    <div class="review-trace-metrics">
      <span><strong>${quality.satisfiedStatements}/${quality.totalStatements}</strong> proposal statements</span>
      <span><strong>${quality.satisfiedRequirements}/${quality.totalRequirements}</strong> requirements</span>
      <span><strong>${quality.directionalDisagreements.length}</strong> one-sided links</span>
    </div>
    <p>The detailed proposal and requirement citations remain beside the reviewed documents in PR.</p>
    <button type="button" class="button ghost" data-review-open-pr>Open traced PR</button>
  </div>`;
}

function renderReviewWorkspace() {
  closeCitationPopover();
  const workspace = document.querySelector("#workspace");
  const story = state.data?.deos;
  const trace = traceabilityViews()[0] || null;
  workspace.className = "review-workspace";
  if (!story && !trace) {
    workspace.innerHTML = `<section class="review-empty"><span class="eyebrow">Review</span><h1>No DEOS review found</h1><p>This pull request is still readable, but DEOS has no accepted trace or retained review story for it.</p></section>`;
    return;
  }
  const recordedHead = story?.governed.pullRequest.recordedHeadSha || trace?.reviewedHeadSha;
  const current = recordedHead === state.data.headSha;
  let authorWorkIndex = 0;
  const events = (story?.events || []).map((event) => {
    const index = reviewStoryStage(event) === "author_work" ? authorWorkIndex++ : authorWorkIndex;
    return renderReviewEvent(event, index);
  });
  workspace.innerHTML = `
    <section class="review-hero">
      <div><span class="eyebrow">${escapeHtml(story?.governed.issue.key || trace?.change || "DEOS review")}</span><h1>Review story</h1><p>${escapeHtml(story?.governed.issue.title || "Accepted trace and retained semantic review evidence")}</p></div>
      <div class="review-summary"><span class="review-outcome">${escapeHtml(String(trace?.review.overall || "review recorded").replaceAll("_", " "))}</span><span class="commit-chip"><span></span>${current ? "Final reviewed commit" : "Reviewed commit"} <code>${shortSha(recordedHead)}</code></span></div>
    </section>
    ${current ? "" : `<div class="review-warning"><strong>The pull request moved.</strong> The review records ${escapeHtml(shortSha(recordedHead))}; GitHub now shows ${escapeHtml(shortSha(state.data.headSha))}.</div>`}
    <section class="review-section">
      <div class="review-section-heading"><span class="eyebrow">Provenance</span><h2>How the review reached this result</h2><p>The retained author and reviewer evidence behind this result.</p></div>
      ${events.length ? `<div class="review-timeline">${events.join("")}</div>` : `<div class="review-missing"><strong>Review history unavailable</strong><p>No retained semantic review records are available.</p></div>`}
    </section>
    <section class="review-section">
      <div class="review-section-heading"><span class="eyebrow">Reviewed result</span><h2>Final trace summary</h2><p>A compact result here; the detailed citations stay with the PR documents.</p></div>
      ${renderReviewTraceSummary(trace)}
    </section>
  `;
  document.querySelector("[data-review-open-pr]")?.addEventListener("click", () => {
    Object.assign(state, selectPortalView("pr"));
    renderWorkspace();
  });
}

function traceabilityViews() {
  return (state.data?.traceabilityReviews || [])
    .filter((review) => review.manifest)
    .map((review) => buildTraceabilityView(review));
}

function traceabilityViewForFile(file) {
  if (!file) return null;
  return traceabilityViews().find((view) => view.statements.some((statement) => statement.proposal.path === file.path)) || null;
}

function traceabilitySpecViewForFile(file) {
  if (!file) return null;
  return traceabilityViews().find((view) => view.links.some((link) => link.spec.path === file.path)) || null;
}

function activeQualityView() {
  return traceabilityViews().find((view) => view.path === state.activeQualityPath) || null;
}

function traceabilityCoverageLabel(value) {
  return value === "sufficient" ? "Covered" : value === "partial" ? "Partial" : "Missing";
}

function scopedCoverageLabel(scope, value) {
  return `${scope} ${traceabilityCoverageLabel(value).toLowerCase()}`;
}

function renderCitationJudgmentIssue(link, { nested = false } = {}) {
  const issues = judgmentLabels(link);
  if (!issues.length) return "";
  const label = issues.length === 1 && issues[0] === "coverage: partial"
    ? "Why this requirement is partial"
    : "Why this requirement needs attention";
  return `<article class="citation-judgment-issue ${nested ? "nested" : ""}"><strong>${escapeHtml(label)}</strong><p>${escapeHtml(link.judgment.rationale)}</p></article>`;
}

function proposalCitationId(view, statement) {
  return `proposal:${view.path}:${statement.id}`;
}

function specCitationId(view, link) {
  return `spec:${view.path}:${link.id}`;
}

function specCitationIndex(view, link) {
  return view.links.filter((candidate) => candidate.spec.path === link.spec.path).indexOf(link) + 1;
}

function renderDirectionalClaim(claim) {
  if (!claim) return "";
  const presentation = directionalClaimPresentation(claim);
  const details = presentation.details.map((detail) => `<p>${detail.label ? `<b>${escapeHtml(detail.label)}:</b> ` : ""}${escapeHtml(detail.rationale)}</p>`).join("");
  return `<div class="directional-claim claim-${escapeHtml(claim.status)}"><strong>${escapeHtml(presentation.label)}</strong>${details}</div>`;
}

function renderCitationRequirement(link, claim = null) {
  const needsAttention = !requirementJudgmentIsSatisfied(link);
  return `
    <details class="citation-requirement" ${needsAttention ? "open" : ""}>
      <summary>
        <span><strong>${escapeHtml(link.spec.title)}</strong><small>${escapeHtml(sourceRangeLabel(link.spec))}</small></span>
        <span class="coverage-state coverage-${escapeHtml(link.judgment.coverage)}">${escapeHtml(scopedCoverageLabel("Requirement", link.judgment.coverage))}</span>
      </summary>
      ${renderDirectionalClaim(claim)}
      ${renderCitationJudgmentIssue(link, { nested: true })}
      <pre>${escapeHtml(link.spec.text)}</pre>
    </details>
  `;
}

function renderCitationProposal(endpoint, index, claim = null) {
  return `
    <details class="citation-requirement" ${index === 0 ? "open" : ""}>
      <summary>
        <span><strong>Proposal statement</strong><small>${escapeHtml(sourceRangeLabel(endpoint))}</small></span>
        <span class="coverage-state">Linked</span>
      </summary>
      ${renderDirectionalClaim(claim)}
      <pre>${escapeHtml(endpoint.text || endpoint.quote)}</pre>
    </details>
  `;
}

function closeCitationPopover(restoreFocus = false) {
  const popover = document.querySelector("#traceability-citation-popover");
  const marker = state.activeCitationMarker;
  document.querySelectorAll(".traceability-citation-marker[aria-expanded='true']").forEach((marker) => marker.setAttribute("aria-expanded", "false"));
  if (popover) {
    popover.hidden = true;
    popover.innerHTML = "";
  }
  state.activeCitationId = null;
  state.activeCitationMarker = null;
  if (restoreFocus && marker?.isConnected) marker.focus({ preventScroll: true });
}

function positionCitationPopover() {
  const popover = document.querySelector("#traceability-citation-popover");
  const marker = state.activeCitationMarker;
  const column = document.querySelector(".document-column");
  if (!popover || popover.hidden || !marker?.isConnected || !column) return;
  const markerRect = marker.getBoundingClientRect();
  const columnRect = column.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = Math.min(popover.offsetHeight, window.innerHeight - 32);
  const left = Math.max(columnRect.left + 16, Math.min(markerRect.right + 12, columnRect.right - width - 16));
  const top = Math.max(88, Math.min(markerRect.top - 18, window.innerHeight - height - 16));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function openCitationPopover(view, statement, marker, citationId) {
  const popover = document.querySelector("#traceability-citation-popover");
  if (!popover) return;
  closeCitationPopover();
  state.activeCitationId = citationId;
  state.activeCitationMarker = marker;
  marker.setAttribute("aria-expanded", "true");
  const index = view.statements.indexOf(statement) + 1;
  const requirementLabel = `${statement.requirements.length} linked requirement${statement.requirements.length === 1 ? "" : "s"}`;
  popover.setAttribute("aria-label", "Linked specification requirements");
  popover.innerHTML = `
    <header>
      <div><span class="eyebrow">Citation ${index} · proposal L${statement.proposal.startLine}</span><h2>${escapeHtml(requirementLabel)}</h2></div>
      <button type="button" class="citation-popover-close" aria-label="Close linked requirements">×</button>
    </header>
    <div class="citation-popover-status">
      <span class="coverage-state coverage-${escapeHtml(statement.coverage)}">${escapeHtml(scopedCoverageLabel("Proposal", statement.coverage))}</span>
      <span>${view.status === "current" ? "Evidence matches this PR head" : "Evidence is stale"}</span>
    </div>
    ${statement.findings.map((finding) => `<article class="citation-finding"><strong>${escapeHtml(String(finding.type || "finding").replaceAll("_", " "))}</strong><p>${escapeHtml(finding.message)}</p></article>`).join("")}
    <div class="citation-requirements">
      ${statement.requirements.length
        ? statement.requirements.map((link) => renderCitationRequirement(
          link,
          statement.directionalClaims?.find((claim) => claim.requirementLinkId === link.id),
        )).join("")
        : `<div class="citation-missing"><strong>No linked requirement</strong><p>${escapeHtml(statement.rationale)}</p></div>`}
    </div>
  `;
  popover.hidden = false;
  popover.querySelector(".citation-popover-close").addEventListener("click", () => closeCitationPopover(true));
  positionCitationPopover();
  popover.querySelector(".citation-popover-close").focus({ preventScroll: true });
}

function openSpecCitationPopover(view, link, marker, citationId) {
  const popover = document.querySelector("#traceability-citation-popover");
  if (!popover) return;
  closeCitationPopover();
  state.activeCitationId = citationId;
  state.activeCitationMarker = marker;
  marker.setAttribute("aria-expanded", "true");
  const index = specCitationIndex(view, link);
  const proposals = link.backLinks.length ? link.backLinks : link.proposalEvidence;
  const proposalLabel = `${proposals.length} linked proposal statement${proposals.length === 1 ? "" : "s"}`;
  popover.setAttribute("aria-label", "Linked proposal statements");
  popover.innerHTML = `
    <header>
      <div><span class="eyebrow">Spec citation P${index} · ${escapeHtml(sourceRangeLabel(link.spec))}</span><h2>${escapeHtml(proposalLabel)}</h2></div>
      <button type="button" class="citation-popover-close" aria-label="Close proposal links">×</button>
    </header>
    <div class="citation-popover-status">
      <span class="coverage-state coverage-${escapeHtml(link.judgment.coverage)}">${escapeHtml(scopedCoverageLabel("Requirement", link.judgment.coverage))}</span>
      <span>${view.status === "current" ? `${view.mode === "directional" ? "Independent directional evidence" : view.mode === "bidirectional" ? "Bidirectional evidence" : "Evidence"} matches this PR head` : "Evidence is stale"}</span>
    </div>
    ${renderCitationJudgmentIssue(link)}
    ${link.findings.map((finding) => `<article class="citation-finding"><strong>${escapeHtml(String(finding.type || "finding").replaceAll("_", " "))}</strong><p>${escapeHtml(finding.message)}</p></article>`).join("")}
    <div class="citation-requirements">
      ${proposals.length
        ? proposals.map((proposal, proposalIndex) => renderCitationProposal(
          proposal,
          proposalIndex,
          link.directionalClaims?.find((claim) => claim.proposal.startLine === proposal.startLine),
        )).join("")
        : `<div class="citation-missing"><strong>No linked proposal statement</strong><p>This requirement has no reverse proposal evidence.</p></div>`}
    </div>
  `;
  popover.hidden = false;
  popover.querySelector(".citation-popover-close").addEventListener("click", () => closeCitationPopover(true));
  positionCitationPopover();
  popover.querySelector(".citation-popover-close").focus({ preventScroll: true });
}

function renderTraceabilityQualityNavigation() {
  const reviews = state.data?.traceabilityReviews || [];
  const targets = state.data?.traceabilityTargets || [];
  if (!reviews.length && !targets.length) return "";
  const reviewedChanges = new Set(reviews.filter((review) => review.manifest).map((review) => review.change));
  return `
    <div class="quality-navigation">
      <span class="eyebrow">Traceability</span>
      ${reviews.map((review) => {
        if (!review.manifest) {
          return `<button class="quality-navigation-button invalid" type="button" disabled title="${escapeHtml(review.error)}"><span class="quality-navigation-icon">!</span><span><strong>Quality unavailable</strong><small>${escapeHtml(review.error)}</small></span></button>`;
        }
        const view = buildTraceabilityView(review);
        const quality = buildTraceabilityQuality(view);
        const attention = quality.needsAttention;
        return `<button class="quality-navigation-button ${state.activeQualityPath === review.path ? "active" : ""} ${attention ? "attention" : ""}" type="button" data-quality-path="${escapeHtml(review.path)}"><span class="quality-navigation-icon" aria-hidden="true">${attention ? "!" : "✓"}</span><span><strong>Trace quality</strong><small>${escapeHtml(review.change)} · ${attention ? "needs attention" : "satisfied"}</small></span></button>`;
      }).join("")}
      ${targets.filter((target) => !reviewedChanges.has(target.change)).map((target) => {
        const running = state.traceabilityRun?.change === target.change && state.traceabilityRun.status === "running";
        const error = state.traceabilityRun?.change === target.change && state.traceabilityRun.status === "error"
          ? state.traceabilityRun.error
          : target.reason;
        return `<div class="traceability-request ${target.eligible ? "" : "unavailable"}">
          <button class="quality-navigation-button" type="button" data-traceability-change="${escapeHtml(target.change)}" ${target.eligible && !running ? "" : "disabled"}>
            <span class="quality-navigation-icon" aria-hidden="true">${running ? "…" : target.eligible ? "↔" : "–"}</span>
            <span><strong>${running ? "Running trace check" : target.eligible ? "Run traceability check" : "Trace unavailable"}</strong><small>${escapeHtml(target.change)}${target.eligible ? " · GPT-5.6 Sol high" : ""}</small></span>
          </button>
          ${error ? `<p>${escapeHtml(error)}</p>` : ""}
        </div>`;
      }).join("")}
    </div>
  `;
}

async function runTraceabilityReview(change) {
  state.traceabilityRun = { change, status: "running", error: null };
  renderWorkspace();
  try {
    const result = await request("/api/traceability/reviews", {
      method: "POST",
      body: JSON.stringify({ prUrl: state.prUrl, headSha: state.data.headSha, change }),
    });
    const reviews = state.data.traceabilityReviews || [];
    state.data.traceabilityReviews = [
      ...reviews.filter((review) => review.path !== result.review.path),
      result.review,
    ];
    state.traceabilityRun = { change, status: "complete", error: null };
    state.activeQualityPath = result.review.path;
    setNotice(`Traceability review completed with ${result.model} (${result.reasoningEffort}).`);
    renderWorkspace();
  } catch (error) {
    state.traceabilityRun = { change, status: "error", error: error.message };
    setNotice(`Traceability review failed: ${error.message}`, "error");
    renderWorkspace();
  }
}

function qualityTargetButton(path, citationId, label) {
  const available = Boolean(path && state.data.files.some((file) => file.path === path));
  return `<button type="button" class="quality-target-button" data-quality-target-path="${escapeHtml(path || "")}" data-quality-citation-id="${escapeHtml(citationId || "")}" ${available ? "" : 'disabled title="This source is not a rendered Markdown file in the pull request."'}>${escapeHtml(label)}</button>`;
}

function renderQualityStatementIssue(view, statement) {
  const index = view.statements.indexOf(statement) + 1;
  return `
    <article class="quality-issue-card">
      <header><span class="coverage-state coverage-${escapeHtml(statement.coverage)}">${escapeHtml(traceabilityCoverageLabel(statement.coverage))}</span><span>${escapeHtml(sourceRangeLabel(statement.proposal))}</span></header>
      <blockquote>${escapeHtml(statement.proposal.text || statement.proposal.quote)}</blockquote>
      <p>${escapeHtml(statement.rationale)}</p>
      ${statement.findings.map((finding) => `<div class="quality-finding-inline"><strong>${escapeHtml(String(finding.type || "finding").replaceAll("_", " "))}</strong><span>${escapeHtml(finding.message)}</span></div>`).join("")}
      <footer>${qualityTargetButton(statement.proposal.path, proposalCitationId(view, statement), `Open proposal citation [${index}]`)}</footer>
    </article>
  `;
}

function judgmentLabels(link) {
  return [
    link.judgment.coverage === "sufficient" ? null : `coverage: ${link.judgment.coverage}`,
    link.judgment.scope === "in_scope" ? null : `scope: ${link.judgment.scope}`,
    link.judgment.minimality === "minimal" ? null : `minimality: ${link.judgment.minimality}`,
  ].filter(Boolean);
}

function renderQualityRequirementIssue(view, link) {
  const index = specCitationIndex(view, link);
  return `
    <article class="quality-issue-card">
      <header><span>${escapeHtml(sourceRangeLabel(link.spec))}</span></header>
      <h3>${escapeHtml(link.spec.title)}</h3>
      <div class="quality-judgments">${judgmentLabels(link).map((label) => `<span>${escapeHtml(label)}</span>`).join("")}</div>
      <p>${escapeHtml(link.judgment.rationale)}</p>
      <footer>${qualityTargetButton(link.spec.path, specCitationId(view, link), `Open spec citation [P${index}]`)}</footer>
    </article>
  `;
}

function renderTraceabilityQuality(view) {
  const quality = buildTraceabilityQuality(view);
  const statementPercent = quality.totalStatements
    ? Math.round((quality.satisfiedStatements / quality.totalStatements) * 100)
    : 0;
  return `
    <div class="quality-toolbar">
      <div><span class="status-dot ${quality.evidenceCurrent ? "" : "stale"}"></span><strong>Trace quality</strong><small>${escapeHtml(view.change)}</small></div>
      <button id="refresh" class="button ghost">Refresh from GitHub</button>
    </div>
    <div class="quality-view">
      <header class="quality-hero">
        <div><span class="eyebrow">OpenSpec · proposal ↔ specs</span><h1>${quality.needsAttention ? "Needs attention" : "Trace satisfied"}</h1></div>
        ${quality.needsAttention ? "" : '<span class="quality-overall satisfied">Satisfied</span>'}
      </header>
      <section class="quality-metrics" aria-label="Trace quality summary">
        <article><strong>${quality.satisfiedStatements}/${quality.totalStatements}</strong><span>proposal statements satisfied</span></article>
        <article><strong>${quality.satisfiedRequirements}/${quality.totalRequirements}</strong><span>specs coverage</span></article>
      </section>
      <div class="quality-progress" aria-label="${statementPercent}% of proposal statements satisfied"><span style="width:${statementPercent}%"></span></div>
      ${quality.statementIssues.length ? `<section class="quality-section"><div class="quality-section-heading"><span class="eyebrow">Proposal coverage</span><h2>Not satisfied</h2><p>${quality.statementIssues.length} proposal statement${quality.statementIssues.length === 1 ? "" : "s"} ${quality.statementIssues.length === 1 ? "needs" : "need"} specification work.</p></div><div class="quality-issue-grid">${quality.statementIssues.map((statement) => renderQualityStatementIssue(view, statement)).join("")}</div></section>` : ""}
      ${quality.requirementIssues.length ? `<section class="quality-section"><div class="quality-section-heading"><span class="eyebrow">Specs coverage</span><h2>Needs review</h2></div><div class="quality-issue-grid">${quality.requirementIssues.map((link) => renderQualityRequirementIssue(view, link)).join("")}</div></section>` : ""}
      ${quality.directionalDisagreements.length ? `<section class="quality-section"><div class="quality-section-heading"><span class="eyebrow">Directional comparison</span><h2>Disputed links</h2><p>${quality.directionalDisagreements.length} relationship${quality.directionalDisagreements.length === 1 ? " was" : "s were"} claimed by only one semantic pass.</p></div><div class="quality-issue-grid">${quality.directionalDisagreements.map((claim) => `<article class="quality-issue-card directional"><header><span class="coverage-state coverage-partial">${escapeHtml(directionalClaimLabel(claim.status))}</span><span>${escapeHtml(sourceRangeLabel(claim.proposal))}</span></header><h3>${escapeHtml(claim.requirement.spec.title)}</h3>${renderDirectionalClaim(claim)}<footer>${qualityTargetButton(claim.proposal.path, proposalCitationId(view, view.statements.find((statement) => statement.id === claim.proposalStatementId)), "Open disputed link")}</footer></article>`).join("")}</div></section>` : ""}
      ${quality.staleDocuments.length ? `<section class="quality-section"><div class="quality-section-heading"><span class="eyebrow">Evidence freshness</span><h2>Stale documents</h2></div><div class="quality-findings">${quality.staleDocuments.map((document) => `<article><strong>${escapeHtml(document.file)}</strong><p>The document no longer matches the reviewed SHA-256 snapshot.</p>${qualityTargetButton(document.path, "", "Open document")}</article>`).join("")}</div></section>` : ""}
      ${quality.limitedEvidence ? `<section class="quality-limited"><strong>Proposal inventory is incomplete</strong><p>This version 2 sidecar links requirements back to proposal evidence but cannot prove that every proposal statement was reviewed.</p></section>` : ""}
      ${quality.needsAttention ? "" : `<section class="quality-satisfied"><strong>No recorded trace gaps</strong><p>Every inventoried proposal statement and requirement judgment is satisfied, with current evidence.</p></section>`}
    </div>
  `;
}

function renderQualityEvidenceRail(view) {
  const quality = buildTraceabilityQuality(view);
  const attentionCount = Math.max(
    quality.statementIssues.length + quality.requirementIssues.length + quality.staleDocuments.length,
    quality.findings.length,
    quality.limitedEvidence ? 1 : 0,
  );
  return `
    <div class="thread-heading"><div><span class="eyebrow">Trace evidence</span><h2>Scope</h2></div><span class="thread-count ${quality.needsAttention ? "attention" : ""}">${attentionCount}</span></div>
    <div class="quality-evidence-status ${quality.evidenceCurrent ? "current" : "stale"}"><strong>${quality.evidenceCurrent ? "Evidence current" : "Evidence stale"}</strong><span>${view.mode === "directional" ? "Independent directional v4 review" : view.mode === "bidirectional" ? "Bidirectional v3 review" : "One-way v2 evidence"}</span></div>
    <dl class="quality-provenance"><div><dt>Reviewer</dt><dd>${escapeHtml(view.review.reviewer?.name || "unknown")} · ${escapeHtml(view.review.reviewer?.version || "unknown")}</dd></div><div><dt>Prompt</dt><dd>${escapeHtml(view.review.promptVersion || "unknown")}</dd></div><div><dt>Reviewed</dt><dd>${escapeHtml(view.review.reviewedAt || "unknown")}</dd></div></dl>
    <div class="quality-document-list"><span class="eyebrow">Verified documents</span>${view.documents.map((document) => `<div><span class="document-verification ${document.current ? "" : "stale"}"></span><span>${escapeHtml(document.file)}</span></div>`).join("")}</div>
  `;
}

function openQualityTarget(path, citationId) {
  if (!state.data.files.some((file) => file.path === path)) return;
  state.activeView = "pr";
  state.activeQualityPath = null;
  state.activePath = path;
  closeSelectionComposer();
  renderWorkspace();
  requestAnimationFrame(() => {
    const marker = [...document.querySelectorAll(".traceability-citation-marker")]
      .find((candidate) => candidate.dataset.citationId === citationId);
    if (marker) {
      marker.scrollIntoView({ behavior: "smooth", block: "center" });
      marker.click();
    } else {
      document.querySelector("#rendered-document")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

function renderWorkspace() {
  syncPullRequestForm();
  if (state.activeView === "review") {
    renderReviewWorkspace();
    return;
  }
  closeCitationPopover();
  document.body.classList.remove("diagram-fullscreen-open");
  const data = state.data;
  const file = data.files.find((item) => item.path === state.activePath);
  const qualityView = activeQualityView();
  const proposalTraceabilityView = traceabilityViewForFile(file);
  const specTraceabilityView = traceabilitySpecViewForFile(file);
  const documentTraceabilityView = proposalTraceabilityView || specTraceabilityView;
  const specLinkCount = specTraceabilityView?.links.filter((link) => link.spec.path === file?.path).length || 0;
  const activeThreads = threadsForActiveFile();
  const activeDrafts = draftsForActiveFile();
  const approveCapability = data.reviewCapabilities?.approve || { allowed: true, reason: null };
  const workspace = document.querySelector("#workspace");
  workspace.className = "workspace";
  workspace.innerHTML = `
    <aside class="file-rail">
      <div class="pr-summary">
        <span class="eyebrow">${escapeHtml(data.repository)} · PR #${data.number}</span>
        <a href="${escapeHtml(data.url)}" target="_blank" rel="noreferrer"><h1>${escapeHtml(data.title)}</h1></a>
        <div class="pr-state-row"><span class="pr-state pr-state-${escapeHtml(data.state)}">${escapeHtml(data.state)}</span><div class="commit-chip"><span></span>Exact head <code>${shortSha(data.headSha)}</code></div></div>
      </div>
      <nav class="file-list" aria-label="Changed Markdown files">
        <div class="file-tree" role="tree">${renderFileTree(buildReviewFileTree(data.files)) || `<p class="muted">No changed Markdown files.</p>`}</div>
      </nav>
      <div class="review-actions">
        <span class="eyebrow">Submit review state</span>
        <button data-review="COMMENT" class="button subtle ${state.reviewEvent === "COMMENT" ? "selected" : ""}">Comment</button>
        <button data-review="APPROVE" class="button subtle ${state.reviewEvent === "APPROVE" ? "selected" : ""}" ${approveCapability.allowed ? "" : `disabled title="${escapeHtml(approveCapability.reason)}"`}>Approve</button>
        <button data-review="REQUEST_CHANGES" class="button subtle danger ${state.reviewEvent === "REQUEST_CHANGES" ? "selected" : ""}">Request changes</button>
        ${approveCapability.allowed ? "" : `<p class="review-restriction">Signed in as @${escapeHtml(data.viewerLogin)}. ${escapeHtml(approveCapability.reason)}</p>`}
      </div>
      <div class="file-rail-resizer" role="separator" aria-label="Resize changed files sidebar" aria-orientation="vertical" aria-valuemin="${MIN_FILE_RAIL_WIDTH}" tabindex="0"></div>
    </aside>
    <section class="document-column">
      ${qualityView ? renderTraceabilityQuality(qualityView) : file ? `
        <div class="document-toolbar">
          <div><span class="status-dot ${documentTraceabilityView?.status === "stale" ? "stale" : ""}"></span><strong>${escapeHtml(file.path)}</strong><small>${file.changedLines.length} commentable changed lines</small>${proposalTraceabilityView ? `<span class="citation-toolbar-state ${proposalTraceabilityView.status === "stale" ? "stale" : ""}"><strong>${proposalTraceabilityView.statements.length}</strong> traced statements · ${proposalTraceabilityView.status === "current" ? "current evidence" : "stale evidence"}</span>` : specTraceabilityView ? `<span class="citation-toolbar-state ${specTraceabilityView.status === "stale" ? "stale" : ""}"><strong>${specLinkCount}</strong> requirement backlinks · ${specTraceabilityView.status === "current" ? "current evidence" : "stale evidence"}</span>` : ""}</div>
          <button id="refresh" class="button ghost">Refresh from GitHub</button>
        </div>
        <article id="rendered-document" class="markdown-body">${file.html}</article>
      ` : `<div class="empty-state"><p>No changed Markdown file to render.</p></div>`}
    </section>
    <aside class="thread-rail">
      <div class="thread-rail-resizer" role="separator" aria-label="Resize review threads sidebar" aria-orientation="vertical" aria-valuemin="${MIN_THREAD_RAIL_WIDTH}" tabindex="0"></div>
      ${qualityView ? renderQualityEvidenceRail(qualityView) : `<div class="thread-heading"><div><span class="eyebrow">GitHub review</span><h2>Threads</h2></div><span class="thread-count">${activeThreads.length + activeDrafts.length}</span></div><div id="threads">${renderThreadRail(activeThreads, activeDrafts)}</div>`}
    </aside>
  `;

  const width = layoutWidth();
  if (!state.fileRailCustomized) state.fileRailWidth = defaultFileRailWidth(width);
  if (!state.threadRailCustomized) state.threadRailWidth = defaultThreadRailWidth(width);
  setFileRailWidth(state.fileRailWidth);
  setThreadRailWidth(state.threadRailWidth);
  bindFileRailResizer();
  bindThreadRailResizer();

  document.querySelectorAll(".file-link").forEach((button) => button.addEventListener("click", () => {
    state.activeQualityPath = null;
    state.activePath = button.dataset.path;
    closeSelectionComposer();
    renderWorkspace();
  }));
  document.querySelectorAll("[data-quality-path]").forEach((button) => button.addEventListener("click", () => {
    state.activeQualityPath = button.dataset.qualityPath;
    closeSelectionComposer();
    renderWorkspace();
  }));
  document.querySelectorAll("[data-traceability-change]").forEach((button) => button.addEventListener("click", () => {
    runTraceabilityReview(button.dataset.traceabilityChange);
  }));
  document.querySelectorAll("[data-quality-target-path]:not(:disabled)").forEach((button) => button.addEventListener("click", () => {
    openQualityTarget(button.dataset.qualityTargetPath, button.dataset.qualityCitationId);
  }));
  document.querySelector("#refresh")?.addEventListener("click", () => {
    loadPullRequest();
  });
  document.querySelectorAll("[data-review]").forEach((button) => button.addEventListener("click", () => submitReview(button.dataset.review)));
  document.querySelector("#rendered-document")?.addEventListener("mouseup", handleTextSelection);
  if (!qualityView) bindThreadActions();
  updateDraftBar();
  if (file && !qualityView) {
    decorateScenarioKeywords(document.querySelector("#rendered-document"));
    highlightCodeBlocks(document.querySelector("#rendered-document"));
    renderMermaidDiagrams(file);
  }
}

function renderFileTree(nodes, depth = 0) {
  return nodes.map((node) => {
    if (node.kind === "branch") {
      return `<div class="file-tree-node" role="treeitem" aria-expanded="true">
        <div class="file-tree-folder" style="--tree-depth: ${depth}"><span class="file-tree-chevron" aria-hidden="true">⌄</span><span>${escapeHtml(node.label)}</span></div>
        <div role="group">${renderFileTree(node.children, depth + 1)}</div>
      </div>`;
    }
    const item = node.file;
    const active = !state.activeQualityPath && item.path === state.activePath;
    return `<button class="file-link ${active ? "active" : ""}" role="treeitem" ${active ? 'aria-current="page"' : ""} style="--tree-depth: ${depth}" data-path="${escapeHtml(item.path)}" title="${escapeHtml(item.path)}"><span class="file-tree-document" aria-hidden="true"></span><span>${escapeHtml(node.label)}</span><small>+${item.additions} −${item.deletions}</small></button>`;
  }).join("");
}

function setFileRailWidth(width) {
  const viewportWidth = layoutWidth();
  state.fileRailWidth = clampFileRailWidth(width, viewportWidth, state.threadRailWidth);
  const workspace = document.querySelector("#workspace");
  workspace?.style.setProperty("--file-rail-width", `${state.fileRailWidth}px`);
  const resizer = workspace?.querySelector(".file-rail-resizer");
  resizer?.setAttribute("aria-valuenow", String(Math.round(state.fileRailWidth)));
  resizer?.setAttribute("aria-valuemax", String(maxFileRailWidth(viewportWidth, state.threadRailWidth)));
}

function bindFileRailResizer() {
  const resizer = document.querySelector(".file-rail-resizer");
  if (!resizer) return;

  resizer.addEventListener("pointerdown", (event) => {
    state.fileRailCustomized = true;
    const startX = event.clientX;
    const startWidth = state.fileRailWidth;
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-file-rail");

    const resize = (moveEvent) => setFileRailWidth(startWidth + moveEvent.clientX - startX);
    const finish = () => {
      document.body.classList.remove("resizing-file-rail");
      resizer.removeEventListener("pointermove", resize);
      resizer.removeEventListener("pointerup", finish);
      resizer.removeEventListener("pointercancel", finish);
    };

    resizer.addEventListener("pointermove", resize);
    resizer.addEventListener("pointerup", finish);
    resizer.addEventListener("pointercancel", finish);
  });

  resizer.addEventListener("keydown", (event) => {
    const steps = { ArrowLeft: -20, ArrowRight: 20 };
    let width;
    if (event.key in steps) width = state.fileRailWidth + steps[event.key];
    else if (event.key === "Home") width = MIN_FILE_RAIL_WIDTH;
    else if (event.key === "End") width = maxFileRailWidth(layoutWidth(), state.threadRailWidth);
    else return;
    state.fileRailCustomized = true;
    setFileRailWidth(width);
    event.preventDefault();
  });
}

function setThreadRailWidth(width) {
  const viewportWidth = layoutWidth();
  state.threadRailWidth = clampThreadRailWidth(width, viewportWidth, state.fileRailWidth);
  const workspace = document.querySelector("#workspace");
  const scale = threadRailFontScale(state.threadRailWidth, viewportWidth, state.fileRailWidth);
  workspace?.style.setProperty("--thread-rail-width", `${state.threadRailWidth}px`);
  workspace?.style.setProperty("--thread-font-growth", `${(scale * 4).toFixed(2)}px`);
  workspace?.style.setProperty("--thread-heading-growth", `${(scale * 7).toFixed(2)}px`);
  workspace?.style.setProperty("--thread-badge-growth", `${(scale * 6).toFixed(2)}px`);
  workspace?.style.setProperty("--thread-small-growth", `${(scale * 3).toFixed(2)}px`);
  const resizer = workspace?.querySelector(".thread-rail-resizer");
  resizer?.setAttribute("aria-valuenow", String(Math.round(state.threadRailWidth)));
  resizer?.setAttribute("aria-valuemax", String(maxThreadRailWidth(viewportWidth, state.fileRailWidth)));
}

function bindThreadRailResizer() {
  const resizer = document.querySelector(".thread-rail-resizer");
  if (!resizer) return;

  resizer.addEventListener("pointerdown", (event) => {
    state.threadRailCustomized = true;
    const startX = event.clientX;
    const startWidth = state.threadRailWidth;
    resizer.setPointerCapture(event.pointerId);
    document.body.classList.add("resizing-thread-rail");

    const resize = (moveEvent) => setThreadRailWidth(startWidth + startX - moveEvent.clientX);
    const finish = () => {
      document.body.classList.remove("resizing-thread-rail");
      resizer.removeEventListener("pointermove", resize);
      resizer.removeEventListener("pointerup", finish);
      resizer.removeEventListener("pointercancel", finish);
    };

    resizer.addEventListener("pointermove", resize);
    resizer.addEventListener("pointerup", finish);
    resizer.addEventListener("pointercancel", finish);
  });

  resizer.addEventListener("keydown", (event) => {
    const steps = { ArrowLeft: 20, ArrowRight: -20 };
    let width;
    if (event.key in steps) width = state.threadRailWidth + steps[event.key];
    else if (event.key === "Home") width = MIN_THREAD_RAIL_WIDTH;
    else if (event.key === "End") width = maxThreadRailWidth(layoutWidth(), state.fileRailWidth);
    else return;
    state.threadRailCustomized = true;
    setThreadRailWidth(width);
    event.preventDefault();
  });
}

function threadsForActiveFile() {
  return state.data?.threads.filter((thread) => thread.path === state.activePath) || [];
}

function draftsForActiveFile() {
  return state.drafts.filter((draft) => draft.path === state.activePath);
}

function renderThreadRail(threads = threadsForActiveFile(), drafts = draftsForActiveFile()) {
  if (!threads.length && !drafts.length) {
    return `<div class="no-threads"><span>◌</span><p>No review threads for this file.</p></div>`;
  }
  return `${renderDrafts(drafts)}${renderThreads(threads)}`;
}

function referencePosition(key) {
  return activeThreadReferences(threadsForActiveFile(), draftsForActiveFile()).find((reference) => reference.key === key)?.position;
}

function renderDrafts(drafts) {
  if (!drafts.length) return "";
  return `<div class="draft-heading"><span class="eyebrow">Unpublished</span><span>Only in this tab</span></div>${drafts.map((draft) => {
    const key = draftReferenceKey(draft);
    return `
    <section class="thread-card draft-card" data-thread-key="${escapeHtml(key)}" data-thread-path="${escapeHtml(draft.path)}" data-thread-line="${draft.startLine}" tabindex="-1">
      <div class="thread-meta">
        <div class="thread-location"><span class="thread-position-index">${referencePosition(key)}</span><button class="line-ref" data-go-path="${escapeHtml(draft.path)}" data-go-line="${draft.startLine}">${escapeHtml(draft.path)}:${draft.startLine}${draft.endLine !== draft.startLine ? `–${draft.endLine}` : ""}</button></div>
        <span>Draft</span>
      </div>
      <div class="comment"><div class="avatar">D</div><div><strong>Unpublished ${draft.kind === "reply" ? "reply" : "comment"}</strong><p>${escapeHtml(draft.body)}</p>${draft.kind === "mermaid-annotation" ? `<span class="draft-kind">Annotated diagram</span>` : ""}</div></div>
      <button class="remove-draft" data-remove-draft="${draft.clientSubmissionId}">Remove</button>
    </section>`;
  }).join("")}`;
}

function bindThreadActions() {
  document.querySelectorAll("[data-reply]").forEach((button) => button.addEventListener("click", () => submitReply(button.dataset.reply)));
  document.querySelectorAll("[data-go-path]").forEach((button) => button.addEventListener("click", () => goToLine(button.dataset.goPath, Number(button.dataset.goLine))));
  document.querySelectorAll("[data-remove-draft]").forEach((button) => button.addEventListener("click", () => {
    state.drafts = state.drafts.filter((draft) => draft.clientSubmissionId !== button.dataset.removeDraft);
    updateDraftUI();
  }));
}

function updateDraftBar() {
  const bar = document.querySelector("#pending-review-bar");
  if (!bar) return;
  bar.hidden = state.drafts.length === 0;
  document.querySelector("#pending-review-count").textContent = `${state.drafts.length} unpublished comment${state.drafts.length === 1 ? "" : "s"}`;
}

function updateDraftUI() {
  updateDraftBar();
  const threads = document.querySelector("#threads");
  if (!threads || !state.data) return;
  const activeThreads = threadsForActiveFile();
  const activeDrafts = draftsForActiveFile();
  threads.innerHTML = renderThreadRail(activeThreads, activeDrafts);
  const count = document.querySelector(".thread-count");
  if (count) count.textContent = activeThreads.length + activeDrafts.length;
  bindThreadActions();
  applyThreadReferences();
}

function visibleCommentBody(body) {
  return body
    .replace(/<!-- bettaview:v1 [A-Za-z0-9_-]+ -->/g, "")
    .replace(/<!-- bettaview:v1 \{[\s\S]*?\} -->/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\\n\\n/g, "\n\n")
    .trim();
}

function annotationState(annotation) {
  if (annotation.headSha === state.data.headSha) return "Current";
  const file = state.data.files.find((candidate) => candidate.path === annotation.path);
  if (!file) return "Orphaned";
  if (file.mermaidBlocks.some((block) => block.fingerprint === annotation.diagram.fingerprint)) return "Replayable";
  const priorSlot = annotation.diagram.id.match(/^mermaid-\d+/)?.[0];
  if (file.mermaidBlocks.some((block) => block.id === annotation.diagram.id || block.id === priorSlot)) return "Stale";
  return "Orphaned";
}

function renderThreads(threads) {
  if (!threads.length) return "";
  return threads.map((thread) => {
    const first = thread.comments[0];
    const annotation = first?.metadata?.kind === "mermaid-annotation" ? first.metadata : null;
    const key = threadReferenceKey(thread);
    return `<section class="thread-card ${thread.isOutdated ? "outdated" : ""}" data-thread-key="${escapeHtml(key)}" data-thread-path="${escapeHtml(thread.path)}" data-thread-line="${thread.line || ""}" tabindex="-1">
      <div class="thread-meta">
        <div class="thread-location"><span class="thread-position-index">${referencePosition(key)}</span>${thread.line ? `<button class="line-ref" data-go-path="${escapeHtml(thread.path)}" data-go-line="${thread.line}">${escapeHtml(thread.path)}:${thread.line}</button>` : `<span>${escapeHtml(thread.path)}:outdated</span>`}</div>
        <span>${thread.isOutdated ? "Outdated" : thread.isResolved ? "Resolved" : "Open"}</span>
      </div>
      ${thread.comments.map((comment) => `<div class="comment">
        <div class="avatar">${escapeHtml((comment.author?.login || "?")[0].toUpperCase())}</div>
        <div><strong>${escapeHtml(comment.author?.login || "unknown")}</strong><p>${escapeHtml(visibleCommentBody(comment.body))}</p>${comment.metadata?.imageUrl ? `<a href="${escapeHtml(comment.metadata.imageUrl)}" target="_blank"><img class="annotation-thumb" src="${escapeHtml(comment.metadata.imageUrl)}" alt="Annotated Mermaid diagram" /></a>` : ""}</div>
      </div>`).join("")}
      ${annotation ? `<div class="annotation-state"><span>Diagram ${escapeHtml(annotation.diagram.id)}</span><span>${annotationState(annotation)}</span></div>` : ""}
      <div class="reply-row"><input id="reply-${first.databaseId}" placeholder="Add a reply…" /><button class="button ghost" data-reply="${first.databaseId}">Add</button></div>
    </section>`;
  }).join("");
}

function handleTextSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  const documentRoot = document.querySelector("#rendered-document");
  if (!documentRoot.contains(range.commonAncestorContainer)) return;
  const fragment = range.cloneContents();
  const selectionContent = document.createElement("div");
  selectionContent.append(fragment);
  selectionContent.querySelectorAll(".comment-position-marker, .comment-position-group, .diagram-toolbar, .diagram-comment").forEach((element) => element.remove());
  const text = selectionContent.textContent.trim();
  if (!text || text.length < 3) return;
  state.selectedText = text;
  state.selectionRange = range.cloneRange();
  const composer = document.querySelector("#selection-composer");
  document.querySelector("#selection-preview").textContent = text;
  document.querySelector("#selection-comment").value = "";
  composer.hidden = false;
  positionSelectionComposer(range.getBoundingClientRect());
  document.querySelector("#selection-comment").focus();
}

function positionSelectionComposer(rect) {
  const composer = document.querySelector("#selection-composer");
  const width = 370;
  const gap = 14;
  const left = rect.right + gap + width <= window.innerWidth
    ? rect.right + gap
    : Math.max(gap, rect.left - width - gap);
  composer.style.left = `${left}px`;
  composer.style.top = `${Math.min(Math.max(88, rect.top - 24), window.innerHeight - 310)}px`;
}

function closeSelectionComposer() {
  document.querySelector("#selection-composer").hidden = true;
  state.selectedText = "";
  state.selectionRange = null;
  window.getSelection()?.removeAllRanges();
}

function requestCloseSelectionComposer() {
  const textarea = document.querySelector("#selection-comment");
  if (commentCloseNeedsConfirmation(textarea.value) && !window.confirm("Discard this unfinished comment and close?")) {
    textarea.focus();
    return false;
  }
  closeSelectionComposer();
  return true;
}

function stageSelectionComment() {
  const button = document.querySelector("#submit-selection");
  const body = document.querySelector("#selection-comment").value;
  if (!state.selectedText) return setNotice("Select text in the rendered document first.", "error");
  if (!body.trim()) return setNotice("Write a comment before adding it.", "error");
  const file = state.data.files.find((item) => item.path === state.activePath);
  const lines = locateSelectionLines(file, state.selectedText, state.selectionRange);
  state.drafts.push({
    kind: "text-selection",
    prUrl: state.prUrl,
    path: state.activePath,
    headSha: state.data.headSha,
    selectedText: state.selectedText,
    body: body.trim(),
    startLine: lines?.startLine || 1,
    endLine: lines?.endLine || lines?.startLine || 1,
    clientSubmissionId: id(),
  });
  button.textContent = "Add comment";
  closeSelectionComposer();
  updateDraftUI();
  setNotice("Comment added to the unpublished review.", "success");
}

async function renderMermaidDiagrams(file) {
  const root = document.querySelector("#rendered-document");
  const candidates = [...root.querySelectorAll('pre[lang="mermaid"], pre code.language-mermaid')].map((node) => node.tagName === "PRE" ? node : node.closest("pre"));
  for (let index = 0; index < file.mermaidBlocks.length; index += 1) {
    const block = file.mermaidBlocks[index];
    const pre = candidates[index];
    if (!pre) continue;
    const card = document.createElement("section");
    card.className = "diagram-review";
    card.dataset.blockId = block.id;
    card.innerHTML = `
      <div class="diagram-toolbar">
        <div><strong>Mermaid annotation</strong><small>Lines ${block.startLine}–${block.endLine}</small></div>
        <div class="tool-group">
          <button class="tool active" data-tool="arrow">↗ Arrow</button>
          <button class="tool" data-tool="circle">◯ Circle</button>
          <button class="tool" data-action="undo">Undo</button>
          <button class="tool" data-action="redo">Redo</button>
          <button class="tool" data-action="clear">Clear</button>
          <button class="tool fullscreen-toggle" data-action="fullscreen" aria-pressed="false">⛶ Full screen</button>
        </div>
      </div>
      <div class="diagram-stage"><div class="mermaid-output"></div><svg class="drawing-layer" viewBox="0 0 1000 1000" preserveAspectRatio="none"><defs><marker id="arrow-${index}" markerUnits="userSpaceOnUse" markerWidth="36" markerHeight="64" refX="32" refY="24" orient="auto"><path d="M0,0 L0,48 L35,24 z" fill="#e34b31" /></marker></defs><g></g></svg></div>
      <div class="diagram-comment"><textarea rows="3" placeholder="Explain what the visual mark refers to…"></textarea><button class="button primary">Add annotation</button></div>
    `;
    const githubEnrichment = pre.closest("section.js-render-needs-enrichment");
    (githubEnrichment || pre).replaceWith(card);
    setupDiagramFullscreen(card);
    try {
      const result = await mermaid.render(`bettaview-${index}-${Date.now()}`, block.code);
      card.querySelector(".mermaid-output").innerHTML = result.svg;
      setupDrawing(card, block, file);
    } catch (error) {
      card.querySelector(".mermaid-output").innerHTML = `<div class="diagram-error">Mermaid could not render: ${escapeHtml(error.message)}</div>`;
    }
  }
  decorateDocumentLines(file);
}

function setDiagramFullscreen(card, active) {
  card.classList.toggle("is-fullscreen", active);
  document.body.classList.toggle("diagram-fullscreen-open", active);
  const button = card.querySelector('[data-action="fullscreen"]');
  button.setAttribute("aria-pressed", String(active));
  button.textContent = active ? "× Exit full screen" : "⛶ Full screen";
  button.setAttribute("aria-label", active ? "Exit full-screen diagram" : "Open diagram full screen");
  if (!active) button.focus();
}

function setupDiagramFullscreen(card) {
  card.querySelector('[data-action="fullscreen"]').addEventListener("click", () => {
    setDiagramFullscreen(card, !card.classList.contains("is-fullscreen"));
  });
}

function setupDrawing(card, block, file) {
  const stage = card.querySelector(".diagram-stage");
  const layer = card.querySelector(".drawing-layer");
  const group = layer.querySelector("g");
  let drawings = [];
  let history = [[]];
  let historyIndex = 0;
  let tool = "arrow";
  let draft = null;

  function point(event) {
    const rect = layer.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  }

  function redraw() {
    const visibleDrawings = draft ? [...drawings, draft] : drawings;
    const viewport = layer.getBoundingClientRect();
    group.innerHTML = visibleDrawings.map((shape) => {
      if (shape.kind === "arrow") {
        return `<line x1="${shape.x1 * 1000}" y1="${shape.y1 * 1000}" x2="${shape.x2 * 1000}" y2="${shape.y2 * 1000}" ${annotationSvgAttributes} marker-end="url(#${layer.querySelector("marker").id})" />`;
      }
      const circle = circleSvgGeometry(shape, viewport);
      return `<ellipse cx="${circle.cx}" cy="${circle.cy}" rx="${circle.rx}" ry="${circle.ry}" ${annotationSvgAttributes} />`;
    }).join("");
  }

  layer.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    layer.setPointerCapture(event.pointerId);
    const start = point(event);
    draft = startDrawing(tool, start);
    stage.focus();
  });
  layer.addEventListener("pointermove", (event) => {
    if (!draft) return;
    const current = point(event);
    draft.x2 = current.x;
    draft.y2 = current.y;
    redraw();
  });
  layer.addEventListener("pointerup", () => {
    if (draft) commitDrawingState([...drawings, draft]);
    draft = null;
    redraw();
  });

  function commitDrawingState(next) {
    history = history.slice(0, historyIndex + 1);
    history.push(next.map((shape) => ({ ...shape })));
    historyIndex += 1;
    drawings = history[historyIndex].map((shape) => ({ ...shape }));
    updateHistoryButtons();
  }

  function restoreHistory(index) {
    historyIndex = index;
    drawings = history[historyIndex].map((shape) => ({ ...shape }));
    draft = null;
    updateHistoryButtons();
    redraw();
  }

  function updateHistoryButtons() {
    card.querySelector('[data-action="undo"]').disabled = historyIndex === 0;
    card.querySelector('[data-action="redo"]').disabled = historyIndex === history.length - 1;
  }

  card.querySelectorAll("[data-tool]").forEach((button) => button.addEventListener("click", () => {
    tool = button.dataset.tool;
    card.querySelectorAll("[data-tool]").forEach((candidate) => candidate.classList.toggle("active", candidate === button));
  }));
  card.querySelector('[data-action="undo"]').addEventListener("click", () => { if (historyIndex > 0) restoreHistory(historyIndex - 1); });
  card.querySelector('[data-action="redo"]').addEventListener("click", () => { if (historyIndex < history.length - 1) restoreHistory(historyIndex + 1); });
  card.querySelector('[data-action="clear"]').addEventListener("click", () => { if (drawings.length) commitDrawingState([]); redraw(); });
  card.addEventListener("keydown", (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z" || event.target.matches("textarea")) return;
    event.preventDefault();
    if (event.shiftKey && historyIndex < history.length - 1) restoreHistory(historyIndex + 1);
    else if (!event.shiftKey && historyIndex > 0) restoreHistory(historyIndex - 1);
  });
  stage.tabIndex = 0;
  updateHistoryButtons();
  card.querySelector(".diagram-comment .button").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const body = card.querySelector("textarea").value;
    if (!drawings.length) return setNotice("Draw an arrow or circle first.", "error");
    if (!body.trim()) return setNotice("Add a typed comment for the annotation.", "error");
    button.disabled = true;
    button.textContent = "Capturing…";
    try {
      const imageDataUrl = await toPng(stage, { pixelRatio: 2, backgroundColor: getComputedStyle(stage).backgroundColor });
      state.drafts.push({
        kind: "mermaid-annotation",
        prUrl: state.prUrl,
        path: file.path,
        headSha: state.data.headSha,
        block,
        geometry: drawings.map((shape) => ({ ...shape })),
        render: { width: stage.clientWidth, height: stage.clientHeight, pixelRatio: 2 },
        imageDataUrl,
        body: body.trim(),
        startLine: block.startLine,
        endLine: block.endLine,
        clientSubmissionId: id(),
      });
      card.querySelector("textarea").value = "";
      commitDrawingState([]);
      redraw();
      updateDraftUI();
      setNotice("Annotation added to the unpublished review.", "success");
    } catch (error) {
      setNotice(error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "Add annotation";
    }
  });
}

async function publishReview() {
  if (!state.drafts.length) return;
  const button = document.querySelector("#publish-review");
  button.disabled = true;
  button.textContent = "Publishing…";
  try {
    const result = await request("/api/comments/batch", {
      method: "POST",
      body: JSON.stringify({ prUrl: state.prUrl, headSha: state.data.headSha, event: state.reviewEvent, comments: state.drafts }),
    });
    const count = state.drafts.length;
    state.drafts = [];
    state.reviewEvent = "COMMENT";
    closeSelectionComposer();
    updateDraftBar();
    setNotice(`${result.published ?? count} comment${count === 1 ? "" : "s"} published from one review submission.`, "success");
    await loadPullRequest();
  } catch (error) {
    setNotice(`${error.message} Your unpublished comments are still here.`, "error");
  } finally {
    button.disabled = false;
    button.textContent = "Publish review";
  }
}

function submitReply(commentId) {
  const input = document.querySelector(`#reply-${commentId}`);
  if (!input.value.trim()) return setNotice("Write a reply before adding it.", "error");
  const thread = state.data.threads.find((candidate) => candidate.comments[0]?.databaseId === Number(commentId));
  if (!thread) return setNotice("That thread is no longer available. Refresh from GitHub.", "error");
  state.drafts.push({
    kind: "reply",
    prUrl: state.prUrl,
    path: thread.path,
    headSha: state.data.headSha,
    commentId: Number(commentId),
    body: input.value.trim(),
    startLine: thread.line || thread.startLine || 1,
    endLine: thread.line || thread.startLine || 1,
    clientSubmissionId: id(),
  });
  input.value = "";
  updateDraftUI();
  setNotice("Reply added to the unpublished review.", "success");
}

async function submitReview(event) {
  if (event === "APPROVE" && state.data.reviewCapabilities?.approve?.allowed === false) {
    return setNotice(state.data.reviewCapabilities.approve.reason, "error");
  }
  if (state.drafts.length) {
    state.reviewEvent = event;
    document.querySelectorAll("[data-review]").forEach((button) => button.classList.toggle("selected", button.dataset.review === event));
    setNotice(`${event.replace("_", " ")} will be applied when the review is published.`, "success");
    return;
  }
  try {
    await request("/api/reviews", {
      method: "POST",
      body: JSON.stringify({ prUrl: state.prUrl, headSha: state.data.headSha, event, body: `BettaView experiment review: ${event.toLowerCase().replace("_", " ")}.` }),
    });
    setNotice(`${event.replace("_", " ")} review submitted.`, "success");
    await loadPullRequest();
  } catch (error) {
    setNotice(error.message, "error");
  }
}

function sourceWordTokens(value) {
  const tokens = [];
  for (const match of value.matchAll(/[\p{L}\p{N}_]+/gu)) tokens.push({ value: match[0].toLocaleLowerCase(), offset: match.index });
  return tokens;
}

function sourceLineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function locateVisibleLines(source, visibleText) {
  const sourceTokens = sourceWordTokens(source);
  const visibleTokens = sourceWordTokens(visibleText);
  if (!visibleTokens.length) return null;
  const windowSize = Math.min(8, visibleTokens.length);
  const offsets = [...new Set([0, Math.max(0, visibleTokens.length - windowSize)])];
  const matches = [];
  for (const visibleOffset of offsets) {
    const needle = visibleTokens.slice(visibleOffset, visibleOffset + windowSize).map((token) => token.value);
    for (let index = 0; index <= sourceTokens.length - needle.length; index += 1) {
      if (needle.every((token, tokenIndex) => sourceTokens[index + tokenIndex].value === token)) {
        matches.push({ visibleOffset, start: sourceTokens[index].offset, end: sourceTokens[index + needle.length - 1].offset });
      }
    }
  }
  const firstMatches = matches.filter((match) => match.visibleOffset === 0);
  if (firstMatches.length !== 1) return null;
  const lastOffset = offsets.at(-1);
  const lastMatches = matches.filter((match) => match.visibleOffset === lastOffset);
  const end = lastMatches.length === 1 ? lastMatches[0].end : firstMatches[0].end;
  return { startLine: sourceLineAt(source, firstMatches[0].start), endLine: sourceLineAt(source, end) };
}

function topLevelSelectionElement(range) {
  const root = document.querySelector("#rendered-document");
  let element = range?.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range?.commonAncestorContainer?.parentElement;
  while (element && element.parentElement !== root) element = element.parentElement;
  return element?.parentElement === root ? element : null;
}

function locateSelectionLines(file, selectedText, range) {
  const element = topLevelSelectionElement(range);
  const sourceStart = Number(element?.dataset.sourceStart);
  const sourceEnd = Number(element?.dataset.sourceEnd);
  if (sourceStart && sourceEnd) {
    const sourceSlice = file.source.split("\n").slice(sourceStart - 1, sourceEnd).join("\n");
    const local = locateVisibleLines(sourceSlice, selectedText);
    if (local) {
      return {
        startLine: sourceStart + local.startLine - 1,
        endLine: sourceStart + local.endLine - 1,
      };
    }
    return { startLine: sourceStart, endLine: sourceEnd };
  }
  return locateVisibleLines(file.source, selectedText);
}

function containsTokenSequence(haystack, needle) {
  if (!needle.length || haystack.length < needle.length) return false;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    if (needle.every((token, tokenIndex) => haystack[index + tokenIndex] === token)) return true;
  }
  return false;
}

function citationAnchorForStatement(root, statement) {
  const statementTokens = sourceWordTokens(statement.proposal.quote || statement.proposal.text).map((token) => token.value);
  const windowSize = Math.min(10, statementTokens.length);
  const firstWindow = statementTokens.slice(0, windowSize);
  const lastWindow = statementTokens.slice(-windowSize);
  const candidates = [...root.querySelectorAll("li, p, blockquote, td")].map((element) => ({
    element,
    tokens: sourceWordTokens(element.textContent).map((token) => token.value),
  })).filter((candidate) => (
    containsTokenSequence(candidate.tokens, firstWindow)
    && containsTokenSequence(candidate.tokens, lastWindow)
  ));
  candidates.sort((left, right) => left.tokens.length - right.tokens.length);
  return candidates[0]?.element || elementForLine(statement.proposal.startLine);
}

function applyTraceabilityCitations(file) {
  const root = document.querySelector("#rendered-document");
  if (!root) return;
  root.querySelectorAll(".traceability-citation-marker").forEach((marker) => marker.remove());
  const proposalView = traceabilityViewForFile(file);
  if (proposalView) {
    for (const [index, statement] of proposalView.statements.entries()) {
      const anchor = citationAnchorForStatement(root, statement);
      if (!anchor) continue;
      const citationId = proposalCitationId(proposalView, statement);
      const marker = document.createElement("button");
      marker.type = "button";
      const disputed = statement.directionalClaims?.some((claim) => claim.status !== "confirmed");
      marker.className = `traceability-citation-marker coverage-${statement.coverage}${statement.findings.length || disputed ? " has-finding" : ""}${disputed ? " disputed" : ""}`;
      marker.dataset.citationId = citationId;
      marker.setAttribute("aria-label", `Citation ${index + 1}: show ${statement.requirements.length} linked specification requirement${statement.requirements.length === 1 ? "" : "s"}`);
      marker.setAttribute("aria-expanded", "false");
      marker.setAttribute("aria-controls", "traceability-citation-popover");
      marker.title = `${traceabilityCoverageLabel(statement.coverage)} · ${statement.requirements.length} linked requirement${statement.requirements.length === 1 ? "" : "s"}`;
      marker.textContent = `[${index + 1}]`;
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.activeCitationId === citationId) closeCitationPopover();
        else openCitationPopover(proposalView, statement, marker, citationId);
      });
      anchor.append(document.createTextNode(" "), marker);
    }
  }
  const specView = traceabilitySpecViewForFile(file);
  if (specView) {
    for (const link of specView.links.filter((candidate) => candidate.spec.path === file.path)) {
      const index = specCitationIndex(specView, link);
      const anchor = elementForLine(link.spec.startLine);
      if (!anchor) continue;
      const citationId = specCitationId(specView, link);
      const proposals = link.backLinks.length ? link.backLinks : link.proposalEvidence;
      const disputed = link.directionalClaims?.some((claim) => claim.status !== "confirmed");
      const adverse = judgmentLabels(link).length > 0 || link.findings.length > 0 || disputed;
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `traceability-citation-marker reverse coverage-${link.judgment.coverage}${adverse ? " has-finding" : ""}${disputed ? " disputed" : ""}`;
      marker.dataset.citationId = citationId;
      marker.setAttribute("aria-label", `Proposal backlink P${index}: show ${proposals.length} linked proposal statement${proposals.length === 1 ? "" : "s"}`);
      marker.setAttribute("aria-expanded", "false");
      marker.setAttribute("aria-controls", "traceability-citation-popover");
      marker.title = `${traceabilityCoverageLabel(link.judgment.coverage)} · ${proposals.length} linked proposal statement${proposals.length === 1 ? "" : "s"}`;
      marker.textContent = `[P${index}]`;
      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (state.activeCitationId === citationId) closeCitationPopover();
        else openSpecCitationPopover(specView, link, marker, citationId);
      });
      anchor.append(document.createTextNode(" "), marker);
    }
  }
}

function decorateDocumentLines(file) {
  const root = document.querySelector("#rendered-document");
  if (!root) return;
  for (const element of root.children) {
    let lines;
    if (element.matches(".diagram-review")) {
      const block = file.mermaidBlocks.find((candidate) => candidate.id === element.dataset.blockId);
      if (block) lines = { startLine: block.startLine, endLine: block.endLine };
    } else {
      lines = locateVisibleLines(file.source, element.textContent.trim());
    }
    if (!lines) continue;
    element.dataset.sourceStart = lines.startLine;
    element.dataset.sourceEnd = lines.endLine;
    element.dataset.sourceLabel = lines.startLine === lines.endLine ? String(lines.startLine) : `${lines.startLine}–${lines.endLine}`;
  }
  applyThreadReferences();
  applyTraceabilityCitations(file);
}

function elementForLine(line) {
  const elements = [...document.querySelectorAll("#rendered-document > [data-source-start]")];
  return elements.find((element) => Number(element.dataset.sourceStart) <= line && Number(element.dataset.sourceEnd) >= line)
    || elements.toSorted((left, right) => Math.abs(Number(left.dataset.sourceStart) - line) - Math.abs(Number(right.dataset.sourceStart) - line))[0];
}

function normalizedTextEnd(root, selectedText) {
  if (!selectedText) return null;
  const nodes = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest(".comment-position-marker, .diagram-toolbar, .diagram-comment")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) nodes.push(walker.currentNode);

  let normalized = "";
  const ends = [];
  for (const node of nodes) {
    for (let offset = 0; offset < node.data.length; offset += 1) {
      const character = node.data[offset];
      if (/\s/.test(character)) {
        if (normalized && !normalized.endsWith(" ")) {
          normalized += " ";
          ends.push({ node, offset: offset + 1 });
        }
      } else {
        normalized += character;
        ends.push({ node, offset: offset + 1 });
      }
    }
  }

  const needle = selectedText.replace(/\s+/g, " ").trim();
  const index = normalized.indexOf(needle);
  if (index < 0 || normalized.indexOf(needle, index + 1) >= 0) return null;
  return ends[index + needle.length - 1];
}

function createPositionMarker(reference) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `comment-position-marker${reference.draft ? " draft-position-marker" : ""}`;
  marker.dataset.threadKey = reference.key;
  marker.setAttribute("aria-label", `Show comment ${reference.position} in the review column`);
  marker.setAttribute("aria-pressed", "false");
  marker.textContent = reference.position;
  marker.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    closeSelectionComposer();
    focusThreadCard(reference.key);
  });
  return marker;
}

function placePositionMarker(reference) {
  const root = document.querySelector("#rendered-document");
  const fallback = elementForLine(reference.line);
  if (!root || !fallback) return;
  const marker = createPositionMarker(reference);
  const exactEnd = reference.selectedText ? normalizedTextEnd(root, reference.selectedText) : null;
  if (exactEnd) {
    marker.classList.add("inline-comment-position-marker");
    const range = document.createRange();
    range.setStart(exactEnd.node, exactEnd.offset);
    range.collapse(true);
    range.insertNode(marker);
  } else {
    let group = fallback.querySelector(":scope > .comment-position-group");
    if (!group) {
      group = document.createElement("span");
      group.className = "comment-position-group";
      fallback.append(group);
    }
    group.append(marker);
  }
  fallback.classList.add("has-thread-reference");
}

function applyThreadReferences() {
  document.querySelectorAll("#rendered-document .comment-position-marker, #rendered-document .comment-position-group").forEach((element) => element.remove());
  document.querySelectorAll("#rendered-document > .has-thread-reference").forEach((element) => element.classList.remove("has-thread-reference"));
  if (!state.data) return;
  activeThreadReferences(threadsForActiveFile(), draftsForActiveFile())
    .filter((reference) => reference.line)
    .forEach(placePositionMarker);
}

function focusThreadCard(key) {
  document.querySelectorAll(".thread-card.is-focused").forEach((card) => card.classList.remove("is-focused"));
  document.querySelectorAll(".comment-position-marker[aria-pressed='true']").forEach((marker) => marker.setAttribute("aria-pressed", "false"));
  const card = [...document.querySelectorAll(".thread-card[data-thread-key]")].find((candidate) => candidate.dataset.threadKey === key);
  if (!card) return;
  card.classList.add("is-focused");
  card.focus({ preventScroll: true });
  document.querySelectorAll(".comment-position-marker").forEach((marker) => {
    if (marker.dataset.threadKey === key) marker.setAttribute("aria-pressed", "true");
  });
  card.scrollIntoView({ behavior: "smooth", block: "center" });
}

function goToLine(path, line) {
  if (path !== state.activePath || state.activeQualityPath) {
    state.activeQualityPath = null;
    state.activePath = path;
    closeSelectionComposer();
    renderWorkspace();
  }
  window.setTimeout(() => {
    const target = elementForLine(line);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.classList.add("line-focus");
    window.setTimeout(() => target.classList.remove("line-focus"), 1800);
  }, 120);
}

shell();
if (state.prUrl) {
  loadPullRequest({ preservePath: false, restoreRecent: !linkedPullRequestUrl });
} else {
  renderOpenPrompt();
}
