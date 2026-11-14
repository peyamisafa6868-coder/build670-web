"""Unit tests for bounded, fail-closed scan behavior."""
import sys, time, threading, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import scan_jobs

class ScanTests(unittest.TestCase):
    def wait(self,jid):
        for _ in range(300):
            result=scan_jobs.read(jid)
            if result['state'] in ('complete','cancelled'):return result
            time.sleep(.01)
        self.fail('Tarama tamamlanmadı.')
    def good(self,s,i,r):
        return {'symbol':s+'.IS','provider':'test','delayed':True,'candles':
            [{'time':n*86400000,'open':10+n/100,'high':11+n/100,'low':9+n/100,'close':10+n/100,'volume':1000000,'closed':True} for n in range(222)]}
    def test_progress_and_filters(self):
        j=scan_jobs.start(['ASELS','THYAO'],self.good);r=self.wait(j['id'])
        self.assertEqual((r['done'],r['passed'],r['failed']),(2,2,0))
        self.assertEqual(r['filteredTotal'],2)
        self.assertEqual(scan_jobs.read(j['id'],filter_='below_sma20')['filteredTotal'],0)
        self.assertEqual(len(scan_jobs.read(j['id'],page_size=1)['results']),1)
    def test_source_failure_does_not_fabricate(self):
        j=scan_jobs.start(['ASELS'],lambda s,i,r:{'symbol':s+'.IS','delayed':True,'provider':'test','candles':[]})
        r=self.wait(j['id'])
        self.assertEqual((r['passed'],r['failed']),(0,1))
        self.assertIn('220',r['errors'][0]['error'])
    def test_impossible_ohlcv_and_timestamps_are_never_scored(self):
        # These bad candles previously passed the stand-alone scan console and
        # could yield misleading breakout/price/volume observations.
        for invalid in ('high_below_close','low_above_open','nonfinite_open',
                        'repeated_time','noninteger_time','boolean_time'):
            with self.subTest(invalid=invalid):
                def malformed(symbol,interval,range_):
                    result=self.good(symbol,interval,range_)
                    last=result['candles'][-1]
                    if invalid=='high_below_close':last['high']=last['close']-1
                    elif invalid=='low_above_open':last['low']=last['open']+1
                    elif invalid=='nonfinite_open':last['open']=float('nan')
                    elif invalid=='repeated_time':last['time']=result['candles'][-2]['time']
                    elif invalid=='noninteger_time':last['time']=float('nan')
                    elif invalid=='boolean_time':last['time']=True
                    return result
                job=scan_jobs.start(['ASELS'],malformed)
                result=self.wait(job['id'])
                self.assertEqual((result['done'],result['passed'],result['failed']),(1,0,1))
                self.assertEqual(result['results'],[])
                self.assertEqual(result['errors'][0]['symbol'],'ASELS')

    def test_invalid_symbols_and_pages(self):
        for symbols in ([],['ASELS','ASELS'],['INVALID!'],['ASELS']*633):
            with self.assertRaises(ValueError):scan_jobs.start(symbols,self.good)
        with self.assertRaises(ValueError):scan_jobs.read('x',page_size=101)
    def test_kotlin_is_suffix_normalization(self):
        j=scan_jobs.start([' asels.is ','THYAO.IS'],self.good)
        r=self.wait(j['id'])
        self.assertEqual(r['passed'],2)
        self.assertEqual([x['symbol'] for x in r['results']],['ASELS','THYAO'])
        with self.assertRaises(ValueError):
            scan_jobs.start(['ASELS','ASELS.IS'],self.good)
    def test_cancellation(self):
        entered=threading.Event();resume=threading.Event()
        def slow(*args):
            entered.set();resume.wait(2);return self.good(*args)
        j=scan_jobs.start(['ASELS','THYAO'],slow)
        self.assertTrue(entered.wait(2));scan_jobs.cancel(j['id']);resume.set()
        result=self.wait(j['id'])
        self.assertEqual(result['state'],'cancelled')
        self.assertLessEqual(result['done'],1)
    def test_http_contract_and_console(self):
        import json, urllib.request, urllib.error
        from http.server import ThreadingHTTPServer
        from unittest.mock import patch
        import server
        host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=host.serve_forever,daemon=True);thread.start()
        base='http://127.0.0.1:'+str(host.server_port)
        try:
            with urllib.request.urlopen(base+'/scan-console',timeout=3) as response:
                self.assertEqual(response.status,200)
                self.assertIn(b'BIST',response.read())
            with patch.object(server,'yahoo_history',side_effect=self.good):
                body=json.dumps({'symbols':['ASELS','THYAO']}).encode()
                req=urllib.request.Request(base+'/scan/start',data=body,headers={'Content-Type':'application/json'},method='POST')
                with urllib.request.urlopen(req,timeout=3) as response:
                    self.assertEqual(response.status,202);j=json.load(response)
                outcome=self.wait(j['id'])
                self.assertEqual(outcome['passed'],2)
                with urllib.request.urlopen(base+'/scan/'+j['id']+'?size=1',timeout=3) as response:
                    self.assertEqual(len(json.load(response)['results']),1)
            bad=urllib.request.Request(base+'/scan/start',data=b'{}',headers={'Content-Type':'application/json','Origin':'https://wrong.example'},method='POST')
            with self.assertRaises(urllib.error.HTTPError) as ctx:urllib.request.urlopen(bad,timeout=3)
            self.assertEqual(ctx.exception.code,403)
        finally:
            host.shutdown();host.server_close();thread.join(timeout=3)
if __name__=='__main__':unittest.main()
