"""Browser auth HTTP regressions, isolated credentials and mocked market data."""
import hashlib,json,re,threading,unittest,urllib.request,urllib.error
from http.server import ThreadingHTTPServer
from unittest.mock import patch
import browser_sessions as sessions
import server

A='EXPLICIT_TEST_ALICE_'+'a'*40
B='EXPLICIT_TEST_BOB_'+'b'*40
class BrowserSessions(unittest.TestCase):
    def setUp(self):
        self.env=patch.dict('os.environ',{'BUILD670_AUTH_REQUIRED':'1','BUILD670_USER_TOKEN_HASHES':json.dumps({'alice':hashlib.sha256(A.encode()).hexdigest(),'bob':hashlib.sha256(B.encode()).hexdigest()})})
        self.env.start()
        sessions._sessions.clear();sessions._failures.clear()
        self.host=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        self.thread=threading.Thread(target=self.host.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.host.server_port)
    def tearDown(self):
        self.host.shutdown();self.host.server_close();self.thread.join(3);self.env.stop()
        sessions._sessions.clear();sessions._failures.clear()
    def request(self,path,body=None,cookie=None,binding=None,origin=True,method=None,headers=None):
        h={'Content-Type':'application/json'}
        if origin:h['Origin']=self.base
        if cookie:h['Cookie']=cookie
        if binding:h['X-Build670-Session']=binding
        h.update(headers or {})
        req=urllib.request.Request(self.base+path,data=None if body is None else json.dumps(body).encode(),headers=h,method=method)
        try:r=urllib.request.urlopen(req,timeout=6)
        except urllib.error.HTTPError as e:r=e
        with r:return r.status,r.headers,r.read().decode()
    def login(self,token=A):
        code,headers,body=self.request('/auth/login',{'token':token});self.assertEqual(code,200)
        cookie=headers['Set-Cookie'].split(';')[0]
        self.assertNotIn(token,body+str(headers))
        code,_,html=self.request('/',cookie=cookie);self.assertEqual(code,200)
        binding=re.search(r'name="build670-session-binding" content="([a-f0-9]+)"',html).group(1)
        return cookie,binding,html
    def test_gate_before_app_and_cookie_security(self):
        for path in ['/','/index.html','/scan-console','/viop-ledger']:
            status,headers,body=self.request(path)
            self.assertEqual(status,200);self.assertIn('id="access-token"',body)
            self.assertNotIn('bist-app-script',body);self.assertEqual(headers['Cache-Control'],'no-store')
        _,headers,_=self.request('/auth/login',{'token':A})
        for flag in ['HttpOnly','Secure','SameSite=Strict','Path=/','Max-Age=3600']:self.assertIn(flag,headers['Set-Cookie'])
    def test_same_origin_required_and_bad_input(self):
        self.assertEqual(self.request('/auth/login',{'token':A},origin=False)[0],403)
        self.assertEqual(self.request('/auth/login',{'token':A},headers={'Origin':'https://other.example'})[0],403)
        self.assertEqual(self.request('/auth/login',{'token':A,'extra':1})[0],400)
        self.assertEqual(self.request('/auth/login',{'token':42})[0],401)
    def test_rotation_logout_and_replay(self):
        old,binding,_=self.login()
        code,headers,_=self.request('/auth/login',{'token':A},cookie=old)
        self.assertEqual(code,200);new=headers['Set-Cookie'].split(';')[0];self.assertNotEqual(old,new)
        self.assertEqual(self.request('/auth/session',cookie=old,binding=binding)[0],401)
        _,_,html=self.request('/',cookie=new)
        binding=re.search(r'name="build670-session-binding" content="([a-f0-9]+)"',html).group(1)
        self.assertEqual(self.request('/auth/logout',{},cookie=new,binding=binding,origin=False)[0],403)
        self.assertEqual(self.request('/auth/logout',{},cookie=new,binding=binding)[0],200)
        self.assertEqual(self.request('/auth/session',cookie=new,binding=binding)[0],401)
    def test_expiry_and_credential_revocation(self):
        cookie,binding,_=self.login()
        for value in sessions._sessions.values():value['expires']=0
        self.assertEqual(self.request('/auth/session',cookie=cookie,binding=binding)[0],401)
        cookie,binding,_=self.login()
        with patch.dict('os.environ',{'BUILD670_USER_TOKEN_HASHES':'{}'}):
            self.assertEqual(self.request('/auth/session',cookie=cookie,binding=binding)[0],401)
    def test_binding_rejects_old_tab_and_bearer_still_works(self):
        cookie,a,_=self.login();bob,b,_=self.login(B)
        self.assertEqual(self.request('/api/core/metadata',cookie=bob,binding=a)[0],409)
        self.assertEqual(self.request('/api/core/metadata',cookie=bob)[0],409)
        self.assertEqual(self.request('/auth/session',cookie=bob,binding=b)[0],200)
        self.assertEqual(self.request('/api/core/metadata',headers={'Authorization':'Bearer '+A})[0],200)
        self.assertEqual(self.request('/api/core/metadata',cookie=cookie,binding=a,headers={'Authorization':'Bearer invalid'})[0],401)
    def test_user_scopes_precede_inline_application_and_preserve_sources(self):
        _,_,alice=self.login();_,_,bob=self.login(B)
        scope=lambda s:re.search(r'name="build670-storage-scope" content="([a-f0-9]+)"',s).group(1)
        self.assertNotEqual(scope(alice),scope(bob))
        self.assertLess(alice.index('<script src="/browser-session.js"'),alice.index('id="bist-report-script"'))
        self.assertIn('HttpOnly',sessions.set_cookie('example'))
        self.assertNotIn(A,alice)
    def test_rate_limit_is_bounded_and_retryable(self):
        for _ in range(5):self.assertEqual(self.request('/auth/login',{'token':'wrong'})[0],401)
        code,headers,_=self.request('/auth/login',{'token':A});self.assertEqual(code,429);self.assertEqual(headers['Retry-After'],'60')
        sessions._failures['127.0.0.1']=(0,5)
        self.assertEqual(self.request('/auth/login',{'token':A})[0],200)
    def test_cookie_owners_cannot_read_or_cancel_each_others_scan(self):
        alice,a,_=self.login();bob,b,_=self.login(B)
        with patch.object(server,'yahoo_history',return_value={'symbol':'ASELS.IS','provider':'TEST','delayed':True,'candles':[]}):
            code,_,body=self.request('/scan/start',{'symbols':['ASELS']},cookie=alice,binding=a)
            self.assertEqual(code,202);jid=json.loads(body)['id']
            for method in ['GET','DELETE']:
                self.assertEqual(self.request('/scan/'+jid,cookie=bob,binding=b,method=method)[0],404)
            self.assertEqual(self.request('/scan/'+jid,cookie=alice,binding=a)[0],200)
            self.assertEqual(self.request('/scan/'+jid,cookie=alice,binding=a,method='DELETE')[0],200)

if __name__=='__main__':unittest.main()
