# SAC-151 native runtime contract probe

*2026-09-10T05:50:17Z by Showboat 0.6.1*
<!-- showboat-id: 82bb6419-ab25-4755-b7ee-474f574cf366 -->

This is a local Codex 0.147.0 runtime probe with scripted responses. It makes no real model, Linear, GitHub, or Cloudflare calls. It does not prove the full canary.

```bash
rtk proxy python3 scripts/probe-native-self-review.py --codex /Users/sachin/.npm/_npx/6391354789b65492/node_modules/.bin/codex --output docs/evidence/sac-151-native-runtime.json
```

```output
  File "/Users/sachin/code/deos-sac-151/scripts/probe-native-self-review.py", line 122
    message = {"id": f"message{ordinal}", "type": "message", "role": "assistant",
              ^
SyntaxError: '{' was never closed
```

```bash
rtk proxy python3 scripts/probe-native-self-review.py --codex /Users/sachin/.npm/_npx/6391354789b65492/node_modules/.bin/codex --output docs/evidence/sac-151-native-runtime.json
```

```output
{
  "evidence_class": "local-scripted-native-runtime",
  "codex_version": "codex-cli 0.147.0",
  "model_responses": "scripted locally; no model or provider calls",
  "checks": {
    "two_fresh_children": true,
    "both_children_completed": true,
    "same_live_parent": true,
    "frozen_profile": true,
    "fresh_profile_context": true,
    "child_write_attempts_observed": true,
    "writes_denied": true,
    "candidate_unchanged": true
  },
  "child_ids": [
    "01a089de-1bea-7d61-a74e-c4bd773665cc",
    "01a089de-1cf3-7353-838f-a714f75ccc49"
  ],
  "passed": true
}
```

```bash
rtk proxy python3 scripts/probe-native-self-review.py --codex /Users/sachin/.npm/_npx/6391354789b65492/node_modules/.bin/codex --output docs/evidence/sac-151-native-runtime.json
```

```output
{
  "evidence_class": "local-scripted-native-runtime",
  "codex_version": "codex-cli 0.147.0",
  "model_responses": "scripted locally; no model or provider calls",
  "checks": {
    "two_fresh_children": true,
    "both_children_completed": true,
    "same_live_parent": true,
    "frozen_profile": true,
    "fresh_profile_context": true,
    "child_write_attempts_observed": true,
    "writes_denied": true,
    "candidate_unchanged": true
  },
  "child_ids": [
    "01a08a37-ffc4-7e61-bc2e-e3e4bad93971",
    "01a08a38-0044-7a93-9a46-dc9ef0a9c9f7"
  ],
  "passed": true
}
```
