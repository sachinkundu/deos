import assert from "node:assert/strict";
import test from "node:test";
import { bettaViewUrl, pullRequestActions } from "../src/review-actions.ts";

const pullRequestUrl = "https://github.com/sachinkundu/deos/pull/74";

test("BettaView receives only the encoded canonical pull request URL", () => {
  assert.equal(
    bettaViewUrl(pullRequestUrl),
    "https://bettaview.voxdez.com/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos%2Fpull%2F74",
  );
});

test("a published pull request always gets GitHub and BettaView actions", () => {
  assert.deepEqual(pullRequestActions(pullRequestUrl, "PR #74"), [
    { kind: "github", label: "PR #74", url: pullRequestUrl },
    {
      kind: "bettaview",
      label: "Open in BettaView",
      url: "https://bettaview.voxdez.com/?pr=https%3A%2F%2Fgithub.com%2Fsachinkundu%2Fdeos%2Fpull%2F74",
    },
  ]);
});
