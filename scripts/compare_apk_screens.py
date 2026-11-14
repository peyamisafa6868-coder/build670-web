#!/usr/bin/env python3
"""Quantify captured APK/web pixels separately from layout-box differences.

These metrics report differences; they do not grant whole-app visual acceptance.
"""
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
ROOT=Path(__file__).resolve().parents[1]
if __name__=='__main__':
    native=ROOT/'test-results/android-harness';web=ROOT/'test-results/apk-pairs'
    target=ROOT/'test-results/apk-comparison';target.mkdir(parents=True,exist_ok=True)
    reference=json.loads((native/'parity-screen-metadata.json').read_text())
    observed=json.loads((web/'results.json').read_text());results=[]
    by_route={r['route']:r for r in observed['captures']}
    for row in reference['captures']:
        route=row['route'];a=Image.open(native/('screen-'+route+'.png')).convert('RGB');b=Image.open(web/('web-'+route+'.png')).convert('RGB')
        if a.size!=b.size:results.append({'route':route,'status':'dimension_mismatch','apk':a.size,'web':b.size});continue
        delta=ImageChops.difference(a,b);red,green,blue=delta.split();histogram=ImageChops.lighter(ImageChops.lighter(red,green),blue).histogram();total=a.width*a.height;changed=total-histogram[0];strong=sum(histogram[17:])
        pixel={'meanAbsoluteChannelError':sum(ImageStat.Stat(delta).mean)/3,'differentPixelFraction':changed/total,'differentPixelFractionAbove16':strong/total,'dimensions':a.size}
        boxes=[]
        for key,expected in row.get('geometry',{}).items():
            current=by_route[route]['geometry'].get(key)
            if current is None:boxes.append({'id':key,'status':'missing_web_view'});continue
            boxes.append({'id':key,'delta':{field:current[field]-expected[field] for field in ['x','y','width','height']}})
        panel=Image.new('RGB',(a.width*3,a.height));panel.paste(a,(0,0));panel.paste(b,(a.width,0));panel.paste(delta,(a.width*2,0));panel.save(target/(route+'-apk-web-diff.png'))
        results.append({'route':route,'status':'compared','pixels':pixel,'layoutBoxes':boxes,'interactionAcceptance':'not established by screenshots'})
    report={'visualParityAccepted':False,'comparisons':results,'nativeCaptureFailures':reference.get('captureFailures',[]),'unmappedWebRoutes':reference.get('unmappedWebRoutes',[])}
    (target/'results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'compared':sum(r['status']=='compared' for r in results),'captureFailures':len(report['nativeCaptureFailures']),'visualParityAccepted':False}))
