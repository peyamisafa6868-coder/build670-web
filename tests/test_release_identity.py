"""Keep the shipped offline BUILD 668 shell distinct from the web release."""
import json
import pathlib
import unittest
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.request import urlopen

ROOT = pathlib.Path(__file__).resolve().parents[1]

class ReleaseIdentityTests(unittest.TestCase):
    def test_offline_shell_explicit(self):
        source = (ROOT / 'index.html').read_text(encoding='utf-8')
        self.assertIn('BUILD 668 · çevrimdışı modül', source)
        self.assertNotIn('TEK HTML v1.1.0</span>', source)

    def test_serve_release_identity(self):
        from server import Handler
        with patch.dict('os.environ', {'SOURCE_COMMIT':'abc123def4567890'}, clear=False):
            httpd = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
            t = Thread(target=httpd.serve_forever, daemon=True)
            t.start()
            try:
                with urlopen(f'http://127.0.0.1:{httpd.server_port}/',timeout=5) as resp:
                    body=resp.read().decode('utf-8')
                version=json.loads((ROOT/'build-version.json').read_text())['version']
                self.assertIn(f'Web V{version} · kaynak abc123def456', body)
                self.assertIn(f'<meta name="application-version" content="{version}">',body)
                self.assertIn('BUILD 668 çevrimdışı modül',body)
            finally:
                httpd.shutdown();httpd.server_close();t.join(3)
