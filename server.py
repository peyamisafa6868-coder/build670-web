#!/usr/bin/env python3
"""One-origin BIST-VIOP web + Yahoo unofficial historical data proxy."""
import os, re, json, time, urllib.request, urllib.error, hashlib, base64, math, hmac
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, parse_qs, urlencode
from pathlib import Path
import scan_jobs
import browser_sessions
import html as html_escape
from access_control import authenticate, required, identities, AccessConfigurationError

ROOT = Path(__file__).resolve().parent
PORT = int(os.getenv('PORT','8000'))
from market_history import yahoo_history, INTERVALS, RANGES, MAX_BY_INTERVAL, CACHE, ProviderError
from engine_bridge import CORE, CoreError
from scan_service import SCANS
from universe import UNIVERSE
from news_service import news
from instruments import overview, instrument
from valuation_service import valuation
from stock_quotes import stock_quote
from kap_directory import DIRECTORY
from company_service import company_data
import history_service
from provider_security import provider_state

EXTRA_SCRIPTS=('stock-analysis.js','yahoo-auto.js','legacy-ledger.js','viop-ledger.js','viop-catalog.js','native-integration.js','android-preferences.js','terminal.js','android-layout.js','chart-support-levels.js','chart-integrity.js','android-chart.js','android-programmatic.js','android-fullscreen.js','android-market.js','android-stocks.js','android-history.js','android-technical.js','android-results.js','android-plan.js','android-app.js')
class Handler(BaseHTTPRequestHandler):
    def _user(self):
        if not self.headers.get('Authorization'):
            session=browser_sessions.lookup(self.headers)
            if session:return session['user']
        return authenticate(self.headers,self.client_address[0])

    def _api_authorized(self):
        path=urlsplit(self.path).path
        protected=(path.startswith('/api/') or path.startswith('/scan/') or path=='/scan/start' or path=='/history')
        if not protected or path in ('/api/provider/status',):return True
        if not self.headers.get('Authorization'):
            session=browser_sessions.lookup(self.headers)
            if session and not hmac.compare_digest(self.headers.get('X-Build670-Session',''),session['binding']):
                self.send_json(409,{'error':'Oturum değişti. Sayfayı yeniden açın.'})
                return False
        if self._user() is not None:return True
        self.send_json(401,{'error':'Kimlik doğrulama gerekli.'})
        return False

    def _same_origin(self):
        origin=self.headers.get('Origin');host=self.headers.get('Host','')
        return not origin or origin in ('http://'+host,'https://'+host)
    def do_DELETE(self):
        if not self._api_authorized():return
        match=re.fullmatch(r'/scan/([0-9a-f]{32})',urlsplit(self.path).path)
        if not match:return self.send_json(404,{'error':'Bulunamadı'})
        if not self._same_origin():return self.send_json(403,{'error':'Geçersiz köken.'})
        try:return self.send_json(200,scan_jobs.cancel(match.group(1),owner=self._user()))
        except KeyError:return self.send_json(404,{'error':'Tarama bulunamadı.'})
    def send_json(self,code,data,extra_headers=None):
        raw=json.dumps(data,ensure_ascii=False,allow_nan=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Length',str(len(raw)))
        for key,value in (extra_headers or {}).items():self.send_header(key,value)
        self.end_headers();self.wfile.write(raw)
    def _send_login(self):
        raw=(ROOT/'browser-login.html').read_bytes()
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8')
        self.send_header('Cache-Control','no-store');self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
        self.send_header('Content-Length',str(len(raw)));self.end_headers();return self.wfile.write(raw)
    def _session_markup(self):
        session=browser_sessions.lookup(self.headers)
        if not required() or not session:return ''
        scope=hashlib.sha256(session['user'].encode()).hexdigest()
        integrity=base64.b64encode(hashlib.sha256((ROOT/'browser-session.js').read_bytes()).digest()).decode()
        return f'<meta name="build670-storage-scope" content="{scope}"><meta name="build670-session-binding" content="{session["binding"]}"><meta name="build670-user" content="{html_escape.escape(session["user"],quote=True)}"><script src="/browser-session.js" integrity="sha256-{integrity}"></script>'
    def do_GET(self):
        if not self._api_authorized():return
        parsed=urlsplit(self.path)
        if parsed.path=='/auth/session':
            session=browser_sessions.lookup(self.headers)
            if not session:return self.send_json(401,{'error':'Oturum sona erdi.'})
            if not hmac.compare_digest(self.headers.get('X-Build670-Session',''),session['binding']):return self.send_json(409,{'error':'Oturum değişti.'})
            return self.send_json(200,{'user':session['user']})
        if parsed.path in ('/','/index.html','/scan-console','/viop-ledger') and required() and not browser_sessions.lookup(self.headers):
            return self._send_login()
        if parsed.path=='/android-resources.json' or re.fullmatch(r'/assets/(Roboto-(Regular|Medium|Bold)|NotoSansSymbols-Regular-Subsetted)\.ttf',parsed.path):
            source=ROOT/parsed.path.lstrip('/')
            if not source.is_file():return self.send_json(404,{'error':'Kaynak bulunamadı.'})
            raw=source.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','application/json; charset=utf-8' if source.suffix=='.json' else 'font/ttf')
            self.send_header('Cache-Control','no-cache');self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(raw)));self.end_headers();return self.wfile.write(raw)
        match=re.fullmatch(r'/scan/([0-9a-f]{32})',parsed.path)
        if match:
            p=parse_qs(parsed.query,keep_blank_values=True)
            if any(len(v)!=1 for v in p.values()) or set(p)-{'page','size','filter','sort'}:return self.send_json(400,{'error':'Geçersiz tarama sorgusu.'})
            try:return self.send_json(200,scan_jobs.read(match.group(1),page=int(p.get('page',['1'])[0]),page_size=int(p.get('size',['25'])[0]),filter_=p.get('filter',['all'])[0],sort=p.get('sort',['symbol'])[0],owner=self._user()))
            except (ValueError,TypeError) as error:return self.send_json(400,{'error':str(error)})
            except KeyError:return self.send_json(404,{'error':'Tarama bulunamadı.'})
        if parsed.path in ('/scan-console','/viop-ledger'):
            raw=(ROOT/('scan-console.html' if parsed.path=='/scan-console' else 'viop-ledger.html')).read_text().replace('</head>',self._session_markup()+'</head>').encode()
            self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.send_header('Cache-Control','no-store')
            self.send_header('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'")
            self.send_header('X-Frame-Options','DENY');self.send_header('Content-Length',str(len(raw)));self.end_headers();return self.wfile.write(raw)
        if parsed.path=='/health':return self.send_json(200,{'bridge':'BIST_YAHOO_SHARED_API','status':'ok','version':'1.4.0',
            'androidCoreBuilt':CORE.jar.is_file(),'sourceCommit':os.getenv('RAILWAY_GIT_COMMIT_SHA',os.getenv('SOURCE_COMMIT','local'))})
        if parsed.path=='/build-version.json':
            # Non-secret release metadata; useful for verifying deployed serial number.
            if parsed.query:return self.send_json(400,{'error':'Sürüm sorgusu parametre kabul etmez.'})
            try:
                metadata=json.loads((ROOT/'build-version.json').read_text(encoding='utf-8'))
                if not isinstance(metadata,dict) or not isinstance(metadata.get('version'),str):
                    raise ValueError('Sürüm bildirimi geçersiz.')
            except (OSError,ValueError):
                return self.send_json(503,{'error':'Sürüm bilgisi okunamadı.'})
            return self.send_json(200,metadata)
        if parsed.path=='/api/provider/status':
            if parsed.query:return self.send_json(400,{'error':'Bu uç sorgu parametresi kabul etmez.'})
            return self.send_json(200,provider_state())
        if parsed.path=='/ready':
            result={'sourceCommit':os.getenv('RAILWAY_GIT_COMMIT_SHA',os.getenv('SOURCE_COMMIT','local')),
                    'licensedProviderConnected':False,'signalAttestationVerified':False,'providerMode':'UNOFFICIAL_DELAYED',
                    'providerConfiguration':provider_state()}
            try:
                metadata=CORE.request({'op':'metadata'},timeout=3)
                if (not isinstance(metadata,dict) or metadata.get('requiredClosedBars')!=220
                    or not isinstance(metadata.get('engineVersion'),str) or not metadata['engineVersion'].strip()):
                    raise CoreError('Android çekirdek sözleşmesi uyuşmuyor.')
                return self.send_json(200,{**result,'status':'ready','coreReady':True,'engineVersion':metadata['engineVersion']})
            except CoreError as error:return self.send_json(503,{**result,'status':'not_ready','coreReady':False,'error':str(error)})
        if parsed.path.startswith('/api/'):
            try:
                p=parse_qs(parsed.query,keep_blank_values=True)
                if any(len(v)!=1 for v in p.values()):raise ValueError('Yinelenen sorgu alanı.')
                one=lambda k,d='':p.get(k,[d])[0]
                if parsed.path=='/api/core/metadata':data=CORE.request({'op':'metadata'})
                elif parsed.path=='/api/universe':data=UNIVERSE.get()
                elif parsed.path=='/api/company':
                    if set(p)!={'symbol','kind'}:raise ValueError('Şirket sorgusu symbol ve kind gerektirir.')
                    data=company_data(one('symbol'),one('kind'))
                elif parsed.path=='/api/instruments':data=overview()
                elif re.fullmatch(r'/api/instruments/[A-Z0-9]{3,10}',parsed.path):data=instrument(parsed.path.rsplit('/',1)[1])
                elif parsed.path=='/api/stocks/quote':
                    if set(p)!={'symbol'}:raise ValueError('Yalnız hisse sembolü gereklidir.')
                    data=stock_quote(one('symbol'))
                elif parsed.path=='/api/stocks/directory':
                    if set(p)-{'refresh'} or one('refresh','0') not in {'0','1'}:raise ValueError('Geçersiz KAP yenileme isteği.')
                    data=DIRECTORY.get(refresh=one('refresh','0')=='1')
                elif parsed.path=='/api/viop/catalog':
                    if set(p)-{'query','category'} or len(one('query'))>80:raise ValueError('Geçersiz kontrat araması.')
                    category=one('category','ALL')
                    if category not in {'ALL','BIST30','FX','COMMODITY','OTHER'}:raise ValueError('Geçersiz kontrat kategorisi.')
                    data={'contracts':CORE.request({'op':'viopCatalog','query':one('query'),'category':category}),
                          'verified':False,'source':'Android ViopBuiltinContractCatalog; dayanak/vade referansı'}
                elif parsed.path=='/api/news':
                    if set(p)-{'symbol','category','company','force'} or one('force','0') not in {'0','1'}:raise ValueError('Bilinmeyen haber alanı.')
                    data=news(one('symbol').upper(),one('category','market'),one('company'),force=one('force','0')=='1')
                elif re.fullmatch(r'/api/scans/[A-Za-z0-9_-]{32}',parsed.path):data=SCANS.status(parsed.path.rsplit('/',1)[1],owner=self._user())
                elif re.fullmatch(r'/api/scans/[A-Za-z0-9_-]{32}/failures',parsed.path):
                    if set(p)-{'page','size'}:raise ValueError('Bilinmeyen hata listesi alanı.')
                    data=SCANS.failures(parsed.path.split('/')[3],int(one('page','1')),int(one('size','100')),owner=self._user())
                elif re.fullmatch(r'/api/scans/[A-Za-z0-9_-]{32}/results',parsed.path):
                    if set(p)-{'filter','page','size'}:raise ValueError('Bilinmeyen sonuç alanı.')
                    data=SCANS.results(parsed.path.split('/')[3],one('filter','ALL'),int(one('page','1')),int(one('size','25')),owner=self._user())
                else:return self.send_json(404,{'error':'API yolu bulunamadı.'})
                return self.send_json(200,data)
            except (ValueError,TypeError) as error:return self.send_json(400,{'error':str(error)})
            except KeyError as error:return self.send_json(404,{'error':str(error)})
            except ProviderError as error:return self.send_json(error.status,{'error':str(error)})
            except CoreError as error:return self.send_json(503,{'error':str(error)})
            except Exception:return self.send_json(502,{'error':'Servis yanıtı alınamadı.'})
        if parsed.path=='/history':
            p=parse_qs(parsed.query,keep_blank_values=True)
            if any(len(v)!=1 for v in p.values()) or set(p)-{'symbol','interval','range'}:
                return self.send_json(400,{'error':'Geçersiz veya yinelenen sorgu alanı.'})
            symbol=p.get('symbol',[''])[0].strip().upper()
            interval=p.get('interval',['1d'])[0];range_=p.get('range',['1mo'])[0]
            try:data=yahoo_history(symbol,interval,range_)
            except ValueError as e:return self.send_json(400,{'error':str(e)})
            except ProviderError as e:
                if e.retry_after is not None:
                    raw=json.dumps({'error':str(e)},ensure_ascii=False).encode('utf-8')
                    self.send_response(e.status)
                    self.send_header('Content-Type','application/json; charset=utf-8')
                    self.send_header('Cache-Control','no-store')
                    self.send_header('Retry-After',str(max(1,min(3600,e.retry_after))))
                    self.send_header('Content-Length',str(len(raw)))
                    self.end_headers();return self.wfile.write(raw)
                return self.send_json(e.status,{'error':str(e)})
            except urllib.error.HTTPError as e:return self.send_json(502,{'error':f'Yahoo HTTP {e.code}; erişim sınırı veya geçici hata.'})
            except Exception:return self.send_json(502,{'error':'Yahoo veri kaynağına ulaşılamadı veya yanıt okunamadı.'})
            return self.send_json(200,data)
        if parsed.path in tuple('/'+s for s in (*EXTRA_SCRIPTS,'scan-console.js','viop-ledger-ui.js','browser-login.js','browser-session.js')):
            raw=(ROOT/parsed.path[1:]).read_bytes()
            self.send_response(200)
            self.send_header('Content-Type','text/javascript; charset=utf-8')
            self.send_header('Cache-Control','no-cache')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(raw)))
            self.end_headers();return self.wfile.write(raw)
        if parsed.path in ('/','/index.html'):
            # Add the same-origin Yahoo loader without mutating the original
            # 650KB HTML or its already-verified inline script CSP hashes.
            html=(ROOT/'index.html').read_text(encoding='utf-8')
            # The file:// shell remains explicitly marked BUILD 668, while the
            # served web application reports its actual manifest and commit.
            # Do not mislabel the embedded offline calculation module as V6.3.x.
            try:
                release=json.loads((ROOT/'build-version.json').read_text(encoding='utf-8'))
                version=str(release['version'])
                if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',version):
                    raise ValueError('Invalid version')
                commit=os.getenv('RAILWAY_GIT_COMMIT_SHA',os.getenv('SOURCE_COMMIT','local'))
                if not re.fullmatch(r'[A-Za-z0-9._-]{1,64}',commit):
                    commit='unknown'
                identity=f'Web V{version} · kaynak {commit[:12]} · BUILD 668 çevrimdışı modül'
                html=html.replace('BUILD 668 · çevrimdışı modül</span>',identity+'</span>',1)
                html=html.replace('<meta name="application-version" content="1.3.0">',f'<meta name="application-version" content="{version}">',1)
            except (OSError,KeyError,ValueError,TypeError):
                pass
            scripts=[]
            for name in EXTRA_SCRIPTS:
                integrity=base64.b64encode(hashlib.sha256((ROOT/name).read_bytes()).digest()).decode()
                html=html.replace("script-src 'sha256-", "script-src 'sha256-"+integrity+"' 'sha256-", 1)
                scripts.append('<script src="/'+name+'" integrity="sha256-'+integrity+'" defer></script>')
            html=html.replace('</body></html>', ''.join(scripts)+'</body></html>', 1)
            session_markup=self._session_markup()
            if session_markup:
                integrity=base64.b64encode(hashlib.sha256((ROOT/'browser-session.js').read_bytes()).digest()).decode()
                html=html.replace("script-src 'sha256-", "script-src 'sha256-"+integrity+"' 'sha256-",1)
                html=html.replace('</head>',session_markup+'</head>',1)
            html=html.replace("font-src 'none'", "font-src 'self'")
            html=html.replace('</head>','<style id="terminal-theme">'+(ROOT/'terminal.css').read_text(encoding='utf-8')+'</style><style id="android-theme">'+(ROOT/'android-ui.css').read_text(encoding='utf-8')+'</style></head>',1)
            raw=html.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type','text/html; charset=utf-8')
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Frame-Options','DENY')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Content-Length',str(len(raw)))
            self.end_headers();return self.wfile.write(raw)
        return self.send_json(404,{'error':'Bulunamadı'})

    def do_POST(self):
        if not self._api_authorized():return
        parsed=urlsplit(self.path)
        if parsed.path in ('/auth/login','/auth/logout'):
            if not self.headers.get('Origin') or not self._same_origin():return self.send_json(403,{'error':'Aynı kaynaktan oturum isteği gerekli.'})
            if self.headers.get('Content-Type','').split(';')[0]!='application/json':return self.send_json(415,{'error':'JSON içerik gerekli.'})
            if parsed.path=='/auth/logout':
                session=browser_sessions.lookup(self.headers)
                if session and not hmac.compare_digest(self.headers.get('X-Build670-Session',''),session['binding']):return self.send_json(409,{'error':'Oturum değişti.'})
                browser_sessions.logout(self.headers)
                return self.send_json(200,{'authenticated':False},{'Set-Cookie':browser_sessions.set_cookie('')})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 2<=length<=2048:raise ValueError()
                payload=json.loads(self.rfile.read(length))
                if not isinstance(payload,dict) or set(payload)!={'token'}:raise ValueError()
                code,value=browser_sessions.login(payload['token'],self.headers,self.client_address[0])
            except (ValueError,TypeError):return self.send_json(400,{'error':'Geçersiz oturum isteği.'})
            if code!=200:return self.send_json(code,{'error':'Oturum açılamadı.'},{'Retry-After':'60'} if code==429 else None)
            return self.send_json(200,{'authenticated':True},{'Set-Cookie':browser_sessions.set_cookie(value)})
        origin=self.headers.get('Origin')
        if origin and urlsplit(origin).netloc!=self.headers.get('Host'):
            return self.send_json(403,{'error':'Farklı kaynaktan yazma isteği reddedildi.'})
        if self.headers.get('Content-Type','').split(';')[0]!='application/json':
            return self.send_json(415,{'error':'JSON içerik gerekli.'})
        try:
            length=int(self.headers.get('Content-Length','0'))
            limit=8_000_000 if parsed.path in {'/api/history/view','/api/history/record','/api/history/update'} else 1_000_000 if parsed.path in {'/api/valuation','/api/chart-analysis','/api/viop/reference','/api/technical-view'} else 32768
            if length<2 or length>limit:raise ValueError('İstek boyutu geçersiz.')
            payload=json.loads(self.rfile.read(length))
            if not isinstance(payload,dict):raise ValueError('JSON nesnesi gerekli.')
            if parsed.path=='/api/scans':data=SCANS.start(payload,owner=self._user())
            elif parsed.path=='/scan/start':
                if set(payload)!={'symbols'}:raise ValueError('Sadece symbols alanı kabul edilir.')
                data=scan_jobs.start(payload['symbols'],yahoo_history,owner=self._user())
            elif parsed.path=='/api/trade-estimate':
                fields={'direction','entry','exit','quantity','commissionPerSide','slippageBpsPerSide'}
                if set(payload)!=fields or payload['direction'] not in {'LONG','SHORT'}:raise ValueError('Simülasyon alanları geçersiz.')
                for key in fields-{'direction'}:
                    value=payload[key]
                    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<0:raise ValueError('Simülasyon değerleri sonlu ve negatif olmayan sayılar olmalıdır.')
                if any(payload[k]<=0 for k in ['entry','exit','quantity']):raise ValueError('Giriş, çıkış ve miktar pozitif olmalıdır.')
                data=CORE.request({'op':'tradeEstimate',**payload})
            elif parsed.path=='/api/valuation':data=valuation(payload)
            elif parsed.path=='/api/history/view':data=history_service.view(payload)
            elif parsed.path=='/api/history/record':data=history_service.record_job(payload,SCANS,owner=self._user())
            elif parsed.path=='/api/history/update':data=history_service.update(payload)
            elif parsed.path=='/api/technical-view':
                if set(payload)!={'frames','price','technical'}:raise ValueError('Geçersiz teknik özet alanları.')
                frames=payload['frames']
                if not isinstance(frames,list) or len(frames)!=4 or [x.get('label') for x in frames if isinstance(x,dict)]!=['3 DK','5 DK','1 SA','1 GÜN']:raise ValueError('Dört bağımsız zaman dilimi gerekli.')
                if any(set(x)!={'label','candles'} or not isinstance(x['candles'],list) or len(x['candles'])>10000 for x in frames):raise ValueError('Geçersiz zaman dilimi girdisi.')
                if type(payload['price']) not in {int,float} or not math.isfinite(payload['price']) or payload['price']<=0 or not isinstance(payload['technical'],dict):raise ValueError('Geçersiz teknik fiyat veya gösterge girdisi.')
                if any(not isinstance(bar,dict) or bar.get('closed') is not True for frame in frames for bar in frame['candles']):raise ValueError('Teknik analiz yalnız kapanışı doğrulanmış mumları kabul eder.')
                data=CORE.request({'op':'technicalView',**payload})
            elif parsed.path=='/api/viop/reference':
                if set(payload)-{'referenceOnly','contracts','quotes','finalQuotes','histories','stocks','interval','symbol'} or payload.get('referenceOnly') is not True:raise ValueError('Bu uç yalnız açık referans hesaplaması içindir. Canlı sağlayıcı değildir.')
                if not isinstance(payload.get('contracts'),list) or len(payload['contracts'])>100:raise ValueError('En fazla 100 referans sözleşme gerekli.')
                data=CORE.request({'op':'viopReference',**payload})
            elif parsed.path=='/api/chart-analysis':
                if set(payload)-{'candles','intraday','excludeNewestForTrend'} or not isinstance(payload.get('candles'),list) or not 1<=len(payload['candles'])<=10000:raise ValueError('Geçersiz grafik girdisi.')
                if not isinstance(payload.get('intraday',True),bool):raise ValueError('Geçersiz grafik periyodu.')
                if not isinstance(payload.get('excludeNewestForTrend',True),bool):raise ValueError('Geçersiz grafik kapanış seçimi.')
                if any(not isinstance(x,dict) or x.get('closed') is not True for x in payload['candles'][:-1]) or not isinstance(payload['candles'][-1],dict) or not isinstance(payload['candles'][-1].get('closed'),bool):raise ValueError('Yalnız en yeni görüntü mumu açık olabilir. Ara mumlar kapanmış olmalı.')
                data=CORE.request({'op':'chart',**payload})
            elif re.fullmatch(r'/api/scans/[A-Za-z0-9_-]{32}/cancel',parsed.path):data=SCANS.cancel(parsed.path.split('/')[3],owner=self._user())
            elif parsed.path=='/api/universe/refresh':data=UNIVERSE.get(refresh=True)
            elif parsed.path=='/api/cache/clear':
                if payload:raise ValueError('Bu işlem ek alan kabul etmez.')
                from market_history import _lock as history_lock
                import instruments,news_service
                with history_lock:CACHE.clear()
                with instruments._lock:instruments._cache.clear()
                with news_service._lock:news_service._cache.clear()
                data={'cleared':True,'scope':'temporary_provider_cache'}
            else:return self.send_json(404,{'error':'API yolu bulunamadı.'})
            return self.send_json(202 if parsed.path in {'/api/scans','/scan/start'} else 200,data)
        except (ValueError,TypeError) as error:return self.send_json(400,{'error':str(error)})
        except KeyError as error:return self.send_json(404,{'error':str(error)})
        except ProviderError as error:return self.send_json(error.status,{'error':str(error)})
        except CoreError as error:return self.send_json(503,{'error':str(error)})
        except Exception:return self.send_json(502,{'error':'Servis işlemi tamamlanamadı.'})

if __name__=='__main__':
    if required() and not identities():
        raise SystemExit('BUILD670 güvenlik: uzak erişim için BUILD670_USER_TOKEN_HASHES yapılandırılmalı.')
    ThreadingHTTPServer((os.getenv('HOST') or ('0.0.0.0' if os.getenv('RAILWAY_ENVIRONMENT') or os.getenv('BUILD670_PUBLIC_SERVER') == '1' else '127.0.0.1'),PORT),Handler).serve_forever()
