#!/usr/bin/env python3
"""Enroll an operator-verified Pro setup token without reading local Claude auth."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import shlex
import secrets
import subprocess
import tempfile
from datetime import datetime, timezone


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--account-binding', required=True, help='Stable opaque 64-hex binding for the operator-verified account')
    parser.add_argument('--secret-version', required=True)
    parser.add_argument('--evidence-reference', required=True, help='Protected evidence of Pro account and disabled paid usage')
    parser.add_argument('--config', default='wrangler.queue-consumer-ts.jsonc')
    parser.add_argument('--verified-pro-with-paid-usage-disabled', action='store_true', required=True)
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{64}', args.account_binding):
        parser.error('account binding must be 64 lowercase hex characters')
    if not re.fullmatch('[A-Za-z0-9._-]{1,80}', args.secret_version):
        parser.error('invalid secret version')
    values = {}
    for line in args.env_file.read_text().splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.removeprefix('export ').split('=', 1)
        if key == 'CLOUDFLARE_TOKEN': key = 'CLOUDFLARE_API_TOKEN'
        if key in {'CLAUDE_SETUP_TOKEN', 'CLAUDE_ENROLLMENT_KEY', 'CLOUDFLARE_API_TOKEN'}:
            parsed = shlex.split(value, comments=True)
            values[key] = parsed[0] if parsed else ''
    if not values.get('CLAUDE_ENROLLMENT_KEY'):
        values['CLAUDE_ENROLLMENT_KEY'] = secrets.token_hex(32)
        with args.env_file.open('a') as output:
            output.write('\nCLAUDE_ENROLLMENT_KEY=' + values['CLAUDE_ENROLLMENT_KEY'] + '\n')
        args.env_file.chmod(0o600)
    if any(not values.get(key) for key in ['CLAUDE_SETUP_TOKEN', 'CLAUDE_ENROLLMENT_KEY', 'CLOUDFLARE_API_TOKEN']):
        parser.error('required enrollment credentials are missing')
    if len(values['CLAUDE_ENROLLMENT_KEY']) < 32:
        parser.error('signing secret is too short')
    env = {**os.environ, 'CLOUDFLARE_API_TOKEN': values['CLOUDFLARE_API_TOKEN']}
    command = ['npx', 'wrangler']
    def query(sql):
        result = subprocess.run(command + ['d1', 'execute', 'DB', '--remote', '--config', args.config,
          '--command', sql, '--json'], env=env, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('enrollment database request failed')
        return json.loads(result.stdout)[0]['results']
    current = query('SELECT secret_version, account_binding, token_hmac FROM claude_review_enrollment WHERE singleton = 1')
    if current and current[0]['account_binding'] != args.account_binding:
        raise RuntimeError('replacement must use the already-enrolled account binding')
    fingerprint = hmac.new(values['CLAUDE_ENROLLMENT_KEY'].encode(),
      ('deos:claude-setup-token:v1:' + values['CLAUDE_SETUP_TOKEN']).encode(), hashlib.sha256).hexdigest()
    if current and current[0]['secret_version'] == args.secret_version and current[0]['token_hmac'] != fingerprint:
        raise RuntimeError('replacement token requires a new secret version')
    # One atomic secret update pairs token and version. Until metadata matches,
    # new invocations fail closed. Running client processes retain their token.
    result = subprocess.run(command + ['secret', 'bulk', '--config', args.config], env=env,
      input=json.dumps({'CLAUDE_ENROLLMENT_KEY': values['CLAUDE_ENROLLMENT_KEY'], 'CLAUDE_SETUP_TOKEN': values['CLAUDE_SETUP_TOKEN'],
                       'CLAUDE_SETUP_TOKEN_VERSION': args.secret_version}),
      capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('protected secret update failed; enrollment was not changed')
    quote = lambda text: "'" + text.replace("'", "''") + "'"
    now = datetime.now(timezone.utc).isoformat()
    sql = f'''INSERT INTO claude_review_enrollment
      (singleton,secret_version,account_binding,token_hmac,evidence_reference,enrolled_at)
      VALUES (1,{quote(args.secret_version)},{quote(args.account_binding)},{quote(fingerprint)},
        {quote(args.evidence_reference)},{quote(now)})
      ON CONFLICT(singleton) DO UPDATE SET secret_version=excluded.secret_version,
        token_hmac=excluded.token_hmac,evidence_reference=excluded.evidence_reference,enrolled_at=excluded.enrolled_at
      WHERE claude_review_enrollment.account_binding=excluded.account_binding;'''
    # Wrangler executes writes; no raw token is placed in SQL or a file.
    with tempfile.TemporaryDirectory(prefix='deos-claude-enrollment-') as temp:
        path = Path(temp) / 'enroll.sql'
        path.write_text(sql)
        path.chmod(0o600)
        result = subprocess.run(command + ['d1', 'execute', 'DB', '--remote', '--config', args.config,
          '--file', str(path)], env=env, capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('metadata update failed; new Claude invocations remain blocked')
    rows = query('SELECT secret_version,account_binding,token_hmac FROM claude_review_enrollment WHERE singleton=1')
    expected = {'secret_version': args.secret_version, 'account_binding': args.account_binding, 'token_hmac': fingerprint}
    if rows != [expected]:
        raise RuntimeError('enrollment read-back mismatch')
    print(json.dumps({'enrolled': True, 'secretVersion': args.secret_version,
      'accountBinding': args.account_binding, 'accountEvidence': 'operator_enrollment'}))


if __name__ == '__main__':
    main()
