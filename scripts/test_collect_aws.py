import importlib.util
from pathlib import Path
import json
import subprocess
import tempfile
import unittest
from unittest.mock import Mock

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-aws.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class InventoryTests(unittest.TestCase):
    def test_metadata_does_not_infer_running_or_aws_permission(self):
        identity = {'instanceId': 'i-0123456789abcdef0', 'accountId': '000000000000', 'region': 'eu-west-1', 'instanceType': 't3.small'}
        runner = Mock(return_value=subprocess.CompletedProcess([], 0, json.dumps(identity)))
        result = collector.collect({'targets': [{'sshAlias': 'test-host', 'region': 'eu-west-1', 'label': 'Sample', 'services': [{'id': 'web'}]}]}, 'metadata', runner)
        self.assertEqual(result['instances'][0]['state'], 'unknown')
        self.assertEqual(result['instances'][0]['serviceIds'], ['web'])
        self.assertNotIn('security-credentials', runner.call_args.kwargs['input'])

    def test_wrong_region_and_failure_do_not_reuse_identity(self):
        runner = Mock(side_effect=OSError('private diagnostic'))
        result = collector.collect({'targets': [{'sshAlias': 'test-host', 'region': 'eu-west-1', 'label': 'Sample'}]}, 'metadata', runner)
        self.assertEqual(result['instances'], [])
        self.assertEqual(result['coverage'][0]['status'], 'unavailable')
        self.assertNotIn('private diagnostic', json.dumps(result))

    def test_api_refuses_wrong_account_before_inventory(self):
        runner = Mock(return_value=subprocess.CompletedProcess([], 0, '{"Account":"111111111111"}'))
        with self.assertRaises(ValueError):
            collector.collect({'expectedAccountId': '000000000000', 'regions': ['eu-west-1']}, 'api', runner)
        self.assertEqual(runner.call_count, 1)

    def test_partial_api_region_failure_is_visible(self):
        runner = Mock(side_effect=[subprocess.CompletedProcess([], 0, '{"Account":"000000000000"}'),
            subprocess.CompletedProcess([], 0, '{"Reservations":[]}'), OSError('unavailable')])
        result = collector.collect({'expectedAccountId': '000000000000', 'regions': ['eu-west-1', 'eu-west-2']}, 'api', runner)
        self.assertEqual([c['status'] for c in result['coverage']], ['available', 'unavailable'])

    def test_atomic_snapshot_replaces_previous(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'inventory.json'
            collector.write_snapshot(path, {'old': True})
            collector.write_snapshot(path, {'new': True})
            self.assertEqual(json.loads(path.read_text()), {'new': True})
            self.assertEqual(len(list(Path(folder).iterdir())), 1)


if __name__ == '__main__': unittest.main()
