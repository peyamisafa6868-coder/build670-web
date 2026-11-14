"""Offline smoke tests: python -m unittest discover -s tests -v"""
import sys, unittest, json, re, hashlib, base64
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
import server

class SmokeTests(unittest.TestCase):
    def test_html_csp(self):
        html=(ROOT/'index.html').read_text()
        scripts=re.findall(r'<script[^>]*>(.*?)</script>',html,re.S)
        hashes=re.findall(r"'sha256-([^']+)'",html[:1500])
        self.assertEqual(len(scripts),3)
        self.assertEqual([base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() for s in scripts],hashes)
    def test_contract(self):
        self.assertTrue((ROOT/'server.py').is_file())
        self.assertTrue((ROOT/'index.html').is_file())
        self.assertIn('1d',server.INTERVALS)
        self.assertNotIn('5y',server.MAX_BY_INTERVAL['5m'])
    def test_rejects_bad_requests(self):
        for symbol,interval,range_ in [('INVALID!','1d','1mo'),('ASELS','5m','5y')]:
            with self.assertRaises(ValueError):
                server.yahoo_history(symbol,interval,range_)
    def test_yahoo_cache_and_ohlcv(self):
        server.CACHE.clear()
        payload={'chart':{'result':[{'timestamp':[1000000], 'indicators':{'quote':[{'open':[10.0], 'high':[10.5], 'low':[9.5], 'close':[10.2], 'volume':[100]}]}}]}}
        class Response:
            status=200
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self,n): return json.dumps(payload).encode()
        with patch.object(server.urllib.request,'urlopen',return_value=Response()) as upstream:
            a=server.yahoo_history('ASELS','1d','1mo')
            b=server.yahoo_history('ASELS','1d','1mo')
        self.assertEqual(upstream.call_count,1)
        self.assertEqual(a,b)
        self.assertEqual(a['symbol'],'ASELS.IS')
        self.assertTrue(a['delayed'])
        self.assertEqual(a['candles'][0]['close'],10.2)

if __name__=='__main__': unittest.main()
