"""Cancelable, bounded full-universe jobs using real provider data and Android math."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import random
import threading
import time

from engine_bridge import CORE, CoreError
from market_history import yahoo_scan_history, ProviderError
from universe import UNIVERSE

ROOT=Path(__file__).resolve().parent
MAX_SCAN_SYMBOLS=632
FILTERS={'ALL','A_CLASS','BREAKOUT','REVERSAL','SQUEEZE','PULLBACK','VOLUME','TREND','LONG','SHORT','HIGH_POWER'}
QUICK={'1m','3m','5m','10m','15m','30m','60m','1d'}


class InsufficientHistoryError(ValueError):
    def __init__(self, stock):
        self.closed_bar_count=len(stock["candles"])
        self.first_bar=stock["candles"][0]["timestamp"] if stock["candles"] else None
        self.last_bar=stock["dataTimestamp"] or None
        super().__init__(f"INSUFFICIENT_HISTORY: {self.closed_bar_count}/220 kapanmış mum; teknik hesap yapılmadı.")


def supported_interval(interval):
    return isinstance(interval,str) and (interval=='1d' or bool(re.fullmatch(r'[1-9][0-9]{0,2}m',interval)) and 1<=int(interval[:-1])<=239)


def history_stock(symbol,interval,identity=None,fetcher=yahoo_scan_history,core=CORE):
    direct=interval in {'1m','5m','15m','30m','60m','1d'}
    source_interval=interval if direct else '1m'
    # Seven calendar days of 1-minute candles cannot provide 220 complete
    # bars if each requested bar exceeds this mathematical upper bound.
    if not direct and int(interval[:-1]) * 220 > 7 * 24 * 60:
        raise ProviderError('INSUFFICIENT_PROVIDER_HISTORY: 7 günlük 1m kaynak, 220 kapanmış mum oluşturamaz; desteklenen geçmiş kaynağı gerekli.', 422)
    range_='1y' if interval=='1d' else '7d' if source_interval=='1m' else '3mo' if interval=='60m' else '1mo'
    data=fetcher(symbol,source_interval,range_)
    if not isinstance(data,dict):
        raise ProviderError('Tarama kaynağı geçerli veri nesnesi döndürmedi.',422)
    # Do not re-label another instrument or timeframe as the requested stock.
    # Legacy isolated test providers omit this metadata; official adapters return it.
    if data.get('symbol') not in (None,symbol+'.IS'):
        raise ProviderError('Tarama kaynağı farklı hisse sembolü döndürdü.',422)
    if data.get('interval') not in (None,source_interval):
        raise ProviderError('Tarama kaynağı beklenen mum periyoduyla eşleşmiyor.',422)
    raw_bars=data.get('candles')
    if not isinstance(raw_bars,list) or any(not isinstance(c,dict) for c in raw_bars):
        raise ProviderError('Tarama kaynağının OHLCV listesi geçersiz.',422)
    closed=[c for c in raw_bars if c.get('closed') is True]
    timestamps=[c.get('time') for c in closed]
    if (any(type(t) is not int or t<=0 for t in timestamps)
            or any(left>=right for left,right in zip(timestamps,timestamps[1:]))):
        raise ProviderError('Tarama kaynağında yinelenen veya sırasız kapanmış mum zamanı var.',422)
    # Validate every completed candle before Kotlin analysis. This also protects
    # future market adapters that may bypass the Yahoo chart parser.
    fields=('open','high','low','close','volume')
    for candle in closed:
        values=[candle.get(field) for field in fields]
        if any(type(value) not in (int,float) or not math.isfinite(value) for value in values):
            raise ProviderError('Tarama kaynağında eksik veya geçersiz OHLCV değeri var.',422)
        open_,high,low,close,volume=values
        if not (0<low<=min(open_,close)<=max(open_,close)<=high and volume>=0):
            raise ProviderError('Tarama kaynağının OHLCV fiyat/hacim aralıkları tutarsız.',422)
    bars=[dict(timestamp=c['time'],**{k:c[k] for k in fields}) for c in closed]
    if not direct:
        bars=core.request({'op':'resample','candles':bars,'sourceMinutes':1,'targetMinutes':int(interval[:-1])})
    bars=bars[-800:]
    return {'symbol':symbol,'companyName':(identity or {}).get('companyName'), 'candles':bars,
        'source':'YAHOO FINANCE (RESMI DEGIL / GECIKMELI)','interval':interval,'lastBarClosed':True,
        'dataTimestamp':bars[-1]['timestamp'] if bars else 0,'lastBarTime':bars[-1]['timestamp'] if bars else 0,
        'isRealtime':False,'delaySeconds':None,'currentSessionIncluded':False,'receivedAt':data['fetchedAt'],
        'currency':'TRY','market':'BIST','historySymbol':symbol,'exchangeTimezone':'Europe/Istanbul'}


def scan_storage_is_persistent(directory):
    """Only an explicit mounted storage ancestor (not the root filesystem) counts."""
    path=Path(directory).resolve()
    return any(os.path.ismount(parent) for parent in (path, *path.parents) if str(parent) != '/')


class ScanService:
    def __init__(self,core=CORE,fetcher=yahoo_scan_history,universe=UNIVERSE,persist=True,directory=None):
        self.core,self.fetcher,self.universe,self.persist=core,fetcher,universe,persist
        self.lock=threading.RLock();self.jobs={};self.last_start=0
        self.directory=Path(directory) if directory is not None else Path(os.environ.get('BUILD670_SCAN_DATA_DIR', str(ROOT/'runtime-data')))
        if not self.directory.is_absolute():
            raise ValueError('Tarama veri dizini mutlak yol olmalı.')
        if persist:
            for path in sorted(self.directory.glob('scan-*.json'),key=lambda p:p.stat().st_mtime)[-4:]:
                try:
                    data=json.loads(path.read_text())
                    if not re.fullmatch(r'[A-Za-z0-9_-]{32}',data['id']) or not supported_interval(data['interval']) or time.time()-data['createdAt']/1000>7200:continue
                    symbols=data['universeSymbols']
                    if not isinstance(symbols,list) or not 1<=len(symbols)<=2000 or any(not isinstance(s,str) or not re.fullmatch('[A-Z0-9]{3,10}',s) for s in symbols):continue
                    if not isinstance(data['results'],list) or not isinstance(data['failures'],list):continue
                    if any(not isinstance(data.get(k),int) or data[k]<0 for k in ['total','processed','successful','insufficient','errors']):continue
                    done={r['symbol'] for r in data['results']}|{r['symbol'] for r in data['failures']}
                    if data['total']!=len(symbols) or data['processed']!=len(done) or data['processed']!=data['successful']+data['insufficient']+data['errors'] or not done<=set(symbols):continue
                    if data['status'] in {'QUEUED','RUNNING','CANCELLING'}:data['status']='INTERRUPTED'
                    data.update(cancel=threading.Event(),symbols=[],identities={},
                                checkpointSaved=True,checkpointError=None,ephemeral=not scan_storage_is_persistent(self.directory))
                    self.jobs[data['id']]=data
                except (OSError,ValueError,KeyError,TypeError):continue

    def start(self,request,owner="local"):
        if set(request)-{'symbols','interval','scope','resumeFrom','retryFailuresOnly'}:raise ValueError('Bilinmeyen tarama alanı.')
        if not isinstance(request.get('retryFailuresOnly',False),bool):raise ValueError('Geçersiz yeniden deneme seçimi.')
        interval=request.get('interval','1d')
        if not supported_interval(interval):raise ValueError('Tarama periyodu 1–239 dakika veya 1d olmalı. 240 dakika günlük değildir.')
        universe=self.universe.get();identities={x['symbol']:x for x in universe['records']}
        supplied=request.get('symbols')
        if supplied is None:
            if request.get('scope')!='discovered':raise ValueError('Hisse keşif kapsamı açıkça seçilmeli.')
            symbols=list(identities)
        else:
            if not isinstance(supplied,list) or not 1<=len(supplied)<=MAX_SCAN_SYMBOLS:raise ValueError('1–632 sembol gerekli.')
            if any(not isinstance(s,str) or not re.fullmatch('[A-Z0-9]{3,10}',s) for s in supplied):raise ValueError('Geçersiz hisse sembolü.')
            symbols=list(dict.fromkeys(supplied))
        if not 1<=len(symbols)<=MAX_SCAN_SYMBOLS:raise ValueError('Keşif kapsamı 1–632 sembol olmalı; liste sessizce kırpılmadı.')
        resume=None;universe_symbols=list(symbols)
        selection_mode='explicit' if supplied is not None else 'discovered'
        discovery_symbols=sorted(identities) if selection_mode=='discovered' else None
        if request.get('resumeFrom') is not None:
            key=request['resumeFrom']
            if not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9_-]{32}',key):raise ValueError('Geçersiz devam kaydı.')
            with self.lock:
                if key not in self.jobs:raise KeyError('Kayıtlı tarama bulunamadı.')
                old=self.jobs[key]
                if old.get('owner','local')!=owner:raise KeyError('Tarama bulunamadı.')
                if old.get('selectionMode')=='discovered':
                    if old.get('discoverySymbols')!=sorted(identities):
                        raise ValueError('Keşif evreni değişti; yeni tarama başlatın, sonuçlar birleştirilmedi.')
                    selection_mode='discovered';discovery_symbols=old['discoverySymbols']
                elif old.get('selectionMode') is None and supplied is None:
                    raise ValueError('Eski kaydın keşif sürümü bilinmiyor; kayıtlı sembolleri açıkça seçin veya yeni tarama başlatın.')
                else:
                    selection_mode='explicit';discovery_symbols=None
                if supplied is not None and set(symbols)!=set(old['universeSymbols']):raise ValueError('Devam evreni değişti; sonuçlar birleştirilmedi.')
                if old['interval']!=interval:raise ValueError('Kayıtlı periyot değiştirilerek devam edilemez.')
                if not old.get('universeSymbols'):raise ValueError('Eski kaydın tam sembol listesi bulunamadı.')
                if request.get('retryFailuresOnly',False):
                    # Re-run ONLY failed / insufficient symbols, while retaining
                    # the original universe and all previously successful rows.
                    symbols=list(dict.fromkeys(
                        [x['symbol'] for x in old['failures']]+
                        [x['symbol'] for x in old['results'] if x.get('signalValidity')=='INSUFFICIENT']))
                    if not symbols:raise ValueError('Yeniden denenecek eksik veya hatalı kayıt yok.')
                    universe_symbols=list(old['universeSymbols'])
                    retry_set=set(symbols)
                    retained_results=[x for x in old['results'] if x['symbol'] not in retry_set]
                    retained_failures=[x for x in old['failures'] if x['symbol'] not in retry_set]
                    resume={**old,'results':retained_results,'failures':retained_failures,
                        'processed':len(retained_results)+len(retained_failures),
                        'successful':sum(x.get('signalValidity')!='INSUFFICIENT' for x in retained_results),
                        'insufficient':sum(x.get('signalValidity')=='INSUFFICIENT' for x in retained_results)+
                            sum(x.get('classification')=='INSUFFICIENT_DATA' or x.get('code')=='INSUFFICIENT_HISTORY' for x in retained_failures),
                        'errors':sum(x.get('classification')!='INSUFFICIENT_DATA' and x.get('code')!='INSUFFICIENT_HISTORY' for x in retained_failures)}
                else:
                    resume=old;universe_symbols=list(old['universeSymbols'])
                    done={x['symbol'] for x in old['results']}|{x['symbol'] for x in old['failures']}
                    symbols=[s for s in universe_symbols if s not in done]
        elif request.get('retryFailuresOnly'):raise ValueError('Yeniden deneme için kayıtlı tarama gerekli.')
        self.core.request({'op':'metadata'})  # Fail before starting a job if runtime unavailable.
        with self.lock:
            if any(x['status'] in {'QUEUED','RUNNING','CANCELLING'} for x in self.jobs.values()):
                raise ProviderError('Bir tarama sürüyor. Bitmesini bekleyin veya kendi taramanızı durdurun.',409)
            for key in list(self.jobs):
                if time.time()-self.jobs[key]['createdAt']/1000>7200:del self.jobs[key]
            while len(self.jobs)>=4:del self.jobs[next(iter(self.jobs))]
            key=secrets.token_urlsafe(24)
            self.jobs[key]={'id':key,'owner':owner,'status':'QUEUED','createdAt':int(time.time()*1000),'interval':interval,
                'total':len(universe_symbols),'processed':0,'successful':0,'insufficient':0,'errors':0,'results':[],
                'failures':[],'cancel':threading.Event(),'symbols':symbols,'identities':identities,
                'universeSymbols':universe_symbols,'resumedFrom':request.get('resumeFrom'),
                'selectionMode':selection_mode,'discoverySymbols':discovery_symbols,
                'universeSha256':hashlib.sha256(json.dumps(sorted(universe_symbols),separators=(',',':')).encode()).hexdigest(),
                'canClaimExchangeComplete':False,'universeFetchedAt':universe['fetchedAt'],
                'signalAttestationVerified':False,'provider':'Yahoo Finance (unofficial, delayed)',
                'engineVersion':'V5.4.1','benchmarkError':None,'lastProgressAt':int(time.time()*1000)}
            if resume:
                for field in ['processed','successful','insufficient','errors']:self.jobs[key][field]=resume[field]
                self.jobs[key]['results']=list(resume['results']);self.jobs[key]['failures']=list(resume['failures'])
            self._checkpoint(self.jobs[key])
            threading.Thread(target=self._run,args=(key,),daemon=True,name='bist-scan').start()
            return self.status(key,owner=owner)

    def _one(self,job,symbol,benchmark):
        if job['cancel'].is_set():return None
        stock=None
        for attempt in range(3):
            try:
                stock=history_stock(symbol,job['interval'],job['identities'].get(symbol),self.fetcher,self.core);break
            except ProviderError as error:
                error.attempts=attempt+1
                error.stage="HISTORY_PROVIDER"
                if attempt==2 or error.status not in {429,502,503,504}:raise
                wait=error.retry_after if error.retry_after is not None else min(60,2**(attempt+1))+random.uniform(0,.5)
                with self.lock:job["lastRetry"]={"symbol":symbol,"attempt":attempt+1,"status":error.status,"waitSeconds":wait,"at":int(time.time()*1000)}
                if job['cancel'].wait(wait):return None
        if job['cancel'].is_set():return None
        if len(stock['candles'])<220:
            raise InsufficientHistoryError(stock)
        request={'stocks':[stock],'interval':job['interval'],'mode':'DELAYED_ANALYSIS','histories':{'XU100':{'1d':benchmark}}}
        payload=self.core.request(request)
        if not isinstance(payload,dict):
            raise CoreError('Android çekirdeği geçersiz sonuç gövdesi döndürdü.')
        results=payload.get('results')
        if not isinstance(results,list) or len(results)!=1:
            raise CoreError(payload.get('errorMessage') or 'Android çekirdeği tekil hisse sonucu üretemedi.')
        result=results[0]
        # Never place another instrument's result, or an incomplete signal state,
        # under the requested symbol. Validate before mutating the result/job.
        if (not isinstance(result,dict) or result.get('symbol')!=symbol
                or not isinstance(result.get('signalValidity'),str)
                or not result['signalValidity'].strip()):
            raise CoreError('Android çekirdeği istekle eşleşmeyen veya eksik sinyal sonucu döndürdü.')
        # Retain a bounded original-price series for StockListActivity sparklines.
        # Scores/decision inputs still use all closed bars and the full input hash.
        result['candles']=stock['candles'][-36:]
        result['closedBarCount']=len(stock['candles'])
        result['inputSha256']=hashlib.sha256(json.dumps(stock['candles'],sort_keys=True,separators=(',',':')).encode()).hexdigest()
        result['kapUrl']=job['identities'].get(symbol,{}).get('kapUrl')
        return result

    def _run(self,key):
        job=self.jobs[key]
        try:
            with self.lock:job['status']='RUNNING'
            try:benchmark=history_stock('XU100','1d',fetcher=self.fetcher)['candles']
            except Exception as error:benchmark=[];job['benchmarkError']=str(error)[:300]
            with ThreadPoolExecutor(max_workers=2,thread_name_prefix='yahoo-scan') as pool:
                # At most two in-flight provider requests; remaining futures are cancelable.
                futures={pool.submit(self._one,job,s,benchmark):s for s in job['symbols']}
                for future in as_completed(futures):
                    if job['cancel'].is_set():
                        for f in futures:f.cancel()
                    try:
                        item=future.result()
                        if item is None:continue
                        if job['cancel'].is_set():continue
                        with self.lock:
                            job['results'].append(item)
                            if item['signalValidity']=='INSUFFICIENT':job['insufficient']+=1
                            else:job['successful']+=1
                    except InsufficientHistoryError as error:
                        with self.lock:
                            job['failures'].append({'symbol':futures[future],'code':'INSUFFICIENT_HISTORY','error':str(error),'provider':'YAHOO','interval':job['interval'],'stage':'HISTORY_READINESS','classification':'INSUFFICIENT_DATA','closedBarCount':error.closed_bar_count,'requiredClosedBars':220,'firstBarTime':error.first_bar,'lastBarTime':error.last_bar})
                            job['insufficient']+=1
                    except Exception as error:
                        if future.cancelled():continue
                        provider=isinstance(error,ProviderError)
                        is_history_short=provider and 'INSUFFICIENT_PROVIDER_HISTORY' in str(error)
                        http=error.status if provider else None
                        code=('INSUFFICIENT_PROVIDER_HISTORY' if is_history_short else
                              'PROVIDER_RATE_LIMIT' if http==429 else
                              'PROVIDER_NOT_FOUND' if http==404 else
                              'INVALID_CANDLES' if provider and http==422 else
                              'PROVIDER_ERROR' if provider else 'CORE_ERROR')
                        with self.lock:
                            job['failures'].append({'symbol':futures[future],'code':code,'error':str(error)[:400],
                                'provider':'YAHOO' if provider else None,'interval':job['interval'],
                                'stage':getattr(error,'stage','CORE_OR_ADAPTER'),'httpStatus':http,
                                'attempts':getattr(error,'attempts',1),'lastBarTime':None,
                                'requiredClosedBars':220 if is_history_short else None,
                                'retryOutcome':'EXHAUSTED' if getattr(error,'attempts',1)>1 else 'NOT_RETRIED',
                                'classification':'INSUFFICIENT_DATA' if is_history_short else 'PROVIDER' if provider else 'CORE_OR_ADAPTER'})
                            if is_history_short:job['insufficient']+=1
                            else:job['errors']+=1
                    with self.lock:
                        job['processed']+=1
                        job['lastProgressAt']=int(time.time()*1000)
                    self._checkpoint(job)
            with self.lock:
                job['status']='CANCELLED' if job['cancel'].is_set() else 'COMPLETED_WITH_ERRORS' if job['errors'] else 'COMPLETE'
                job['completedAt']=int(time.time()*1000)
        except Exception as error:
            with self.lock:job['status']='FAILED';job['error']=str(error)[:400]
        self._checkpoint(job)

    def _checkpoint(self,job):
        if not self.persist:return
        try:
            directory=self.directory;directory.mkdir(parents=True,exist_ok=True)
            data={k:v for k,v in job.items() if k not in {'cancel','identities','symbols'}}
            data.update(ephemeral=not scan_storage_is_persistent(directory),checkpointSaved=True,checkpointError=None)
            raw=json.dumps(data,ensure_ascii=False,allow_nan=False)
            target=directory/('scan-'+job['id']+'.json');temporary=target.with_suffix('.tmp')
            with temporary.open('w') as stream:
                stream.write(raw);stream.flush();os.fsync(stream.fileno())
            temporary.replace(target)
            temporary=directory/('latest-'+job['id']+'.tmp');temporary.write_text(raw);temporary.replace(directory/'latest-scan.json')
            job.update(ephemeral=data['ephemeral'],checkpointSaved=True,checkpointError=None)
            # Match the existing four-job recovery limit and bound persistent-disk growth.
            for old in sorted(directory.glob('scan-*.json'),key=lambda p:p.stat().st_mtime)[:-4]:old.unlink()
        except (OSError,ValueError) as error:
            job.update(checkpointSaved=False,checkpointError=str(error)[:200])

    def status(self,key,owner="local"):
        with self.lock:
            if key not in self.jobs:raise KeyError('Tarama bulunamadı veya oturum süresi doldu.')
            job=self.jobs[key]
            if job.get('owner','local')!=owner:raise KeyError('Tarama bulunamadı.')
            label=('İptal edildi' if job['status']=='CANCELLED' else
                   'Tarama başarısız' if job['status'] in {'FAILED','INTERRUPTED'} else
                   'Hatalarla tamamlandı' if job['status']=='COMPLETED_WITH_ERRORS' else
                   'Eksik veriyle tamamlandı' if job['status']=='COMPLETE' and job['insufficient'] else
                   'Tamamlandı' if job['status']=='COMPLETE' else
                   'Tarama sürüyor' if job['status'] in {'RUNNING','QUEUED','CANCELLING'} else job['status'])
            return {**{k:v for k,v in job.items() if k not in {'cancel','symbols','universeSymbols','identities','results','owner'}},
                    'completionLabel':label,'pending':max(0,job['total']-job['processed']),
                    'storage':{'ephemeral':not (self.persist and scan_storage_is_persistent(self.directory)),
                               'checkpointSaved':job.get('checkpointSaved',False),'error':job.get('checkpointError'),
                               'retentionHours':2,'maxRetainedJobs':4}}

    def results(self,key,filter_='ALL',page=1,size=25,owner='local'):
        if filter_ not in FILTERS or not 1<=page<=2000 or not 1<=size<=100:raise ValueError('Geçersiz filtre veya sayfalama.')
        with self.lock:
            if key not in self.jobs:raise KeyError('Tarama bulunamadı.')
            if self.jobs[key].get('owner','local')!=owner:raise KeyError('Tarama bulunamadı.')
            rows=list(self.jobs[key]['results'])
            extras={x['symbol']:{k:x.get(k) for k in ('closedBarCount','inputSha256','kapUrl','strategies')} for x in rows}
        filtered=self.core.request({'op':'filter','filter':filter_,'results':rows}) if rows else []
        for row in filtered:row.update(extras.get(row['symbol'],{}))
        return {'total':len(filtered),'page':page,'size':size,'results':filtered[(page-1)*size:page*size]}

    def failures(self,key,page=1,size=100,owner='local'):
        """Owner-scoped, bounded diagnostic records; never returns another user's scan."""
        if not isinstance(page,int) or not isinstance(size,int) or not 1<=page<=2000 or not 1<=size<=100:
            raise ValueError('Geçersiz hata kaydı sayfalaması.')
        with self.lock:
            if key not in self.jobs or self.jobs[key].get('owner','local')!=owner:
                raise KeyError('Tarama bulunamadı.')
            failures=list(self.jobs[key].get('failures',[]))
            # Older scan results can also mark a symbol as insufficient without
            # emitting a separate failure record; do not duplicate their counts.
            insufficient=[{'symbol':r.get('symbol'),'code':'INSUFFICIENT_RESULT',
                           'error':r.get('signalValidityReason') or 'Yetersiz teknik veri',
                           'closedBarCount':r.get('closedBarCount'),'requiredClosedBars':220,
                           'interval':self.jobs[key].get('interval')}
                          for r in self.jobs[key].get('results',[])
                          if r.get('signalValidity')=='INSUFFICIENT']
        records=failures+insufficient
        return {'total':len(records),'page':page,'size':size,
                'failures':records[(page-1)*size:page*size]}

    def cancel(self,key,owner="local"):
        with self.lock:
            if key not in self.jobs:raise KeyError('Tarama bulunamadı.')
            job=self.jobs[key]
            if job.get('owner','local')!=owner:raise KeyError('Tarama bulunamadı.')
            if job['status'] in {'QUEUED','RUNNING','CANCELLING'}:job['cancel'].set();job['status']='CANCELLING'
        return self.status(key,owner=owner)


SCANS=ScanService()
