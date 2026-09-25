"""Read explicitly configured Docker services, heartbeat JSON and TLS expiry.

This is an optional companion to collect-ssh.py. It never retrieves environment
variables, process arguments, Docker logs, trading positions or private keys.
"""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import socket
import ssl
import subprocess

REMOTE = r'''
import json, subprocess
from pathlib import Path
from datetime import datetime, timezone
config = json.loads(CONFIG_JSON)
now = datetime.now(timezone.utc).isoformat()
output = []
template = '{"image":{{json .Config.Image}},"imageId":{{json .Image}},"state":{{json .State.Status}},"restartCount":{{.RestartCount}},"startedAt":{{json .State.StartedAt}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}"not-configured"{{end}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}'
for service in config:
    result = {'id': service['id'], 'observedAt': now, 'containers': []}
    for name in service['containers']:
        container = {'name': name, 'image': 'unknown', 'state': 'unknown', 'health': 'unknown', 'restartCount': None, 'observedAt': now}
        try:
            response = subprocess.run(['docker', 'inspect', '--format', template, name], capture_output=True, text=True, timeout=8, check=True)
            if len(response.stdout) > 8192: raise ValueError('Oversized inspection')
            item = json.loads(response.stdout)
            container.update({key: item[key] for key in ('image', 'imageId', 'state', 'restartCount')})
            container['state'] = 'running' if item['state'] == 'running' else 'stopped'
            container['health'] = {'healthy': 'passing', 'unhealthy': 'failing', 'starting': 'starting', 'not-configured': 'not-configured'}.get(item['health'], 'unknown')
            if item.get('startedAt') and not item['startedAt'].startswith('0001'): container['startedAt'] = item['startedAt']
            if item.get('revision'): container['revision'] = item['revision']
        except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError): pass
        result['containers'].append(container)
    if service.get('heartbeatFile'):
        result['heartbeat'] = {'maxAgeSeconds': service.get('heartbeatMaxAgeSeconds', 300)}
        try:
            path = Path(service['heartbeatFile'])
            if path.stat().st_size > 4096: raise ValueError('Oversized heartbeat')
            heartbeat = json.loads(path.read_text())
            result['heartbeat']['lastSeenAt'] = heartbeat['observedAt']
        except (OSError, ValueError, KeyError, TypeError): pass
    output.append(result)
print(json.dumps(output))
'''


def validate_services(target):
    services = target.get('services', [])
    if not isinstance(services, list) or len(services) > 20:
        raise ValueError('Configure at most 20 services per host')
    for service in services:
        if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,39}', service.get('id', '')):
            raise ValueError('Invalid service ID')
        if not isinstance(service.get('name'), str) or not 1 <= len(service['name']) <= 120:
            raise ValueError('Invalid service name')
        if not re.fullmatch(r'component:[a-z0-9-]+/[a-z0-9-]+', service.get('entityRef', '')):
            raise ValueError('Invalid service entityRef')
        names = service.get('containers')
        if not isinstance(names, list) or not 1 <= len(names) <= 20 or any(not isinstance(n, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}', n) for n in names):
            raise ValueError('Configure explicit container names')
        heartbeat = service.get('heartbeatFile')
        if heartbeat is not None and (not isinstance(heartbeat, str) or not heartbeat.startswith(('/var/lib/', '/run/', '/opt/')) or '..' in Path(heartbeat).parts):
            raise ValueError('Heartbeat must be a dedicated JSON file in /var/lib, /run or /opt')
        age = service.get('heartbeatMaxAgeSeconds', 300)
        if type(age) is not int or not 1 <= age <= 86400:
            raise ValueError('Invalid heartbeat expiry')
        hostname = service.get('certificateHostname')
        if hostname is not None and (not isinstance(hostname, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]{0,251}[a-zA-Z0-9]', hostname)):
            raise ValueError('Invalid certificate hostname')
    if len({s['id'] for s in services}) != len(services):
        raise ValueError('Duplicate service IDs')
    return services


def timestamp(value):
    if not isinstance(value, str): return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.isoformat() if parsed.tzinfo else None
    except ValueError: return None


def collect_services(target, runner=subprocess.run):
    services = validate_services(target)
    if not services: return []
    now = datetime.now(timezone.utc).isoformat()
    program = REMOTE.replace('CONFIG_JSON', repr(json.dumps(services)))
    try:
        response = runner(['ssh', '-T', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=10', target['sshAlias'], 'python3', '-'], input=program, capture_output=True, text=True, timeout=60, check=True)
        if len(response.stdout) > 1024 * 1024: raise ValueError('Oversized response')
        rows = json.loads(response.stdout)
        if not isinstance(rows, list): raise ValueError('Expected service list')
    except (OSError, subprocess.SubprocessError, ValueError): rows = []
    output = []
    for service in services:
        row = next((r for r in rows if isinstance(r, dict) and r.get('id') == service['id']), {})
        # Treat malformed optional fields as absent evidence, preserving the rest
        # of the host collection instead of failing the whole snapshot.
        items = row.get('containers')
        if not isinstance(items, list): items = []
        containers = []
        for name in service['containers']:
            item = next((c for c in items if isinstance(c, dict) and c.get('name') == name), {})
            container = {'name': name, 'image': str(item.get('image', 'unknown'))[:300], 'state': item.get('state') if item.get('state') in ('running', 'stopped') else 'unknown', 'health': item.get('health') if item.get('health') in ('passing', 'failing', 'starting', 'not-configured') else 'unknown', 'restartCount': item.get('restartCount') if type(item.get('restartCount')) is int and item['restartCount'] >= 0 else None, 'observedAt': timestamp(item.get('observedAt')) or now}
            for key in ('imageId', 'revision'):
                value = item.get(key)
                pattern = r'(sha256:)?[a-f0-9]{7,64}' if key == 'imageId' else r'[a-f0-9]{7,64}'
                if isinstance(value, str) and re.fullmatch(pattern, value): container[key] = value
            started = timestamp(item.get('startedAt'))
            if started: container['startedAt'] = started
            containers.append(container)
        result = {'id': service['id'], 'name': service['name'], 'entityRef': service['entityRef'], 'host': target['label'], 'region': target['region'], 'environment': target['environment'], 'observedAt': timestamp(row.get('observedAt')) or now, 'containers': containers}
        if service.get('heartbeatFile'):
            result['heartbeat'] = {'maxAgeSeconds': service.get('heartbeatMaxAgeSeconds', 300)}
            heartbeat = row.get('heartbeat')
            last_seen = timestamp(heartbeat.get('lastSeenAt')) if isinstance(heartbeat, dict) else None
            if last_seen: result['heartbeat']['lastSeenAt'] = last_seen
        if service.get('certificateHostname'):
            hostname = service['certificateHostname']
            result['certificate'] = {'hostname': hostname, 'checkedAt': now}
            try:
                with socket.create_connection((hostname, 443), timeout=5) as connection:
                    with ssl.create_default_context().wrap_socket(connection, server_hostname=hostname) as secure:
                        cert = secure.getpeercert()
                        result['certificate']['expiresAt'] = datetime.fromtimestamp(ssl.cert_time_to_seconds(cert['notAfter']), timezone.utc).isoformat()
            except (OSError, ValueError, KeyError): pass
        output.append(result)
    return output
