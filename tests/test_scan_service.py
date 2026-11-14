import json
import threading
import time
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from engine_bridge import AndroidCore
from market_history import ProviderError
from scan_service import ScanService, history_stock, supported_interval, InsufficientHistoryError
from universe import parse_sources
from news_service import parse_rss
from instruments import parse_instrument
from valuation_service import valuation

NOW=1794045600000


def candles(count=252):
    return [dict(time=NOW-(count-i)*86400000,open=100+i*.1,high=102+i*.1,low=99+i*.1,close=101+i*.1,volume=1000000+i,closed=True) for i in range(count)]


class FixedUniverse:
    def get(self):return {'records':[{'symbol':f'T{i:04}'} for i in range(632)],'fetchedAt':NOW}


class StubCore:
    def request(self,payload):
        if payload.get('op')=='metadata':return {'requiredClosedBars':220}
        if payload.get('op')=='filter':return sorted(payload['results'],key=lambda x:x['symbol'])
        s=payload['stocks'][0]
        return {'results':[dict(symbol=s['symbol'],signalValidity='WATCH',candles=[],score=50)]}


def wait(service,key):
    for _ in range(200):
        status=service.status(key)
        if status['status'] not in {'QUEUED','RUNNING','CANCELLING'}:return status
        time.sleep(.01)
    raise AssertionError('Job did not settle')


