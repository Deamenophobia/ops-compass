import importlib.util
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('services', Path(__file__).with_name('collect-services.py'))
services = importlib.util.module_from_spec(spec)
spec.loader.exec_module(services)
TARGET = {'sshAlias': 'test-host', 'label': 'Test host', 'environment': 'test', 'region': 'test', 'services': [{'id': 'worker', 'name': 'Worker', 'entityRef': 'component:default/worker', 'containers': ['worker'], 'heartbeatFile': '/run/worker/heartbeat.json'}]}

class ServiceCollectorTest(unittest.TestCase):
    def test_rejects_commands_and_unsafe_heartbeat_paths(self):
        for update in [{'containers': ['worker;reboot']}, {'heartbeatFile': '/etc/shadow'}, {'heartbeatFile': '/run/../etc/shadow'}]:
            with self.assertRaises(ValueError): services.validate_services({**TARGET, 'services': [{**TARGET['services'][0], **update}]})

    def test_failure_is_unknown_not_a_zero_restart_claim(self):
        def fail(*args, **kwargs): raise subprocess.CalledProcessError(1, 'ssh', stderr='private error')
        result = services.collect_services(TARGET, fail)
        self.assertEqual(result[0]['containers'][0]['state'], 'unknown')
        self.assertIsNone(result[0]['containers'][0]['restartCount'])
        self.assertNotIn('lastSeenAt', result[0]['heartbeat'])
        self.assertNotIn('private error', json.dumps(result))

    def test_collects_only_fixed_inspection_fields(self):
        def runner(command, **kwargs):
            self.assertEqual(command[-2:], ['python3', '-'])
            self.assertIn('StrictHostKeyChecking=yes', command)
            self.assertNotIn('.Config.Env', kwargs['input'])
            return SimpleNamespace(stdout=json.dumps([{'id': 'worker', 'observedAt': '2026-09-25T00:00:00Z', 'containers': [{'name': 'worker', 'image': 'worker:1', 'state': 'running', 'health': 'passing', 'restartCount': 2, 'observedAt': '2026-09-25T00:00:00Z', 'revision': 'abcdef1234567'}], 'heartbeat': {'lastSeenAt': 'invalid'}}]))
        result = services.collect_services(TARGET, runner)
        self.assertEqual(result[0]['containers'][0]['restartCount'], 2)
        self.assertNotIn('lastSeenAt', result[0]['heartbeat'])

    def test_malformed_optional_fields_remain_unknown(self):
        result = services.collect_services(TARGET, lambda *args, **kwargs: SimpleNamespace(stdout=json.dumps([{'id': 'worker', 'containers': None, 'heartbeat': []}])))
        self.assertEqual(result[0]['containers'][0]['health'], 'unknown')
        self.assertNotIn('lastSeenAt', result[0]['heartbeat'])

if __name__ == '__main__': unittest.main()
