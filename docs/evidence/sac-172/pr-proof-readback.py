"""Read back the GitHub presentation and durable human gate; never mutate them."""
import argparse, base64, json, re, runpy, subprocess
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

parser=argparse.ArgumentParser()
parser.add_argument("--env-file",type=Path,required=True)
args=parser.parse_args()
root=Path(__file__).resolve().parents[3]
def gh(path):
    return json.loads(subprocess.check_output(['rtk','proxy','gh','api',path],text=True))
pull=gh('repos/sachinkundu/deos-sample-project/pulls/33')
body=pull['body']
commit=re.search(r'\.\./blob/([a-f0-9]{40})/images/',body).group(1)
proof=gh(f'repos/sachinkundu/deos-sample-project/git/commits/{commit}')
record=gh(f'repos/sachinkundu/deos-sample-project/contents/showboat.md?ref={commit}')
showboat=base64.b64decode(record['content']).decode()
helper=runpy.run_path(str(root/'.agents/skills/cloudflare-container-load/scripts/query_container_load.py'))
token=helper['api_token'](args.env_file)
run='workflow:99426d9b-cda7-4db4-9136-692a95a0b090:d5dc0e9d-be0d-4504-82a1-62c14340c91c:run:1'
query={'batch':[
 {'sql':'SELECT current_node,current_visit_sequence,status,definition_version FROM orchestration_runs WHERE run_id=?','params':[run]},
 {'sql':"SELECT visit_sequence,node_id,state,pr_number,head_sha,base_sha FROM implementation_gates WHERE run_id=? AND state='open'",'params':[run]},
 {'sql':'SELECT publication_sequence,status,provider_receipt FROM implementation_publications WHERE run_id=? ORDER BY publication_sequence DESC LIMIT 1','params':[run]},
 {'sql':"SELECT project_id,definition_version,route_revision,workflow_revision,dispatch_enabled,allowed_linear_user_id FROM project_workflow_policies WHERE project_id=?",'params':['99426d9b-cda7-4db4-9136-692a95a0b090']},
]}
request=Request('https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e/d1/database/4e854f8a-018a-42c4-a325-c4b8805c06b2/query',data=json.dumps(query).encode(),headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'})
with urlopen(request,timeout=30) as response: durable=json.load(response)
if not durable['success']:raise RuntimeError(durable)
result={'observedAt':datetime.now(timezone.utc).isoformat(),'pr':pull['html_url'],'state':pull['state'],'merged':pull['merged'],
 'head':pull['head']['sha'],'proofCommit':commit,'proofCommitParents':proof['parents'],
 'images':len(re.findall(r'!\[',body)),'template':{'proposal31':'[PR #31]' in body,'design32':'[PR #32]' in body,
 'showboat':'This is the [Showboat file]' in body,'protectedProofLinks':'/api/implementation/' in body,
 'internalReport':any(s in body for s in ['## Checks','## Demo review','## Implementation response','## Documentation','## Assumptions'])},
 'showboat':{'url':record['html_url'],'bytes':record['size'],'images':len(re.findall(r'!\[',showboat))},
 'durable':[r['results'] for r in durable['result']]}
assert result['head']=='72c46f9f2a3027600289cb60911e2857a08ee688' and result['merged'] is False
assert result['images']==31 and not result['template']['internalReport'] and not result['template']['protectedProofLinks']
assert result['durable'][0][0]['current_node']=='implementation_review'
assert result['durable'][1][0]['head_sha']==result['head']
assert result['durable'][3][0]['definition_version']==37 and result['durable'][3][0]['dispatch_enabled']==1
print(json.dumps(result,indent=2))