class ScanServiceTests(unittest.TestCase):
    def test_real_input_series_survives_as_bounded_display_bars(self):
        service=ScanService(StubCore(),lambda *args:{'candles':candles(),'fetchedAt':NOW},FixedUniverse(),persist=False)
        key=service.start({'symbols':['ASELS'],'interval':'1d'})['id'];wait(service,key)
        row=service.results(key)['results'][0]
        self.assertEqual(len(row['candles']),36);self.assertEqual(row['candles'][-1]['close'],candles()[-1]['close'])
        self.assertEqual(row['closedBarCount'],252);self.assertEqual(row['score'],50);self.assertEqual(row['signalValidity'],'WATCH')

    def test_scan_failure_diagnostics_are_owner_scoped_and_paginated(self):
        service=ScanService(StubCore(),lambda *args:{'candles':candles(5),'fetchedAt':NOW},FixedUniverse(),persist=False)
        key=service.start({'symbols':['ASELS'],'interval':'1d'},owner='owner-a')['id']
        wait_result=None
        for _ in range(200):
            state=service.status(key,owner='owner-a')
            if state['status'] not in {'QUEUED','RUNNING','CANCELLING'}:
                wait_result=state;break
            time.sleep(.01)
        self.assertIsNotNone(wait_result)
        failures=service.failures(key,owner='owner-a',page=1,size=1)
        self.assertEqual(failures['total'],1)
        self.assertEqual(failures['failures'][0]['symbol'],'ASELS')
        self.assertEqual(len(failures['failures']),1)
        with self.assertRaises(KeyError):service.failures(key,owner='owner-b')
        with self.assertRaises(ValueError):service.failures(key,owner='owner-a',size=999)

    def test_checkpoint_write_failure_is_visible_in_status(self):
        with tempfile.TemporaryDirectory() as directory:
            service=ScanService(StubCore(),directory=directory);job={'id':'a'*32,'status':'COMPLETE'};service.jobs[job['id']]=job
            with patch.object(Path,'write_text',side_effect=OSError('EXPLICIT DISK FAILURE')):service._checkpoint(job)
            state=service.status(job['id'])['storage'];self.assertFalse(state['checkpointSaved']);self.assertIn('EXPLICIT DISK FAILURE',state['error']);self.assertTrue(state['ephemeral'])

    def test_mounted_checkpoint_has_accurate_storage_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            service=ScanService(StubCore(),directory=directory);job={'id':'a'*32,'status':'COMPLETE'};service.jobs[job['id']]=job
            with patch('scan_service.os.path.ismount',return_value=True):
                service._checkpoint(job);state=service.status(job['id'])['storage']
            self.assertTrue(state['checkpointSaved']);self.assertFalse(state['ephemeral']);self.assertEqual((state['retentionHours'],state['maxRetainedJobs']),(2,4))

    def test_retention_prunes_only_older_scan_checkpoints(self):
        with tempfile.TemporaryDirectory() as directory:
            service=ScanService(StubCore(),directory=directory);keep=Path(directory)/'user-export.json';keep.write_text('{}')
            for i in range(6):service._checkpoint({'id':str(i)*32,'status':'COMPLETE'})
            self.assertEqual(len(list(Path(directory).glob('scan-*.json'))),4);self.assertTrue(keep.exists())

    def test_restart_preserves_results_and_resume_only_fetches_missing_symbols(self):
        calls=[]
        def provider(symbol,*args):
            calls.append(symbol)
            return {'candles':candles(),'fetchedAt':NOW}
        with tempfile.TemporaryDirectory() as directory:
            service=ScanService(StubCore(),provider,FixedUniverse(),directory=directory)
            key=service.start({'symbols':['ONE','TWO','THREE'],'interval':'1d'})['id'];wait(service,key)
            job=service.jobs[key];job['results']=[x for x in job['results'] if x['symbol']=='ONE']
            job.update(processed=2,successful=1,insufficient=0,errors=1,status='RUNNING',failures=[{'symbol':'TWO','code':'PROVIDER_OR_CORE_ERROR','error':'offline'}]);service._checkpoint(job)
            restarted=ScanService(StubCore(),provider,FixedUniverse(),directory=directory)
            self.assertTrue(restarted.status(key)['storage']['checkpointSaved'])
            self.assertEqual(restarted.status(key)['status'],'INTERRUPTED');calls.clear()
            resumed=restarted.start({'scope':'discovered','interval':'1d','resumeFrom':key})['id'];status=wait(restarted,resumed)
            self.assertEqual((status['processed'],status['successful'],status['errors']),(3,2,1))
            self.assertIn('THREE',calls);self.assertNotIn('ONE',calls);self.assertNotIn('TWO',calls)
            self.assertEqual(len(restarted.results(resumed)['results']),2)
            calls.clear();retried=restarted.start({'scope':'discovered','interval':'1d','resumeFrom':resumed,'retryFailuresOnly':True})['id'];status=wait(restarted,retried)
            self.assertEqual((status['total'],status['processed'],status['successful'],status['errors']),(1,1,1,0))
            self.assertIn('TWO',calls);self.assertNotIn('ONE',calls);self.assertNotIn('THREE',calls)
            self.assertEqual(restarted.status(resumed)['errors'],1)

    def test_full_632_universe_progress_and_pagination(self):
        calls=[]
        def provider(symbol,interval,range_):calls.append(symbol);return {'candles':candles(),'fetchedAt':NOW}
        service=ScanService(StubCore(),provider,FixedUniverse(),persist=False)
        key=service.start({'scope':'discovered','interval':'1d'})['id'];status=wait(service,key)
        self.assertEqual((status['total'],status['processed'],status['successful'],status['errors']),(632,632,632,0))
        pages=[service.results(key,page=i,size=100)['results'] for i in range(1,8)]
        rows=[x['symbol'] for page in pages for x in page]
        self.assertEqual(len(rows),632);self.assertEqual(len(set(rows)),632)
        self.assertFalse(status['canClaimExchangeComplete']);self.assertFalse(status['signalAttestationVerified'])

    def test_insufficient_history_is_separate_from_provider_error(self):
        def provider(symbol,interval,range_):
            if symbol=='BAD':raise ProviderError('missing',400)
            return {'candles':candles(219 if symbol=='NEW' else 252),'fetchedAt':NOW}
        service=ScanService(StubCore(),provider,FixedUniverse(),persist=False)
        key=service.start({'symbols':['NEW','GOOD','BAD'],'interval':'1d'})['id'];s=wait(service,key)
        self.assertEqual((s['processed'],s['successful'],s['insufficient'],s['errors']),(3,1,1,1))
        self.assertEqual(s['status'],'COMPLETED_WITH_ERRORS')
        self.assertIn('INSUFFICIENT_HISTORY',{x['code'] for x in s['failures']})

    def test_core_result_must_match_requested_symbol_and_signal_state(self):
        # Bad core envelopes must never enter scan success rows or checkpoints.
        bad_payloads=[
            {'results':[{'symbol':'THYAO','signalValidity':'WATCH'}]},
            {'results':[{'symbol':'ASELS'}]},
            {'results':[{'symbol':'ASELS','signalValidity':None}]},
            {'results':[{'symbol':'ASELS','signalValidity':'  '}]},
            {'results':[{'symbol':'ASELS','signalValidity':'WATCH'},
                        {'symbol':'THYAO','signalValidity':'WATCH'}]},
            {'results':[]},
            {'results':'wrong-type'},
            {'results':[None]},
            [],
        ]
        class InvalidCore(StubCore):
            def __init__(self,response):self.response=response
            def request(self,payload):
                if payload.get('op')=='metadata':return {'requiredClosedBars':220}
                if payload.get('op')=='filter':return []
                return self.response
        for bad in bad_payloads:
            with self.subTest(bad=bad):
                service=ScanService(
                    InvalidCore(bad),
                    lambda *args:{'candles':candles(),'fetchedAt':NOW},
                    FixedUniverse(),persist=False)
                key=service.start({'symbols':['ASELS'],'interval':'1d'})['id']
                status=wait(service,key)
                self.assertEqual((status['processed'],status['successful'],
                                  status['insufficient'],status['errors']),(1,0,0,1))
                self.assertEqual(status['status'],'COMPLETED_WITH_ERRORS')
                self.assertEqual(service.results(key)['total'],0)
                self.assertEqual(status['failures'][0]['symbol'],'ASELS')
                self.assertEqual(status['failures'][0]['classification'],'CORE_OR_ADAPTER')

    def test_cancellation_prevents_queued_work_and_concurrent_job(self):
        entered=threading.Event();release=threading.Event()
        def provider(*args):entered.set();release.wait(2);return {'candles':candles(),'fetchedAt':NOW}
        service=ScanService(StubCore(),provider,FixedUniverse(),persist=False)
        key=service.start({'scope':'discovered'})['id'];self.assertTrue(entered.wait(1))
        with self.assertRaises(ProviderError):service.start({'symbols':['ASELS']})
        service.cancel(key);release.set();s=wait(service,key)
        self.assertEqual(s['status'],'CANCELLED');self.assertLess(s['processed'],s['total'])

    def test_all_original_minute_periods_and_no_240_daily_alias(self):
        self.assertTrue(all(supported_interval(str(i)+'m') for i in range(1,240)))
        for x in ['0m','240m','01m','1h','max',1,True,None]:self.assertFalse(supported_interval(x))
        self.assertTrue(supported_interval('1d'))

    def test_scan_history_rejects_wrong_symbol_or_interval(self):
        for changed in ({'symbol':'THYAO.IS','interval':'1d'},
                        {'symbol':'ASELS.IS','interval':'5m'}):
            with self.subTest(changed=changed):
                payload={'candles':candles(),'fetchedAt':NOW,**changed}
                with self.assertRaises(ProviderError) as caught:
                    history_stock('ASELS','1d',fetcher=lambda *args:payload)
                self.assertEqual(caught.exception.status,422)

    def test_scan_history_rejects_repeated_and_out_of_order_closes(self):
        for offset in (2,3):
            bars=candles()
            bars[-1]['time']=bars[-offset]['time']
            payload={'symbol':'ASELS.IS','interval':'1d','candles':bars,'fetchedAt':NOW}
            with self.subTest(offset=offset):
                with self.assertRaises(ProviderError) as caught:
                    history_stock('ASELS','1d',fetcher=lambda *args:payload)
                self.assertEqual(caught.exception.status,422)

    def test_wrong_symbol_is_reported_as_provider_failure_not_success(self):
        def provider(symbol,interval,range_):
            return {'symbol':'THYAO.IS','interval':interval,'candles':candles(),'fetchedAt':NOW}
        service=ScanService(StubCore(),provider,FixedUniverse(),persist=False)
        key=service.start({'symbols':['ASELS'],'interval':'1d'})['id']
        status=wait(service,key)
        self.assertEqual((status['processed'],status['successful'],status['errors']),(1,0,1))
        failure=status['failures'][0]
        self.assertEqual(failure['httpStatus'],422)
        self.assertEqual(failure['attempts'],1)
        self.assertEqual(failure['classification'],'PROVIDER')
        self.assertEqual(service.results(key)['total'],0)

    def test_scan_provider_rejects_invalid_closed_ohlcv_before_core(self):
        invalid=[
            ('open_beyond_high',lambda c:c.update(open=c['high']+1)),
            ('close_below_low',lambda c:c.update(close=c['low']-1)),
            ('negative_volume',lambda c:c.update(volume=-1)),
            ('nan_open',lambda c:c.update(open=float('nan'))),
            ('infinite_close',lambda c:c.update(close=float('inf'))),
            ('boolean_volume',lambda c:c.update(volume=True)),
            ('missing_high',lambda c:c.pop('high')),
        ]
        for name,corrupt in invalid:
            with self.subTest(name=name):
                bars=candles()
                corrupt(bars[-1])
                payload={'symbol':'ASELS.IS','interval':'1d','candles':bars,'fetchedAt':NOW}
                with self.assertRaises(ProviderError) as caught:
                    history_stock('ASELS','1d',fetcher=lambda *args:payload)
                self.assertEqual(caught.exception.status,422)
        for invalid_payload in (None,[],{'candles':None,'fetchedAt':NOW},
                                {'candles':[False],'fetchedAt':NOW}):
            with self.subTest(invalid_payload=invalid_payload):
                with self.assertRaises(ProviderError) as caught:
                    history_stock('ASELS','1d',fetcher=lambda *args:invalid_payload)
                self.assertEqual(caught.exception.status,422)

    def test_mixed_632_universe_keeps_provider_and_history_failures_separate(self):
        # Deterministic fixture stress test, NOT a real exchange-wide market scan.
        def provider(symbol,interval,range_):
            bars=candles(219 if symbol=='T0001' else 252)
            if symbol=='T0002':
                bars[-1]['high']=bars[-1]['close']-1
            if symbol=='T0003':
                raise ProviderError('fixture unavailable',404)
            return {'symbol':symbol+'.IS','interval':interval,'candles':bars,'fetchedAt':NOW}
        service=ScanService(StubCore(),provider,FixedUniverse(),persist=False)
        key=service.start({'scope':'discovered','interval':'1d'})['id']
        status=wait(service,key)
        self.assertEqual((status['total'],status['processed'],status['successful'],
                          status['insufficient'],status['errors']),(632,632,629,1,2))
        self.assertEqual(status['status'],'COMPLETED_WITH_ERRORS')
        failures={row['symbol']:row for row in status['failures']}
        self.assertEqual(set(failures),{'T0001','T0002','T0003'})
        self.assertEqual(failures['T0001']['code'],'INSUFFICIENT_HISTORY')
        self.assertEqual(failures['T0002']['httpStatus'],422)
        self.assertEqual(failures['T0002']['classification'],'PROVIDER')
        self.assertEqual(failures['T0003']['httpStatus'],404)
        rows=[row for page in range(1,8)
              for row in service.results(key,page=page,size=100)['results']]
        self.assertEqual(len(rows),629)
        self.assertEqual(len({row['symbol'] for row in rows}),629)
        self.assertFalse(status['canClaimExchangeComplete'])
        self.assertFalse(status['signalAttestationVerified'])

    def test_closed_bars_only_and_max_800_before_core(self):
        rows=candles(850);rows[-1]['closed']=False
        data=history_stock('ASELS','1d',fetcher=lambda *args:{'candles':rows,'fetchedAt':NOW})
        self.assertEqual(len(data['candles']),800);self.assertEqual(data['dataTimestamp'],rows[-2]['time'])
        self.assertFalse(data['isRealtime']);self.assertTrue(data['lastBarClosed'])


