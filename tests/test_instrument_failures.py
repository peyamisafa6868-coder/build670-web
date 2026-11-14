import io
import unittest
import urllib.error
from unittest.mock import patch
import instruments as m

class InstrumentFailures(unittest.TestCase):
    def setUp(self):m._cache.clear()
    def test_provider_status_and_symbol_are_preserved(self):
        for status in [404,429,503]:
            error=urllib.error.HTTPError('https://query1.finance.yahoo.com',status,'error',{},io.BytesIO())
            with patch.object(m.urllib.request,'urlopen',side_effect=error):
                row=next(x for x in m.overview()['items'] if x['key']=='XAUUSD')
            self.assertEqual(row['status'],status)
            self.assertIn('XAUUSD=X',row['error'])
            self.assertNotIn('price',row)
            self.assertEqual(row['retryAfter'],60 if status==429 else None)
    def test_timeout_is_distinct_from_missing_symbol(self):
        with patch.object(m.urllib.request,'urlopen',side_effect=TimeoutError()):
            with self.assertRaises(m.ProviderError) as result:m.instrument('USDTRY')
        self.assertEqual(result.exception.status,504)
    def test_one_failed_instrument_does_not_hide_other_prices(self):
        def fetch(key):
            if key=='XAUUSD':raise m.ProviderError('missing',404)
            return {'key':key,'price':1,'delayed':True}
        with patch.object(m,'instrument',side_effect=fetch):data=m.overview()
        self.assertFalse(data['live'])
        self.assertEqual(sum('price' in x for x in data['items']),4)
        self.assertEqual(len(data['items']),5)
