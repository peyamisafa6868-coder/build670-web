"""Fixed market-instrument adapters used by Android home cards; no spot/futures substitution."""
from concurrent.futures import ThreadPoolExecutor
from collections import OrderedDict
import json
import math
import threading
import time
from datetime import datetime
from zoneinfo import ZoneInfo
from urllib.parse import quote
import urllib.request
import urllib.error
from market_history import ProviderError, _slots

INSTRUMENTS={
    'XU100':('BIST 100',('XU100.IS','^XU100'),'TRY','BIST endeksi'),
    'XU030':('BIST 30',('XU030.IS','^XU030'),'TRY','BIST endeksi'),
    'USDTRY':('Dolar / TL',('TRY=X',),'TRY','Döviz kuru'),
    'EURTRY':('Euro / TL',('EURTRY=X',),'TRY','Döviz kuru'),
    'XAUUSD':('Spot altın / ons',('XAUUSD=X',),'USD','Spot altın; vadeli altınla değiştirilmez'),
}
_cache=OrderedDict();_lock=threading.Lock()


def parse_instrument(raw,ticker,key,now=None):
    now=time.time() if now is None else now
    if len(raw)>1_500_000:raise ProviderError('Piyasa yanıtı boyut sınırı.')
    try:
        result=json.loads(raw)['chart']['result'][0]
        meta=result['meta'];q=result['indicators']['quote'][0]
        if meta.get('symbol')!=ticker:raise ValueError('Sembol uyuşmuyor')
        if meta.get('dataGranularity','1d')!='1d':raise ValueError('Periyot uyuşmuyor')
        if meta.get('currency')!=INSTRUMENTS[key][2]:raise ValueError('Para birimi uyuşmuyor')
        bars=[]
        for i,t in enumerate(result.get('timestamp') or []):
            values=[q[name][i] for name in ('open','high','low','close')]
            if isinstance(t,bool) or not isinstance(t,(int,float)) or not math.isfinite(t) or t<=0 or t>now:continue
            if any(isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x) for x in values):continue
            o,h,l,c=values
            if not 0<l<=min(o,c)<=max(o,c)<=h:continue
            # This overview uses completed daily observations, never a claimed live quote.
            if key in {'XU100','XU030'}:
                # Match the BIST daily-history close policy (Europe/Istanbul).
                # A trading-day candle starts during the session, not 24h before close.
                local_now=datetime.fromtimestamp(now,ZoneInfo('Europe/Istanbul'))
                day=datetime.fromtimestamp(t,ZoneInfo('Europe/Istanbul')).date()
                closed=day<local_now.date() or (day==local_now.date() and (local_now.hour,local_now.minute)>=(18,10))
                if not closed:continue
            elif t+86400>now:continue
            bars.append(dict(time=int(t*1000),open=o,high=h,low=l,close=c))
        bars.sort(key=lambda b:b['time'])
        if len(bars)<2 or len({b['time'] for b in bars})!=len(bars):raise ValueError('Yeterli tekil günlük mum yok')
    except (ValueError,TypeError,KeyError,IndexError) as error:raise ProviderError('Piyasa aracı geçmişi doğrulanamadı.') from error
    return {'key':key,'name':INSTRUMENTS[key][0],'ticker':ticker,'currency':INSTRUMENTS[key][2],
        'description':INSTRUMENTS[key][3],'price':bars[-1]['close'],'previousClose':bars[-2]['close'],
        'changePct':(bars[-1]['close']/bars[-2]['close']-1)*100,'asOf':bars[-1]['time'],
        'provider':'Yahoo Finance (unofficial)','delayed':True,'observation':'COMPLETED_DAILY',
        'fetchedAt':int(now*1000),'candles':bars}


def instrument(key):
    if key not in INSTRUMENTS:raise ValueError('Desteklenmeyen piyasa aracı.')
    with _lock:
        hit=_cache.get(key)
        if hit and time.monotonic()-hit[0]<300:return hit[1]
    errors=[]
    for ticker in INSTRUMENTS[key][1]:
        if not _slots.acquire(timeout=2):raise ProviderError('Veri servisi meşgul.',503,5)
        try:
            url='https://query1.finance.yahoo.com/v8/finance/chart/'+quote(ticker,safe='')+'?range=1mo&interval=1d&events=history'
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 BIST-VIOP-Web/1.4','Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=12) as response:raw=response.read(1_500_001)
            data=parse_instrument(raw,ticker,key)
            with _lock:_cache[key]=(time.monotonic(),data)
            return data
        except urllib.error.HTTPError as error:
            status=error.code
            errors.append(f'{ticker}: HTTP {status}')
        except (TimeoutError,urllib.error.URLError):
            status=504
            errors.append(f'{ticker}: kaynak bağlantısı veya zaman aşımı hatası')
        except (OSError,ProviderError) as error:
            status=getattr(error,'status',502)
            errors.append(f'{ticker}: {str(error)[:160]}')
        finally:_slots.release()
    raise ProviderError('Kaynak bu piyasa aracını döndürmedi: '+'; '.join(errors),status,60 if status==429 else None)


def overview():
    def one(key):
        try:return instrument(key)
        except ProviderError as error:return {'key':key,'name':INSTRUMENTS[key][0],'error':str(error),
            'status':error.status,'retryAfter':error.retry_after,'tickers':list(INSTRUMENTS[key][1]),
            'provider':'Yahoo Finance (unofficial)','delayed':True}
    with ThreadPoolExecutor(max_workers=2) as pool:items=list(pool.map(one,INSTRUMENTS))
    return {'items':items,'provider':'Yahoo Finance (unofficial)','live':False,'fetchedAt':int(time.time()*1000)}
