import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error The container runtime is JavaScript.
import { selectReviewProof, selectedReviewProof } from "../container/implementation-runtime.mjs";

test("author selection controls PR order and keeps obsolete captures in the saved evidence", () => {
  const failed = {id:"old-hosted-check",kind:"showboat",audience:"review",caption:"old URL",sha256:"old"};
  const image = {id:"final-image",kind:"browser_image",caption:"item saved",sha256:"image"};
  const current = {id:"current-hosted-check",kind:"showboat",audience:"diagnostic",caption:"current URL",sha256:"new"};
  const state = {proof:[failed,current,image]};
  selectReviewProof(state,[image.id,current.id]);
  assert.deepEqual(selectedReviewProof(state), [
    {...image,audience:"review"}, {...current,audience:"review"},
  ]);
  assert.deepEqual(state.proof,[failed,current,image]);
  assert.equal(current.audience,"diagnostic", "presentation must not rewrite the original record");
});

test("unknown IDs are rejected by the tool without replacing the author's valid selection", () => {
  const image = {id:"saved-image",kind:"browser_image"};
  const state = {proof:[image]};
  selectReviewProof(state,[image.id]);
  assert.throws(()=>selectReviewProof(state,["another-run-image"]), /proof IDs/);
  assert.deepEqual(selectedReviewProof(state).map((p:{id:string})=>p.id),[image.id]);
});

test("legacy jobs keep their gallery and an explicit empty selection is allowed", () => {
  const proof = [{id:"saved-image",kind:"browser_image"}];
  const state = {proof};
  assert.equal(selectedReviewProof(state),proof);
  selectReviewProof(state,[]);
  assert.deepEqual(selectedReviewProof(state),[]);
  assert.equal(state.proof,proof);
});
