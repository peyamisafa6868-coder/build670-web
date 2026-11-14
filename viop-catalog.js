/* Price-free underlying/expiry reference catalogue mirroring Android ViopBuiltinContractCatalog. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ViopCatalog=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BIST30=['AKBNK','GARAN','ASELS','THYAO','TUPRS','ISCTR','YKBNK','KCHOL','SAHOL','EREGL','SISE','PGSUS','BIMAS','FROTO','TOASO','PETKM','XU030'];
const FX=['USDTRY','EURTRY'];
const COMMODITY=['GOLD','SILVER','BRENT'];
const ALL=[...BIST30,...FX,...COMMODITY];
const pad=x=>String(x).padStart(2,'0');
function istanbulParts(now){
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
 const d=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return {year:Number(d.year),month:Number(d.month),day:Number(d.day)};
}
function expiryUtc(y,month){
 const end=new Date(Date.UTC(y,month,0));
 while(end.getUTCDay()===0||end.getUTCDay()===6)end.setUTCDate(end.getUTCDate()-1);
 // Turkey has UTC+3 as of Android BUILD670 reference. Dates remain indicative only.
 return Date.UTC(end.getUTCFullYear(),end.getUTCMonth(),end.getUTCDate(),15,10,0,0);
}
function current(now=Date.now()){
 if(!Number.isFinite(now)||now<=0)throw Error('Geçersiz tarih');
 const local=istanbulParts(now);
 let months=[];
 for(let i=0;i<5&&months.length<3;i++){
  const index=local.year*12+local.month-1+i;
  const y=Math.floor(index/12),m=index%12+1;
  const end=expiryUtc(y,m);
  if(end>=now)months.push({expiry:y+'-'+pad(m),expiryAt:end});
 }
 return ALL.flatMap(underlying=>months.map(m=>({
   symbol:'UNDERLYING:'+underlying+':'+m.expiry,underlying,expiry:m.expiry,expiryAt:m.expiryAt,
   category:BIST30.includes(underlying)?'BIST30':FX.includes(underlying)?'FX':'COMMODITY',
   price:null,verified:false,provider:'builtin_catalog',
   status:'Dayanak/vade referansı; gerçek VİOP kontratı veya kotasyon değildir'
 })));
}
function find({query='',category='ALL',now=Date.now()}={}){
 if(!['ALL','BIST30','FX','COMMODITY'].includes(category))throw Error('Geçersiz kategori');
 const needle=String(query).trim().toUpperCase();
 return current(now).filter(x=>(category==='ALL'||x.category===category)&&
  (!needle||x.underlying.includes(needle)||x.symbol.includes(needle)||x.expiry.includes(needle)));
}
return {current,find,expiryUtc};
});