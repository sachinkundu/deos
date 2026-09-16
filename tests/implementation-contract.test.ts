import assert from "node:assert/strict";
import test from "node:test";
import {implementationBranch, validateImplementationPath} from "../src/implementation-contract.ts";
test("implementation branches separate issue runs", () => {
  assert.equal(implementationBranch("SAC-172",2),"deos/agent/SAC-172/run-2");
  assert.throws(() => implementationBranch("../main",1));
});
test("publication paths stay within the repository and exclude credentials", () => {
  for (const path of ["../outside", "/absolute", ".git/config", ".env"]) {
    assert.throws(() => validateImplementationPath(path,"sample","build"), /Unsupported candidate path/);
  }
  validateImplementationPath("src/app.ts","sample","build");
});
