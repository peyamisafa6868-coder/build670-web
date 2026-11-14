"""Android NewsRepository's public RSS fallback, with bounded safe parsing."""
from collections import OrderedDict
from email.utils import parsedate_to_datetime
import re
import threading
import time
from urllib.parse import urlencode, urlsplit
import urllib.request
import xml.etree.ElementTree as ET

from market_history import ProviderError

CATEGORIES={'all':'','company':'','kap':' KAP','sector':' sektör','market':'Borsa İstanbul piyasa',
            'dividend':' (temettü OR "kar payı" OR "kâr payı")',
            'analyst':' ("analist raporu" OR "hedef fiyat" OR "araştırma raporu")'}
_cache=OrderedDict();_lock=threading.Lock()


def parse_rss(raw):
    if len(raw)>2_000_000 or re.search(br'<!\s*(DOCTYPE|ENTITY)',raw,re.I):raise ProviderError('Haber XML güvenlik/boyut sınırı.')
    try:root=ET.fromstring(raw)
    except ET.ParseError as error:raise ProviderError('Haber akışı okunamadı.') from error
    items=[]
    seen=set()
    for item in root.findall('./channel/item')[:160]:
        title=(item.findtext('title') or '').strip()[:400]
        link=(item.findtext('link') or '').strip()[:2000]
        if not title or urlsplit(link).scheme!='https':continue
        identity=(link,title.lower())
        if identity in seen:continue
        seen.add(identity)
        try:date=int(parsedate_to_datetime(item.findtext('pubDate')).timestamp()*1000)
        except (TypeError,ValueError,OverflowError):date=None
        items.append({'title':title,'url':link,'source':(item.findtext('source') or 'Kaynak belirtilmedi')[:150],
            'publishedAt':date,'contentVerified':False})
    return sorted(items,key=lambda x:x['publishedAt'] or 0,reverse=True)[:80]


def news(symbol='',category='market',company='',force=False):
    if symbol and not re.fullmatch('[A-Z0-9]{3,10}',symbol):raise ValueError('Geçersiz haber sembolü.')
    if category not in CATEGORIES:raise ValueError('Geçersiz haber kategorisi.')
    if len(company)>180:raise ValueError('Şirket adı çok uzun.')
    company=company.strip().replace('"','')
    base=' OR '.join(x for x in [symbol,'"'+company+'"' if company else ''] if x) or 'Borsa İstanbul'
    if category in {'dividend','analyst'} and not symbol:raise ValueError('Temettü/analist kaynağı için hisse sembolü gereklidir.')
    query=CATEGORIES[category] if category=='market' else ('('+base+')' if category in {'dividend','analyst'} else base)+CATEGORIES[category]
    key=(query,category)
    with _lock:
        hit=_cache.get(key)
        if hit and not force and time.monotonic()-hit[0]<600:return {**hit[1],'fromCache':True,'stale':False}
    url='https://news.google.com/rss/search?'+urlencode({'q':query,'hl':'tr','gl':'TR','ceid':'TR:tr'})
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 BIST-VIOP-Web/1.4'})
        with urllib.request.urlopen(req,timeout=15) as response:raw=response.read(2_000_001)
        items=parse_rss(raw)
    except (OSError,TimeoutError,ProviderError) as error:
        if hit:return {**hit[1],'fromCache':True,'stale':True,'warning':'Kaynak yenilenemedi; son başarılı haber kaydı gösteriliyor.'}
        if isinstance(error,ProviderError):raise
        raise ProviderError('Haber kaynağına erişilemedi; uydurma başlık gösterilmedi.',504) from error
    data={'items':items,'provider':'Google News RSS (Android yedek kaynağı)','fetchedAt':int(time.time()*1000),
          'query':query,'category':category,'contentVerified':False,'coverage':'NEWS_HEADLINES_ONLY' if category in {'dividend','analyst'} else 'NEWS',
          'paymentVerified':False,'analystReportVerified':False,'fromCache':False,'stale':False}
    with _lock:
        _cache[key]=(time.monotonic(),data);_cache.move_to_end(key)
        while len(_cache)>64:_cache.popitem(last=False)
    return data
