import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release', Path(__file__).with_name('aws-release.py'))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
CONFIG = {'accountId': '000000000000', 'region': 'eu-west-1', 'instanceId': 'i-0123456789abcdef0', 'documentVersion': '1'}
ACTIVE = {'image': '000000000000.dkr.ecr.eu-west-1.amazonaws.com/ops-compass-sandbox@sha256:' + 'a' * 64, 'revision': 'b' * 40}


class AwsReleaseTests(unittest.TestCase):
    def test_invalid_digest_never_contacts_aws(self):
        with patch.object(release, 'invoke') as invoke:
            with self.assertRaises(ValueError): release.deploy(CONFIG, 'deploy', 'latest', 'a' * 40)
            invoke.assert_not_called()

    def test_wrong_account_cannot_dispatch(self):
        with patch.object(release, 'invoke', return_value={'Account': '111111111111'}) as invoke:
            with self.assertRaises(ValueError): release.deploy(CONFIG, 'deploy', 'a' * 64, 'b' * 40)
            self.assertEqual(invoke.call_count, 1)

    def test_untagged_instance_cannot_dispatch(self):
        with patch.object(release, 'invoke', side_effect=[{'Account': CONFIG['accountId']}, {'Reservations': [{'Instances': [{'Tags': []}]}]}]) as invoke:
            with self.assertRaises(ValueError): release.deploy(CONFIG, 'deploy', 'a' * 64, 'b' * 40)
            self.assertEqual(invoke.call_count, 2)

    def test_one_command_to_exact_instance_and_document_version(self):
        with patch.object(release.time, 'sleep'), patch.object(release, 'invoke', side_effect=[
            {'Account': CONFIG['accountId']}, {'Reservations': [{'Instances': [{'Tags': [{'Key': 'OpsCompassSandbox', 'Value': 'true'}]}]}]},
            {'Command': {'CommandId': 'test-command'}}, {'Status': 'InProgress'}, {'Status': 'Success', 'StandardOutputContent': json.dumps({'active': ACTIVE})},
        ]) as invoke:
            result = release.deploy(CONFIG, 'deploy', 'a' * 64, 'b' * 40)
            sends = [c.args[0] for c in invoke.call_args_list if c.args[0][:2] == ['ssm', 'send-command']]
            self.assertEqual(len(sends), 1)
            self.assertIn(CONFIG['instanceId'], sends[0])
            self.assertIn('OpsCompass-SandboxRelease', sends[0])
            self.assertEqual(result['status'], 'Success')
            self.assertEqual(result['observedRelease']['active'], ACTIVE)

    def test_rollback_records_actual_previous_revision(self):
        with patch.object(release.time, 'sleep'), patch.object(release, 'invoke', side_effect=[
            {'Account': CONFIG['accountId']}, {'Reservations': [{'Instances': [{'Tags': [{'Key': 'OpsCompassSandbox', 'Value': 'true'}]}]}]},
            {'Command': {'CommandId': 'rollback-command'}}, {'Status': 'Success', 'StandardOutputContent': 'Login Succeeded\n' + json.dumps({'active': ACTIVE})},
        ]):
            result = release.deploy(CONFIG, 'rollback', 'c' * 64, 'd' * 40)
            self.assertEqual(result['observedRelease']['active']['revision'], 'b' * 40)
            self.assertEqual(result['requestedRelease']['revision'], 'd' * 40)

    def test_success_without_evidence_is_not_a_verified_release(self):
        with patch.object(release.time, 'sleep'), patch.object(release, 'invoke', side_effect=[
            {'Account': CONFIG['accountId']}, {'Reservations': [{'Instances': [{'Tags': [{'Key': 'OpsCompassSandbox', 'Value': 'true'}]}]}]},
            {'Command': {'CommandId': 'unknown-command'}}, {'Status': 'Success', 'StandardOutputContent': ''},
        ]):
            with self.assertRaisesRegex(RuntimeError, 'unknown-command'):
                release.deploy(CONFIG, 'deploy', 'a' * 64, 'b' * 40)


if __name__ == '__main__': unittest.main()
