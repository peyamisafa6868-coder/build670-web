"""Read-only, bounded official KAP company summaries; no price or signal inputs."""
from html.parser import HTMLParser
import re,time,threading,urllib.request,urllib.error,json
from universe import UNIVERSE
from market_history import ProviderError

class Tables(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True);self.tables=[];self.table=None;self.row=None;self.cell=None;self.skip=0;self.visible=[]
    def handle_starttag(self,tag,attrs):
        if tag in {'script','style'}:self.skip+=1
        if self.skip:return
        if tag=='table':self.table=[]
        elif tag=='tr' and self.table is not None:self.row=[]
        elif tag in {'td','th'} and self.row is not None:self.cell=[]
        elif tag=='br' and self.cell is not None:self.cell.append(' ')
    def handle_data(self,data):
        if self.skip:return
        self.visible.append(data)
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in {'script','style'}:self.skip=max(0,self.skip-1);return
        if self.skip:return
        if tag in {'td','th'} and self.cell is not None:
            self.row.append(' '.join(''.join(self.cell).split()));self.cell=None
        elif tag=='tr' and self.row is not None:
            if any(self.row):self.table.append(self.row)
            self.row=None
        elif tag=='table' and self.table is not None:
            if self.table:self.tables.append(self.table)
            self.table=None

def flight_tables(html):
    # KAP streams table bodies in React Flight records after the initial HTML.
    # Parse JSON data only. Never execute upstream scripts or fetch arbitrary URLs.
    chunks=[]
    for match in re.finditer(r'self\.__next_f\.push\((\[.*?)\)</script>',html,re.S):
        value=json.loads(match[1])
        if len(value)>1 and isinstance(value[1],str):chunks.append(value[1])
    data=''.join(chunks);records={};decoder=json.JSONDecoder()
    for match in re.finditer(r'(?:^|\n)([a-f0-9]+):',data):
        try:records[match[1]]=decoder.raw_decode(data,match.end())[0]
        except ValueError:continue
    steps=[0]
    def resolved(node,seen):
        if isinstance(node,str) and re.fullmatch(r'\$L?[a-f0-9]+',node):
            key=node[2:] if node.startswith('$L') else node[1:]
            if key in seen:return None
            return resolved(records.get(key),seen|{key})
        return node
    def children(node):
        if isinstance(node,list):
            if len(node)==4 and node[0]=='$' and isinstance(node[3],dict):return [node[3].get('children')]
            return node
        return []
    def elements(node,tag,seen=frozenset(),depth=0):
        steps[0]+=1
        if steps[0]>500000 or depth>80:return []
        node=resolved(node,seen)
        if isinstance(node,list) and len(node)==4 and node[0]=='$' and node[1]==tag:return [node]
        return [item for child in children(node) for item in elements(child,tag,seen,depth+1)]
    def texts(node,depth=0):
        if depth>80:return ''
        node=resolved(node,frozenset())
        if isinstance(node,(str,int,float)):return str(node) if not str(node).startswith('$') else ''
        return ' '.join(texts(c,depth+1) for c in children(node))
    tables=[];seen=set()
    for record in records.values():
        for table in elements(record,'table'):
            rows=[]
            for row in elements(table[3].get('children'),'tr'):
                cells=elements(row[3].get('children'),'th') or elements(row[3].get('children'),'td')
                values=[' '.join(texts(c[3].get('children')).split()) for c in cells]
                if any(values):rows.append(values)
            signature=tuple(tuple(r) for r in rows)
            if rows and signature not in seen:tables.append(rows);seen.add(signature)
    return tables

def urls(record):
    match=re.fullmatch(r'https://(?:www\.)?kap\.org\.tr/tr/sirket-bilgileri/ozet/([a-z0-9-]{1,180})',record.get('kapUrl',''))
    if not match:raise ValueError('Şirketin resmî KAP eşlemesi bulunamadı.')
    slug=match[1]
    return {'company':'https://www.kap.org.tr/tr/sirket-bilgileri/genel/'+slug,'financial':'https://www.kap.org.tr/tr/sirket-finansal-bilgileri/'+slug,'summary':'https://www.kap.org.tr/tr/sirket-bilgileri/ozet/'+slug}

