"""Smoke tests for the delayed Yahoo chart loader endpoint and CSP integrity."""
import base64,hashlib,unittest,threading,urllib.request,re
from pathlib import Path
import server
class YahooAutoRouteTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  cls.worker=threading.Thread(target=cls.http.serve_forever,daemon=True)
  cls.worker.start()
  cls.url='http://127.0.0.1:'+str(cls.http.server_address[1])
 @classmethod
 def tearDownClass(cls):
  cls.http.shutdown();cls.http.server_close()
 def test_auto_script_and_strict_csp(self):
  with urllib.request.urlopen(self.url+'/') as r:
   page=r.read().decode('utf-8')
   self.assertEqual(r.status,200)
  for name in ('stock-analysis.js','yahoo-auto.js'):
   with urllib.request.urlopen(self.url+'/'+name) as r:
    js=r.read();self.assertEqual(r.status,200)
    self.assertIn('text/javascript',r.headers['Content-Type'])
   digest=base64.b64encode(hashlib.sha256(js).digest()).decode()
   self.assertEqual(page.count('src="/'+name+'"'),1)
   policy=re.search(r'Content-Security-Policy" content="([^"]+)',page).group(1)
   self.assertIn("'sha256-"+digest+"'",policy)
   self.assertIn('src="/'+name+'" integrity="sha256-'+digest+'"',page)
   self.assertNotIn("'unsafe-inline'",policy.split('script-src ')[1].split(';')[0])
   self.assertNotIn("'unsafe-eval'",policy)
