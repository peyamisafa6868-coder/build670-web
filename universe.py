"""Android's experimental universe discovery, enriched with official KAP identities."""
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import threading
import time
import urllib.request

ROOT=Path(__file__).resolve().parent
DOVIZ_URL='https://m.doviz.com/borsa/hisseler'
KAP_URL='https://kap.org.tr/tr/bist-sirketler'


class KapCompanies(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows=[];self.cells=None;self.cell=None;self.href=None;self.links=[]
    def handle_starttag(self,tag,attrs):
        if tag=='tr':self.cells=[];self.links=[]
        elif tag=='td' and self.cells is not None:self.cell=[]
        elif tag=='a' and self.cell is not None:
            url=dict(attrs).get('href','')
            if url.startswith('/tr/sirket-bilgileri/ozet/'):self.links.append('https://kap.org.tr'+url)
        elif tag in {'div','br'} and self.cell is not None:self.cell.append(' ')
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag=='td' and self.cell is not None:
            self.cells.append(' '.join(''.join(self.cell).split()));self.cell=None
        elif tag=='tr' and self.cells is not None:
            if len(self.cells)>=2 and self.links:self.rows.append((self.cells,self.links[0]))
            self.cells=None;self.cell=None


def parse_sources(discovery_html,kap_html):
    symbols=sorted(set(x.upper() for x in re.findall(r'(?:https://borsa\.doviz\.com)?/hisseler/([a-z0-9_]{3,12})-',discovery_html)
                       if re.fullmatch(r'[A-Za-z0-9]{3,10}',x)))
    if len(symbols)<100 or len(symbols)>2000:raise ValueError('Hisse keşif listesi beklenen kapsamda değil.')
    parser=KapCompanies();parser.feed(kap_html)
    identities={}
    for cells,url in parser.rows:
        for code in re.findall(r'\b[A-Z0-9]{3,10}\b',cells[0]):
            identities[code]={'companyName':cells[1],'kapUrl':url}
    if len(identities)<100:raise ValueError('KAP şirket kimlikleri okunamadı.')
    return {'records':[dict(symbol=s,**identities.get(s,{})) for s in symbols],
        'fetchedAt':int(time.time()*1000),'discoverySource':DOVIZ_URL,'identitySource':KAP_URL,
        'canClaimExchangeComplete':False,'kapCompanyCount':len(parser.rows),
        'identityMatched':sum(s in identities for s in symbols),
        'scopeNote':'Android Yahoo yedek sağlayıcısıyla aynı deneysel keşif listesi. Borsa genelinde eksiksizlik resmen doğrulanmadı.'}


def _download(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 BIST-VIOP-Web/1.4','Accept':'text/html'})
    with urllib.request.urlopen(request,timeout=20) as response:
        raw=response.read(4_000_001)
        if len(raw)>4_000_000:raise ValueError('Hisse listesi boyut sınırı.')
        return raw.decode('utf-8')


class Universe:
    def __init__(self):
        self._lock=threading.Lock();self._data=None;self._last_attempt=0
    def get(self,refresh=False):
        with self._lock:
            if self._data is None:
                self._data=json.loads((ROOT/'data/bist-universe.json').read_text())
            if refresh:
                if time.monotonic()-self._last_attempt<300:raise ValueError('Liste yenileme için beş dakika bekleyin.')
                self._last_attempt=time.monotonic()
                # Commit only after both upstream contracts were parsed successfully.
                self._data=parse_sources(_download(DOVIZ_URL),_download(KAP_URL))
            return {**self._data,'count':len(self._data['records'])}


UNIVERSE=Universe()
