"""Views of browser-owned history, evaluated by the unchanged Android store.

No global user journal, remote signal authentication, or fabricated outcome is created.
"""
from datetime import datetime, timedelta
import math
import re
from zoneinfo import ZoneInfo
from engine_bridge import CORE
from market_history import yahoo_history
from concurrent.futures import ThreadPoolExecutor
import time

HORIZONS={'15m','30m','1h','4h','1d'}
STRATEGIES={'TREND','MOMENTUM','BREAKOUT','MEAN_REVERSION','MTF_REGIME','COMBINED'}

def valid_interval(value):
    return isinstance(value,str) and (value=='1d' or bool(re.fullmatch(r'[1-9][0-9]{0,2}m',value)) and int(value[:-1])<=239)

def validate_journal(payload):
    for key,limit in [('records',3000),('viopRecords',1500)]:
        rows=payload.get(key,[])
        if not isinstance(rows,list) or len(rows)>limit or any(not isinstance(x,dict) for x in rows):
            raise ValueError('Geçmiş kayıt biçimi veya saklama sınırı geçersiz.')
        for row in rows:
            for name in ['id','symbol','direction']:
                if name in row and (not isinstance(row[name],str) or len(row[name])>200):raise ValueError('Geçmiş kimlik alanı geçersiz.')
            for name in ['signalGeneratedAt','generatedAt']:
                if name in row and (type(row[name]) is not int or not 0<=row[name]<=9007199254740991):raise ValueError('Geçmiş zaman alanı geçersiz.')
            for name in ['signalPrice','finalSignalScore','technicalScore','riskScore']:
                if name in row and (type(row[name]) not in {int,float} or not math.isfinite(row[name]) or row[name]<0):raise ValueError('Geçmiş sayısal alanı geçersiz: '+name)
            if 'interval' in row and not valid_interval(row['interval']):raise ValueError('Geçmiş tarama periyodu geçersiz.')
            if 'strategyIds' in row and (not isinstance(row['strategyIds'],list) or any(not isinstance(s,str) or len(s)>100 for s in row['strategyIds'])):raise ValueError('Geçmiş strateji alanı geçersiz.')
            if 'outcomes' in row and (not isinstance(row['outcomes'],dict) or any(not isinstance(v,dict) for v in row['outcomes'].values())):raise ValueError('Geçmiş outcome alanı geçersiz.')
    def finite(value):
        if isinstance(value,(int,float)) and not isinstance(value,bool) and not math.isfinite(value):raise ValueError('Geçmiş sonlu olmayan sayı içeriyor.')
        if isinstance(value,dict):
            for v in value.values():finite(v)
        elif isinstance(value,list):
            for v in value:finite(v)
    finite(payload)

def day_bound(raw,end=False):
    if raw in (None,''):return None
    if not isinstance(raw,str) or not re.fullmatch(r'\d{2}\.\d{2}\.\d{4}',raw):raise ValueError('Geçersiz tarih (GG.AA.YYYY).')
    try:date=datetime.strptime(raw,'%d.%m.%Y').replace(tzinfo=ZoneInfo('Europe/Istanbul'))
    except ValueError:raise ValueError('Geçersiz tarih (GG.AA.YYYY).')
    if end:date+=timedelta(days=1,milliseconds=-1)
    return int(date.timestamp()*1000)

def view(payload):
    if set(payload)-{'records','viopRecords','filter','horizon'}:raise ValueError('Bilinmeyen geçmiş alanı.')
    validate_journal(payload)
    horizon=payload.get('horizon','15m')
    if horizon not in HORIZONS:raise ValueError('Geçersiz forward periyodu.')
    f=payload.get('filter',{})
    if not isinstance(f,dict) or set(f)-{'direction','minScore','symbol','fromDate','toDate','strategy','interval'}:raise ValueError('Geçersiz geçmiş filtresi.')
    strategy,interval=f.get('strategy',''),f.get('interval','')
    if not isinstance(strategy,str) or strategy and strategy not in STRATEGIES:raise ValueError('Geçersiz strateji filtresi.')
    if not isinstance(interval,str) or interval and interval!='UNKNOWN' and not valid_interval(interval):raise ValueError('Geçersiz tarama periyodu filtresi.')
    direction=f.get('direction');score=f.get('minScore');symbol=f.get('symbol','')
    if direction not in {None,'LONG','SHORT'} or score is not None and (type(score) is not int or not 0<=score<=100):raise ValueError('Geçersiz yön veya puan filtresi.')
    if not isinstance(symbol,str) or len(symbol)>40:raise ValueError('Geçersiz sembol filtresi.')
    start,end=day_bound(f.get('fromDate')),day_bound(f.get('toDate'),True)
    if start is not None and end is not None and start>end:raise ValueError('Bitiş tarihi başlangıçtan önce olamaz.')
    selected=[r for r in payload.get('records',[]) if (not strategy or strategy in r.get('strategyIds',[])) and
              (not interval or ('interval' not in r if interval=='UNKNOWN' else r.get('interval')==interval))]
    return CORE.request({'op':'historyView','records':payload.get('records',[]),'displayRecords':selected,'viopRecords':payload.get('viopRecords',[]),'horizon':horizon,
        'filter':{'direction':direction,'minScore':score,'symbol':symbol.strip(),'fromTime':start,'toTime':end}})

