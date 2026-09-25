"""Collect AWS identity without retrieving secrets; write a private inventory snapshot.

API mode uses the AWS CLI credential chain. Metadata mode reads IMDSv2 through
explicit SSH aliases and makes no claim about EC2 lifecycle or account coverage.
"""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

METADATA_PROGRAM = '''
import json, urllib.request
url = 'http://169.254.169.254/latest/'
request = urllib.request.Request(url + 'api/token', method='PUT', headers={'X-aws-ec2-metadata-token-ttl-seconds': '60'})
with urllib.request.urlopen(request, timeout=3) as response: token = response.read(4096).decode()
request = urllib.request.Request(url + 'dynamic/instance-identity/document', headers={'X-aws-ec2-metadata-token': token})
with urllib.request.urlopen(request, timeout=3) as response: data = json.loads(response.read(16384))
print(json.dumps({key: data[key] for key in ('instanceId', 'accountId', 'region', 'instanceType')}))
'''


def call_json(command, runner, program=None):
    result = runner(command, input=program, capture_output=True, text=True, timeout=60, check=True)
    if len(result.stdout) > 2 * 1024 * 1024:
        raise ValueError('Inventory response exceeds limit')
    return json.loads(result.stdout)


def collect(config, mode, runner=subprocess.run):
    now = datetime.now(timezone.utc).isoformat()
    result = {'schemaVersion': 1, 'source': 'instance-metadata' if mode == 'metadata' else 'aws-api',
              'collectedAt': now, 'coverage': [], 'instances': []}
    if mode == 'metadata':
        targets = config.get('targets', [])
        if not isinstance(targets, list) or not 1 <= len(targets) <= 50:
            raise ValueError('Configure 1–50 SSH targets')
        for target in targets:
            alias = target['sshAlias']
            if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}', alias):
                raise ValueError('Invalid SSH alias')
            region = target['region']
            try:
                identity = call_json(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
                                      '-o', 'ConnectTimeout=10', alias, 'python3', '-'], runner, METADATA_PROGRAM)
                if identity['region'] != region:
                    raise ValueError('Unexpected region')
                result['instances'].append({**identity, 'name': target['label'], 'state': 'unknown',
                    'monitoring': 'unknown', 'observedAt': now, 'serviceIds': [s['id'] for s in target.get('services', [])]})
                result['coverage'].append({'region': region, 'status': 'available',
                    'detail': 'Configured host identity only. AWS API, lifecycle and alarms not queried.'})
            except (OSError, subprocess.SubprocessError, ValueError, KeyError):
                result['coverage'].append({'region': region, 'status': 'unavailable', 'detail': 'Host identity collection failed; no prior identity reused.'})
    else:
        expected = config.get('expectedAccountId', '')
        regions = config.get('regions', [])
        if not re.fullmatch(r'\d{12}', expected) or not isinstance(regions, list) or not 1 <= len(regions) <= 20:
            raise ValueError('Supply expectedAccountId and 1–20 regions')
        prefix = [config.get('awsExecutable', 'aws')]
        if config.get('profile'):
            prefix += ['--profile', config['profile']]
        identity = call_json(prefix + ['sts', 'get-caller-identity', '--output', 'json'], runner)
        if identity['Account'] != expected:
            raise ValueError('AWS identity does not match configured account')
        for region in regions:
            if not re.fullmatch(r'[a-z]{2}(-[a-z]+)+-\d', region):
                raise ValueError('Invalid AWS region')
            try:
                data = call_json(prefix + ['ec2', 'describe-instances', '--region', region, '--output', 'json'], runner)
                instances = [i for r in data['Reservations'] for i in r['Instances']]
                if len(instances) > 500:
                    raise ValueError('Inventory limit exceeded')
                for item in instances:
                    name = next((t['Value'] for t in item.get('Tags', []) if t['Key'] == 'Name'), item['InstanceId'])
                    result['instances'].append({'instanceId': item['InstanceId'], 'accountId': expected, 'region': region,
                        'instanceType': item['InstanceType'], 'name': name[:120], 'state': item['State']['Name'],
                        'monitoring': item.get('Monitoring', {}).get('State', 'unknown'), 'observedAt': now,
                        'serviceIds': config.get('serviceMappings', {}).get(item['InstanceId'], [])})
                result['coverage'].append({'region': region, 'status': 'available', 'detail': 'EC2 DescribeInstances completed; application health and alarms are separate.'})
            except (OSError, subprocess.SubprocessError, ValueError, KeyError):
                result['coverage'].append({'region': region, 'status': 'unavailable', 'detail': 'AWS inventory request failed; check credentials, region and read permissions.'})
    return result


def write_snapshot(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Replace atomically so the portal never reads a half-written collection.
    descriptor, temporary = tempfile.mkstemp(prefix='.inventory-', dir=path.parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf8') as handle:
            json.dump(value, handle, indent=2)
            handle.write('\n')
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mode', choices=['metadata', 'api'], required=True)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    snapshot = collect(json.loads(Path(args.config).read_text(encoding='utf-8-sig')), args.mode)
    write_snapshot(args.output, snapshot)
    available = sum(c['status'] == 'available' for c in snapshot['coverage'])
    print(f"Saved {len(snapshot['instances'])} identities; {available}/{len(snapshot['coverage'])} collection targets available. Source: {snapshot['source']}.")
    if not available:
        raise SystemExit(1)
