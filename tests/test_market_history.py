import concurrent.futures
import io
import json
import math
import threading
import time
import unittest
import urllib.error
import urllib.request
from datetime import datetime
from unittest.mock import patch
import market_history as history
import server


def stamp(text):
    return int(datetime.fromisoformat(text).timestamp()*1000)


def bar(t, price=100, closed=True):
    return dict(time=t,open=price,high=price+2,low=price-1,close=price+1,volume=10,closed=closed)


class AggregationTests(unittest.TestCase):
    def test_ten_minute_exact_ohlcv_and_incomplete_tail(self):
        t=stamp('2026-11-06T10:00:00+03:00')
        rows=[bar(t+i*300000,100+i) for i in range(5)]
        result=history.aggregate_candles(rows,5,10)
        self.assertEqual(len(result),2)
        self.assertEqual(result[0],dict(time=t,open=100,high=103,low=99,close=102,volume=20,closed=True))

    def test_gap_open_duplicate_and_midnight_are_not_fabricated(self):
        t=stamp('2026-11-06T10:00:00+03:00')
        for rows in [[bar(t),bar(t+600000)],[bar(t),bar(t+300000,closed=False)],
                     [bar(t),bar(t),bar(t+300000)],
                     [bar(stamp('2026-11-06T23:55:00+03:00')),bar(stamp('2026-11-07T00:00:00+03:00'))]]:
            self.assertEqual(history.aggregate_candles(rows,5,10),[])

    def test_four_hour_session_anchor(self):
        t=stamp('2026-11-06T10:00:00+03:00')
        rows=[bar(t+i*3600000,100+i) for i in range(8)]
        result=history.aggregate_candles(rows,60,240,session=True)
        self.assertEqual([r['time'] for r in result],[t,t+4*3600000])
        self.assertEqual(result[0]['volume'],40)

    def test_weekly_candle_does_not_reopen_during_weekend(self):
        # Nov 6, 2026 was a Friday. Weekly candle should stay closed
        # after Friday's regular BIST close until the next trading week.
        friday=bar(stamp('2026-11-06T10:00:00+03:00'))
        cases=[
            ('2026-11-06T18:09:00+03:00',False),
            ('2026-11-06T18:10:00+03:00',True),
            ('2026-11-07T12:00:00+03:00',True),
            ('2026-11-08T12:00:00+03:00',True),
            ('2026-11-09T00:00:00+03:00',True),
        ]
        for now,expected in cases:
            with self.subTest(now=now):
                candles=history.calendar_candles([friday],'1w',stamp(now)/1000)
                self.assertEqual(len(candles),1)
                self.assertIs(candles[0]['closed'],expected)
        # Source rows that are not closed must never be promoted to closed.
        still_open=bar(stamp('2026-11-06T10:00:00+03:00'),closed=False)
        self.assertIs(history.calendar_candles([still_open],'1w',stamp('2026-11-08T12:00:00+03:00')/1000)[0]['closed'],False)

    def test_weekly_and_monthly_istanbul_boundaries(self):
        rows=[bar(stamp(s)) for s in ['2026-10-30T10:00:00+03:00','2026-11-02T10:00:00+03:00','2026-11-06T10:00:00+03:00']]
        now=stamp('2026-11-07T12:00:00+03:00')/1000
        weeks=history.calendar_candles(rows,'1w',now)
        months=history.calendar_candles(rows,'1mo',now)
        self.assertEqual([r['volume'] for r in weeks],[10,20])
        self.assertEqual([r['closed'] for r in months],[True,False])
        self.assertEqual(months[1]['time'],rows[1]['time'])