def record_job(payload,scans,owner="local"):
    if set(payload)-{'records','viopRecords','jobId'}:raise ValueError('Bilinmeyen geçmiş kayıt alanı.')
    validate_journal(payload)
    key=payload.get('jobId')
    if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',key):raise ValueError('Geçersiz tarama kaydı.')
    with scans.lock:
        if key not in scans.jobs:raise KeyError('Tarama kaydı bulunamadı.')
        job=scans.jobs[key]
        if job.get('owner','local')!=owner:raise KeyError('Tarama kaydı bulunamadı.')
        if job['status'] in {'QUEUED','RUNNING','CANCELLING'}:raise ValueError('Süren tarama henüz geçmişe alınamaz.')
        items=list(job['results'])
        status='COMPLETE' if job['status']=='COMPLETE' else 'PARTIAL' if job['status'] in {'CANCELLED','COMPLETED_WITH_ERRORS','INTERRUPTED'} and items else 'FAILED'
        run={'scanRunId':key,'scanStartedAt':job['createdAt'],'scanCompletedAt':job.get('completedAt'),
             'providerId':'web_delayed_yahoo','status':status,'count':len(items),'errorCount':job['errors']}
    result=CORE.request({'op':'historyView','action':'record','run':run,'opportunities':items,
        'records':payload.get('records',[]),'viopRecords':payload.get('viopRecords',[])})
    # The Android journal has no scan interval field. Preserve this web metadata
    # on newly created records without guessing a period for legacy entries.
    for row in result['records']:
        if row.get('scanRunId')==key and 'interval' not in row and valid_interval(job.get('interval')):row['interval']=job['interval']
    return result

def update(payload,fetcher=yahoo_history):
    if set(payload)-{'records','viopRecords','costs'}:raise ValueError('Bilinmeyen forward alanı.')
    validate_journal(payload)
    costs=payload.get('costs',{'quantity':0,'commissionPerSide':0,'slippageBpsPerSide':0})
    if not isinstance(costs,dict) or set(costs)!={'quantity','commissionPerSide','slippageBpsPerSide'} or any(type(v) not in {int,float} or not math.isfinite(v) or v<0 for v in costs.values()):raise ValueError('Geçersiz forward maliyet ayarları.')
    now=int(time.time()*1000);selected=[]
    for r in reversed(payload.get('records',[])):
        generated=r.get('signalGeneratedAt',0);outcomes=r.get('outcomes',{})
        if not isinstance(outcomes,dict):continue
        due=any(name not in outcomes and generated>0 and now>=generated+delay for name,delay in [('15m',900000),('30m',1800000),('1h',3600000),('4h',14400000),('1d',86400000)])
        if due and r.get('signalPrice',0)>0 and isinstance(r.get('symbol'),str) and re.fullmatch('[A-Z0-9]{3,10}',r['symbol']):selected.append(r)
        if len(selected)>=20:break
    def load(symbol):
        try:
            data=fetcher(symbol,'1m','7d')
            bars=[dict(timestamp=b['time'],**{k:b[k] for k in ['open','high','low','close','volume']}) for b in data['candles'] if b.get('closed') is True and b['time']<=now]
            return symbol,{'1m':bars},None
        except Exception:return symbol,{'1m':[]},'Gerçek kapanmış 1 DK geçmişi alınamadı; outcome üretilmedi.'
    histories={};errors={}
    with ThreadPoolExecutor(max_workers=2) as workers:
        for symbol,bars,error in workers.map(load,list(dict.fromkeys(r['symbol'] for r in selected))):
            histories[symbol]=bars
            if error:errors[symbol]=error
    result=CORE.request({'op':'historyView','action':'update','histories':histories,'costs':costs,
        'records':payload.get('records',[]),'viopRecords':payload.get('viopRecords',[])})
    result.update(updateErrors=errors,outcomeProvider='Yahoo Finance (unofficial, historical, closed 1m bars)')
    return result
