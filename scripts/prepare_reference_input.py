#!/usr/bin/env python3
"""Prepare explicit, reproducible inputs for the owned BUILD670 APK harness."""
import csv
import json
from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from engine_bridge import CORE

if __name__=='__main__':
    cases={}
    with (ROOT/'tests/fixtures/candles.csv').open() as stream:
        for row in csv.DictReader(stream):
            cases.setdefault(row['case'],[]).append({key:int(row[key]) if key=='timestamp' else float(row[key]) for key in ['timestamp','open','high','low','close','volume']})
    bars=cases['trend'];scenarios={name:{'candles':rows,'intraday':True} for name,rows in cases.items()}
    scenarios.update(empty={'candles':[],'intraday':True},short={'candles':bars[:8],'intraday':True},zero_volume={'candles':[{**b,'volume':0} for b in bars],'intraday':False})
    stock={'symbol':'ASELS','companyName':'EXPLICIT APK COMPARISON FIXTURE','candles':bars,'source':'EXPLICIT TEST FIXTURE','interval':'5m','lastBarClosed':True,'dataTimestamp':bars[-1]['timestamp']}
    opportunity=CORE.request({'op':'technical','stock':stock})['opportunity']
    costs={}
    for name,direction,entry,exit,quantity,fee,slip in [('long','LONG',100,110,2,1.5,10),('short','SHORT',110,100,2,1.5,10),('fractional','LONG',100,95,.5,.75,5),('no_cost','SHORT',100,90,1,0,0)]:
        costs[name]={'direction':direction,'entry':entry,'exit':exit,'quantity':quantity,'commissionPerSide':fee,'slippageBpsPerSide':slip}
    output=ROOT/'test-results/android-harness/parity-input.json';output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps({'fixture':'tests/fixtures/candles.csv#trend','candles':bars,'opportunity':opportunity,'scenarios':scenarios,'costScenarios':costs},ensure_ascii=False)+'\n')
    print(json.dumps({'bars':len(bars),'scenarios':len(scenarios),'costCases':len(costs),'input':str(output)}))
