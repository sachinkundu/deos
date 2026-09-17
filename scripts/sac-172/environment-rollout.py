"""Roll out the temporary-environment capability only while all agents are stopped."""
import argparse
import json
import os
import runpy
import subprocess
import tempfile
from pathlib import Path
from urllib.request import Request, urlopen

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['preflight', 'deploy', 'readback', 'ready'])
parser.add_argument('--containers-rollout', choices=['gradual', 'none'], default='gradual')
parser.add_argument('--image-sha', help='Required expected image digest for the ready check')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2]
helper = runpy.run_path(str(root / '.agents/skills/cloudflare-container-load/scripts/query_container_load.py'))
token = helper['api_token'](Path('/Users/sachin/code/deos/.env'))
account = 'c68856288112af7698f5be52ea94b96e'
database = '4e854f8a-018a-42c4-a325-c4b8805c06b2'
config = 'wrangler.queue-consumer-ts.jsonc'


def api(path, body=None):
    request = Request(f'https://api.cloudflare.com/client/v4/accounts/{account}/{path}',
                      data=None if body is None else json.dumps(body).encode(),
                      headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'})
    with urlopen(request, timeout=30) as response:
        value = json.load(response)
    if not value['success']:
        raise RuntimeError(value)
    return value['result']


def query(sql):
    return api(f'd1/database/{database}/query', {'sql': sql, 'params': []})[0]['results']


def stopped():
    active = query("SELECT attempt_id,run_id,node_id,state FROM agent_attempts WHERE state IN ('pending','starting','running','collecting')")
    print(json.dumps({'active_attempts': active}), flush=True)
    if active:
        raise RuntimeError('Backend rollout refused while an agent is active')


if args.mode in ['preflight', 'deploy']:
    stopped()
    # Shared prompt edits can change several workflow digests. Check every
    # bundled variant, not just the new implementation version, before upload.
    local = json.loads(subprocess.check_output(
        ['node', '--experimental-strip-types', 'scripts/sac-172/workflow-registry-manifest.mjs'], cwd=root, text=True))
    remote = {(row['definition_id'], row['version']): row['digest']
              for row in query('SELECT definition_id,version,digest FROM workflow_definitions')}
    conflicts = [row for row in local if (row['name'], row['version']) in remote
                 and remote[(row['name'], row['version'])] != row['digest']]
    print(json.dumps({'workflow_version_conflicts': conflicts, 'bundled_definitions': local}), flush=True)
    if conflicts:
        raise RuntimeError('Bundled workflow version conflicts with a frozen provider definition; assign new versions before deployment')
    applied = {row['name'] for row in query('SELECT name FROM d1_migrations')}
    pending = sorted(p.name for p in (root / 'migrations').glob('*.sql') if p.name not in applied)
    print(json.dumps({'pending_migrations': pending}), flush=True)
    definitions = query("SELECT version,canonical_json FROM workflow_definitions WHERE definition_id='implementation' ORDER BY version DESC LIMIT 1")
    if definitions:
        canonical = json.loads(definitions[0]['canonical_json'])
        print(json.dumps({'latest_frozen_definition': {'version': definitions[0]['version'], 'keys': list(canonical),
                                                      'implementationPolicy': canonical.get('implementationPolicy')}}), flush=True)
    if set(pending) - {'0053_implementation_environments.sql'}:
        raise RuntimeError('Unexpected pending migrations; inspect before rollout')
    if args.mode == 'deploy':
        environment = {**os.environ, 'CLOUDFLARE_API_TOKEN': token, 'CI': 'true'}
        if pending:
            subprocess.run(['npx', 'wrangler', 'd1', 'migrations', 'apply', 'DB', '--remote', '--config', config], cwd=root, env=environment, check=True)
        stopped()
        # A single deployment installs the new secret alongside its code. The
        # secret is never passed in argv or printed; other deployed secrets remain.
        with tempfile.TemporaryDirectory(prefix='deos-environment-secret-') as folder:
            secret_file = Path(folder) / 'secret.json'
            secret_file.write_text(json.dumps({'IMPLEMENTATION_ENVIRONMENT_TOKEN': token}))
            secret_file.chmod(0o600)
            subprocess.run(['npx', 'wrangler', 'deploy', '--config', config,
                            '--secrets-file', str(secret_file), '--containers-rollout', args.containers_rollout],
                           cwd=root, env=environment, check=True)

if args.mode in ['preflight', 'readback', 'ready']:
    deployments = api('workers/scripts/deos-queue-consumer-ts/deployments')['deployments']
    current = max(deployments, key=lambda row: row['created_on'])
    print(json.dumps({'worker_deployment': current}), flush=True)
    apps = api('containers/applications')
    rows = []
    for item in apps:
        if item['name'].startswith('deos-queue-consumer-ts-'):
            app = api(f"containers/applications/{item['id']}")
            rollouts = api(f"containers/applications/{item['id']}/rollouts")
            latest = max(rollouts, key=lambda rollout: rollout['created_at']) if rollouts else None
            rows.append({'name': app['name'], 'image': app['configuration']['image'], 'health': app['health'], 'version': app['version'],
                         'rollout': None if latest is None else {key: latest[key] for key in ['id', 'status', 'created_at', 'target_version', 'progress', 'steps']}})
    print(json.dumps({'container_pools': rows}), flush=True)
    print(json.dumps({'implementation_definitions': query("SELECT definition_id,version,digest FROM workflow_definitions WHERE definition_id='implementation' ORDER BY version DESC LIMIT 2")}), flush=True)
    if args.mode == 'ready':
        if not args.image_sha or len(args.image_sha) != 64:
            raise RuntimeError('ready requires --image-sha with the expected container digest')
        if len(rows) != 4:
            raise RuntimeError('Expected exactly four DEOS container pools')
        for row in rows:
            rollout = row['rollout']
            if not row['image'].endswith('@sha256:' + args.image_sha):
                raise RuntimeError('Unexpected image for ' + row['name'])
            if not rollout or rollout['status'] != 'completed' or rollout['target_version'] != row['version']:
                raise RuntimeError('Container rollout is not completed for ' + row['name'])
            distribution = rollout['progress']['version_distribution']
            if distribution['target_version_percentage'] != 100 or distribution['current_version_instances'] != 0:
                raise RuntimeError('Container replacement remains in progress for ' + row['name'])
            if row['health']['errors'] or row['health']['instances']['failed']:
                raise RuntimeError('Container health errors remain for ' + row['name'])
        print(json.dumps({'ready': True, 'expected_image_sha': args.image_sha}), flush=True)
