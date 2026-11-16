const assert=require('node:assert/strict');
const r=require('../android-results.js');
const fixture=(state,validity='WATCH',direction='NONE',verified=false)=>({
  symbol:'TEST',trendDisplay:{trend:{state},verifiedSignal:verified},
  signalValidity:validity,direction
});
for(const [state,expected] of [
 ['BULLISH','UP'],['STRONG_BULLISH','UP'],['BEARISH','DOWN'],
 ['STRONG_BEARISH','DOWN'],['NEUTRAL','FLAT'],
 ['CONFLICTING','MIXED'],['MIXED','MIXED'],['INSUFFICIENT_DATA','UNKNOWN'],
 [undefined,'UNKNOWN']]){
 assert.equal(r.trendCategory(fixture(state)),expected);
}
assert.equal(r.signalCategory(fixture('BULLISH','WATCH')),'WATCH');
assert.equal(r.signalCategory(fixture('BULLISH','VALID','LONG',true)),'NONE');
assert.equal(r.signalCategory(fixture('BULLISH','VALID','LONG',true),true),'BUY');
assert.equal(r.signalCategory(fixture('BEARISH','VALID','SHORT',true),true),'SELL');
const rows=[
 fixture('BULLISH','WATCH'),fixture('BEARISH','WATCH'),
 fixture('NEUTRAL','INSUFFICIENT'),fixture('BULLISH','VALID','LONG',true)
];
assert.equal(r.homeSelect(rows,{trend:'UP',signal:'WATCH'}).length,1);
assert.equal(r.homeSelect(rows,{signal:'VERIFIED'}).length,0);
assert.equal(r.homeSelect(rows,{signal:'VERIFIED',attestationVerified:true}).length,1);
assert.equal(r.scanStatusLabel({status:'COMPLETE',insufficient:0}),'Tamamlandı');
assert.equal(r.scanStatusLabel({status:'COMPLETE',insufficient:36}),'Eksik veriyle tamamlandı');
assert.equal(r.scanStatusLabel({status:'COMPLETED_WITH_ERRORS',insufficient:36,errors:4}),'Hatalarla tamamlandı');
assert.equal(r.scanStatusLabel({status:'CANCELLED'}),'İptal edildi');
assert.equal(r.scanStatusLabel({status:'FAILED'}),'Tarama başarısız');
const partial=r.scanProgress({total:632,processed:593});
assert.equal(partial.pending,39);
assert.equal(partial.percentage.toFixed(1),'93.8');
assert.equal(r.scanProgress({total:632,processed:632}).percentage,100);
assert.equal(r.scanProgress({total:632,processed:631.99}).percentage<100,true);
assert.equal(r.scanProgress({total:0,processed:0}).percentage,0);
console.log('PASS home trend, signal attestation, terminal labels, 632-count progress');
