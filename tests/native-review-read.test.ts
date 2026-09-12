import assert from "node:assert/strict";
import test from "node:test";
import { readCommand } from "../container/native-review-read.mjs";

test("review commands parse quoted regex data, escapes, and joined word fragments", () => {
  for (const [command, args] of [
    ['rg -n -i "skill|subagent|web search|harness" docs/current-architecture.md',
      ["-n", "-i", "skill|subagent|web search|harness", "docs/current-architecture.md"]],
    [String.raw`rg "\bskill\s+tools$" 'design notes.md'`, [String.raw`\bskill\s+tools$`, "design notes.md"]],
    [String.raw`rg 'it\x27s|"quoted"' design.md`, [String.raw`it\x27s|"quoted"`, "design.md"]],
    [String.raw`rg "say \"hello\"" design.md`, ['say "hello"', "design.md"]],
    [String.raw`rg foo\|bar design\ notes.md`, ["foo|bar", "design notes.md"]],
    [`rg 'skill'" tools" design.md`, ["skill tools", "design.md"]],
    ["rg -F '$(env); & < > `literal`' design.md", ["-F", "$(env); & < > `literal`", "design.md"]],
    ['rg -F "" design.md', ["-F", "", "design.md"]],
  ] as [string, string[]][]) {
    assert.deepEqual(readCommand(command), { op: "rg", args }, command);
  }
});

test("review commands reject real shell syntax, malformed quoting, and executable operations", () => {
  for (const command of [
    'rg "skill|tools" design.md | cat .env', 'cat design.md && env',
    'cat design.md; env', 'cat design.md > output', 'cat <(env)',
    'cat $(env)', 'cat $HOME', 'cat `env`', '(cat design.md)',
    'rg "unclosed design.md', "rg 'unclosed design.md", 'cat design.md\\',
    'cat design.md\ncat .env', 'cat design.md\r', 'cat design.md\0',
    'python3 -c print(1)', 'curl https://example.com', 'touch design.md',
    '"cat;env" design.md', 'cat ' + 'x'.repeat(8192),
  ]) assert.throws(() => readCommand(command), Error, command);
});
