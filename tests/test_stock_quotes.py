import unittest
from unittest.mock import patch
from stock_quotes import stock_quote
from market_history import ProviderError

class DisplayQuoteTests(unittest.TestCase):
 def history(self):return {'symbol':'ASELS.IS','interval':'1d','candles':[{'time':1700000000000,'close':100,'volume':50},{'time':1700100000000,'close':110,'volume':60}], 'provider':'EXPLICIT TEST FIXTURE','fetchedAt':1700100001000}
 def test_previous_daily_close_and_strict_delay_label(self):
  h=self.history()
  with patch('stock_quotes.yahoo_history',return_value=h) as source:q=stock_quote('ASELS')
  source.assert_called_once_with('ASELS','1d','1mo');self.assertAlmostEqual(q['changePct'],10);self.assertEqual(q['price'],110);self.assertFalse(q['realtime']);self.assertTrue(q['delayed']);self.assertEqual(q['timestampKind'],'CANDLE_START');self.assertEqual(h['candles'][0]['close'],100)
 def test_one_observation_does_not_invent_a_daily_change(self):
  h=self.history();h['candles']=h['candles'][-1:]
  with patch('stock_quotes.yahoo_history',return_value=h):self.assertIsNone(stock_quote('ASELS')['changePct'])
 def test_mismatched_source_identity_is_rejected(self):
  h=self.history();h['symbol']='THYAO.IS'
  with patch('stock_quotes.yahoo_history',return_value=h):
   with self.assertRaises(ProviderError):stock_quote('ASELS')
 def test_bad_symbols_do_not_reach_the_provider(self):
  with patch('stock_quotes.yahoo_history') as source:
   for value in ['../secret','ASELS.IS','asels',None]:
    with self.assertRaises(ValueError):stock_quote(value)
  source.assert_not_called()

 def test_open_daily_bar_is_not_a_completed_close(self):
  h=self.history()
  h['candles'].append({'time':1700200000000,'close':999,'volume':777,'closed':False})
  h['candles'][-2]['closed']=True
  with patch('stock_quotes.yahoo_history',return_value=h):
   quote=stock_quote('ASELS')
  self.assertEqual(quote['price'],110)
  self.assertEqual(quote['previousDailyClose'],100)
  self.assertAlmostEqual(quote['changePct'],10)
  self.assertEqual(quote['timestamp'],1700100000000)
 def test_open_bar_cannot_be_used_as_previous_close(self):
  h=self.history()
  h['candles']=[{'time':1700000000000,'close':100,'volume':50,'closed':True},
                {'time':1700050000000,'close':700,'volume':20,'closed':False},
                {'time':1700100000000,'close':110,'volume':60,'closed':True}]
  with patch('stock_quotes.yahoo_history',return_value=h):
   quote=stock_quote('ASELS')
  self.assertEqual(quote['previousDailyClose'],100)
 def test_empty_or_only_open_daily_history_fails_cleanly(self):
  for candles in ([],[{'time':1700100000000,'close':110,'volume':60,'closed':False}]):
   h=self.history();h['candles']=candles
   with patch('stock_quotes.yahoo_history',return_value=h):
    with self.assertRaisesRegex(ProviderError,'günlük fiyat'):
     stock_quote('ASELS')
 def test_missing_or_invalid_previous_close_is_not_fabricated(self):
  h=self.history()
  h['candles'][0]['close']=0
  with patch('stock_quotes.yahoo_history',return_value=h):
   quote=stock_quote('ASELS')
  self.assertIsNone(quote['previousDailyClose'])
  self.assertIsNone(quote['changePct'])
