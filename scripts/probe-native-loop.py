#!/usr/bin/env python3
"""Run inside the DEOS image: production hooks and adapter, scripted model/controller.
No credentials or provider calls. This is a local integration test, not a canary.
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path('/deos/native-review')
REPO = Path('/deos/workspace/repository')
CHANGE = 'native-loop-test'
PREFIX = f'openspec/changes/{CHANGE}'
MODEL = 'gpt-5.6-sol'
INPUT = 'a' * 64
requests = []
proofs = []
failures = []
finished = threading.Event()


def save(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data))
    temporary.replace(path)


def execute(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, text=True, **kwargs)


def setup():
    REPO.mkdir(parents=True, exist_ok=True)
    folder = REPO / PREFIX
    (folder / 'specs/review-step').mkdir(parents=True)
    (folder / '.openspec.yaml').write_text('schema: spec-driven\n')
    (folder / 'proposal.md').write_text('## Why\n\nPeople need a clear plan.\n\n## What Changes\n\n- Add a review step.\n\n## Capabilities\n\n### New Capabilities\n\n- `review-step`: Check a plan.\n\n## Impact\n\nThe app checks plans.\n')
    (folder / 'specs/review-step/spec.md').write_text('## ADDED Requirements\n\n### Requirement: Check the plan\n\nThe system SHALL check the plan.\n\n#### Scenario: Plan is ready\n\n- **WHEN** the plan is complete\n- **THEN** the system checks it\n')
    execute(['git', 'init'], cwd=REPO)
    execute(['git', 'add', '.'], cwd=REPO)
    execute(['git', '-c', 'user.name=Probe', '-c', 'user.email=probe@example.invalid', 'commit', '-m', 'fixture'], cwd=REPO)
    (folder / 'design.md').write_text('## Component diagram\n\nThe app checks the plan.\n\n## Event flow\n\nA person sends a plan.\n\n## Minimal data model\n\nStore a plan.\n\n## Failure modes\n\nShow an error if the check fails.\n')
    Path('/deos/run').mkdir(parents=True, exist_ok=True)
    Path('/deos/output').mkdir(parents=True, exist_ok=True)
    Path('/deos/run/prompt.md').write_text('PARENT_PRIVATE_MARKER: finish the design, then follow trusted review hooks.')
    job = dict(nativeSelfReview=dict(phase='design'), attemptId='probe-author', deadline=(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat(), openspecChange=CHANGE, promptPath='/deos/run/prompt.md', materializedContext='{}', model=MODEL, reasoning='high', cwd=str(REPO))
    save(Path('/deos/run/job.json'), job)
    execute(['node', '--input-type=module', '-e', 'import {readFile} from "node:fs/promises"; import {setupNativeReview} from "/deos/bin/native-review-setup.mjs"; await setupNativeReview(JSON.parse(await readFile("/deos/run/job.json","utf8")));'])


def controller():
    seen = -1
    while not finished.is_set():
        try:
            file = ROOT / 'request.json'
            if not file.exists():
                time.sleep(.05)
                continue
            raw = file.read_text()
            request = json.loads(raw)
            if request['sequence'] == seen:
                time.sleep(.05)
                continue
            kind = request['kind']
            sequence = request['candidateSequence']
            if kind == 'candidate':
                sources = [dict(path=f'{PREFIX}/{name}', content=(REPO/PREFIX/name).read_text(), sha256=hashlib.sha256((REPO/PREFIX/name).read_bytes()).hexdigest()) for name in ['proposal.md','design.md']]
                context = json.dumps(dict(designReview=dict(inputSha256=INPUT, phase='self', sources=sources)))
                reply = dict(action='review', authorContext='{}', reviewJob=dict(agentRole='reviewer',reviewKind='design',reviewMode='discovery',permissionProfile='review_read_only',modelProvider='codex',model=MODEL,reasoning='high',materializedContext=context,prompt='Check this design.',promptPath=f'{ROOT}/candidate-{sequence}/prompt.md',cwd=str(REPO),openspecChange=CHANGE))
            elif kind == 'session_allocate':
                reply = dict(action='launch',sessionKey=f"probe-author:{sequence}:{request['launch']['index']}")
            elif kind == 'session_started':
                reply = dict(action='started')
            elif kind == 'session_completed':
                proofs.append(request['proof'])
                reply = dict(action='stored')
            elif kind == 'review_completed':
                review = json.loads(Path(request['outputRoot'],'normalized-review.json').read_text())
                reply = dict(action='repair',materializedContext='{}') if review['outcome']=='concerns' else dict(action='stop')
            else:
                raise RuntimeError(kind)
            reply.update(sequence=request['sequence'],requestSha256=hashlib.sha256(raw.encode()).hexdigest())
            save(ROOT/'response.json',reply)
            seen = request['sequence']
        except Exception as error:
            failures.append(repr(error))
            return


class Model(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        requests.append(request)
        ordinal = len(requests)
        encoded = json.dumps(request['input'])
        child = 'Service-authored context:' in encoded and 'PARENT_PRIVATE_MARKER' not in encoded
        state = json.loads((ROOT/'state.json').read_text())
        output = [item for item in request['input'] if item.get('type') in ['function_call_output','custom_tool_call_output']]
        def call(name, arguments):
            return dict(id=f'f{ordinal}',type='function_call',namespace='collaboration',name=name,call_id=f'c{ordinal}',arguments=json.dumps(arguments))
        def shell(command):
            return dict(id=f'f{ordinal}',type='custom_tool_call',namespace='functions',name='exec',call_id=f'c{ordinal}',input=f'text(await tools.exec_command({json.dumps(dict(cmd=command,max_output_tokens=1000))}));')
        def message(value):
            return dict(id=f'm{ordinal}',type='message',role='assistant',status='completed',content=[dict(type='output_text',text=json.dumps(value),annotations=[])])
        if child and not output:
            item = shell(f'cat {PREFIX}/design.md')
        elif child:
            findings = [] if state['candidateSequence'] > 1 else [dict(id='failure-message',severity='low',category='completeness',message='Name the error shown to a person.',sourceRanges=[dict(path=f'{PREFIX}/design.md',startLine=13,endLine=15)])]
            item = message(dict(version=1,inputSha256=INPUT,phase='self',outcome='concerns' if findings else 'pass',summary='Checked the design.',findings=findings))
        elif state['stage']=='review':
            item = call('spawn_agent',dict(task_name=f"review_{state['candidateSequence']}",agent_type='deos_reviewer',fork_turns='none',message='Run prepared review'))
        elif state['stage'] in ['active','launching']:
            item = call('wait_agent',dict(timeout_ms=10000))
        elif state['stage']=='writing' and state['candidateSequence']==1 and 'Error: plan check failed.' not in (REPO/PREFIX/'design.md').read_text():
            item = shell(f"printf '\\nError: plan check failed.\\n' >> {PREFIX}/design.md")
        else:
            item = message(dict(outcome='completed'))
        response = dict(id=f'r{ordinal}',object='response',status='completed',output=[item],usage=dict(input_tokens=1,output_tokens=2,total_tokens=3))
        events = [dict(type='response.created',response={**response,'status':'in_progress','output':[]}),dict(type='response.output_item.added',output_index=0,item=item),dict(type='response.output_item.done',output_index=0,item=item),dict(type='response.completed',response=response)]
        data = ''.join(f'event: {event["type"]}\ndata: {json.dumps(event)}\n\n' for event in events).encode()
        self.send_response(200);self.send_header('Content-Type','text/event-stream');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)


def main():
    setup()
    server = ThreadingHTTPServer(('127.0.0.1',0),Model)
    config = Path('/root/.codex/config.toml')
    config.write_text('model_provider = "probe"\n'+config.read_text()+f'\n[model_providers.probe]\nname="Scripted local probe"\nbase_url="http://127.0.0.1:{server.server_port}/v1"\nwire_api="responses"\nrequires_openai_auth=false\n')
    threading.Thread(target=server.serve_forever,daemon=True).start()
    threading.Thread(target=controller,daemon=True).start()
    result = subprocess.run(['codex','exec','--json','--model',MODEL,'--dangerously-bypass-approvals-and-sandbox','PARENT_PRIVATE_MARKER: finish this design.'],cwd=REPO,capture_output=True,text=True,timeout=240)
    finished.set();server.shutdown()
    state = json.loads((ROOT/'state.json').read_text())
    check = dict(exit_success=result.returncode==0,loop_completed=state['stage']=='done',two_fresh_children=len(proofs)==2 and len({proof['subagentId'] for proof in proofs})==2,read_only=all(proof['beforeManifest']==proof['afterManifest'] and proof['fault'] is None for proof in proofs),one_author_attempt=all(proof['authorAttemptId']=='probe-author' for proof in proofs),no_controller_failures=not failures)
    evidence = dict(evidence_class='local-scripted-production-hook-integration',checks=check,passed=all(check.values()),controller_errors=failures)
    if not evidence['passed']:
        evidence.update(state=state,stderr=result.stderr,stdout=result.stdout,requests=requests)
    Path('/tmp/native-loop-result.json').write_text(json.dumps(evidence,indent=2))
    print(json.dumps({key:value for key,value in evidence.items() if key not in ['state','stderr','stdout','requests']},indent=2))
    raise SystemExit(0 if evidence['passed'] else 1)


if __name__=='__main__': main()
