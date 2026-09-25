import importlib.util
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-ssh.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)
TARGET = {'id': 'sample', 'sshAlias': 'sample-host', 'entityRef': 'resource:default/sample-host', 'label': 'Sample host', 'environment': 'demo', 'region': 'eu-west-1', 'checkDocker': True, 'minimumRunning': 2}
NOW = '2026-09-25T00:00:00+00:00'


class CollectorTest(unittest.TestCase):
    def test_disk_thresholds(self):
        for percent, expected in [(79, 'healthy'), (80, 'warning'), (90, 'critical'), (None, 'unknown'), (float('nan'), 'unknown')]:
            self.assertEqual(collector.observations(TARGET, {'diskPercent': percent}, NOW)[0]['state'], expected)

    def test_running_without_healthcheck_is_unknown(self):
        result = collector.observations(TARGET, {'docker': {'total': 2, 'running': 2, 'healthy': 0, 'unhealthy': 0}}, NOW)
        self.assertEqual(result[1]['state'], 'unknown')

    def test_missing_expected_container_is_critical(self):
        result = collector.observations(TARGET, {'docker': {'total': 1, 'running': 1, 'healthy': 1, 'unhealthy': 0}}, NOW)
        self.assertEqual(result[1]['state'], 'critical')

    def test_ssh_failure_reports_unknown_without_stderr(self):
        def fail(*args, **kwargs):
            raise subprocess.CalledProcessError(255, 'ssh', stderr='private details')
        output = collector.collect(TARGET, fail)
        self.assertTrue(all(o['state'] == 'unknown' for o in output))
        self.assertNotIn('private details', json.dumps(output))

    def test_success_uses_fixed_command_and_preserves_observation_time(self):
        def run(command, **kwargs):
            self.assertEqual(command[-3:], ['sample-host', 'python3', '-'])
            self.assertIn('StrictHostKeyChecking=yes', command)
            self.assertNotIn('shell', kwargs)
            return SimpleNamespace(stdout=json.dumps({'diskPercent': 40, 'observedAt': NOW}))
        self.assertEqual(collector.collect(TARGET, run)[0]['observedAt'], NOW)

    def test_rejects_ssh_option_injection(self):
        with self.assertRaises(ValueError):
            collector.collect({**TARGET, 'sshAlias': '-oProxyCommand=bad'})


if __name__ == '__main__':
    unittest.main()
