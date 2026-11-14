"""Regression: new features must be mounted in native app, not floating links."""
import sys, json, urllib.request, threading, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from http.server import ThreadingHTTPServer

class IntegrationTests(unittest.TestCase):
 def test_native_script_and_no_floating_buttons(self):
  host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  t=threading.Thread(target=host.serve_forever,daemon=True)
  t.start()
  base='http://127.0.0.1:'+str(host.server_port)
  try:
   with urllib.request.urlopen(base+'/',timeout=5) as response:
    html=response.read().decode()
    self.assertEqual(response.status,200)
   self.assertIn('native-integration.js',html)
   self.assertIn('integrity="sha256-',html)
   self.assertNotIn('position:fixed;right:16px;bottom:16px',html)
   for path,required in (('/native-integration.js','nativeScanPanel'),('/viop-ledger.js','ViopLedger'),('/viop-catalog.js','ViopCatalog')):
    with urllib.request.urlopen(base+path,timeout=5) as response:
     body=response.read().decode()
     self.assertEqual(response.status,200)
     self.assertIn(required,body)
  finally:host.shutdown();host.server_close();t.join(timeout=5)
if __name__=='__main__':unittest.main()
