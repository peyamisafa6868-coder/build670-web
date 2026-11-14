/* One preference contract for boot, editing and backup restoration. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BistNativePreferences=api;})(globalThis,()=>{
 'use strict';
 const base={interval:'5m',cadence:5,auto:false,notifications:false,delayed:true,quantity:0,commission:0,slippage:0,valueStrategy:'BALANCED'},limits={favorites:10000,watchlist:20,userSymbols:2000},symbol=x=>typeof x==='string'&&/^[A-Z0-9]{3,10}$/.test(x);
 const defaults=()=>({...base,favorites:[],watchlist:[],userSymbols:[]});
 function field(key,value){
  if(key in limits)return Array.isArray(value)&&value.length<=limits[key]&&value.every(symbol)&&(key==='userSymbols'||new Set(value).size===value.length);
  if(key==='interval')return value==='1d'||typeof value==='string'&&/^[1-9][0-9]{0,2}m$/.test(value)&&Number(value.slice(0,-1))<=239;
  if(key==='cadence')return Number.isInteger(value)&&value>=1&&value<=1440;
  if(['auto','notifications','delayed'].includes(key))return typeof value==='boolean';
  if(['quantity','commission','slippage'].includes(key))return Number.isFinite(value)&&value>=0;
  return key==='valueStrategy'&&['BALANCED','QUALITY','DISCOUNT'].includes(value);
 }
 function validate(s){
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('BUILD670 tercih nesnesi geçersiz.');
  for(const k of Object.keys(s))if(!field(k,s[k]))throw Error('BUILD670 tercih alanı geçersiz: '+k);
  for(const k of Object.keys(base).filter(k=>k!=='valueStrategy'))if(!(k in s))throw Error('BUILD670 tercih alanı eksik: '+k);
  return s;
 }
 function recover(s){
  const settings=defaults(),issues=[];
  if(!s||typeof s!=='object'||Array.isArray(s))return {settings,issues:['Tercih nesnesi okunamadı']};
  for(const [key,value] of Object.entries(s)){
   if(field(key,value))settings[key]=Array.isArray(value)?[...value]:value;
   else{issues.push(key);if(key in limits&&Array.isArray(value)){const valid=value.filter(symbol);settings[key]=(key==='userSymbols'?valid:[...new Set(valid)]).slice(0,limits[key]);}}
  }
  for(const k of Object.keys(base).filter(k=>k!=='valueStrategy'))if(!(k in s))issues.push(k);
  if(issues.length)settings.auto=false;
  return {settings,issues};
 }
 return {defaults,validate,recover};
});
