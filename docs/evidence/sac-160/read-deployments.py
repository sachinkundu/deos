"""Read-only SAC-160 evidence. Pass the ignored DEOS env file as argument 1."""
import json
import sys
import urllib.request
from pathlib import Path

values = {}
for line in Path(sys.argv[1]).read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"'")
base = "https://api.cloudflare.com/client/v4/accounts/c68856288112af7698f5be52ea94b96e"
for script in ['deos-queue-consumer-ts', 'deos-sample-project', 'deos-workflow-portal']:
    request = urllib.request.Request(base + '/workers/scripts/' + script + '/deployments', headers={'Authorization': 'Bearer ' + values.get('CLOUDFLARE_API_TOKEN', values.get('CLOUDFLARE_TOKEN', ''))})
    deployment = json.load(urllib.request.urlopen(request))['result']['deployments'][0]
    print(json.dumps({'script': script, 'deployment': deployment}, indent=2))
request = urllib.request.Request(base + '/containers/applications', headers={'Authorization': 'Bearer ' + values.get('CLOUDFLARE_API_TOKEN', values.get('CLOUDFLARE_TOKEN', ''))})
for app in json.load(urllib.request.urlopen(request))['result']:
    if app['name'] == 'deos-queue-consumer-ts-sandbox':
        print(json.dumps({'image': app['configuration']['image'], 'health': app['health']}, indent=2))