class UpstreamTests(unittest.TestCase):
    def setUp(self): history.CACHE.clear()

    def payload(self, stamps=None, values=None):
        stamps=stamps or [stamp('2026-11-06T10:00:00+03:00')//1000]
        values=values or [100,102,99,101,10]
        return {'chart':{'result':[{'meta':{'symbol':'ASELS.IS'},'timestamp':stamps,
            'indicators':{'quote':[dict((k,[v]*len(stamps)) for k,v in zip(['open','high','low','close','volume'],values))]}}]}}

    def response(self, data):
        class Response:
            status=200
            def __enter__(self):return self
            def __exit__(self,*args):pass
            def read(self,n):return data
        return Response()

    def test_invalid_provider_payloads_are_not_client_errors(self):
        mismatch=self.payload();mismatch['chart']['result'][0]['meta']['symbol']='THYAO.IS'
        duplicate=self.payload(stamps=[1000000,1000000])
        for raw in [b'<html>error</html>',b'{}',json.dumps(mismatch).encode(),json.dumps(duplicate).encode(),
                    json.dumps(self.payload(values=[100,102,99,float('nan'),10])).encode(),
                    json.dumps(self.payload(values=[100,102,99,101,-1])).encode()]:
            with patch.object(history.urllib.request,'urlopen',return_value=self.response(raw)):
                with self.assertRaises(history.ProviderError):history.yahoo_history('ASELS','1d','1mo')
            self.assertFalse(history.CACHE)

    def test_rate_limit_and_timeout(self):
        limited=urllib.error.HTTPError('https://query1.finance.yahoo.com',429,'limit',{'Retry-After':'90'},io.BytesIO())
        missing=urllib.error.HTTPError('https://query1.finance.yahoo.com',404,'missing',{},io.BytesIO())
        for error,status in [(limited,429),(missing,404),(TimeoutError(),504)]:
            with patch.object(history.urllib.request,'urlopen',side_effect=error):
                with self.assertRaises(history.ProviderError) as caught:history.yahoo_history('ASELS','1d','1mo')
            self.assertEqual(caught.exception.status,status)

    def test_concurrent_identical_requests_share_one_fetch(self):
        entered=threading.Event();release=threading.Event()
        def fetch(*args):entered.set();release.wait(2);return {'candles':[bar(1000000)]}
        with patch.object(history,'fetch_history',side_effect=fetch) as upstream:
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                futures=[pool.submit(history.yahoo_history,'ASELS','1d','1mo') for _ in range(4)]
                self.assertTrue(entered.wait(1));release.set()
                results=[x.result() for x in futures]
        self.assertEqual(upstream.call_count,1)
        self.assertTrue(all(x==results[0] for x in results))

    def test_cache_bound(self):
        with patch.object(history,'fetch_history',return_value={'candles':[]}),patch.object(history,'CACHE_MAX',3):
            for symbol in ['ASELS','THYAO','TUPRS','EREGL']:history.yahoo_history(symbol,'1d','1mo')
        self.assertEqual(len(history.CACHE),3)
        self.assertNotIn(('ASELS','1d','1mo'),history.CACHE)

    def test_ten_minute_requests_real_five_minute_source(self):
        start=stamp('2026-11-06T10:00:00+03:00')//1000
        payload=self.payload(stamps=[start,start+300,start+600,start+900])
        with patch.object(history.urllib.request,'urlopen',return_value=self.response(json.dumps(payload).encode())) as upstream:
            result=history.yahoo_history('ASELS','10m','1mo')
        self.assertIn('interval=5m',upstream.call_args.args[0].full_url)
        self.assertEqual(result['interval'],'10m')
        self.assertEqual(len(result['candles']),2)
        self.assertTrue(all(r['closed'] for r in result['candles']))

    def test_wrong_granularity_is_rejected_and_max_uses_daily_boundaries(self):
        payload=self.payload();payload['chart']['result'][0]['meta']['dataGranularity']='1mo'
        with patch.object(history.urllib.request,'urlopen',return_value=self.response(json.dumps(payload).encode())):
            with self.assertRaises(history.ProviderError):history.yahoo_history('ASELS','all','max')
        payload['chart']['result'][0]['meta']['dataGranularity']='1d'
        with patch.object(history.urllib.request,'urlopen',return_value=self.response(json.dumps(payload).encode())) as upstream:
            data=history.yahoo_history('ASELS','all','max')
        url=upstream.call_args.args[0].full_url
        self.assertNotIn('range=max',url)
        self.assertIn('period1=0',url)
        self.assertEqual(data['sourceInterval'],'1d')

    def test_yahoo_hour_alias_is_same_duration(self):
        payload=self.payload();payload['chart']['result'][0]['meta']['dataGranularity']='1h'
        with patch.object(history.urllib.request,'urlopen',return_value=self.response(json.dumps(payload).encode())):
            data=history.yahoo_history('ASELS','60m','1mo')
        self.assertEqual(data['interval'],'60m')


class HttpFailureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.worker=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.worker.start()
        cls.url='http://127.0.0.1:'+str(cls.http.server_address[1])

    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()

    def test_duplicate_query_and_provider_status(self):
        with self.assertRaises(urllib.error.HTTPError) as caught:
            urllib.request.urlopen(self.url+'/history?symbol=ASELS&symbol=THYAO')
        self.assertEqual(caught.exception.code,400)
        with patch.object(server,'yahoo_history',side_effect=history.ProviderError('Yahoo istek sınırı',429,90)):
            with self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(self.url+'/history?symbol=ASELS')
        self.assertEqual(caught.exception.code,429)
        self.assertEqual(caught.exception.headers['Retry-After'],'90')
