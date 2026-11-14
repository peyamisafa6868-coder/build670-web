"""Security regression: scan IDs do not grant access across users."""
import hashlib, json, os, threading, time, unittest, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
from pathlib import Path
import tempfile
import scan_jobs, server
from scan_service import ScanService

TOKEN_A='A'*48
TOKEN_B='B'*48

class Core:
    def request(self, obj):
        if obj.get('op')=='metadata':return {'requiredClosedBars':220}
        if obj.get('op')=='filter':return obj['results']
        return {'results':[{'symbol':obj['stocks'][0]['symbol'],'signalValidity':'WATCH'}]}
class Universe:
    def get(self):return {'records':[{'symbol':'ASELS'}],'fetchedAt':123456}

def history(*args):
    bars=[{'time':(i+1)*86400000, 'open':10.,'high':12.,'low':9.,'close':11.,'volume':100.,'closed':True} for i in range(223)]
    return {'candles':bars,'fetchedAt':123456}

class Isolation(unittest.TestCase):
    def test_both_scan_services_and_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            s=ScanService(Core(),history,Universe(),directory=folder)
            job=s.start({'symbols':['ASELS'],'interval':'1d'},owner='alice')['id']
            for fn in [lambda:s.status(job,owner='bob'),lambda:s.results(job,owner='bob'),lambda:s.cancel(job,owner='bob'),lambda:s.start({'symbols':['ASELS'],'interval':'1d','resumeFrom':job},owner='bob')]:
                with self.assertRaises(KeyError):fn()
            self.assertEqual(s.status(job,owner='alice')['id'],job)
            for _ in range(200):
                if s.jobs[job]['status'] not in ('RUNNING','QUEUED','CANCELLING'):break
                time.sleep(.01)
            s._checkpoint(s.jobs[job]);loaded=ScanService(Core(),history,Universe(),directory=folder)
            with self.assertRaises(KeyError):loaded.status(job,owner='bob')
            self.assertEqual(loaded.status(job,owner='alice')['id'],job)
            # A pre-ownership checkpoint remains local-only, not claimable remotely.
            loaded.jobs[job].pop('owner')
            with self.assertRaises(KeyError):loaded.status(job,owner='alice')
            self.assertEqual(loaded.status(job,owner='local')['id'],job)

    def test_http_alice_cannot_read_or_cancel_bob(self):
        mapping={'alice':hashlib.sha256(TOKEN_A.encode()).hexdigest(),'bob':hashlib.sha256(TOKEN_B.encode()).hexdigest()}
        def fake_history(sym, interval, range_):return {'symbol':sym+'.IS','provider':'test','delayed':True,'candles':[]}
        with patch.dict(os.environ,{'BUILD670_AUTH_REQUIRED':'1','BUILD670_USER_TOKEN_HASHES':json.dumps(mapping)}),patch.object(server,'yahoo_history',side_effect=fake_history):
            host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
            th=threading.Thread(target=host.serve_forever,daemon=True);th.start()
            base=f'http://127.0.0.1:{host.server_port}'
            def request(path,token,method='GET',payload=None):
                req=urllib.request.Request(base+path,data=json.dumps(payload).encode() if payload is not None else None,
                    headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'},method=method)
                try:
                    with urllib.request.urlopen(req,timeout=4) as r:return r.status,json.load(r)
                except urllib.error.HTTPError as e:return e.code,json.load(e)
            try:
                code,job=request('/scan/start',TOKEN_A,'POST',{'symbols':['ASELS']});self.assertEqual(code,202)
                jid=job['id']
                for path,method in [(f'/scan/{jid}','GET'),(f'/scan/{jid}','DELETE')]:
                    status,_=request(path,TOKEN_B,method);self.assertEqual(status,404)
                self.assertEqual(request(f'/scan/{jid}',TOKEN_A)[0],200)
                self.assertEqual(request(f'/scan/{jid}',TOKEN_A,'DELETE')[0],200)
                self.assertEqual(request('/scan/start','bad','POST',{'symbols':['ASELS']})[0],401)
            finally:
                host.shutdown();host.server_close();th.join(3)

if __name__=='__main__':unittest.main()

class HistoryIsolation(unittest.TestCase):
    def test_job_to_history_cannot_cross_owner(self):
        import history_service
        from types import SimpleNamespace
        job={'owner':'alice','status':'COMPLETE','results':[],'createdAt':123,'completedAt':456,'errors':0,'interval':'1d'}
        fake=SimpleNamespace(lock=threading.RLock(),jobs={'a'*32:job})
        with self.assertRaises(KeyError):
            history_service.record_job({'records':[],'viopRecords':[],'jobId':'a'*32},fake,owner='bob')
