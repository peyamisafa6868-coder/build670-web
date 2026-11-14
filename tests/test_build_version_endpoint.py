"""Release metadata is public but not a provider/data claim."""
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class TestBuildVersion(unittest.TestCase):
    def test_release_manifest(self):
        data = json.loads((ROOT/'build-version.json').read_text(encoding='utf-8'))
        self.assertEqual(data['version'], '6.3.45')
        self.assertEqual(data['build'], 45)
        self.assertNotEqual(data['androidReferenceVersion'], data['version'])

    def test_server_responds_with_release_metadata(self):
        source = (ROOT/'server.py').read_text(encoding='utf-8')
        self.assertIn("parsed.path=='/build-version.json'", source)
        self.assertIn("return self.send_json(200,metadata)", source)


if __name__ == '__main__':
    unittest.main()
