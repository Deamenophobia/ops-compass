"""Collect a small, read-only Linux host snapshot using existing SSH configuration.

Only disk totals and container states leave the host. No env, logs, image names,
keys, or process arguments are collected. The portal never accepts SSH commands.
"""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import importlib.util

_service_spec = importlib.util.spec_from_file_location('collect_services', Path(__file__).with_name('collect-services.py'))
_service_module = importlib.util.module_from_spec(_service_spec)
_service_spec.loader.exec_module(_service_module)

REMOTE = r'''
import json, shutil, subprocess
from datetime import datetime, timezone
disk = shutil.disk_usage('/')
result = {'observedAt': datetime.now(timezone.utc).isoformat(), 'diskPercent': round(disk.used / disk.total * 100, 1)}
if CHECK_DOCKER:
    try:
        process = subprocess.run(['docker', 'ps', '-a', '--format', '{{.State}}|{{.Status}}'], capture_output=True, text=True, timeout=10, check=True)
        rows = [row.split('|', 1) for row in process.stdout.splitlines() if row]
        result['docker'] = {
            'total': len(rows),
            'running': sum(row[0] == 'running' for row in rows),
            'healthy': sum('(healthy)' in row[1] for row in rows),
            'unhealthy': sum('(unhealthy)' in row[1] for row in rows),
        }
    except (OSError, subprocess.SubprocessError):
        result['docker'] = None
print(json.dumps(result))
'''


def validate_target(target):
    """Validate configured aliases before they become SSH command arguments."""
    for key in ('id', 'sshAlias'):
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9-]{0,63}', target.get(key, '')):
            raise ValueError(f'Invalid {key}; use a configured SSH alias')
    if not re.fullmatch(r'(resource|component|system):[a-z0-9-]+/[a-z0-9-]+', target.get('entityRef', '')):
        raise ValueError('Invalid entityRef')
    for key, limit in (('label', 100), ('environment', 40), ('region', 40)):
        if not isinstance(target.get(key), str) or not 1 <= len(target[key]) <= limit:
            raise ValueError(f'Invalid {key}')
    if type(target.get('checkDocker', False)) is not bool:
        raise ValueError('checkDocker must be boolean')
    if type(target.get('minimumRunning', 1)) is not int or target.get('minimumRunning', 1) < 1:
        raise ValueError('minimumRunning must be a positive integer')


def observations(target, result, now):
    """Reduce collected facts to the portal contract; absence stays unknown."""
    base = {key: target[key] for key in ('entityRef', 'environment', 'region')}
    base['observedAt'] = result.get('observedAt', now)
    percent = result.get('diskPercent')
    valid_disk = type(percent) in (int, float) and 0 <= percent <= 100
    state = 'unknown' if not valid_disk else 'critical' if percent >= 90 else 'warning' if percent >= 80 else 'healthy'
    output = [{**base, 'id': target['id'].lower() + '-disk', 'label': target['label'] + ' / root disk', 'state': state,
               'summary': f'Root disk {percent}% used; warning at 80%, critical at 90%.' if valid_disk else 'Disk observation unavailable; check SSH access and the collector.'}]
    if target.get('checkDocker'):
        docker = result.get('docker')
        valid = isinstance(docker, dict) and all(type(docker.get(k)) is int and docker[k] >= 0 for k in ('total', 'running', 'healthy', 'unhealthy'))
        if valid:
            valid = docker['running'] <= docker['total'] and docker['healthy'] + docker['unhealthy'] <= docker['total']
        state, summary = 'unknown', 'Container observation unavailable; check Docker access and the collector.'
        if valid:
            summary = f"{docker['running']} running, {docker['healthy']} healthy, {docker['unhealthy']} unhealthy out of {docker['total']} observed containers. Minimum expected running: {target.get('minimumRunning', 1)}."
            if docker['unhealthy'] or docker['running'] < target.get('minimumRunning', 1) or docker['running'] < docker['total']:
                state = 'critical'
            elif docker['healthy'] < docker['running']:
                # A running process without a passing health check is not proof of readiness.
                state = 'unknown'
                summary += ' Some running containers lack a passing health check.'
            else:
                state = 'healthy'
        output.append({**base, 'id': target['id'].lower() + '-containers', 'label': target['label'] + ' / containers', 'state': state, 'summary': summary})
    return output


def collect(target, runner=subprocess.run):
    """Send only the fixed read-only program; omit raw SSH errors from snapshots."""
    validate_target(target)
    now = datetime.now(timezone.utc).isoformat()
    command = ['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', target['sshAlias'], 'python3', '-']
    try:
        response = runner(command, input=REMOTE.replace('CHECK_DOCKER', repr(target.get('checkDocker', False))),
                          capture_output=True, text=True, timeout=30, check=True)
        if len(response.stdout) > 1024 * 1024:
            raise ValueError('Collector output too large')
        result = json.loads(response.stdout)
        if not isinstance(result, dict):
            raise ValueError('Invalid collector output')
        timestamp = datetime.fromisoformat(result['observedAt'])
        if timestamp.tzinfo is None:
            raise ValueError('Missing timezone')
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        result = {}
    return observations(target, result, now)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    targets = json.loads(args.config.read_text(encoding='utf-8'))['targets']
    if not isinstance(targets, list) or not 1 <= len(targets) <= 20:
        raise ValueError('Configure 1 to 20 hosts')
    for target in targets:
        validate_target(target)
        _service_module.validate_services(target)
    if sum(len(target.get('services', [])) for target in targets) > 100:
        raise ValueError('Configure at most 100 services across all hosts')
    if len({t['id'].lower() for t in targets}) != len(targets):
        raise ValueError('Target IDs must be unique')
    results = [observation for target in targets for observation in collect(target)]
    services = [service for target in targets for service in _service_module.collect_services(target)]
    if len({s['id'] for s in services}) != len(services):
        raise ValueError('Service IDs must be unique across hosts')
    snapshot = {'schemaVersion': 1, 'source': 'ssh', 'observations': results, 'services': services}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = args.output.with_suffix(args.output.suffix + '.tmp')
    # Readers see either the complete previous collection or the complete new one.
    temporary.write_text(json.dumps(snapshot, indent=2) + '\n', encoding='utf-8')
    temporary.replace(args.output)
    print(f'Wrote {len(results)} observations; {sum(o["state"] == "unknown" for o in results)} unknown.')


if __name__ == '__main__':
    main()
