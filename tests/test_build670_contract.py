import unittest
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
import urllib.request, urllib.error, json, threading
import server
class ClosedContract(unittest.TestCase):
 def test_technical_view_rejects_unconfirmed_bars(self):
  host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
  t=threading.Thread(target=host.serve_forever,daemon=True);t.start()
  try:
   url=f'http://127.0.0.1:{host.server_port}/api/technical-view'
   frames=[{'label':s,'candles':[{'timestamp':1700000000000,'closed':False}]} for s in ['3 DK','5 DK','1 SA','1 GÜN']]
   req=urllib.request.Request(url,data=json.dumps({'frames':frames,'price':101,'technical':{}}).encode(),headers={'Content-Type':'application/json'},method='POST')
   with self.assertRaises(urllib.error.HTTPError) as context: urllib.request.urlopen(req,timeout=4)
   self.assertEqual(context.exception.code,400)
  finally:
   host.shutdown();host.server_close();t.join(timeout=3)
 def test_local_default_binding_is_loopback(self):
  source=(Path(server.__file__).read_text())
  self.assertIn("else '127.0.0.1'",source)

class IntervalPreflight(unittest.TestCase):
 def test_mathematically_impossible_intervals_fail_before_fetch(self):
  from scan_service import history_stock
  from market_history import ProviderError
  called=[]
  def fetch(*args):called.append(args);raise AssertionError('Should not query provider')
  with self.assertRaises(ProviderError):history_stock('ASELS','239m',fetcher=fetch)
  self.assertEqual(called,[])
