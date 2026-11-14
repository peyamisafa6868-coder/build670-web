"""BUILD670 KAP hydration parser and one-hour, same-Istanbul-day membership policy."""
import json,re,threading,time,urllib.request
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo
from market_history import ProviderError

URL='https://www.kap.org.tr/tr/Endeksler';IST=ZoneInfo('Europe/Istanbul')

def parse_directory(html,now=None):
    if len(html)>4000000:raise ValueError('KAP yanıt boyutu geçersiz.')
    now=int(time.time()*1000) if now is None else now
    payload=''.join(x[1] if len(x)>1 and isinstance(x[1],str) else '' for x in [json.loads(m.group(1)) for m in re.finditer(r'self\.__next_f\.push\((\[.*?)\)</script>',html,re.S)])
    decoder=json.JSONDecoder()
    def rows(code,required=True):
        objects=[]
        for match in re.finditer(r'\{\s*"code"\s*:\s*"'+code+'"',payload):
            value,_=decoder.raw_decode(payload,match.start());content=value.get('content')
            if isinstance(content,list) and content:objects.append(content)
        if not objects and not required:return []
        if not objects:raise ValueError('KAP '+code+' içeriği yok.')
        if any({r['stockCode'] for r in values}!={r['stockCode'] for r in objects[0]} for values in objects):raise ValueError('KAP tekrar eden endeks içerikleri uyuşmuyor.')
        return objects[0]
    def names(values):
        out={}
        for row in values:
            code,title=row['stockCode'].strip(),row['title'].strip()
            if code in out:raise ValueError('KAP tekrarlı sembol.')
            out[code]=title
        return out
    complete=names(rows('XUTUM'));bist30=names(rows('XU030'))
    if len(bist30)!=30:raise ValueError('KAP BIST30 üye sayısı doğrulanmadı.')
    sectors={code:names(values) for code in ['XUBNK','XUSIN','XUTEK'] if (values:=rows(code,False))}
    complete.update(bist30)
    for values in sectors.values():complete.update(values)
    result={'names':complete,'bist30':list(bist30),'memberships':{k:list(v) for k,v in sectors.items()},'fetchedAt':now,'source':URL,'cached':False}
    if not valid(result):raise ValueError('KAP üyelik/şirket kaydı geçersiz.')
    return result

def valid(data):
    try:return (isinstance(data['fetchedAt'],int) and data['fetchedAt']>=1000000000000 and len(set(data['bist30']))==30 and len(data['bist30'])==30 and 30<=len(data['names'])<=10000 and all(re.fullmatch('[A-Z0-9]{2,12}',code) and isinstance(name,str) and name.strip() and len(name)<=300 for code,name in data['names'].items()) and all(s in data['names'] for s in data['bist30']) and all(code in {'XUBNK','XUSIN','XUTEK'} and members and all(s in data['names'] for s in members) for code,members in data['memberships'].items()))
    except (KeyError,TypeError,ValueError,AttributeError):return False

def usable(data,now=None):
    now=int(time.time()*1000) if now is None else now
    return valid(data) and 0<=now-data['fetchedAt']<=3600000 and datetime.fromtimestamp(now/1000,IST).date()==datetime.fromtimestamp(data['fetchedAt']/1000,IST).date()

class Directory:
    def __init__(self,path=None):self.path=Path(path) if path else Path(__file__).resolve().parent/'runtime-data/kap-directory.json';self.lock=threading.Lock();self.data=None
    def get(self,refresh=False):
        with self.lock:
            if self.data is None:
                try:self.data=json.loads(self.path.read_text())
                except (OSError,ValueError):pass
            if self.data and usable(self.data) and not refresh:return {**self.data,'cached':True}
            try:
                req=urllib.request.Request(URL,headers={'User-Agent':'Mozilla/5.0 BIST-VIOP-Web/1.4'})
                with urllib.request.urlopen(req,timeout=20) as r:raw=r.read(4000001)
                if len(raw)>4000000:raise ValueError('KAP yanıt boyutu geçersiz.')
                result=parse_directory(raw.decode('utf-8'))
                self.data=result
                try:
                    self.path.parent.mkdir(parents=True,exist_ok=True);temporary=self.path.with_suffix('.tmp');temporary.write_text(json.dumps(result,ensure_ascii=False));temporary.replace(self.path)
                except OSError:pass
                return result
            except (OSError,ValueError,KeyError,TypeError) as error:
                if self.data and usable(self.data):return {**self.data,'cached':True}
                raise ProviderError('KAP endeks üyeliği alınamadı veya süresi doldu; grup listesi üretilmedi.') from error

DIRECTORY=Directory()
