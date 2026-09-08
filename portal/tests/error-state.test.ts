import assert from "node:assert/strict";
import test from "node:test";
import { separateErrors } from "../src/error-state.ts";
const errors = [{visitSequence:14,occurredAt:"2026-09-07"},{visitSequence:17,occurredAt:"2026-09-08"}];
test("a running workflow keeps previous diagnostics out of the current failure panel", () => {
  const view = separateErrors(errors,{status:"active",currentVisitSequence:17,freshness:"2026-09-08"});
  assert.equal(view.failed,false); assert.deepEqual(view.current,[]); assert.deepEqual(view.historical,errors);
});
test("a failed workflow prominently shows only its failed visit errors", () => {
  const view = separateErrors(errors,{status:"failed",currentVisitSequence:18,freshness:"2026-09-08"});
  assert.deepEqual(view.current,[errors[1]]); assert.deepEqual(view.historical,[errors[0]]);
});