class SourceParsingTests(unittest.TestCase):
    def test_kap_multi_share_aliases_and_discovery_not_membership(self):
        discovery=''.join(f'<a href="/hisseler/t{i:04}-company">' for i in range(101))+'<a href="/hisseler/garan-bank">'
        table='<table>'+''.join(f'<tr><td><a href="/tr/sirket-bilgileri/ozet/{i}"><div>T{i:04}</div></a></td><td>Company {i}</td></tr>' for i in range(101))
        table+='<tr><td><a href="/tr/sirket-bilgileri/ozet/2422"><div>GARAN</div><div> TGB</div></a></td><td>Garanti Bankası</td></tr></table>'
        result=parse_sources(discovery,table)
        self.assertEqual(len(result['records']),102)
        self.assertEqual(next(x for x in result['records'] if x['symbol']=='GARAN')['companyName'],'Garanti Bankası')
        self.assertNotIn('TGB',[x['symbol'] for x in result['records']])
        self.assertFalse(result['canClaimExchangeComplete'])

    def test_rss_blocks_entities_and_unsafe_links(self):
        with self.assertRaises(ProviderError):parse_rss(b'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><rss/>')
        raw=b'<rss><channel><item><title>Invalid</title><link>javascript:alert(1)</link></item><item><title>Safe</title><link>https://example.com/news</link><source>Example</source><pubDate>Fri, 06 Nov 2026 12:00:00 GMT</pubDate></item></channel></rss>'
        items=parse_rss(raw);self.assertEqual(len(items),1);self.assertFalse(items[0]['contentVerified'])

    def test_instrument_identity_currency_and_daily_close(self):
        payload={'chart':{'result':[{'meta':{'symbol':'TRY=X','currency':'TRY','dataGranularity':'1d'},'timestamp':[1793740000,1793826400],
            'indicators':{'quote':[{'open':[40,40],'high':[42,42],'low':[39,39],'close':[41,41.5]}]}}]}}
        result=parse_instrument(json.dumps(payload).encode(),'TRY=X','USDTRY',1794045600)
        self.assertEqual(result['price'],41.5);self.assertEqual(result['observation'],'COMPLETED_DAILY')
        payload['chart']['result'][0]['meta']['currency']='USD'
        with self.assertRaises(ProviderError):parse_instrument(json.dumps(payload).encode(),'TRY=X','USDTRY',1794045600)


