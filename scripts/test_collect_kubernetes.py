import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
import urllib.error
import ssl

spec = importlib.util.spec_from_file_location('collector', Path(__file__).with_name('collect-kubernetes.py'))
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class KubernetesTests(unittest.TestCase):
    def setUp(self):
        self.config = {'clusters': [{'name': 'test', 'url': 'https://cluster.example.test', 'tokenFile': 'unused'}],
            'targets': [{'cluster': 'test', 'namespace': 'apps', 'entityRef': 'component:default/api', 'selector': 'app=api'}]}

    def fetch(self, cluster, path, query):
        self.assertEqual(query['limit'], '101')
        if path.endswith('deployments'):
            return {'items': [{'metadata': {'name': 'api', 'uid': 'deployment-uid', 'generation': 2}, 'spec': {'replicas': 2, 'template': {'secrets': 'PRIVATE-CANARY'}},
                'status': {'readyReplicas': 1, 'availableReplicas': 1, 'updatedReplicas': 2, 'observedGeneration': 2}}]}
        if path.endswith('pods'):
            self.assertEqual(query['labelSelector'], 'app=api')
            return {'items': [{'metadata': {'name': 'api-pod', 'uid': 'pod-uid'}, 'spec': {'env': 'PRIVATE-CANARY'},
                'status': {'phase': 'Running', 'conditions': [{'type': 'Ready', 'status': 'False'}], 'containerStatuses': [{'restartCount': 3}]}}]}
        self.assertEqual(query['fieldSelector'], 'type=Warning')
        return {'items': [{'type': 'Warning', 'involvedObject': {'uid': 'pod-uid', 'name': 'api-pod', 'kind': 'Pod'}, 'reason': 'BackOff', 'message': 'PRIVATE-CANARY', 'count': 3},
            {'type': 'Warning', 'involvedObject': {'uid': 'other'}, 'message': 'PRIVATE-CANARY'}]}

    def test_selected_fields_and_scope(self):
        result = collector.collect(self.config, self.fetch)
        target = result['targets'][0]
        self.assertFalse(target['pods'][0]['ready'])
        self.assertEqual(target['pods'][0]['restarts'], 3)
        self.assertEqual(len(target['warnings']), 1)
        self.assertNotIn('PRIVATE-CANARY', json.dumps(result))
        self.assertNotIn('tokenFile', json.dumps(result))

    def test_failure_coverage_and_limits(self):
        def partial(cluster, path, query):
            if path.endswith('events'):
                raise urllib.error.HTTPError('private', 403, 'PRIVATE-CANARY', {}, None)
            return self.fetch(cluster, path, query)
        target = collector.collect(self.config, partial)['targets'][0]
        self.assertEqual(target['coverage']['events'], 'forbidden')
        self.assertEqual(len(target['pods']), 1)
        for reply, expected in [({'items': [], 'metadata': {'continue': 'next'}}, 'limit'), ({'items': [{}] * 101}, 'limit'), ({'items': [{}]}, 'invalid'), ({'items': [None]}, 'invalid'), ({'items': [], 'metadata': None}, 'invalid')]:
            target = collector.collect(self.config, lambda *args: reply)['targets'][0]
            self.assertEqual(target['coverage']['pods'], expected)
            self.assertEqual(target['pods'], [])

    def test_config_rejected_before_requests(self):
        for url in ['http://example.test', 'https://user:password@example.test', 'https://example.test/api', 'https://example.test/?token=private']:
            config = copy.deepcopy(self.config)
            config['clusters'][0]['url'] = url
            with self.assertRaises(ValueError):
                collector.collect(config, lambda *args: self.fail('Unexpected request'))
        self.config['targets'].append(copy.deepcopy(self.config['targets'][0]))
        with self.assertRaises(ValueError):
            collector.collect(self.config, lambda *args: self.fail('Unexpected request'))

    def test_transport_diagnostics_do_not_disclose_raw_errors(self):
        for error, expected in [
            (urllib.error.HTTPError('private', 401, 'PRIVATE-CANARY', {}, None), 'unauthorized'),
            (urllib.error.HTTPError('private', 403, 'PRIVATE-CANARY', {}, None), 'forbidden'),
            (urllib.error.URLError(ssl.SSLCertVerificationError('PRIVATE-CANARY')), 'tls-error'),
            (urllib.error.URLError('PRIVATE-CANARY'), 'unavailable')]:
            def fail(*args):
                raise error
            result = collector.collect(self.config, fail)
            self.assertEqual(result['targets'][0]['coverage']['pods'], expected)
            self.assertNotIn('PRIVATE-CANARY', json.dumps(result))

    def test_transport_and_atomic_file(self):
        with tempfile.TemporaryDirectory() as directory:
            token = Path(directory) / 'token.txt'
            token.write_text('synthetic-token')
            cluster = {**self.config['clusters'][0], 'tokenFile': str(token)}
            response = MagicMock()
            response.__enter__.return_value.read.return_value = b'{"items": []}'
            opener = MagicMock()
            opener.open.return_value = response
            with patch.object(collector.urllib.request, 'build_opener', return_value=opener):
                collector.request_json(cluster, '/api/v1/namespaces/apps/pods', {'labelSelector': 'app=api'})
            request = opener.open.call_args.args[0]
            self.assertEqual(request.get_method(), 'GET')
            self.assertEqual(opener.open.call_args.kwargs['timeout'], 5)
            self.assertEqual(response.__enter__.return_value.read.call_args.args[0], collector.MAX_BYTES + 1)
            with self.assertRaises(ValueError):
                collector.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.test')
            file = Path(directory) / 'snapshot.json'
            collector.write_snapshot(file, {'example': True})
            self.assertEqual(json.loads(file.read_text()), {'example': True})


if __name__ == '__main__':
    unittest.main()
