"""Bounded BIST delayed-data scan; never produces synthetic prices or trade signals."""
import math, re, threading, time, uuid
from engine_bridge import CORE, CoreError
from concurrent.futures import ThreadPoolExecutor
MAX_SYMBOLS=632
_lock=threading.RLock()
_jobs={}
_pool=ThreadPoolExecutor(max_workers=2,thread_name_prefix='bist-scan')
_symbol=re.compile(r'[A-Z0-9]{3,10}\Z')

def snapshot(job):
    return {k:job[k] for k in ('id','state','total','done','passed','failed','created','updated')}

def start(symbols,history,owner="local"):
    if not isinstance(symbols,list) or not 1<=len(symbols)<=MAX_SYMBOLS:
        raise ValueError('1–632 sembol içeren bir liste gereklidir.')
    normalized=[s.strip().upper().removesuffix('.IS') if isinstance(s,str) else None for s in symbols]
    if any(not isinstance(s,str) or not _symbol.fullmatch(s) for s in normalized) or len(set(normalized))!=len(normalized):
        raise ValueError('Geçersiz veya yinelenen BIST sembolü.')
    symbols=normalized
    now=time.time()
    with _lock:
        for jid,j in list(_jobs.items()):
            if j['state'] in ('complete','cancelled') and now-j['updated']>3600: del _jobs[jid]
        if sum(j['state'] in ('queued','running') for j in _jobs.values())>=3:
            raise RuntimeError('Tarama kapasitesi dolu.')
        jid=uuid.uuid4().hex
        j={'id':jid,'owner':owner,'state':'queued','total':len(symbols),'done':0,'passed':0,'failed':0,'created':now,'updated':now,'results':[],'errors':[],'cancel':threading.Event()}
        _jobs[jid]=j
    _pool.submit(_run,j,list(symbols),history)
    return snapshot(j)

def kotlin_indicators(symbol, bars, provider, core=CORE):
    """Single authority for EMA/RSI: unchanged Android calculation JAR.

    No Python fallback: when the core is unavailable the row fails closed.
    """
    converted=[{'timestamp': b['time'], **{k:float(b[k]) for k in ('open','high','low','close','volume')}} for b in bars]
    stock={'symbol':symbol,'candles':converted,'source':provider,'interval':'1d',
           'lastBarClosed':True,'dataTimestamp':converted[-1]['timestamp'],
           'lastBarTime':converted[-1]['timestamp'],'isRealtime':False,
           'delaySeconds':None,'currentSessionIncluded':False,
           'receivedAt':converted[-1]['timestamp'],'currency':'TRY','market':'BIST',
           'historySymbol':symbol,'exchangeTimezone':'Europe/Istanbul'}
    response=core.request({'op':'technical','stock':stock})
    if not isinstance(response,dict) or not isinstance(response.get('technical'),dict):
        raise CoreError('Kotlin teknik analiz gövdesi eksik.')
    readiness=response.get('readiness',{})
    if readiness.get('availableClosedBars',0)<220 or readiness.get('timeframeReady') is not True:
        raise CoreError('Kotlin 220 kapanmış mum gereksinimini karşılamadı.')
    t=response['technical']
    values={key:t.get(key) for key in ('ema20','ema50','ema200','rsi14')}
    if any(type(v) not in (float,int) or not math.isfinite(v) for v in values.values()):
        raise CoreError('Kotlin EMA/RSI çıktısı eksik veya geçersiz.')
    return values