@unittest.skipUnless((Path(__file__).resolve().parents[1]/'android-core/build/android-core.jar').is_file(),'Build Android reference kernel first')
class CoreBridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.core=AndroidCore()
    @classmethod
    def tearDownClass(cls):cls.core.close()

    def test_viop_reference_cannot_publish_and_rejects_stale_quotes(self):
        now=int(time.time()*1000)
        contract=dict(symbol='F_TEST1126',underlying='TEST',expiry='2099-12',contractType='Vadeli İşlem',validity='VALID',validityReason='EXPLICIT TEST FIXTURE',lastTradingAt=now+30*86400000,expiryAt=now+30*86400000,isManual=False,dataMode='REALTIME',isRealtime=True,delaySeconds=0,currentSessionIncluded=True,exchangeTimezone='Europe/Istanbul',providerId='reference',providerLabel='EXPLICIT TEST FIXTURE')
        quote=dict(symbol=contract['symbol'],price=100,bid=99,ask=101,volume=10000,openInterest=1000,exchangeTimestamp=now-300000,receivedAt=now,source='EXPLICIT TEST FIXTURE',realtime=True,delaySeconds=0,currentSessionIncluded=True)
        result=self.core.request({'op':'viopReference','referenceOnly':True,'contracts':[contract],'quotes':{contract['symbol']:quote}})
        self.assertFalse(result['canPublishSignals']);self.assertFalse(result['signalAttestationVerified']);self.assertFalse(result['licensedProviderConnected'])
        self.assertEqual(result['result']['opportunities'],[])
        self.assertIn('STALE_DATA',{x['code'] for x in result['result']['errors']})

    def test_raw_ohlcv_chain_and_delay_safety_then_filter(self):
        stock=history_stock('ASELS','1d',fetcher=lambda *args:{'candles':candles(),'fetchedAt':NOW})
        result=self.core.request({'stocks':[stock]})['results'][0]
        self.assertEqual(result['calculationEngineVersion'],'V5.4.1');self.assertEqual(result['signalValidity'],'WATCH')
        self.assertEqual(result['signalScore'],0);self.assertIsNone(result['riskPlan'])
        self.assertIn('V531_AUDIT=COMPONENT=TREND',' '.join(result['scoreBreakdown']))
        for filter_ in ['LONG','SHORT','HIGH_POWER']:self.assertEqual(self.core.request({'op':'filter','filter':filter_,'results':[result]}),[])

    def test_open_candle_cannot_change_technical_and_quote_is_separate(self):
        rows=[dict(timestamp=c['time'],**{k:c[k] for k in ('open','high','low','close','volume')}) for c in candles()]
        stock={'symbol':'TEST','candles':rows,'interval':'1d','lastBarClosed':True}
        a=self.core.request({'op':'technical','stock':stock})['technical']
        forming={**rows[-1],'timestamp':rows[-1]['timestamp']+86400000,'open':1000,'high':2000,'low':500,'close':1500}
        b=self.core.request({'op':'technical','stock':{**stock,'candles':rows+[forming],'lastBarClosed':False,'quotePrice':9999}})['technical']
        self.assertEqual(a,b)

    def test_financial_reference_uses_original_peers_but_never_verifies_content(self):
        now=int(time.time()*1000)
        base=dict(sector='SAME',businessType='NON_FINANCIAL',accountingBasis='TMS29',financialCurrency='TRY',
            financialPeriodEndMs=now-60*86400000,disclosurePublishedAtMs=now-30*86400000,marketObservedAtMs=now-86400000,
            sharesOutstanding=10_000_000,netIncomeTtmTry=20_000_000,equityTry=100_000_000,ebitdaTtmTry=30_000_000,
            netDebtTry=10_000_000,freeCashFlowTtmTry=10_000_000,disclosureUrl='https://kap.org.tr/tr/Bildirim/1234567')
        records=[dict(base,symbol='VAL'+str(i),priceTry=10 if i==0 else 20,marketCapTry=100_000_000 if i==0 else 200_000_000) for i in range(6)]
        result=valuation({'financials':records},self.core)
        self.assertFalse(result['contentVerified']);self.assertEqual(result['publicationGate'],'KAP_CONTENT_UNVERIFIED')
        own=next(x for x in result['results'] if x['assessment']['symbol']=='VAL0')
        self.assertEqual(own['assessment']['status'],'RELATIVE_DISCOUNT');self.assertEqual(own['assessment']['peerCount'],5)
        self.assertIsNotNone(own['score']);self.assertFalse(own['contentVerified'])
        with self.assertRaises(ValueError):valuation({'financials':records+[records[0]]},self.core)

