import hashlib, os, sys, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from access_control import authenticate, identities, required
from scan_jobs import kotlin_indicators
from engine_bridge import CoreError

class FakeCore:
    def __init__(self): self.payload=None
    def request(self, payload):
        self.payload=payload
        return {'readiness':{'timeframeReady':True,'availableClosedBars':220},
                'technical':{'ema20':12.4,'ema50':12.1,'ema200':10.8,'rsi14':37.6}}

class SecurityTests(unittest.TestCase):
    def test_remote_denied_without_configuration(self):
        with patch.dict(os.environ,{'BUILD670_AUTH_REQUIRED':'1','BUILD670_USER_TOKEN_HASHES':'{}'}):
            self.assertIsNone(authenticate({},'192.0.2.1'))
            self.assertIsNone(authenticate({},'127.0.0.1'))

    def test_two_users_have_distinct_tokens(self):
        a='A'*48;b='B'*48
        values='{"alice":"'+hashlib.sha256(a.encode()).hexdigest()+'","bob":"'+hashlib.sha256(b.encode()).hexdigest()+'"}'
        with patch.dict(os.environ,{'BUILD670_AUTH_REQUIRED':'1','BUILD670_USER_TOKEN_HASHES':values}):
            self.assertEqual(authenticate({'Authorization':'Bearer '+a},'192.0.2.1'),'alice')
            self.assertEqual(authenticate({'Authorization':'Bearer '+b},'192.0.2.1'),'bob')
            self.assertIsNone(authenticate({'Authorization':'Bearer '+a+'x'},'192.0.2.1'))

    def test_local_no_auth_when_not_public(self):
        with patch.dict(os.environ,{'BUILD670_AUTH_REQUIRED':'0'},clear=True):
            self.assertEqual(authenticate({},'127.0.0.1'),'local')
            self.assertIsNone(authenticate({},'192.0.2.1'))

    def test_scan_technical_delegates_to_kotlin(self):
        bars=[dict(time=1700000000000+i*86400000,open=10,high=12,low=9,close=11,volume=1000) for i in range(220)]
        core=FakeCore(); result=kotlin_indicators('ASELS',bars,'test',core)
        self.assertEqual(result['rsi14'],37.6)
        self.assertEqual(core.payload['op'],'technical')
        self.assertEqual(len(core.payload['stock']['candles']),220)

    def test_scan_fails_closed_if_core_returns_incomplete(self):
        class BadCore: 
            def request(self,payload):return {'readiness':{'timeframeReady':False},'technical':{}}
        bars=[dict(time=i+1,open=10,high=12,low=9,close=11,volume=1000) for i in range(220)]
        with self.assertRaises(CoreError):kotlin_indicators('ASELS',bars,'test',BadCore())

if __name__=='__main__':unittest.main()
