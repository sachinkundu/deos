import assert from "node:assert/strict";
import test from "node:test";
import { directionalClaimPresentation } from "../src/directional-claim.ts";

test("one-sided proposal evidence omits the redundant requirement absence", () => {
  assert.deepEqual(directionalClaimPresentation({
    status: "proposal_only",
    proposalFirst: { rationale: "The proposal explicitly promises conversion." },
    requirementFirst: { rationale: "The requirement-first pass did not claim this relationship." },
  }), {
    label: "Only in proposal",
    details: [{ label: null, rationale: "The proposal explicitly promises conversion." }],
  });
});

test("one-sided requirement evidence omits the redundant proposal absence", () => {
  assert.deepEqual(directionalClaimPresentation({
    status: "requirement_only",
    proposalFirst: { rationale: "The proposal-first pass did not claim this relationship." },
    requirementFirst: { rationale: "The requirement cites this behavior." },
  }), {
    label: "Only in requirement",
    details: [{ label: null, rationale: "The requirement cites this behavior." }],
  });
});

test("a confirmed relationship names the two source views without first-pass jargon", () => {
  assert.deepEqual(directionalClaimPresentation({
    status: "confirmed",
    proposalFirst: { rationale: "Promised by the proposal." },
    requirementFirst: { rationale: "Specified by the requirement." },
  }), {
    label: "In proposal and requirement",
    details: [
      { label: "Proposal", rationale: "Promised by the proposal." },
      { label: "Requirement", rationale: "Specified by the requirement." },
    ],
  });
});
