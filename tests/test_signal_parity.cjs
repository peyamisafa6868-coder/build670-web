const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const context={};vm.runInNewContext(html.slice(html.indexOf('const SCORE_CONFIG ='),html.indexOf('function checkReportedDecision(')),context);
const inputs=fs.readFileSync(path.join(__dirname,'fixtures/signal_inputs.csv'),'utf8').trim().split(/\r?\n/).slice(1).map(l=>l.split(',').map(v=>v==='null'?null:Number(v)));
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/android_signal_golden.json'),'utf8'));
let values=0;
inputs.forEach(([longScore,shortScore,dataConfidence,availableSignalWeight,mtfConsensusScore],i)=>{
 const actual=context.signalDecision({longScore,shortScore,dataConfidence,availableSignalWeight,mtfConsensusScore});
 for(const [k,want] of Object.entries(expected[i])){assert.equal(JSON.stringify(actual[k]),JSON.stringify(want),'case '+i+' '+k);values++;}
 assert.equal(actual.verified,false);
});
console.log(JSON.stringify({cases:inputs.length,comparisons:values,status:'passed',scope:'precomputed component scores; no production signal attestation'}));
