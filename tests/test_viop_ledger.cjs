const assert=require('node:assert/strict');
const v=require('../viop-ledger.js');
let s=v.empty();
s=v.open(s,{id:'p1',symbol:'F_XU030',underlying:'XU030',expiry:'2026-12',side:'LONG',multiplier:10,quantity:5,price:100});
assert.equal(v.summary(s).openContracts,5);
const old=JSON.stringify(s);
s=v.close(s,'p1',2,110);
assert.equal(s.positions[0].quantity,3);
assert.equal(s.positions[0].realizedGross,200);
assert.equal(JSON.parse(old).positions[0].quantity,5);
s=v.close(s,'p1',3,90);
assert.equal(s.positions[0].quantity,0);
assert.equal(s.positions[0].realizedGross,-100);
let short=v.open(v.empty(),{id:'p2',symbol:'F_USDTRY',underlying:'USDTRY',expiry:'2026-12',side:'SHORT',multiplier:1000,quantity:1,price:40});
short=v.close(short,'p2',1,39);
assert.equal(short.positions[0].realizedGross,1000);
assert.deepEqual(v.importBackup(JSON.stringify(short)),short);
assert.throws(()=>v.close(s,'p1',1,100));
assert.throws(()=>v.open(s,{id:'p1',symbol:'X',underlying:'X',expiry:'2026-12',side:'LONG',multiplier:1,quantity:1,price:1}));
assert.throws(()=>v.importBackup('{"version":2,"positions":[],"events":[]}'));

// Android ViopManualPositionMathTest.kt golden accounting cases.
let longAndroid=v.open(v.empty(),{id:'android-long',symbol:'F_TEST',underlying:'TEST',expiry:'2026-12',
 side:'LONG',multiplier:10,quantity:2,price:100,stop:99,target:103,
 costPerContract:2,marginPerContract:1000,brokerExecutionId:'BROKER-LONG'});
assert.equal(v.summary(longAndroid).openRiskTry,24);
assert.equal(v.summary(longAndroid).openMarginTry,2000);
longAndroid=v.close(longAndroid,'android-long',2,102);
assert.equal(v.summary(longAndroid).grossRealized,40);
assert.equal(v.summary(longAndroid).netRealized,36);
let shortAndroid=v.open(v.empty(),{id:'android-short',symbol:'F_TEST',underlying:'TEST',expiry:'2026-12',
 side:'SHORT',multiplier:5,quantity:3,price:100,stop:102,target:97,
 costPerContract:1,marginPerContract:1500,brokerExecutionId:'BROKER-SHORT'});
assert.equal(v.summary(shortAndroid).openRiskTry,33);
shortAndroid=v.close(shortAndroid,'android-short',3,103);
assert.equal(v.summary(shortAndroid).netRealized,-48);
assert.equal(v.summary(shortAndroid).openMarginTry,0);
assert.throws(()=>v.open(shortAndroid,{id:'other',symbol:'F_TEST',underlying:'TEST',expiry:'2026-12',side:'LONG',
 multiplier:10,quantity:1,price:100,brokerExecutionId:'BROKER-SHORT'}));
console.log(JSON.stringify({status:'passed',cases:19}));
