"""Run on a selected Linux host: immutable sandbox releases with verified rollback.

The only managed container is ops-compass-sandbox on localhost:18887. Existing
containers must carry our label; the tool never accepts arbitrary shell commands.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
import urllib.request

NAME = 'ops-compass-sandbox'
STATE = Path('/var/tmp/ops-compass-sandbox')
IMAGE = re.compile(r'(?:sha256:[a-f0-9]{64}|[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com/ops-compass-sandbox@sha256:[a-f0-9]{64})')


def docker(*args):
    return subprocess.run(['docker', *args], text=True, capture_output=True, check=True, timeout=180).stdout.strip()


def current():
    ids = docker('ps', '-aq', '--filter', f'name=^/{NAME}$')
    if not ids:
        return None
    value = json.loads(docker('inspect', ids))[0]
    if value['Name'] != '/' + NAME or value['Config'].get('Labels', {}).get('ops-compass.managed') != 'sandbox':
        raise ValueError('Refusing to change a container without the sandbox ownership label')
    return value


def verify(image, revision):
    for _ in range(20):
        try:
            running = current()
            with urllib.request.urlopen('http://127.0.0.1:18887/health', timeout=2) as response:
                result = json.loads(response.read(4096))
            if running and running['State']['Running'] and running['Config']['Image'] == image and result == {'service': NAME, 'revision': revision}:
                return
        except (OSError, ValueError):
            pass
        time.sleep(1)
    raise ValueError('Sandbox endpoint or image revision verification failed')


def install(image, revision):
    if not IMAGE.fullmatch(image) or not re.fullmatch(r'[a-f0-9]{40}', revision):
        raise ValueError('Use an immutable image and full 40-character source revision')
    # Pull/inspect before replacing the old container. A missing image leaves it intact.
    if not image.startswith('sha256:'):
        docker('pull', image)
    metadata = json.loads(docker('image', 'inspect', image))[0]
    labels = metadata['Config'].get('Labels', {})
    if labels.get('org.opencontainers.image.revision') != revision or labels.get('ops-compass.managed') != 'sandbox':
        raise ValueError('Image revision or ownership label mismatch')
    if current():
        docker('rm', '-f', NAME)
    docker('run', '-d', '--name', NAME, '--label', 'ops-compass.managed=sandbox',
           '--memory', '64m', '--cpus', '0.25', '--pids-limit', '32', '--read-only',
           '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--user', '65534:65534',
           '-p', '127.0.0.1:18887:8080', image)
    verify(image, revision)


def release(action, image=None, revision=None):
    STATE.mkdir(mode=0o700, exist_ok=True)
    if STATE.is_symlink() or STATE.stat().st_uid != os.getuid():
        raise ValueError('Unsafe sandbox state directory')
    with (STATE / 'release.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        statefile = STATE / 'release.json'
        state = json.loads(statefile.read_text()) if statefile.exists() else {}
        running = current()
        if action == 'status':
            return {'running': bool(running and running['State']['Running']), 'record': state}
        if action == 'remove':
            if running: docker('rm', '-f', NAME)
            state['active'] = None
        else:
            target = state.get('previous') if action == 'rollback' else {'image': image, 'revision': revision}
            if not target: raise ValueError('No verified previous release')
            previous = state.get('active')
            # Persist the intent before touching Docker. Recovery can inspect both releases.
            state['pending'] = target
            statefile.write_text(json.dumps(state), encoding='utf8')
            try:
                install(target['image'], target['revision'])
            except Exception:
                if previous:
                    install(previous['image'], previous['revision'])
                raise
            state = {'active': target, 'previous': previous, 'pending': None}
        state['verifiedAt'] = datetime.now(timezone.utc).isoformat()
        temporary = STATE / 'release.new.json'
        temporary.write_text(json.dumps(state, indent=2), encoding='utf8')
        temporary.replace(statefile)
        with (STATE / 'history.jsonl').open('a', encoding='utf8') as log:
            log.write(json.dumps({'action': action, **state}) + '\n')
        return state


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['deploy', 'rollback', 'status', 'remove'])
    parser.add_argument('--image')
    parser.add_argument('--revision')
    args = parser.parse_args()
    if args.action == 'deploy' and (not args.image or not args.revision):
        parser.error('deploy requires --image and --revision')
    print(json.dumps(release(args.action, args.image, args.revision)))
