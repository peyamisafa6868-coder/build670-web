"""Delayed Yahoo display history; Android ChartTimeframe.kt aggregation rules."""
import json
import math
import re
import threading
import time
import urllib.error
import urllib.request
from collections import OrderedDict
from concurrent.futures import Future
from datetime import datetime, timedelta
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

IST = ZoneInfo('Europe/Istanbul')
INTERVALS = {'1m','3m','5m','10m','15m','30m','60m','240m','1d','1w','1mo','all'}
RANGES = {'7d','1mo','3mo','6mo','1y','2y','5y','max'}
DAILY = {'1d','1w','1mo','all'}
MAX_BY_INTERVAL = {i: ({'max'} if i=='all' else RANGES-{'7d'} if i in DAILY else {'7d'} if i in {'1m','3m'} else {'1mo'}) for i in INTERVALS}
MAX_BY_INTERVAL['60m']={'1mo','3mo','6mo'}
SOURCE = {'3m':'1m','10m':'5m','15m':'5m','30m':'5m','240m':'60m','1w':'1d','1mo':'1d','all':'1d'}
CACHE = OrderedDict()
CACHE_SECONDS, CACHE_MAX = 300, 128
_lock = threading.Lock()
_pending = {}
_slots = threading.BoundedSemaphore(4)


class ProviderError(Exception):
    def __init__(self, message, status=502, retry_after=None):
        super().__init__(message)
        self.status, self.retry_after = status, retry_after


def merge(rows):
    return dict(time=rows[0]['time'], open=rows[0]['open'], high=max(b['high'] for b in rows),
                low=min(b['low'] for b in rows), close=rows[-1]['close'],
                volume=sum(b['volume'] for b in rows), closed=all(b.get('closed') is True for b in rows))


def aggregate_candles(rows, source_minutes, target_minutes, session=False):
    """Only complete, contiguous, closed groups. Never bridge trading dates."""
    if source_minutes<=0 or target_minutes<source_minutes or target_minutes%source_minutes:
        return []
    count, source_ms, bucket_ms = target_minutes//source_minutes, source_minutes*60_000, target_minutes*60_000
    buckets, anchors = {}, {}
    for b in sorted(rows, key=lambda b:b['time']):
        day = datetime.fromtimestamp(b['time']/1000, IST).date()
        anchor = anchors.setdefault(day,b['time']) if session else 0
        bucket = anchor+(b['time']-anchor)//bucket_ms*bucket_ms
        buckets.setdefault((day,bucket),[]).append(b)
    out=[]
    for (_,bucket), bars in sorted(buckets.items()):
        if (len(bars)==count and [b['time'] for b in bars]==[bucket+i*source_ms for i in range(count)]
                and all(b.get('closed') is True for b in bars)):
            out.append(merge(bars))
    return out


def calendar_candles(rows, interval, now=None):
    clock=datetime.fromtimestamp(time.time() if now is None else now,IST)
    groups={}
    for b in rows:
        day=datetime.fromtimestamp(b['time']/1000,IST).date()
        key=day-timedelta(days=day.weekday()) if interval=='1w' else day.replace(day=1)
        groups.setdefault(key,[]).append(b)
    result=[]
    for key,bars in sorted(groups.items()):
        b=merge(bars)
        if interval=='1w':
            # The BIST week ends after Friday's regular 18:10 close. Keep it
            # closed on Saturday/Sunday; do not reopen it before next Monday.
            friday=key+timedelta(days=4)
            finished=clock.date()>friday or (clock.date()==friday and (clock.hour,clock.minute)>=(18,10))
        else:
            finished=(clock.year,clock.month)>(key.year,key.month)
        b['closed']=finished and b['closed']
        result.append(b)
    return result


