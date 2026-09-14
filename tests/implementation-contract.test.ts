import assert from "node:assert/strict";
import test from "node:test";
import {
  implementationPolicy,
  proofRequirements,
  validateCandidate,
  validateDocumentation,
  implementationBranch,
  type ImplementationCandidate,
  type ProofSubject,
} from "../src/implementation-contract.ts";
const subject: ProofSubject = {
  change: "sample",
  approvedDesignSha: "a".repeat(40),
  testedBaseSha: "b".repeat(40),
  treeSha: "c".repeat(40),
};
const candidate = (): ImplementationCandidate => ({
  ...subject,
  version: 1,
  attemptId: "attempt",
  kind: "build",
  outcome: "completed",
  files: [],
  tasks: "- [x] Build behavior",
  patchSha: "d".repeat(64),
  checks: [
    { command: "demo", exitCode: 0, stdout: "actual result", stderr: "" },
  ],
  proof: [
    {
      ...subject,
      id: "proof",
      kind: "showboat",
      path: "proof.md",
      caption: "Behavior",
      sha256: "e".repeat(64),
      sanitized: true,
    },
  ],
  sources: [],
  assumptions: [],
  question: null,
});
test("requirements grow across tries and missing safe adapters cannot downgrade provider proof", () => {
  const first = proofRequirements({
    approvedText: "Add a webhook and a web page",
    paths: [],
    policy: implementationPolicy,
  });
  assert.deepEqual(first.kinds, ["browser_image", "provider_originated"]);
  assert.equal(first.blockedProviders.length, 1);
  const later = proofRequirements({
    approvedText: "",
    paths: [],
    policy: implementationPolicy,
    prior: first,
  });
  assert.ok(later.kinds.includes("browser_image"));
  assert.ok(later.kinds.includes("provider_originated"));
  assert.equal(later.blockedProviders.length, 1);
  assert.throws(
    () => validateCandidate(candidate(), subject, later),
    /safe provider adapter/,
  );
});
test("UI paths require current sanitized images; unit tests and older tree images do not suffice", () => {
  const requirements = proofRequirements({
    approvedText: "",
    paths: ["portal/src/view.tsx"],
    policy: implementationPolicy,
  });
  const value = candidate();
  value.proof[0].kind = "unit_test";
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /browser_image/,
  );
  value.proof[0].kind = "browser_image";
  value.proof[0].treeSha = "f".repeat(40);
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /browser_image/,
  );
  value.proof[0].treeSha = subject.treeSha;
  value.proof[0].sanitized = false;
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /browser_image/,
  );
  value.proof[0].sanitized = true;
  validateCandidate(value, subject, requirements);
});
test("completed tasks, successful checks, and approved-file protection are independent gates", () => {
  const requirements = {
    kinds: ["showboat" as const],
    reasons: [],
    blockedProviders: [],
  };
  const value = candidate();
  validateCandidate(value, subject, requirements);
  value.tasks = "- [ ] Build behavior";
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /tasks remain/,
  );
  value.tasks = "- [x] Build behavior";
  value.checks[0].exitCode = 1;
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /commands/,
  );
  value.checks[0].exitCode = 0;
  value.files = [
    {
      path: "openspec/changes/sample/design.md",
      mode: "100644",
      contentBase64: "",
      sha: "a".repeat(40),
    },
  ];
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /approved planning/,
  );
  value.kind = "tasks";
  value.files[0].path = "src/app.py";
  assert.throws(
    () => validateCandidate(value, subject, requirements),
    /Task creation/,
  );
});
test("documentation requires exact primary access and actual artifact line, but search listings need no citation", () => {
  const url = "https://developers.cloudflare.com/workers/";
  const access = [
    { access_id: "doc", url, content_returned: 1 },
    {
      access_id: "search",
      url: "https://docs.github.com/",
      content_returned: 0,
    },
  ];
  const source = {
    url,
    title: "Workers",
    claim: "Worker deployment contract",
    artifactLocator: "docs/implementation.md:2",
  };
  const files = [
    {
      path: "docs/implementation.md",
      mode: "100644" as const,
      contentBase64: Buffer.from(`Reference\nSee ${url}\n`).toString("base64"),
      sha: "a".repeat(40),
    },
  ];
  validateDocumentation(
    [source],
    access,
    implementationPolicy.documentationHosts,
    files,
  );
  assert.throws(
    () =>
      validateDocumentation(
        [],
        access,
        implementationPolicy.documentationHosts,
        files,
      ),
    /lacks/,
  );
  assert.throws(
    () =>
      validateDocumentation(
        [{ ...source, artifactLocator: "docs/implementation.md:1" }],
        access,
        implementationPolicy.documentationHosts,
        files,
      ),
    /absent/,
  );
  assert.throws(
    () =>
      validateDocumentation(
        [{ ...source, url: "https://developers.cloudflare.com.evil.test/" }],
        access,
        implementationPolicy.documentationHosts,
        files,
      ),
    /Unverified/,
  );
});
test("blockers preserve unfinished work and readable branches separate issue runs", () => {
  const value = candidate();
  value.outcome = "needs_human";
  value.tasks = "- [ ] Continue";
  value.checks = [];
  value.question = {
    blockKey: "missing-provider",
    question: "Which safe resource can receive this event?",
    reason: "No approved adapter.",
  };
  validateCandidate(value, subject, {
    kinds: ["provider_originated"],
    reasons: [],
    blockedProviders: ["missing"],
  });
  assert.equal(implementationBranch("SAC-172", 2), "deos/agent/SAC-172/run-2");
  assert.throws(() => implementationBranch("../main", 1));
});

test("malformed documentation sidecars report the required contract instead of throwing a TypeError", () => {
  const url = "https://docs.github.com/en/rest/pulls/reviews";
  const accesses = [{access_id:"read",url,content_returned:1}];
  for (const sources of [null, {}, [null], [{url,title:"Reviews",claimLocator:"tasks.md:1"}],
    [{url,title:42,claim:"Review semantics",artifactLocator:"tasks.md:1"}]]) {
    assert.throws(() => validateDocumentation(sources,accesses,["docs.github.com"],[]),
      error => error instanceof Error && error.name === "ImplementationError" &&
        /array|claim and artifactLocator/.test(error.message));
  }
});
