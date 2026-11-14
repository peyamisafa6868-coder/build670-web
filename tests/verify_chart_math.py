"""Independent Kotlin JAR / JavaScript chart-indicator parity on deterministic OHLCV.
No assertion of exchange authenticity or external live feed data.
"""
import json,math,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine_bridge import CORE
bars=[]
for i in range(280):
 p=100+4*math.sin(i/6)+1.1*math.sin(i/17)
 bars.append({'timestamp':1700000000000+i*300000,'open':p-.12,'high':p+.65,'low':p-.65,'close':p+.12,'volume':1000+i,'closed':True})
source=(ROOT/'index.html').read_text().split('/* === ORIGINAL BUILD 668 MODULE: indicators.js === */',1)[1].split('function closedCandles(payload)',1)[0]
js='''const fs=require('fs');const input=JSON.parse(fs.readFileSync(0,'utf8'));const vm=require('vm');vm.runInThisContext(input.source);console.log(JSON.stringify(calculateIndicators(input.bars,{intraday:true})));'''
proc=subprocess.run(['node','-e',js],input=json.dumps({'source':source,'bars':bars}),capture_output=True,text=True,check=True,timeout=20)
reference=json.loads(proc.stdout)
kotlin=CORE.request({'op':'chart','candles':bars,'intraday':True,'excludeNewestForTrend':False})['series']
keys=['ema9','ema21','sma50','sma200','vwap','rsi','upper','lower']
result={'status':'passed','fixture':'280 synthetic closed OHLCV bars','tolerance':1e-7,'elementsCompared':0,'maxError':0,'series':{}}
for key in keys:
 a,b=kotlin[key],reference[key]
 assert len(a)==len(b)==len(bars),(key,'length')
 errors=[]
 for i,(x,y) in enumerate(zip(a,b)):
  assert (x is None)==(y is None),(key,i,'null mismatch')
  if x is not None:
   err=abs(x-y);errors.append(err)
   assert err<1e-7,(key,i,err)
 result['elementsCompared']+=len(a)
 result['maxError']=max([result['maxError']]+errors)
 result['series'][key]={'maxError':max(errors) if errors else None,'nonNull':len(errors)}
print(json.dumps(result,ensure_ascii=False,indent=2))
( ROOT/'test-results'/'selected-chart-upgrade'/'math-parity.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
