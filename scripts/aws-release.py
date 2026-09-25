"""Dispatch the fixed sandbox SSM document to ONE explicitly configured instance."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import time


def invoke(arguments):
    result = subprocess.run(['aws', *arguments, '--output', 'json'], text=True, capture_output=True, timeout=60, check=True)
    return json.loads(result.stdout)


def deploy(config, action, digest, revision):
    if action not in ('deploy', 'rollback', 'status') or not re.fullmatch(r'[a-f0-9]{64}', digest) or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Invalid release parameters')
    account, region, instance = config['accountId'], config['region'], config['instanceId']
    if not re.fullmatch(r'\d{12}', account) or not re.fullmatch(r'i-[a-f0-9]{17}', instance) or not re.fullmatch(r'[a-z]{2}(-[a-z]+)+-\d', region):
        raise ValueError('Invalid target identity')
    if invoke(['sts', 'get-caller-identity'])['Account'] != account:
        raise ValueError('AWS account mismatch')
    target = invoke(['ec2', 'describe-instances', '--region', region, '--instance-ids', instance])['Reservations'][0]['Instances'][0]
    if not any(t['Key'] == 'OpsCompassSandbox' and t['Value'] == 'true' for t in target.get('Tags', [])):
        raise ValueError('Target is not explicitly tagged for this sandbox')
    command = invoke(['ssm', 'send-command', '--region', region, '--instance-ids', instance,
        '--document-name', 'OpsCompass-SandboxRelease', '--document-version', str(config['documentVersion']),
        '--parameters', json.dumps({'Action': [action], 'ImageDigest': [digest], 'SourceRevision': [revision]}),
        '--timeout-seconds', '600', '--comment', 'Ops Compass isolated sandbox release'])['Command']['CommandId']
    for _ in range(130):
        time.sleep(5)
        try:
            result = invoke(['ssm', 'get-command-invocation', '--region', region, '--command-id', command, '--instance-id', instance])
        except subprocess.CalledProcessError:
            # SSM command visibility is eventually consistent; never dispatch again.
            continue
        if result['Status'] in ['Pending', 'InProgress', 'Delayed']: continue
        if result['Status'] != 'Success': raise RuntimeError('Sandbox command failed; inspect its recorded command ID: ' + command)
        # Rollback resolves the previous release on the host. Never report the
        # requested parameters as evidence of what is actually running.
        try:
            observed = json.loads(result['StandardOutputContent'].strip().splitlines()[-1])
            active = (observed.get('record', {}) if action == 'status' else observed).get('active')
            if active is not None and (not isinstance(active, dict) or not re.fullmatch(r'[a-f0-9]{40}', active.get('revision', ''))):
                raise ValueError('Invalid active release')
            if action == 'deploy' and (not active or active['revision'] != revision or not active.get('image', '').endswith('@sha256:' + digest)):
                raise ValueError('Deployed release mismatch')
            if action == 'rollback' and not active:
                raise ValueError('Rollback returned no active release')
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise RuntimeError('Command succeeded but release evidence is invalid; inspect command ID: ' + command) from error
        return {'commandId': command, 'status': result['Status'], 'action': action,
                'requestedRelease': {'revision': revision, 'imageDigest': digest},
                'observedRelease': observed}
    raise TimeoutError('Command outcome unknown; inspect command ID before retrying: ' + command)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['deploy', 'rollback', 'status'])
    parser.add_argument('--config', required=True)
    parser.add_argument('--digest', required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    if Path(args.output).exists(): parser.error('Choose a new output file for the delivery record')
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    result = deploy(json.loads(Path(args.config).read_text(encoding='utf-8-sig')), args.action, args.digest, args.revision)
    with Path(args.output).open('x', encoding='utf8') as handle: json.dump(result, handle, indent=2)
    print('Sandbox command succeeded; private delivery record saved.')