class FailureTelemetryTests(unittest.TestCase):
    def test_missing_history_reports_count_and_coverage_without_analysis(self):
        core=StubCore();service=ScanService(core,lambda *a:{'candles':candles(39),'fetchedAt':NOW},FixedUniverse(),persist=False)
        key=service.start({'symbols':['ASELS'],'interval':'1d'})['id'];status=wait(service,key)
        row=status['failures'][0]
        self.assertEqual((status['successful'],status['insufficient'],status['errors']),(0,1,0))
        self.assertEqual((row['closedBarCount'],row['requiredClosedBars'],row['interval']),(39,220,'1d'))
        self.assertLess(row['firstBarTime'],row['lastBarTime'])
    def test_provider_failure_preserves_status_and_attempts(self):
        def fetch(symbol,*args):
            if symbol=='XU100':return {'candles':candles(),'fetchedAt':NOW}
            raise ProviderError('TEST missing symbol',404)
        service=ScanService(StubCore(),fetch,FixedUniverse(),persist=False)
        status=wait(service,service.start({'symbols':['ASELS']})['id']);row=status['failures'][0]
        self.assertEqual((row['httpStatus'],row['attempts'],row['classification'],row['stage']),(404,1,'PROVIDER','HISTORY_PROVIDER'))
    def test_retry_after_is_respected_without_early_retry(self):
        from unittest.mock import Mock
        service=ScanService(StubCore(),Mock(side_effect=ProviderError('limit',429,125)),persist=False)
        cancel=Mock();cancel.is_set.return_value=False;cancel.wait.return_value=True
        self.assertIsNone(service._one({'cancel':cancel,'interval':'1d','identities':{}},'ASELS',[]))
        cancel.wait.assert_called_once_with(125)
