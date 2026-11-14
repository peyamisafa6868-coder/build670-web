"""Original APK cost estimates versus the web's same Android round-trip function."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from engine_bridge import CORE
root=Path(__file__).resolve().parents[1]/'test-results/android-harness'
inputs=json.loads((root/'parity-input.json').read_text())['costScenarios'];checkpoint=root/'parity-costs-output.json'
expected=json.loads(checkpoint.read_text()) if checkpoint.exists() else json.loads((root/'parity-screen-metadata.json').read_text())['costOutputs'];cases=[]
for name,body in inputs.items():
 actual=CORE.request({'op':'tradeEstimate',**body});wanted=expected[name];difference=[];maximum=0
 for key,value in wanted.items():
  got=actual.get(key)
  if isinstance(value,(int,float)):
   delta=abs(got-value);maximum=max(maximum,delta)
   if delta>1e-8:difference.append([key,got,value])
  elif got!=value:difference.append([key,got,value])
 cases.append({'name':name,'fields':len(wanted),'maxNumericDifference':maximum,'differences':difference,'status':'failed' if difference else 'passed'})
result={'scope':'Four valid original-APK TradeForwardEngine.estimateRoundTrip inputs; manual simulation, no orders.','cases':cases,'fields':sum(x['fields'] for x in cases),'maxNumericDifference':max(x['maxNumericDifference'] for x in cases),'tolerance':1e-8,'status':'passed' if len(cases)==4 and all(x['status']=='passed' for x in cases) else 'failed'}
(root/'cost-comparison.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));sys.exit(result['status']!='passed')
