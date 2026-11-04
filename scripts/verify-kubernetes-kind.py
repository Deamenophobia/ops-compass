"""Opt-in integration rehearsal: create and remove one disposable LOCAL kind cluster.

Requires Docker, kind, kubectl and network access for public container images.
Never reads the default kubeconfig. Credentials and evidence stay under private/.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', default='kind')
    parser.add_argument('--kubectl', default='kubectl')
    parser.add_argument('--docker', default='docker')
    parser.add_argument('--docker-context', default='desktop-linux' if os.name == 'nt' else 'default')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    env = {key: value for key, value in os.environ.items()
           if key not in ('KUBECONFIG', 'DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH')}
    env.update(DOCKER_CONTEXT=args.docker_context, KIND_EXPERIMENTAL_PROVIDER='docker')
    if Path(args.docker).is_absolute():
        env['PATH'] = str(Path(args.docker).parent) + os.pathsep + env.get('PATH', '')

    def run(command, timeout=60, input_text=None):
        result = subprocess.run(command, input=input_text, capture_output=True, text=True,
                                timeout=timeout, env=env)
        if result.returncode:
            # Raw tool output may include credential/configuration details.
            raise RuntimeError(f'{Path(command[0]).name} failed (exit {result.returncode}); no credential output printed')
        return result.stdout

    context = json.loads(run([args.docker, 'context', 'inspect', args.docker_context]))[0]
    host = context['Endpoints']['docker']['Host']
    if not host.startswith(('unix://', 'npipe://')):
        raise ValueError('Refusing a non-local Docker endpoint')
    try:
        engine = json.loads(run([args.docker, '--context', args.docker_context, 'info', '--format', '{{json .}}']))
        if not engine.get('ServerVersion') or engine.get('OSType') != 'linux':
            raise RuntimeError('A responding Linux container engine is required')
    except (RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        raise RuntimeError('Local Docker engine unavailable. Enable the local runtime before this rehearsal.') from error

    (root / 'private').mkdir(exist_ok=True)
    output = Path(tempfile.mkdtemp(prefix='kind-check-', dir=root / 'private'))
    kubeconfig = output / 'kubeconfig'
    name = 'ops-check-' + uuid.uuid4().hex[:10]
    config = output / 'kind.json'
    config.write_text(json.dumps({'kind': 'Cluster', 'apiVersion': 'kind.x-k8s.io/v1alpha4',
                                 'networking': {'apiServerAddress': '127.0.0.1'}}), encoding='utf8')

    def kubectl(*argv, body=None):
        return run([args.kubectl, '--kubeconfig', str(kubeconfig), '--request-timeout=30s', *argv],
                   timeout=180, input_text=json.dumps(body) if body is not None else None)

    def apply(body):
        kubectl('apply', '-f', '-', body=body)

    def resource(kind, resource_name, spec=None, api='v1', namespaced=True):
        return {'apiVersion': api, 'kind': kind,
                'metadata': {'name': resource_name, **({'namespace': 'observations'} if namespaced else {})},
                **(spec or {})}

    def collect(expected_exit):
        result = subprocess.run([sys.executable, str(root / 'scripts/collect-kubernetes.py'),
                                 '--config', str(output / 'collector.json'), '--output', str(output / 'snapshot.json')],
                                capture_output=True, text=True, timeout=45, env=env)
        if result.returncode != expected_exit:
            raise AssertionError(f'Collector exit {result.returncode}, expected {expected_exit}')
        return json.loads((output / 'snapshot.json').read_text(encoding='utf8'))['targets'][0]

    completed = []
    attempted = False
    try:
        # The generated name and explicit kubeconfig are owned solely by this run.
        attempted = True
        run([args.kind, 'create', 'cluster', '--name', name, '--kubeconfig', str(kubeconfig),
             '--config', str(config), '--wait', '120s'], timeout=300)
        apply(resource('Namespace', 'observations', namespaced=False))
        apply(resource('ServiceAccount', 'collector'))
        role = resource('Role', 'collector', {'rules': [
            {'apiGroups': [''], 'resources': ['pods', 'events'], 'verbs': ['get', 'list']},
            {'apiGroups': ['apps'], 'resources': ['deployments'], 'verbs': ['get', 'list']},
        ]}, api='rbac.authorization.k8s.io/v1')
        apply(role)
        apply(resource('RoleBinding', 'collector', {
            'subjects': [{'kind': 'ServiceAccount', 'name': 'collector', 'namespace': 'observations'}],
            'roleRef': {'apiGroup': 'rbac.authorization.k8s.io', 'kind': 'Role', 'name': 'collector'},
        }, api='rbac.authorization.k8s.io/v1'))
        deployment = resource('Deployment', 'sample-api', {'spec': {
            'replicas': 1, 'selector': {'matchLabels': {'app': 'sample-api'}},
            'template': {'metadata': {'labels': {'app': 'sample-api'}}, 'spec': {
                'containers': [{'name': 'sample', 'image': 'registry.k8s.io/pause:3.10'}]}}}}, api='apps/v1')
        deployment['metadata']['labels'] = {'app': 'sample-api'}
        apply(deployment)
        kubectl('-n', 'observations', 'rollout', 'status', 'deployment/sample-api', '--timeout=120s')
        pod = json.loads(kubectl('-n', 'observations', 'get', 'pods', '-l', 'app=sample-api', '-o', 'json'))['items'][0]
        apply(resource('Event', 'synthetic-warning', {
            'type': 'Warning', 'reason': 'SyntheticRehearsal', 'message': 'Synthetic rehearsal event', 'count': 1,
            'involvedObject': {'apiVersion': 'v1', 'kind': 'Pod', 'name': pod['metadata']['name'],
                               'namespace': 'observations', 'uid': pod['metadata']['uid']},
        }))
        connection = json.loads(kubectl('config', 'view', '--raw', '--minify', '-o', 'json'))['clusters'][0]['cluster']
        (output / 'ca.pem').write_bytes(base64.b64decode(connection['certificate-authority-data']))
        token_file = output / 'token'
        token = kubectl('-n', 'observations', 'create', 'token', 'collector', '--duration=1h').strip()
        token_file.write_text(token, encoding='utf8')
        if os.name != 'nt':
            token_file.chmod(0o600)
            kubeconfig.chmod(0o600)
        collector = {'clusters': [{'name': 'local-kind', 'url': connection['server'],
                                   'tokenFile': str(token_file), 'caFile': str(output / 'ca.pem')}],
                     'targets': [{'cluster': 'local-kind', 'namespace': 'observations',
                                  'entityRef': 'component:default/sample-api', 'selector': 'app=sample-api'}]}
        def save_config():
            (output / 'collector.json').write_text(json.dumps(collector), encoding='utf8')
        save_config()
        target = collect(0)
        assert set(target['coverage'].values()) == {'available'}
        assert target['deployments'][0]['ready'] == 1 and target['pods'][0]['ready']
        assert any(item['reason'] == 'SyntheticRehearsal' for item in target['warnings'])
        completed.append('Trusted TLS, deployment/pod readiness and warning events')
        role['rules'][0]['resources'] = ['pods']
        apply(role)
        assert collect(2)['coverage']['events'] == 'forbidden'
        completed.append('Namespace RBAC denial remains partial coverage')
        token_file.write_text('invalid-token', encoding='utf8')
        assert set(collect(2)['coverage'].values()) == {'unauthorized'}
        completed.append('Rejected token classified as unauthorized')
        token_file.write_text(token, encoding='utf8')
        collector['clusters'][0].pop('caFile')
        save_config()
        assert set(collect(2)['coverage'].values()) == {'tls-error'}
        completed.append('Untrusted CA rejected without bypassing TLS')
        (output / 'result.json').write_text(json.dumps({'passed': True, 'completed': completed}, indent=2), encoding='utf8')
        print(json.dumps({'passed': True, 'completed': completed, 'output': str(output)}, indent=2))
    finally:
        if attempted:
            try:
                run([args.kind, 'delete', 'cluster', '--name', name, '--kubeconfig', str(kubeconfig)], timeout=120)
            except (RuntimeError, subprocess.TimeoutExpired):
                print(f'Cleanup could not be verified: kind delete cluster --name {name} --kubeconfig {kubeconfig}', file=sys.stderr)
                raise


if __name__ == '__main__':
    main()
