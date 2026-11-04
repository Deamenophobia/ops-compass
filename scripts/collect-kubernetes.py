"""Explicit, read-only Kubernetes collection. No kubeconfig exec plugins or shell commands."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import ssl
import tempfile
import urllib.error
import urllib.parse
import urllib.request

MAX_BYTES = 1024 * 1024
NAME = r'[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('Redirect refused')


def secure_url(value):
    if not isinstance(value, str) or re.search(r'[\x00-\x20]', value):
        raise ValueError('Invalid URL')
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.query or url.fragment:
        raise ValueError('Use an HTTPS origin without credentials or query')
    return url


def validate(config):
    clusters, targets = config['clusters'], config['targets']
    if not isinstance(clusters, list) or not 1 <= len(clusters) <= 20 or not isinstance(targets, list) or not 1 <= len(targets) <= 20:
        raise ValueError('Configure 1–20 clusters and targets')
    names, keys = set(), set()
    for cluster in clusters:
        if not re.fullmatch(NAME, cluster['name']) or cluster['name'] in names:
            raise ValueError('Invalid or duplicate cluster')
        names.add(cluster['name'])
        if secure_url(cluster['url']).path not in ('', '/'):
            raise ValueError('Cluster URL must be an origin')
        if not isinstance(cluster['tokenFile'], str) or not cluster['tokenFile']:
            raise ValueError('A private token file is required')
    for target in targets:
        if target['cluster'] not in names or not re.fullmatch(NAME, target['namespace']):
            raise ValueError('Invalid target')
        if not re.fullmatch(r'component:[a-z0-9_-]+/[a-z0-9_.-]+', target['entityRef']) or len(target['entityRef']) > 200:
            raise ValueError('Use a component catalog reference')
        selector = target['selector']
        if not isinstance(selector, str) or not 1 <= len(selector) <= 250 or re.search(r'[\x00-\x1f]', selector):
            raise ValueError('An explicit label selector is required')
        if target.get('dashboardUrl'):
            secure_url(target['dashboardUrl'])
        key = (target['cluster'], target['namespace'], target['entityRef'])
        if key in keys:
            raise ValueError('Duplicate target')
        keys.add(key)


def request_json(cluster, path, query):
    with open(cluster['tokenFile'], encoding='utf-8') as file:
        token = file.read(16385).strip()
    if not 1 <= len(token) <= 16384 or not re.fullmatch(r'[A-Za-z0-9._~+/-]+=*', token):
        raise ValueError('Invalid token file')
    context = ssl.create_default_context(cafile=cluster.get('caFile'))
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}),
        urllib.request.HTTPSHandler(context=context), NoRedirect())
    request = urllib.request.Request(cluster['url'].rstrip('/') + path + '?' + urllib.parse.urlencode(query),
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'}, method='GET')
    with opener.open(request, timeout=5) as response:
        raw = response.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError('Response too large')
    return json.loads(raw)


def listing(cluster, path, query, fetch):
    try:
        data = fetch(cluster, path, {**query, 'limit': '101'})
        items = data['items']
        if not isinstance(items, list):
            raise ValueError('Expected a resource list')
        if len(items) > 100 or data.get('metadata', {}).get('continue'):
            return [], 'limit'
        return items, 'available'
    except urllib.error.HTTPError as error:
        return [], 'unauthorized' if error.code == 401 else 'forbidden' if error.code == 403 else 'unavailable'
    except urllib.error.URLError as error:
        return [], 'tls-error' if isinstance(error.reason, ssl.SSLCertVerificationError) else 'unavailable'
    except ssl.SSLCertVerificationError:
        return [], 'tls-error'
    except (OSError, TimeoutError):
        return [], 'unavailable'
    except (ValueError, KeyError, TypeError, AttributeError):
        return [], 'invalid'


def integer(value):
    if type(value) is not int or not 0 <= value <= 1000000:
        raise ValueError('Invalid count')
    return value


def deployment(item):
    status, spec = item.get('status', {}), item['spec']
    return {'name': item['metadata']['name'], 'desired': integer(spec.get('replicas', 1)),
        'ready': integer(status.get('readyReplicas', 0)), 'available': integer(status.get('availableReplicas', 0)),
        'updated': integer(status.get('updatedReplicas', 0)), 'generation': integer(item['metadata']['generation']),
        'observedGeneration': integer(status['observedGeneration']) if 'observedGeneration' in status else None,
        'paused': spec.get('paused', False) is True,
        'failed': any(c.get('type') == 'ReplicaFailure' and c.get('status') == 'True' or
            c.get('type') == 'Progressing' and c.get('status') == 'False' for c in status.get('conditions', []))}


def pod(item):
    status = item.get('status', {})
    ready = next((c.get('status') for c in status.get('conditions', []) if c.get('type') == 'Ready'), None)
    statuses = status.get('containerStatuses', []) + status.get('initContainerStatuses', [])
    return {'name': item['metadata']['name'], 'phase': status.get('phase', 'Unknown'),
        'ready': True if ready == 'True' else False if ready == 'False' else None,
        'restarts': sum(integer(c['restartCount']) for c in statuses) if statuses else None,
        'terminating': bool(item['metadata'].get('deletionTimestamp'))}


def collect(config, fetch=request_json):
    validate(config)  # Validate every target before any network request.
    started = datetime.now(timezone.utc).isoformat()
    targets = []
    for target in config['targets']:
        cluster = next(c for c in config['clusters'] if c['name'] == target['cluster'])
        namespace = urllib.parse.quote(target['namespace'], safe='')
        result = {key: target[key] for key in ('cluster', 'namespace', 'entityRef', 'selector')}
        if target.get('dashboardUrl'):
            result['dashboardUrl'] = target['dashboardUrl']
        result.update({'coverage': {}, 'deployments': [], 'pods': [], 'warnings': []})
        uids = set()
        for kind, prefix, parse in [('deployments', '/apis/apps/v1', deployment), ('pods', '/api/v1', pod)]:
            items, state = listing(cluster, f'{prefix}/namespaces/{namespace}/{kind}', {'labelSelector': target['selector']}, fetch)
            try:
                result[kind] = [parse(item) for item in items]
                selected_uids = [item['metadata']['uid'] for item in items]
                if any(not isinstance(uid, str) or not uid for uid in selected_uids):
                    raise ValueError('Invalid resource UID')
                uids.update(selected_uids)
            except (KeyError, TypeError, ValueError, AttributeError):
                result[kind], state = [], 'invalid'
            result['coverage'][kind] = state
        items, state = listing(cluster, f'/api/v1/namespaces/{namespace}/events', {'fieldSelector': 'type=Warning'}, fetch)
        try:
            result['warnings'] = [{'object': e['involvedObject']['kind'] + '/' + e['involvedObject']['name'],
                'reason': e.get('reason', '')[:100], 'count': integer(e.get('series', {}).get('count', e.get('count', 1))),
                'lastSeen': e.get('series', {}).get('lastObservedTime') or e.get('lastTimestamp') or e.get('eventTime') or e.get('metadata', {}).get('creationTimestamp')}
                for e in items if e.get('involvedObject', {}).get('uid') in uids and e.get('type') == 'Warning']
        except (KeyError, TypeError, ValueError, AttributeError):
            result['warnings'], state = [], 'invalid'
        result['coverage']['events'] = state
        targets.append(result)
    return {'schemaVersion': 1, 'source': 'kubernetes-api',
        'collectedAt': started, 'targets': targets}


def write_snapshot(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(data, indent=2).encode('utf-8')
    if len(raw) > 4 * MAX_BYTES:
        raise ValueError('Snapshot too large')
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as file:
            temporary = file.name
            file.write(raw)
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
    finally:
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        config_path = Path(args.config).resolve()
        output_path = Path(args.output).resolve()
        config = json.loads(config_path.read_text(encoding='utf-8'))
        validate(config)
        # Never replace a supplied config, credential, or CA with a snapshot.
        inputs = {config_path} | {Path(c[k]).resolve() for c in config['clusters'] for k in ('tokenFile', 'caFile') if c.get(k)}
        if output_path in inputs:
            raise ValueError('Output overlaps an input')
        data = collect(config)
        write_snapshot(output_path, data)
        failed = any(v != 'available' for t in data['targets'] for v in t['coverage'].values())
        print('Snapshot saved; some resource collections failed.' if failed else 'Snapshot saved. Application health requires separate checks.')
        raise SystemExit(2 if failed else 0)
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        raise SystemExit('Collection failed. Check the private config, credentials, certificates, and output path.') from None
