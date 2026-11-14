"""E-21: provider credentials never leak into browser API or readiness output."""
import json
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import provider_security
import server

class ProviderConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.base={
            "BIST_MARKET_PROVIDER_URL":"https://feed.example-provider.test/v1",
            "BIST_MARKET_PROVIDER_TOKEN":"example-secret-long-token-never-show-in-api",
            "BIST_MARKET_PROVIDER_KEY_ID":"key_TEST_01",
            "BIST_MARKET_PROVIDER_ALLOWED_HOSTS":"feed.example-provider.test"
        }
    def test_empty_configuration_is_fail_closed(self):
        self.assertEqual(provider_security.provider_state({}),{
            "configured":False,"configurationValid":False,"connected":False,
            "authenticated":False,"reason":"NOT_CONFIGURED"})
    def test_valid_configuration_does_not_impersonate_connection(self):
        result=provider_security.provider_state(self.base)
        self.assertTrue(result["configurationValid"])
        self.assertFalse(result["connected"])
        self.assertFalse(result["authenticated"])
        self.assertNotIn("secret",json.dumps(result))
    def test_forbidden_targets_and_bad_credentials(self):
        invalid=[
            ("http://feed.example-provider.test/v1","feed.example-provider.test"),
            ("https://localhost/v1","localhost"),
            ("https://127.0.0.1/v1","127.0.0.1"),
            ("https://feed.example-provider.test:9443/v1","feed.example-provider.test"),
            ("https://attacker.example.test/v1","feed.example-provider.test"),
            ("https://user:pass@feed.example-provider.test/v1","feed.example-provider.test"),
            ("https://feed.example-provider.test/v1?token=abc","feed.example-provider.test"),
            ("https://feed.example-provider.test.evil.test/v1","feed.example-provider.test")
        ]
        for url,allow in invalid:
            with self.subTest(url=url):
                env={**self.base,"BIST_MARKET_PROVIDER_URL":url,
                     "BIST_MARKET_PROVIDER_ALLOWED_HOSTS":allow}
                self.assertFalse(provider_security.provider_state(env)["configurationValid"])
                with self.assertRaises(ValueError):
                    provider_security.authorize_header_for_internal_probe(env)
        env={**self.base,"BIST_MARKET_PROVIDER_TOKEN":"abc\nHEADER: evil"}
        self.assertFalse(provider_security.provider_state(env)["configurationValid"])
    def test_credentials_not_exposed_on_status_and_ready(self):
        env={"PORT":"0",**self.base}
        with patch.dict("os.environ",env,clear=False):
            host=ThreadingHTTPServer(("127.0.0.1",0),server.Handler)
            thread=threading.Thread(target=host.serve_forever,daemon=True)
            thread.start()
            base=f"http://127.0.0.1:{host.server_port}"
            try:
                for path in ["/api/provider/status","/ready"]:
                    with urllib.request.urlopen(base+path,timeout=8) as response:
                        payload=response.read().decode()
                    self.assertNotIn(self.base["BIST_MARKET_PROVIDER_TOKEN"],payload)
                    self.assertNotIn(self.base["BIST_MARKET_PROVIDER_KEY_ID"],payload)
                    self.assertNotIn("feed.example-provider.test",payload)
                    parsed=json.loads(payload)
                    status=parsed if path.endswith("/status") else parsed["providerConfiguration"]
                    self.assertFalse(status["connected"])
                    self.assertFalse(status["authenticated"])
            finally:
                host.shutdown()
                host.server_close()
                thread.join(timeout=3)
    def test_no_secret_in_invalid_diagnostics(self):
        for key in ["BIST_MARKET_PROVIDER_URL","BIST_MARKET_PROVIDER_ALLOWED_HOSTS","BIST_MARKET_PROVIDER_KEY_ID"]:
            env={**self.base,key:"bad\nsecret"}
            response=json.dumps(provider_security.provider_state(env))
            self.assertNotIn("bad",response)
            self.assertNotIn("secret",response)
if __name__=="__main__":
    unittest.main()
