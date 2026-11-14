import json
import unittest
from datetime import datetime
from instruments import parse_instrument


def epoch(value):
    return datetime.fromisoformat(value).timestamp()


class InstrumentCloseTests(unittest.TestCase):
    def payload(self, ticker, currency='TRY'):
        stamps=[epoch(day+'T10:00:00+03:00') for day in ['2026-11-05','2026-11-06','2026-11-09']]
        return json.dumps({'chart':{'result':[{'meta':{'symbol':ticker,'currency':currency,'dataGranularity':'1d'},'timestamp':stamps,'indicators':{'quote':[{'open':[100,110,120],'high':[102,112,122],'low':[99,109,119],'close':[101,111,121]}]}}]}}).encode()

    def test_bist_close_boundary_and_both_indices(self):
        for key in ['XU100','XU030']:
            for clock,expected in [('18:09:59',111),('18:10:00',121),('19:00:00',121)]:
                with self.subTest(key=key,clock=clock):
                    result=parse_instrument(self.payload(key+'.IS'),key+'.IS',key,epoch('2026-11-09T'+clock+'+03:00'))
                    self.assertEqual(result['price'],expected)
                    self.assertTrue(result['delayed'])
                    self.assertEqual(result['observation'],'COMPLETED_DAILY')

    def test_next_day_keeps_last_observation(self):
        result=parse_instrument(self.payload('XU100.IS'),'XU100.IS','XU100',epoch('2026-11-10T00:01:00+03:00'))
        self.assertEqual(result['price'],121)

    def test_fx_does_not_inherit_bist_session_close(self):
        result=parse_instrument(self.payload('TRY=X'),'TRY=X','USDTRY',epoch('2026-11-09T19:00:00+03:00'))
        self.assertEqual(result['price'],111)

    def test_symbol_mismatch_still_rejected(self):
        from market_history import ProviderError
        with self.assertRaises(ProviderError):
            parse_instrument(self.payload('XU030.IS'),'XU100.IS','XU100',epoch('2026-11-09T19:00:00+03:00'))
