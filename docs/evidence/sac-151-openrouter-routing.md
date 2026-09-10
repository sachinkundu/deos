# SAC-151 automatic OpenRouter routing

The user authorized leaving Baidu and testing automatic routing with the existing JSON recovery. The model stays `deepseek/deepseek-v4-pro` at high reasoning. Provider routing now uses `require_parameters: true` and `ignore: ["baidu"]`, with no pinned provider. OpenRouter may select or fail over among endpoints supporting the remaining request parameters.

The public endpoint listing advertises structured outputs for StreamLake, Fireworks, DeepInfra, Alibaba, Venice, AtlasCloud, Baidu, Parasail, and NextBit. Advertisement alone does not prove compatibility with the Codex tool loop. The snapshot is [sac-151-openrouter-endpoints.json](sac-151-openrouter-endpoints.json).

## Provider probes

- Automatic routing with upstream schema enforcement completed responses but skipped the required fixture read in two probes. The first was confirmed through OpenRouter generation metadata as StreamLake.
- A further schema-enforced probe forcing the tool choice did not produce a completed response. It is not counted as passing evidence.
- Automatic routing with the schema in the prompt, without the upstream `text.format` parameter, completed the real Codex tool round-trip and exact JSON result. OpenRouter generation metadata confirmed StreamLake for both calls: `gen-1789039431-Mk7P6J64oqCUGQSMYe9N` and `gen-1789039438-V5jiceDxsnRohu8I2U6E`.
- A clean rerun against the final production adapter also passed, below. Neither successful probe forced a tool choice. The client selected the tool from the prompt and had to read an unknown random marker from a local fixture.

The Responses adapter therefore omits upstream `text.format`. The schema remains required at the adapter boundary and is included in the reviewer prompt. Existing JSON recovery, deterministic review validation, and bounded proof correction remain unchanged. No semantic review or human gate is removed. Earlier-message recovery was not needed by the successful provider responses; that fallback remains covered by existing tests.

The first prompt-only diagnostic emitted a harmless local error-log warning for a trailing blank transcript line. The diagnostic harness now trims its captured transcript and directs any diagnostic files to its temporary directory; production recovery code is unchanged.

## Final isolated probe

```jsonl
{"harness":"0.147.0","model":"deepseek/deepseek-v4-pro","provider":"automatic-excluding-baidu","promptOnly":true,"forceTool":false,"workflowStarted":false}
{"requestTools":[{"name":"exec_command","type":"function"},{"name":"write_stdin","type":"function"},{"name":"update_plan","type":"function"},{"name":"request_user_input","type":"function"},{"name":"view_image","type":"function"},{"name":"multi_agent_v1","type":"namespace"},{"name":"get_goal","type":"function"},{"name":"create_goal","type":"function"},{"name":"update_goal","type":"function"}],"requestedToolChoice":"auto"}
{"outputTypes":["reasoning","function_call"]}
{"request":1,"completed":true,"providerRequestId":"gen-1789039551-LaV2oFgCx8oeMr6haFrP","toolCalls":1}
{"requestTools":[{"name":"exec_command","type":"function"},{"name":"write_stdin","type":"function"},{"name":"update_plan","type":"function"},{"name":"request_user_input","type":"function"},{"name":"view_image","type":"function"},{"name":"multi_agent_v1","type":"namespace"},{"name":"get_goal","type":"function"},{"name":"create_goal","type":"function"},{"name":"update_goal","type":"function"}],"requestedToolChoice":"auto"}
{"outputTypes":["reasoning","message"]}
{"request":2,"completed":true,"providerRequestId":"gen-1789039557-qQ8MDYtsExEHxcJ2rErF","toolCalls":1}
{"result":"real Codex tool round-trip and exact review JSON passed","recoveredEarlierMessage":false,"workflowStarted":false}
```

355 Node tests and TypeScript checking passed. These probes use real providers with a local fixture; they do not themselves complete the SAC-166 workflow. The existing three-retry policy remains in place.