def _run(j,symbols,history):
    with _lock:
        j['state']='running';j['updated']=time.time()
    for sym in symbols:
        if j['cancel'].is_set():break
        try:
            data=history(sym,'1d','2y')
            if not isinstance(data,dict) or data.get('symbol')!=sym+'.IS' or data.get('delayed') is not True or not data.get('provider'):
                raise ValueError('Kaynak kimliği veya gecikme bilgisi doğrulanamadı.')
            candles=data.get('candles')
            if not isinstance(candles,list): raise ValueError('OHLCV listesi bulunamadı.')
            bars=[b for b in candles if isinstance(b,dict) and b.get('closed') is True][-220:]
            if len(bars)<220: raise ValueError('220 kapanmış mum bulunamadı.')
            times=[b['time'] for b in bars]
            closes=[float(b['close']) for b in bars]
            if (any(type(t) is not int or t<=0 for t in times)
                    or any(a>=b for a,b in zip(times,times[1:]))
                    or any(not math.isfinite(x) or x<=0 for x in closes)):
                raise ValueError('Mum zamanı, sırası veya kapanış fiyatı geçersiz.')
            sma20=sum(closes[-20:])/20;sma50=sum(closes[-50:])/50
            metrics=kotlin_indicators(sym,bars,data['provider'])
            ema20=metrics['ema20'];ema50=metrics['ema50'];ema200=metrics['ema200']
            volumes=[float(b['volume']) for b in bars]
            highs=[float(b['high']) for b in bars]
            lows=[float(b['low']) for b in bars]
            if any(not math.isfinite(v) or v<0 for v in volumes) or any(not math.isfinite(h) for h in highs) or any(not math.isfinite(l) for l in lows):
                raise ValueError('Mum hacmi veya yüksek/düşük fiyat geçersiz.')
            opens=[float(b['open']) for b in bars]
            if (any(not math.isfinite(o) for o in opens)
                    or any(not (0 < low <= min(o,c) <= max(o,c) <= high)
                           for o,c,low,high in zip(opens,closes,lows,highs))):
                raise ValueError('OHLC fiyat aralıkları tutarsız; tarama sonucu oluşturulmadı.')
            avg_vol=sum(volumes[-21:-1])/20
            ratio=volumes[-1]/avg_vol if avg_vol>0 else None
            turnover=sum(c*v for c,v in zip(closes[-20:],volumes[-20:]))/20
            liquid=turnover>=5000000
            trending=closes[-1]>ema20>ema50>ema200
            strength=metrics['rsi14']
            row={'symbol':sym,'close':closes[-1],'sma20':round(sma20,5),'sma50':round(sma50,5),
                 'ema20':round(ema20,5),'ema50':round(ema50,5),'ema200':round(ema200,5),
                 'rsi14':round(strength,2),'volumeRatio':round(ratio,3) if ratio is not None else None,
                 'avgTurnoverTry':round(turnover,2),'liquid':liquid,'trendUp':trending,
                 'breakout':closes[-1]>max(highs[-21:-1]),'volumeSpike':ratio is not None and ratio>=1.5,
                 'aboveSma20':closes[-1]>sma20,'barCount':220,'lastBarTime':times[-1],
                 'provider':data['provider'],'delayed':True,'calculationSource':'ANDROID_KOTLIN_CORE'}
            with _lock:j['results'].append(row);j['passed']+=1
        except Exception as exc:
            with _lock:j['errors'].append({'symbol':sym,'error':str(exc)[:180]});j['failed']+=1
        finally:
            with _lock:j['done']+=1;j['updated']=time.time()
    with _lock:j['state']='cancelled' if j['cancel'].is_set() else 'complete';j['updated']=time.time()

def cancel(jid,owner="local"):
    with _lock:
        j=_jobs.get(jid)
        if j is None or j.get('owner')!=owner:raise KeyError(jid)
        j['cancel'].set();j['updated']=time.time()
        return snapshot(j)

def read(jid,page=1,page_size=25,filter_='all',sort='symbol',owner='local'):
    if not isinstance(page,int) or page<1 or not isinstance(page_size,int) or not 1<=page_size<=100:
        raise ValueError('Geçersiz sayfa veya sayfa boyutu.')
    if filter_ not in ('all','above_sma20','below_sma20','trend','breakout','volume','pullback','reversal') or sort not in ('symbol','close_desc'):
        raise ValueError('Geçersiz filtre veya sıralama.')
    with _lock:
        j=_jobs.get(jid)
        if j is None or j.get('owner')!=owner:raise KeyError(jid)
        rows=list(j['results']);errors=list(j['errors']);state=snapshot(j)
    if filter_=='above_sma20':rows=[r for r in rows if r['aboveSma20']]
    if filter_=='below_sma20':rows=[r for r in rows if not r['aboveSma20']]
    if filter_=='trend':rows=[r for r in rows if r['trendUp'] and r['liquid']]
    if filter_=='breakout':rows=[r for r in rows if r['trendUp'] and r['liquid'] and r['breakout'] and r['volumeSpike']]
    if filter_=='volume':rows=[r for r in rows if r['liquid'] and r['volumeSpike']]
    if filter_=='pullback':rows=[r for r in rows if r['trendUp'] and r['liquid'] and .98*r['ema20']<=r['close']<=1.03*r['ema20']]
    if filter_=='reversal':rows=[r for r in rows if r['liquid'] and 30<=r['rsi14']<=50 and r['close']>r['ema20']]
    rows.sort(key=(lambda r:(-r['close'],r['symbol'])) if sort=='close_desc' else (lambda r:r['symbol']))
    begin=(page-1)*page_size
    return {**state,'page':page,'pageSize':page_size,'filteredTotal':len(rows),'results':rows[begin:begin+page_size],'errors':errors}