def fetch_history(symbol, interval, range_, source_override=None):
    source=source_override or SOURCE.get(interval,interval)
    params=dict(interval=source,range=range_,events='history')
    # Yahoo silently changes range=max to monthly bars, even with interval=1d.
    # Explicit epoch boundaries retain genuine daily observations for all-time view.
    if range_=='max':
        params.pop('range');params.update(period1=0,period2=int(time.time()))
    url='https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'.IS?'+urlencode(params)
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (compatible; BIST-VIOP/1.3)','Accept':'application/json'})
    if not _slots.acquire(timeout=1):
        raise ProviderError('Veri servisi meşgul; tekrar deneyin.',503,5)
    try:
        with urllib.request.urlopen(req,timeout=16) as upstream:
            if upstream.status!=200: raise ProviderError('Yahoo beklenmeyen HTTP yanıtı döndürdü.')
            raw=upstream.read(2_500_001)
    except urllib.error.HTTPError as e:
        retry=e.headers.get('Retry-After','60') if e.headers else '60'
        if e.code==429: raise ProviderError('Yahoo istek sınırı; daha sonra tekrar deneyin.',429,int(retry) if retry.isdigit() else 60) from e
        raise ProviderError(f'Yahoo HTTP {e.code}; veri alınamadı.',e.code) from e
    except (TimeoutError,urllib.error.URLError) as e:
        raise ProviderError('Yahoo veri kaynağına ulaşılamadı veya istek zaman aşımına uğradı.',504) from e
    finally:
        _slots.release()
    if len(raw)>2_500_000: raise ProviderError('Veri yanıtı boyut sınırını aştı.')
    try:
        chart=json.loads(raw)['chart']
        if chart.get('error'): raise ProviderError('Yahoo bu sembol için veri döndürmedi.')
        result=chart['result'][0]
        meta=result.get('meta') or {}
        if meta.get('symbol',symbol+'.IS')!=symbol+'.IS':
            raise ProviderError('Yahoo sembolü istekle eşleşmiyor.')
        observed=meta.get('dataGranularity',source)
        if {'1h':'60m'}.get(observed,observed)!=source:
            raise ProviderError('Yahoo farklı mum periyodu döndürdü; istenen grafik oluşturulmadı.')
        stamps=result.get('timestamp') or []
        quote=result['indicators']['quote'][0]
    except (ValueError,TypeError,KeyError,IndexError) as e:
        raise ProviderError('Yahoo geçmiş veri sözleşmesi okunamadı.') from e
    candles,seen=[],set()
    now=time.time()
    local_now=datetime.fromtimestamp(now,IST)
    for i,stamp in enumerate(stamps):
        try:
            values=[quote[k][i] for k in ('open','high','low','close','volume')]
            if any(x is None or isinstance(x,bool) for x in values) or isinstance(stamp,bool): continue
            o,h,l,c,v=map(float,values);t=float(stamp)
            if not all(math.isfinite(x) for x in (o,h,l,c,v,t)) or t<=0 or t>now+60 or not t.is_integer(): continue
            if not (0<l<=o<=h and l<=c<=h and v>=0): continue
            t=int(t)*1000
            if t in seen: raise ProviderError('Yahoo yanıtında yinelenen mum zamanı var; veri kullanılmadı.')
            seen.add(t)
            if source=='1d':
                day=datetime.fromtimestamp(t/1000,IST).date()
                closed=day<local_now.date() or (day==local_now.date() and (local_now.hour,local_now.minute)>=(18,10))
            else: closed=t/1000+int(source[:-1])*60<=now
            candles.append(dict(time=t,open=o,high=h,low=l,close=c,volume=v,closed=closed))
        except (ValueError,TypeError,KeyError,IndexError,OverflowError): continue
    candles.sort(key=lambda b:b['time'])
    if not source_override and interval in {'3m','10m','15m','30m','240m'}:
        candles=aggregate_candles(candles,int(source[:-1]),int(interval[:-1]),session=interval=='240m')
    elif interval in {'1w','1mo'}: candles=calendar_candles(candles,interval,now)
    if not candles: raise ProviderError('Bu zaman dilimi için kullanılabilir tamamlanmış OHLCV verisi yok.')
    return dict(provider='Yahoo Finance (unofficial)',symbol=symbol+'.IS',interval=interval,sourceInterval=source,
                range=range_,candles=candles,delayed=True,fetchedAt=int(now*1000),
                aggregation='ANDROID_OHLCV_RESAMPLER' if source!=interval and interval!='all' else None)


def yahoo_history(symbol, interval, range_):
    if not re.fullmatch(r'[A-Z0-9]{3,10}',symbol): raise ValueError('Geçersiz BIST sembolü')
    if interval not in INTERVALS or range_ not in MAX_BY_INTERVAL[interval]:
        raise ValueError('Bu aralık ve zaman dilimi desteklenmiyor')
    return _cached_history((symbol,interval,range_),lambda:fetch_history(symbol,interval,range_))


def yahoo_scan_history(symbol, interval, range_):
    """Scan provider intervals follow IntervalMarketDataProvider, independent of chart resampling."""
    if not re.fullmatch(r'[A-Z0-9]{3,10}',symbol):raise ValueError('Geçersiz BIST sembolü')
    if interval not in {'1m','5m','15m','30m','60m','1d'}:raise ValueError('Geçersiz ham tarama periyodu')
    if range_ not in MAX_BY_INTERVAL[interval]:raise ValueError('Geçersiz tarama aralığı')
    if interval=='1d':return yahoo_history(symbol,interval,range_)
    return _cached_history((symbol,'scan:'+interval,range_),lambda:fetch_history(symbol,interval,range_,source_override=interval))


def _cached_history(key,loader):
    with _lock:
        hit=CACHE.get(key)
        if hit and 0<=time.monotonic()-hit[0]<CACHE_SECONDS:
            CACHE.move_to_end(key)
            return hit[1]
        waiting=_pending.get(key);owner=waiting is None
        if owner: waiting=Future();_pending[key]=waiting
    if not owner: return waiting.result(timeout=20)
    try:
        data=loader()
        with _lock:
            CACHE[key]=(time.monotonic(),data);CACHE.move_to_end(key)
            while len(CACHE)>CACHE_MAX: CACHE.popitem(last=False)
        waiting.set_result(data)
        return data
    except Exception as e:
        waiting.set_exception(e)
        raise
    finally:
        with _lock: _pending.pop(key,None)
