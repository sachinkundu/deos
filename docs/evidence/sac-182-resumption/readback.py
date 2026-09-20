"""Read-only durable SAC-182 supervision snapshot. Never changes a provider."""
import json,runpy
from datetime import datetime,timezone
from pathlib import Path
from urllib.request import Request,urlopen
ROOT=Path(__file__).resolve().parents[3]
OUT=Path('/private/tmp/sac182-supervision');OUT.mkdir(exist_ok=True)
token=runpy.run_path(str(ROOT/'.agents/skills/cloudflare-container-load/scripts/query_container_load.py'))['api_token'](Path('/Users/sachin/code/deos/.env'))
RUN='workflow:2a653831-c1ec-4db7-972a-d0d08ac0a3d8:e75aad25-c32f-4c23-8184-b4b38388a631:run:1'
QUERIES={
 'run':('SELECT * FROM orchestration_runs WHERE run_id=?',[RUN]),
 'active':("SELECT run_id,attempt_id,node_id,state,sandbox_id,sandbox_tier,updated_at FROM agent_attempts WHERE state IN ('pending','starting','running','collecting')",[]),
 'attempts':('SELECT attempt_id,node_id,state,result_class,result_detail,cleanup_state,manifest_id,visit_sequence,updated_at FROM agent_attempts WHERE run_id=? ORDER BY created_at DESC LIMIT 5',[RUN]),
 'work':('SELECT approved_design_sha,tested_base_sha,patch_base_sha,patch_sha,input_sha,status,pr_url,pr_head_sha FROM implementation_runs WHERE run_id=?',[RUN]),
 'questions':("SELECT * FROM implementation_questions WHERE run_id=? AND status IN ('open','answered')",[RUN]),
 'demos':('SELECT * FROM implementation_demo_reviews WHERE run_id=? ORDER BY visit_sequence DESC LIMIT 3',[RUN]),
 'errors':('SELECT * FROM workflow_errors WHERE run_id=? ORDER BY occurred_at DESC LIMIT 10',[RUN]),
 'environments':('SELECT name,state,cleanup_receipt,updated_at FROM implementation_environments WHERE run_id=?',[RUN]),
 'progress':('SELECT * FROM implementation_progress WHERE run_id=? ORDER BY observed_at DESC LIMIT 1',[RUN]),
}
request=Request('https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',data=json.dumps({'batch':[{'sql':s,'params':p} for s,p in QUERIES.values()]}).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urlopen(request,timeout=30) as response: raw=json.load(response)
if not raw['success']:raise RuntimeError(raw)
value={k:r['results'] for k,r in zip(QUERIES,raw['result'])};value['observedAt']=datetime.now(timezone.utc).isoformat()
path=OUT/('readback-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json');path.write_text(json.dumps(value,indent=2));(OUT/'latest.json').write_text(json.dumps(value,indent=2))
print(json.dumps({'path':str(path),'run':[{k:r[k] for k in ['status','current_node','current_visit_sequence','definition_version','workflow_instance_id']} for r in value['run']], 'active':value['active'],'attempts':value['attempts'][:2],'work':value['work'],'questions':value['questions'],'demos':[{k:r[k] for k in ['kind','outcome','summary','payload_key','payload_sha']} for r in value['demos']],'errors':value['errors'][:2]},indent=2))
