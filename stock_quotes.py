"""Display-only delayed daily quotes; scanner decision inputs stay unchanged."""
import math
import re
from market_history import yahoo_history, ProviderError


def stock_quote(symbol):
    if not isinstance(symbol,str) or not re.fullmatch('[A-Z0-9]{3,10}',symbol):
        raise ValueError('Geçersiz BIST sembolü.')
    history=yahoo_history(symbol,'1d','1mo')
    if history.get('symbol')!=symbol+'.IS' or history.get('interval')!='1d':
        raise ProviderError('Fiyat kaynağı sembol/periyot kimliği uyuşmuyor.')
    raw_bars=history.get('candles')
    if not isinstance(raw_bars,list):
        raise ProviderError('Günlük fiyat geçmişi eksik veya geçersiz.')
    # The Yahoo adapter marks the still-forming BIST session closed=False.
    # An open daily candle must never become a completed previous-day close.
    # Old explicit test fixtures may omit 'closed'; production data supplies it.
    bars=[b for b in raw_bars if isinstance(b,dict) and b.get('closed') is not False]
    if not bars:
        raise ProviderError('Henüz kapanmış, geçerli günlük fiyat gözlemi yok.')
    last=bars[-1]
    price=last.get('close')
    if isinstance(price,bool) or not isinstance(price,(int,float)) or not math.isfinite(price) or price<=0:
        raise ProviderError('Son kapanış fiyatı geçersiz.')
    previous=bars[-2].get('close') if len(bars)>1 else None
    if isinstance(previous,bool) or not isinstance(previous,(int,float)) or not math.isfinite(previous) or previous<=0:
        previous=None
    change=(price/previous-1)*100 if previous is not None else None
    return {'symbol':symbol,'price':price,'previousDailyClose':previous,'changePct':change,
            'timestamp':last.get('time'),'timestampKind':'CANDLE_START',
            'volume':last.get('volume'),'realtime':False,'source':history['provider'],
            'delayed':True,'fetchedAt':history['fetchedAt'],'cacheTtlSeconds':300}
