import io,unittest
from unittest.mock import patch
from urllib.parse import urlsplit,parse_qs
import news_service as n
from market_history import ProviderError

class NewsTests(unittest.TestCase):
 def setUp(self):n._cache.clear()
 def rss(self):return b'<rss><channel><item><title>EXPLICIT FIXTURE</title><link>https://example.com/news</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><source>Fixture Publisher</source></item></channel></rss>'
 def test_query_matches_android_symbol_or_quoted_company_terms(self):
  seen=[]
  def source(req,timeout):seen.append(parse_qs(urlsplit(req.full_url).query));return io.BytesIO(self.rss())
  with patch('news_service.urllib.request.urlopen',side_effect=source):
   for category in ['all','company','sector','kap','market']:n.news('ASELS',category,'ASELSAN Elektronik')
  self.assertEqual(seen[0]['q'],['ASELS OR "ASELSAN Elektronik"']);self.assertEqual(seen[2]['q'],['ASELS OR "ASELSAN Elektronik" sektör']);self.assertEqual(seen[-1]['q'],['Borsa İstanbul piyasa'])
 def test_cache_and_force_refresh_are_distinct(self):
  with patch('news_service.urllib.request.urlopen',side_effect=lambda *a,**k:io.BytesIO(self.rss())) as source:
   self.assertFalse(n.news('ASELS','all')['fromCache']);self.assertTrue(n.news('ASELS','all')['fromCache']);self.assertFalse(n.news('ASELS','all',force=True)['fromCache']);self.assertEqual(source.call_count,2)
 def test_unverified_rss_is_deduplicated_without_fabricating_documents(self):
  raw=self.rss().replace(b'</channel>',self.rss().split(b'<channel>')[1].split(b'</channel>')[0]+b'</channel>');rows=n.parse_rss(raw);self.assertEqual(len(rows),1);self.assertFalse(rows[0]['contentVerified']);self.assertEqual(rows[0]['source'],'Fixture Publisher')
 def test_unsafe_or_oversized_xml_is_rejected(self):
  for raw in [b'<!DOCTYPE rss><rss/>',b'<!ENTITY x "y"><rss/>',b'x'*2000001]:
   with self.assertRaises(ProviderError):n.parse_rss(raw)
 def test_failed_refresh_preserves_original_cache_time_and_marks_stale(self):
  with patch('news_service.urllib.request.urlopen',return_value=io.BytesIO(self.rss())):first=n.news('ASELS','all')
  with patch('news_service.urllib.request.urlopen',side_effect=OSError('EXPLICIT FAILURE')):cached=n.news('ASELS','all',force=True)
  self.assertTrue(cached['stale']);self.assertTrue(cached['fromCache']);self.assertEqual(cached['fetchedAt'],first['fetchedAt']);self.assertEqual(cached['items'],first['items'])
 def test_dividend_and_analyst_queries_are_separate_and_not_verified_archives(self):
  seen=[]
  def source(req,timeout):seen.append(parse_qs(urlsplit(req.full_url).query)['q'][0]);return io.BytesIO(self.rss())
  with patch('news_service.urllib.request.urlopen',side_effect=source):
   dividend=n.news('TTRAK','dividend','Türk Traktör')
   analyst=n.news('TTRAK','analyst','Türk Traktör')
  self.assertIn('TTRAK',seen[0]);self.assertIn('temettü',seen[0])
  self.assertIn('TTRAK',seen[1]);self.assertIn('analist raporu',seen[1])
  self.assertNotEqual(seen[0],seen[1])
  for value in [dividend,analyst]:
   self.assertEqual(value['coverage'],'NEWS_HEADLINES_ONLY')
   self.assertFalse(value['contentVerified'])
   self.assertFalse(value['paymentVerified'])
   self.assertFalse(value['analystReportVerified'])
  with self.assertRaises(ValueError):n.news('','dividend')
  with self.assertRaises(ValueError):n.news('','analyst')
