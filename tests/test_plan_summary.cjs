'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {parse,summarize}=require('../android-plan.js');
const audit=[
  'MODE=DELAYED_ANALYSIS','NO_TRADE_SIGNAL=true','RISK_NOTE=GECİKMELİ/GÜNLÜK VERİ · AL/SAT SİNYALİ ÜRETİLMEDİ.',
  'RISK_NOTE=GECİKMELİ/GÜNLÜK VERİ · AL/SAT SİNYALİ ÜRETİLMEDİ.',
  'V531_CONFLICT_PENALTY=0','V531_REASON=STALE_DATA','V531_REASON=MISSING_VOLUME',
  'V531_REASON=DIRECTION_CONFLICT','V531_AUDIT=CONFLICT_PENALTY=0',
  'V531_AUDIT=DECISION=WATCH','VOLUME_ANOMALY_PCT=-100.00',
  'V531_AUDIT=RAW_LONG=8','V531_AUDIT=RAW_SHORT=5'
];
let count=0;
function check(name,fn){fn();count++;console.log('PASS '+name);}
check('Audit parser keeps raw records and unique decision reasons',()=>{
  const p=parse(audit);
  assert.deepEqual(p.raw,audit);
  assert.deepEqual(p.reasons,['STALE_DATA','MISSING_VOLUME','DIRECTION_CONFLICT']);
  assert.equal(p.conflictPenalty,0);assert.equal(p.anomaly,-100);
  assert.equal(p.riskNotes.length,1);
});
const scan={symbol:'BAKAB',score:8,riskScore:45,dataConfidenceScore:65,
  signalValidity:'WATCH',direction:'YUKSELIS',scoreBreakdown:audit};
check('Scores and decision are not mixed',()=>{
  const p=summarize(scan,{symbol:'BAKAB',periodMatches:true,lastVolume:0});
  assert.equal(p.technical,8);assert.equal(p.risk,45);assert.equal(p.confidence,65);
  assert.equal(p.signalVerified,false);assert.equal(p.status,'İZLE');
  assert.match(p.title,/AL\/SAT yok/);
  assert.equal(p.cards.length,3);
});
check('Missing volume must not be called a real -100% volume crash',()=>{
  const p=summarize(scan,{symbol:'BAKAB',periodMatches:true,lastVolume:0});
  assert.match(p.notes.join(' '),/gerçek piyasa hacminin/);
  assert.match(p.notes.join(' '),/son kapanmış mum hacmi 0/);
  assert.match(p.notes.join(' '),/farklı zamanda/);
});
check('Direction mismatch is distinct from zero time-frame penalty',()=>{
  const p=summarize(scan,{symbol:'BAKAB',periodMatches:true,lastVolume:0});
  assert.match(p.notes.join(' '),/LONG\/SHORT puan farkı/);
  assert.match(p.notes.join(' '),/CONFLICT_PENALTY=0/);
});
check('Missing score is an em dash, never zero',()=>{
  const p=summarize({symbol:'BAKAB',score:null,riskScore:0,dataConfidenceScore:null,
    scoreBreakdown:[]},{symbol:'BAKAB'});
  assert.equal(p.scoreLabel,'—');assert.equal(p.riskLabel,'0');assert.equal(p.confidenceLabel,'—');
  assert.equal(p.signalVerified,false);
});
check('No scan, or mismatching symbol, never shows other asset audit',()=>{
  assert.equal(summarize(null,{symbol:'BAKAB'}).hasScan,false);
  const p=summarize(scan,{symbol:'ASELS'});
  assert.equal(p.hasScan,false);assert.equal(p.raw.length,0);
});
check('Unverified high technical score cannot publish LONG or SHORT',()=>{
  const p=summarize({...scan,score:99,signalValidity:'VALID',publishedDirection:'LONG'},
    {symbol:'BAKAB'});
  assert.equal(p.signalVerified,false);
});
check('Unknown reasons remain in original audit, not promoted as verified facts',()=>{
  const p=parse([...audit,'V531_REASON=SOME_FUTURE_REASON']);
  assert.ok(p.raw.includes('V531_REASON=SOME_FUTURE_REASON'));
  assert.equal(p.reasons.includes('SOME_FUTURE_REASON'),false);
});
check('Active source integrates the renderer without changing calculation engine',()=>{
  const main=fs.readFileSync(path.join(__dirname,'../android-app.js'),'utf8');
  const server=fs.readFileSync(path.join(__dirname,'../server.py'),'utf8');
  assert.match(main,/function paintPlan\(/);
  assert.match(main,/paintPlan\(opportunity,/);
  assert.match(server,/'android-plan\.js','android-app\.js'/);
});
console.log(count+' plan tests passed');
