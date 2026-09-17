import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function hook(name: string, input: Record<string, unknown> = {}) {
  const result = spawnSync(process.execPath, [new URL('../container/implementation-hook.mjs', import.meta.url).pathname], {
    input: JSON.stringify({hook_event_name:'PreToolUse',tool_name:name,tool_input:input}), encoding:'utf8',
  });
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout).hookSpecificOutput;
}

test('implementation author can use the current native web research tool', () => {
  for (const name of ['webrun','WebSearch','web_search']) {
    assert.equal(hook(name,{search_query:[{q:'OpenSpec tasks official documentation'}]}).permissionDecision,'allow');
  }
});

test('research access does not enable provider mutations or privileged patch tools', () => {
  for (const name of ['mcp__github__merge_pull_request','mcp__cloudflare__deploy','apply_patch']) {
    const result = hook(name);
    assert.equal(result.permissionDecision,'deny');
    assert.match(result.permissionDecisionReason,/Python, Node, cat or tee/);
  }
});