def parse(html,symbol,kind):
    p=Tables();p.feed(html)
    streamed=flight_tables(html)
    if streamed:p.tables=streamed
    visible=' '.join(' '.join(p.visible).split())
    if not re.search(r'\b'+re.escape(symbol)+r'\b',visible):raise ValueError('KAP yanıtında istenen şirket sembolü doğrulanamadı.')
    if kind=='financial':
        selected=[rows for rows in p.tables if rows and any('FİNANSAL DURUM TABLOSU' in ' '.join(row) or 'GELİR TABLOSU' in ' '.join(row) for row in rows)]
    elif kind=='ownership':
        selected=[rows for rows in p.tables if len(rows)>1 and any('Ortağın' in ' '.join(row) and ('Sermayedeki Payı' in ' '.join(row) or 'Oy Hakkı' in ' '.join(row)) for row in rows[:2])]
    else:selected=[]
    if kind in {'financial','ownership'} and not selected:raise ValueError('KAP tablo şeması değişmiş veya bu şirket için tablo yok; veri üretilmedi.')
    if sum(len(t) for t in selected)>500 or any(len(row)>30 or any(len(c)>10000 for c in row) for t in selected for row in t):raise ValueError('KAP tablo boyut sınırı.')
    return selected

_cache={};_lock=threading.Lock();_slots=threading.BoundedSemaphore(2)
def company_data(symbol,kind,universe=UNIVERSE):
    if not isinstance(symbol,str) or not re.fullmatch('[A-Z0-9]{3,10}',symbol) or kind not in {'company','financial','ownership'}:raise ValueError('Geçersiz şirket veya tablo türü.')
    record=next((r for r in universe.get()['records'] if r['symbol']==symbol),None)
    if not record:raise ValueError('Sembol şirket dizininde yok.')
    links=urls(record);url=links['financial' if kind=='financial' else 'company'];key=(symbol,kind)
    with _lock:
        hit=_cache.get(key)
        if hit and 0<=time.monotonic()-hit[0]<900:return {**hit[1],'cached':True}
    if kind=='company':return {'symbol':symbol,'companyName':record.get('companyName'),'links':links,'source':url,'fetchedAt':None,'tables':[],'contentType':'DIRECTORY_IDENTITY','cached':False}
    if not _slots.acquire(timeout=1):raise ProviderError('Şirket veri servisi meşgul; yeniden deneyin.',503,5)
    try:
        request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 BIST-VIOP-Web/1.4','Accept':'text/html'})
        with urllib.request.urlopen(request,timeout=20) as response:
            if response.status!=200 or response.geturl().split('/')[2] not in {'www.kap.org.tr','kap.org.tr'}:raise ValueError('KAP yanıt kaynağı doğrulanamadı.')
            raw=response.read(4000001)
        if len(raw)>4000000:raise ValueError('KAP yanıt boyut sınırı.')
        tables=parse(raw.decode('utf-8'),symbol,kind)
    except urllib.error.HTTPError as e:raise ProviderError('KAP HTTP '+str(e.code)+'; şirket verisi alınamadı.',e.code) from e
    except (OSError,ValueError,UnicodeError) as e:raise ProviderError('KAP şirket verisi alınamadı: '+str(e)[:220],502) from e
    finally:_slots.release()
    result={'symbol':symbol,'companyName':record.get('companyName'),'source':url,'links':links,'fetchedAt':int(time.time()*1000),'tables':tables,'contentType':'KAP_FINANCIAL_SUMMARY' if kind=='financial' else 'KAP_OWNERSHIP','cached':False,'note':'KAP sayfasından okunan özet. Erişim zamanı yayın tarihi değildir. Finansal özet tam finansal rapor/nakit akışı değildir; önceki dönem düzeltmeleri için asıl bildirime bakın.'}
    with _lock:
        if len(_cache)>=128:_cache.pop(next(iter(_cache)))
        _cache[key]=(time.monotonic(),result)
    return result
