/* VIOP manual ledger: independent of live market data and pre-existing records. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ViopLedger=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const VERSION=1;
const safeNum=(x,min=0)=>typeof x==='number'&&Number.isFinite(x)&&x>min;
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=80;
function empty(){return {version:VERSION,positions:[],events:[]};}
function check(state){
 if(!state||state.version!==VERSION||!Array.isArray(state.positions)||!Array.isArray(state.events)||state.positions.length>5000||state.events.length>100000)throw Error('Geçersiz defter sürümü veya veri boyutu.');
 const ids=new Set();
 for(const p of state.positions){
  if(!text(p.id)||ids.has(p.id)||!text(p.symbol)||!text(p.underlying)||!text(p.expiry)||!['LONG','SHORT'].includes(p.side)||
   !safeNum(p.multiplier)||!integer(p.quantity)||!safeNum(p.average)||!Number.isFinite(p.realizedGross))throw Error('Geçersiz pozisyon kaydı.');
  ids.add(p.id);
 }
 return state;
}
function open(state,details){
 check(state);
 const {id,symbol,underlying,expiry,side,multiplier,quantity,price,stop,target,
  costPerContract,marginPerContract,brokerExecutionId}=details;
 if(!text(id)||!text(symbol)||!text(underlying)||!text(expiry)||!['LONG','SHORT'].includes(side)||
 !safeNum(multiplier)||!Number.isSafeInteger(quantity)||quantity<1||!safeNum(price)||
 state.positions.some(p=>p.id===id)||
  (stop!==undefined&&!safeNum(stop))||(target!==undefined&&!safeNum(target))||
  (costPerContract!==undefined&&(!Number.isFinite(costPerContract)||costPerContract<0))||
  (marginPerContract!==undefined&&!safeNum(marginPerContract))||
  (brokerExecutionId!==undefined&&(!text(brokerExecutionId)||state.positions.some(p=>p.brokerExecutionId===brokerExecutionId))))
  throw Error('Geçersiz veya yinelenen pozisyon.');
 const optional={};
 for(const [k,v] of Object.entries({stop,target,costPerContract,marginPerContract,brokerExecutionId}))
  if(v!==undefined)optional[k]=v;
 const p={id,symbol:symbol.trim().toUpperCase(),underlying:underlying.trim().toUpperCase(),expiry:expiry.trim(),side,
 multiplier,quantity,average:price,...optional,realizedGross:0,realizedNet:0};
 return {...state,positions:[...state.positions,p],events:[...state.events,{type:'OPEN',id,quantity,price,at:new Date().toISOString()}]};
}
function close(state,id,quantity,price,extraFeeTry=0){
 check(state);
 if(!Number.isSafeInteger(quantity)||quantity<1||!safeNum(price)||!Number.isFinite(extraFeeTry)||extraFeeTry<0)throw Error('Kapatma miktarı ve fiyat geçersiz.');
 const p=state.positions.find(p=>p.id===id);
 if(!p||quantity>p.quantity)throw Error('Pozisyon bulunamadı veya miktar aşıldı.');
 const gross=(price-p.average)*quantity*p.multiplier*(p.side==='LONG'?1:-1);
 if(!Number.isFinite(gross))throw Error('Hesaplama sınırı aşıldı.');
 const cost=quantity*(p.costPerContract??0)+extraFeeTry;
 const net=gross-cost;
 const next={...p,quantity:p.quantity-quantity,realizedGross:p.realizedGross+gross,
  realizedNet:(p.realizedNet??p.realizedGross)+net};
 if(!Number.isFinite(next.realizedGross)||!Number.isFinite(next.realizedNet))throw Error('Gerçekleşen sonuç geçersiz.');
 return {...state,positions:state.positions.map(x=>x.id===id?next:x),
 events:[...state.events,{type:'CLOSE',id,quantity,price,gross,net,extraFeeTry,at:new Date().toISOString()}]};
}
function summary(state){
 check(state);
 const active=state.positions.filter(p=>p.quantity>0);
 return {openContracts:active.reduce((v,p)=>v+p.quantity,0),
 grossRealized:state.positions.reduce((v,p)=>v+p.realizedGross,0),
 netRealized:state.positions.reduce((v,p)=>v+(p.realizedNet??p.realizedGross),0),
 openRiskTry:active.every(p=>p.stop!==undefined&&p.costPerContract!==undefined)?
   active.reduce((v,p)=>v+p.quantity*(Math.abs(p.average-p.stop)*p.multiplier+p.costPerContract),0):null,
 openMarginTry:active.every(p=>p.marginPerContract!==undefined)?
   active.reduce((v,p)=>v+p.quantity*p.marginPerContract,0):null,
 positions:state.positions.length};
}
function importBackup(json){const value=typeof json==='string'?JSON.parse(json):json;return check(value);}
return {empty,check,open,close,summary,importBackup,VERSION};
});