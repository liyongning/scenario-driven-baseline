"""维护工具回归：受控临时输入，不作为 Go 错误码事实来源，也不调用 Go。"""
import copy
import hashlib
import json
from pathlib import Path
import runpy
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent


class RefreshManifestsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / 'fixtures'
        self.archive = Path(self.temp.name) / 'archive'
        self.archive.mkdir()
        self.fixed = self.archive / 'controlled.go'
        self.fixed.write_text('// controlled maintenance input, not IDL authority\n')
        self.manifests = []
        for owner in ['SCN-PROTOCOL-CONTRACT-003']:
            folder = self.root / owner
            folder.mkdir(parents=True)
            manifest = json.loads((SOURCE.parent / owner / 'manifest.json').read_text())
            manifest['sources']['idlFiles'] = {'controlled.go': hashlib.sha256(self.fixed.read_bytes()).hexdigest()}
            # 旧整锁摘要故意失配，维护固定 Go 样例不得再要求 generated 来源与其同步。
            manifest['sources']['idlLockSha256'] = 'historical-lock-digest'
            manifest['sources']['generatedCompatibility']['source']['contractDigest'] = 'controlled-baseline-must-not-be-overwritten'
            file = folder / 'manifest.json'
            file.write_text(json.dumps(manifest))
            (folder / 'controlled.json').write_text('{"controlled":true}\n')
            self.manifests.append((file, copy.deepcopy(manifest)))
        for name in ['extract.go', 'reproduce.sh', 'refresh-manifests.py']:
            (self.root / SOURCE.name / name).write_bytes((SOURCE / name).read_bytes())

    def refresh(self):
        with patch('sys.argv', [str(SOURCE / 'refresh-manifests.py'), str(self.root), str(self.archive)]), \
                patch('subprocess.check_output', return_value='go version controlled-test-runtime\n'):
            runpy.run_path(str(SOURCE / 'refresh-manifests.py'), run_name='__main__')

    def test_refresh_accepts_metadata_change_preserves_baselines_and_checksums(self):
        self.refresh()
        for file, before in self.manifests:
            after = json.loads(file.read_text())
            self.assertNotIn('idlLockSha256', after['sources'])
            for field in ['idlCommit', 'idlFiles', 'generatedCompatibility']:
                self.assertEqual(after['sources'][field], before['sources'][field])
            self.assertEqual(after['sha256']['controlled.json'], hashlib.sha256((file.parent / 'controlled.json').read_bytes()).hexdigest())

    def test_fixed_go_source_drift_is_rejected_before_any_manifest_write(self):
        self.fixed.write_text('// changed controlled source\n')
        with self.assertRaisesRegex(ValueError, 'fixed IDL source mismatch: controlled.go'):
            self.refresh()
        for file, before in self.manifests:
            self.assertEqual(json.loads(file.read_text()), before)


if __name__ == '__main__':
    unittest.main()
