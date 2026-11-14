"""Compare eight independently executed original-APK scenarios with the web core."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine_bridge import CORE
root=Path(__file__).resolve().parents[1]/'test-results/android-harness'
inputs=json.loads((root/'parity-input.json').read_text())['scenarios'];checkpoint=root/'parity-scenarios-output.json'
expected=json.loads(checkpoint.read_text()) if checkpoint.exists() else json.loads((root/'parity-screen-metadata.json').read_text())['scenarioOutputs'];reports=[]
for name,fixture in inputs.items():
 actual=CORE.request({'op':'chart','candles':fixture['candles'],'intraday':fixture['intraday'],'excludeNewestForTrend':False});differences=[];stats={'fields':0,'maxNumericDifference':0}
 def compare(a,b,path):
  if isinstance(b,dict):
   if not isinstance(a,dict):differences.append([path,'object type']);return
   for k,v in b.items():compare(a.get(k),v,path+'.'+k)
  elif isinstance(b,list):
   if not isinstance(a,list) or len(a)!=len(b):differences.append([path,'array length']);return
   for i,v in enumerate(b):compare(a[i],v,path+'['+str(i)+']')
  else:
   stats['fields']+=1
   if isinstance(a,(int,float)) and isinstance(b,(int,float)) and not isinstance(a,bool) and not isinstance(b,bool):
    delta=abs(a-b);stats['maxNumericDifference']=max(stats['maxNumericDifference'],delta)
    if delta>1e-8:differences.append([path,a,b])
   elif a!=b:differences.append([path,a,b])
 compare(actual,expected[name],name);reports.append({'name':name,'bars':len(fixture['candles']),**stats,'differences':differences,'status':'failed' if differences else 'passed'})
result={'scope':'Original APK ChartIndicators, LinearTrendAnalyzer, ChartSupportResistance and TechnicalAnalyzer only; not all scan/MTF/business flows.','scenarios':reports,'fields':sum(r['fields'] for r in reports),'maxNumericDifference':max(r['maxNumericDifference'] for r in reports),'tolerance':1e-8,'status':'passed' if len(reports)==8 and all(r['status']=='passed' for r in reports) else 'failed'}
(root/'scenario-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items() if k!='scenarios'},ensure_ascii=False));print([(r['name'],r['bars'],r['fields'],r['status']) for r in reports]);sys.exit(result['status']!='passed')
