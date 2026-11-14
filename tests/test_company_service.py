import json,unittest
from unittest.mock import patch
from company_service import parse,urls,company_data,_cache
from market_history import ProviderError

def element(tag,children):return ['$',tag,None,{'children':children}]
def fixture(symbol='TESTX'):
    table=element('table',[element('tr',[element('th','FİNANSAL DURUM TABLOSU'),element('th','2026/09')]),'$a'])
    row=element('tr',[element('td','Özkaynak'),element('td','100')])
    records='1:'+json.dumps(table,ensure_ascii=False)+'\na:'+json.dumps(row,ensure_ascii=False)+'\n'
    return '<p>'+symbol+'</p><script>self.__next_f.push('+json.dumps([1,records],ensure_ascii=False)+')</script>'
class CompanyTests(unittest.TestCase):
    def setUp(self):_cache.clear()
    def test_streamed_body_is_resolved_without_running_script(self):
        self.assertEqual(parse(fixture(),'TESTX','financial')[0],[['FİNANSAL DURUM TABLOSU','2026/09'],['Özkaynak','100']])
    def test_wrong_symbol_rejects_other_company_tables(self):
        with self.assertRaisesRegex(ValueError,'sembol'):parse(fixture('OTHER'),'TESTX','financial')
    def test_missing_table_rejects_instead_of_fabricating(self):
        with self.assertRaises(ValueError):parse('<p>TESTX</p>','TESTX','financial')
    def test_ownership_headers_only_are_not_data(self):
        with self.assertRaises(ValueError):parse('<p>TESTX</p><table><tr><th>Ortağın Adı</th><th>Sermayedeki Payı</th></tr></table>','TESTX','ownership')
    def test_official_urls_cannot_be_arbitrary_hosts_or_queries(self):
        for value in ['https://evil.test/tr/sirket-bilgileri/ozet/123-test','https://kap.org.tr/tr/sirket-bilgileri/ozet/123-test?x=y','http://kap.org.tr/tr/sirket-bilgileri/ozet/123-test']:
            with self.assertRaises(ValueError):urls({'kapUrl':value})
        self.assertEqual(urls({'kapUrl':'https://kap.org.tr/tr/sirket-bilgileri/ozet/123-test'})['financial'],'https://www.kap.org.tr/tr/sirket-finansal-bilgileri/123-test')
    def test_bad_request_does_not_fetch(self):
        with patch('company_service.urllib.request.urlopen') as f:
            with self.assertRaises(ValueError):company_data('../x','financial')
            f.assert_not_called()
