#!/usr/bin/env python3
"""Probe the pinned native runtime with scripted model responses and no credentials.

This is local runtime evidence, not a model-quality or Cloudflare canary test.
The executable must be the pinned Codex CLI, with its code-mode host installed.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


PINNED_VERSION = "codex-cli 0.147.0"
MODEL = "gpt-5.6-sol"
EVENTS = ("PreToolUse", "PostToolUse", "SubagentStart", "SubagentStop", "Stop")
HOOK = '''import json, sys
from pathlib import Path
root = Path(__file__).parent
event = json.load(sys.stdin)
with (root / "hooks.jsonl").open("a") as stream:
    stream.write(json.dumps(event) + "\\n")
result = {}
if event["hook_event_name"] == "PreToolUse":
    if event.get("agent_type") == "reviewer":
        result = {"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "deny",
            "permissionDecisionReason": "Read-only reviewer: tool denied"}}
    elif event.get("tool_name", "").endswith("spawn_agent"):
        requested = event["tool_input"]
        result = {"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "allow",
            "updatedInput": {
                "agent_type": "reviewer",
                "fork_context": False, "message": "REVIEW_PACKET_CANARY"}}}
print(json.dumps(result))
'''


def isolated_environment(home):
    # Do not load or copy a signed-in Codex home, auth file, or API credential.
    allowed = ("PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SYSTEMROOT")
    environment = {key: os.environ[key] for key in allowed if key in os.environ}
    environment["CODEX_HOME"] = str(home)
    return environment


def trust_generated_hooks(codex, root, environment):
    """Read back and trust only the exact hook definitions this probe generated."""
    process = subprocess.Popen(
        [codex, "app-server"], env=environment, text=True,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
    )

    def rpc(identifier, method, params):
        process.stdin.write(json.dumps({"id": identifier, "method": method, "params": params}) + "\n")
        process.stdin.flush()
        for line in process.stdout:
            message = json.loads(line)
            if message.get("id") == identifier:
                if "error" in message:
                    raise RuntimeError(message["error"])
                return message["result"]
        raise RuntimeError("Codex app server exited before hook read-back")

    timer = threading.Timer(30, process.kill)
    timer.start()
    try:
        rpc(1, "initialize", {
            "clientInfo": {"name": "deos-native-runtime-probe", "version": "1"},
            "capabilities": {"experimentalApi": True},
        })
        process.stdin.write('{"method":"initialized"}\n')
        process.stdin.flush()
        data = rpc(2, "hooks/list", {"cwds": [str(root / "work")]})["data"]
        if len(data) != 1 or data[0]["errors"] or data[0]["warnings"]:
            raise RuntimeError("Unexpected hook discovery result")
        hooks = data[0]["hooks"]
        if len(hooks) != len(EVENTS):
            raise RuntimeError("The pinned runtime did not discover all probe hooks")
        with (root / "home/config.toml").open("a") as stream:
            for hook in hooks:
                if (hook["command"] != f"python3 {root}/hook.py" or
                        Path(hook["sourcePath"]) != root / "home/config.toml"):
                    raise RuntimeError("Refusing to trust a hook outside this probe")
                stream.write(f'\n[hooks.state.{json.dumps(hook["key"])}]\n'
                             f'trusted_hash = {json.dumps(hook["currentHash"])}\n'
                             'enabled = true\n')
    finally:
        timer.cancel()
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def run_probe(codex, root):
    requests = []
    request_lock = threading.Lock()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            with request_lock:
                requests.append(request)
                ordinal = len(requests)
            inputs = request.get("input", [])
            encoded = json.dumps(inputs)
            child = "REVIEW_PACKET_CANARY" in encoded and "PARENT_PRIVATE_CANARY" not in encoded
            outputs = [item for item in inputs if item.get("type") in
                       ("function_call_output", "custom_tool_call_output")]
            message = {"id": f"message{ordinal}", "type": "message", "role": "assistant",
                       "status": "completed", "content": [{"type": "output_text",
                       "text": '{"outcome":"pass"}' if child else "probe complete", "annotations": []}]}
            if child and not outputs:
                item = {"id": f"exec{ordinal}", "type": "custom_tool_call", "namespace": "functions",
                        "name": "exec", "call_id": f"call{ordinal}",
                        "input": 'text(await tools.exec_command({cmd: "touch SHOULD_NOT_EXIST", max_output_tokens: 10}));'}
            elif not child and len(outputs) < 4:
                spawn = len(outputs) % 2 == 0
                arguments = ({"agent_type": "default", "fork_context": True,
                              "message": "PARENT_PRIVATE_CANARY_LEAK"} if spawn else {"targets": [json.loads(line)["agent_id"] for line in (root / "hooks.jsonl").read_text().splitlines() if json.loads(line).get("hook_event_name") == "SubagentStart"][-1:], "timeout_ms": 10000})
                item = {"id": f"function{ordinal}", "type": "function_call", "namespace": "multi_agent_v1",
                        "name": "spawn_agent" if spawn else "wait_agent", "call_id": f"call{ordinal}",
                        "arguments": json.dumps(arguments)}
            else:
                item = message
            response = {"id": f"response{ordinal}", "object": "response", "status": "completed",
                        "output": [item], "usage": {"input_tokens": 1, "output_tokens": 1, "total_tokens": 2}}
            events = [
                {"type": "response.created", "response": {**response, "status": "in_progress", "output": []}},
                {"type": "response.output_item.added", "output_index": 0, "item": item},
                {"type": "response.output_item.done", "output_index": 0, "item": item},
                {"type": "response.completed", "response": response},
            ]
            data = "".join(f'event: {event["type"]}\ndata: {json.dumps(event)}\n\n' for event in events).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    environment = isolated_environment(root / "home")
    (root / "home").mkdir()
    (root / "work").mkdir()
    (root / "hook.py").write_text(HOOK)
    candidate = root / "work/draft.md"
    candidate.write_text("A calculator adds numbers and converts temperatures and angles.\n")
    before = hashlib.sha256(candidate.read_bytes()).hexdigest()
    (root / "home/reviewer.toml").write_text(
        'name = "reviewer"\ndescription = "Fresh read-only reviewer"\n'
        'developer_instructions = "REVIEWER_PROFILE_CANARY. Review only."\n'
        f'model = "{MODEL}"\nmodel_reasoning_effort = "high"\n')
    (root / "home/models.json").write_text(json.dumps(dict(models=[dict(
        slug=MODEL, display_name=MODEL, description='Local runtime fixture',
        base_instructions='Follow the supplied task and tools.',
        default_reasoning_level='high', supported_reasoning_levels=[dict(effort='high',description='Review')],
        shell_type='shell_command', visibility='list', supported_in_api=True, priority=1,
        availability_nux=None, upgrade=None, support_verbosity=True, default_verbosity='low',
        apply_patch_tool_type='freeform', truncation_policy=dict(mode='tokens',limit=10000),
        supports_parallel_tool_calls=True, experimental_supported_tools=[],
        tool_mode='code_mode_only', multi_agent_version='v1', context_window=272000,
    )])))
    (root / "home/config.toml").write_text(
        f'model_catalog_json = {json.dumps(str(root / "home/models.json"))}\nmodel = "{MODEL}"\nmodel_provider = "probe"\napproval_policy = "never"\n'
        'sandbox_mode = "danger-full-access"\n[model_providers.probe]\n'
        'name = "Local scripted runtime probe"\n'
        f'base_url = "http://127.0.0.1:{server.server_port}/v1"\n'
        'wire_api = "responses"\nrequires_openai_auth = false\n'
        '[features]\nmulti_agent = true\nmulti_agent_v2 = false\nhooks = true\napps = false\nplugins = false\nshell_snapshot = false\n'
        '[agents.reviewer]\nconfig_file = "reviewer.toml"\ndescription = "Fresh read-only reviewer"\n' +
        "".join(f'\n[[hooks.{event}]]\nmatcher = ".*"\n[[hooks.{event}.hooks]]\n'
                f'type = "command"\ncommand = "python3 {root}/hook.py"\n' for event in EVENTS))
    try:
        trust_generated_hooks(codex, root, environment)
        prompt_path = root / "parent-prompt.txt"
        prompt_path.write_text("PARENT_PRIVATE_CANARY: spawn two successive fresh reviewer checks and wait for each.")
        execution = subprocess.run(
            [codex, "exec", "--skip-git-repo-check", "--json", "--dangerously-bypass-approvals-and-sandbox",
             "-"],
            cwd=root / "work", env=environment, input=prompt_path.read_text(),
            text=True, capture_output=True, timeout=90,
        )
        if execution.returncode:
            raise RuntimeError(execution.stderr)
        (root / "requests.json").write_text(json.dumps(requests, indent=2))
        (root / "execution.json").write_text(json.dumps({"stdout": execution.stdout, "stderr": execution.stderr}, indent=2))
        hooks = [json.loads(line) for line in (root / "hooks.jsonl").read_text().splitlines()]
        starts = [event for event in hooks if event["hook_event_name"] == "SubagentStart"]
        stops = [event for event in hooks if event["hook_event_name"] == "SubagentStop"]
        children = {event["agent_id"] for event in starts}
        child_requests = [request for request in requests if "REVIEW_PACKET_CANARY" in json.dumps(request["input"])
                          and "PARENT_PRIVATE_CANARY" not in json.dumps(request["input"])]
        checks = {
            "two_fresh_children": len(starts) == len(children) == 2,
            "native_wait_has_no_contract_error": "agent ids must be non-empty" not in execution.stderr,
            "both_children_completed": {event["agent_id"] for event in stops} == children and len(stops) == 2,
            "same_live_parent": len({event["session_id"] for event in hooks if not event.get("agent_id")}) == 1,
            "frozen_profile": bool(starts) and all(event["agent_type"] == "reviewer" and event["model"] == MODEL for event in starts),
            "fresh_profile_context": len(child_requests) == 4 and all(
                "REVIEWER_PROFILE_CANARY" in json.dumps(request["input"]) and
                request["reasoning"]["effort"] == "high" for request in child_requests),
            "child_write_attempts_observed": len([event for event in hooks if event["hook_event_name"] == "PreToolUse"
                                                  and event.get("agent_id") in children and event.get("tool_name") == "Bash"]) == 2,
            "writes_denied": not (root / "work/SHOULD_NOT_EXIST").exists() and all(
                any("Read-only reviewer: tool denied" in json.dumps(item) for item in request["input"])
                for request in child_requests if any(item.get("type") == "custom_tool_call_output" for item in request["input"])),
            "candidate_unchanged": hashlib.sha256(candidate.read_bytes()).hexdigest() == before,
        }
        result = {"evidence_class": "local-scripted-native-runtime", "codex_version": PINNED_VERSION,
                  "model_responses": "scripted locally; no model or provider calls", "checks": checks,
                  "child_ids": sorted(children), "passed": all(checks.values())}
        return result
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--codex", required=True, help="Path to Codex CLI 0.147.0")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--diagnostics", type=Path)
    args = parser.parse_args()
    codex = str(Path(args.codex).absolute())
    version = subprocess.check_output([codex, "--version"], text=True).strip()
    if version != PINNED_VERSION:
        raise SystemExit(f"Expected {PINNED_VERSION}; found {version}")
    with tempfile.TemporaryDirectory(prefix="deos-native-probe-") as temporary:
        result = run_probe(codex, Path(temporary).resolve())
        if args.diagnostics:
            shutil.copytree(temporary, args.diagnostics, dirs_exist_ok=True)
    encoded = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded)
    print(encoded, end="")
    raise SystemExit(0 if result["passed"] else 1)


if __name__ == "__main__":
    main()
