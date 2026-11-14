"""Compare independently captured APK results with the web JVM core on the identical fixture."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine_bridge import CORE

directory=Path(__file__).resolve().parents[1]/'test-results/android-harness'
fixture=json.loads((directory/'parity-input.json').read_text())
apk=json.loads((directory/'android-output.json').read_text())
web=CORE.request({'op':'chart','candles':fixture['candles'],'intraday':True,'excludeNewestForTrend':False})
comparisons=0;maximum=0;differences=[]
def compare(actual,expected,path):
    global comparisons,maximum
    if isinstance(expected,dict):
        if not isinstance(actual,dict):differences.append([path,'type']);return
        for key,value in expected.items():compare(actual.get(key),value,path+'.'+key)
    elif isinstance(expected,list):
        if not isinstance(actual,list) or len(actual)!=len(expected):differences.append([path,'length']);return
        for i,value in enumerate(expected):compare(actual[i],value,path+'['+str(i)+']')
    else:
        comparisons+=1
        if isinstance(expected,(int,float)) and not isinstance(expected,bool) and isinstance(actual,(int,float)):
            delta=abs(actual-expected);maximum=max(maximum,delta)
            if delta>1e-8:differences.append([path,actual,expected])
        elif actual!=expected:differences.append([path,actual,expected])
for key,value in apk.items():compare(web.get(key),value,key)
result={'status':'failed' if differences else 'passed','fixture':fixture.get('fixture','explicit APK-captured input'),'bars':len(fixture['candles']),'comparisons':comparisons,'maxNumericDifference':maximum,'tolerance':1e-8,'differences':differences,'scope':'Direct APK ChartIndicators, LinearTrendAnalyzer, ChartSupportResistance and TechnicalAnalyzer calls; local test signing only.'}
(directory/'comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False));sys.exit(bool(differences))
