/* Browser-local ledger math versus unchanged Kotlin ViopManualPositionStore + ViopV6Policy. */
const assert=require('node:assert/strict'),path=require('node:path'),{spawnSync}=require('node:child_process');
const ledger=require('../viop-ledger.js');
const now=Date.UTC(2026,10,7,10),requests=[],expected=[];
let seed=7301;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
for(let i=0;i<360;i++){
 const entry=20+rnd()*500,side=i%2?'LONG':'SHORT',distance=0.05+rnd()*12;
 const input={op:'viopSize',entry,stop:entry+(side==='LONG'?-distance:distance),multiplier:1+Math.floor(rnd()*100),costPerContract:rnd()*10,
  marginPerContract:500+rnd()*4000,openRiskTry:rnd()*550,dailyLossTry:rnd()*1200,activePositions:i%4,usedMarginTry:rnd()*27000,direction:side};
 if(i%17===0)input.stop=entry;if(i%29===0)input.multiplier=-1;if(i%31===0)input.costPerContract=-1;
 requests.push(input);expected.push(ledger.size(input));
}
const positions=[];
for(let i=0;i<48;i++){
 const quantity=1+i%5,entry=100+i,side=i%2?'LONG':'SHORT',openedAt=now-86400000;
 const p={id:'p'+i,symbol:'F_TEST'+i,side,quantity,entry,stop:entry+(side==='LONG'?-2:2),target:entry+(side==='LONG'?5:-5),multiplier:5,cost:1.5,margin:1000,openedAt,closedAt:null,exitPrice:null,brokerExecutionId:'REF'+i,riskViolationAtEntry:null,exits:[]};
 const fills=Math.min(i%3,quantity);
 for(let q=0;q<fills;q++)p.exits.push({quantity:1,price:entry+(q%2?-1:2),executedAt:now-100000+q*100,extraFeeTry:0.7});
 if(fills===quantity){p.closedAt=p.exits.at(-1).executedAt;p.exitPrice=p.exits.at(-1).price;}
 positions.push(p);
 const scope=positions.slice(-Math.min(i+1,4));requests.push({op:'ledger',positions:scope,now});expected.push({state:ledger.summarize(scope,now),math:scope.map(p=>({id:p.id,remainingQuantity:ledger.remaining(p),openRiskTry:ledger.remaining(p)*(Math.abs(p.entry-p.stop)*p.multiplier+p.cost),openMarginTry:ledger.remaining(p)*p.margin,realizedPnlTry:ledger.realized(p)}))});
}
const source={...positions[0],id:'exit-test',quantity:3,closedAt:null,exitPrice:null,exits:[]};
for(const [qty,price,fee] of [[1,102,0],[3,99,2],[4,105,0],[0,105,0],[1,0,0],[1,102,-1]]){
 const want=ledger.closePartial([source],source.id,qty,price,now,fee);
 requests.push({op:'ledger',action:'exit',positions:[source],id:source.id,quantity:qty,price,fee,now});
 expected.push({accepted:want.accepted,reason:want.reason,positions:want.positions,state:ledger.summarize(want.positions,now)});
}
for(const [broker,qty] of [['',2],['NEW-REF',2],['REF0',2],['BIG-REF',100]]){
 const input={symbol:'F_TEST',side:'LONG',quantity:qty,entry:100,stop:99,target:105,multiplier:10,cost:2,margin:1000,brokerExecutionId:broker};
 const scope=[source],want=ledger.record(scope,input,now,'new-id');
 requests.push({op:'ledger',action:'record',positions:scope,now,...input});expected.push({accepted:want.accepted,reason:want.reason,state:ledger.summarize(want.positions,now)});
}
const reference=spawnSync('java',['-Xmx256m','-jar',path.resolve(__dirname,'../android-core/build/android-core.jar')],{input:requests.map(x=>JSON.stringify(x)).join('\n')+'\n',encoding:'utf8',maxBuffer:8*1024*1024});
assert.equal(reference.status,0,reference.stderr);const actual=reference.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(actual.length,expected.length);
let comparisons=0;
function compare(a,b,label){
 if(typeof b==='number'){assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-8,label+': '+a+' != '+b);comparisons++;}
 else if(Array.isArray(b)){assert.equal(a.length,b.length,label);b.forEach((x,i)=>compare(a[i],x,label+'.'+i));}
 else if(b&&typeof b==='object'){for(const [k,v] of Object.entries(b))compare(a[k],v,label+'.'+k);}
 // JSONObject.put(key, null) removes nullable keys in Android storage.
 else{assert.equal(b===null?(a??null):a,b,label);comparisons++;}
}
actual.forEach((x,i)=>{
 assert.equal(x.ok,true,'Kotlin '+i+': '+x.error);const want=expected[i];
 if(requests[i].op==='viopSize')compare(x.data,want,'size'+i);
 else if('accepted' in want){compare(x.data.result.accepted,want.accepted,'accepted'+i);compare(x.data.result.reason,want.reason,'reason'+i);compare(x.data.state,want.state,'state'+i);if(want.positions)compare(x.data.positions,want.positions,'positions'+i);}
 else compare(x.data,want,'ledger'+i);
});
assert.throws(()=>ledger.validate([{...source,multiplier:0}]),/POSITION_STORAGE_CORRUPT/);
assert.equal(ledger.closePartial([{...source,exits:[{quantity:1,price:102,executedAt:now,extraFeeTry:0}]}],source.id,1,102,now-1).reason,'EXIT_BEFORE_PREVIOUS_FILL');
console.log(JSON.stringify({status:'passed',kotlinCases:requests.length,comparisons,corruptStorage:'blocked',outOfOrderExit:'blocked'}));
