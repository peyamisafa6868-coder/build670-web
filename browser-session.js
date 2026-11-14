/* Installed synchronously before application code, only on authenticated pages. */
(() => {
 'use strict';
 const scope=document.querySelector('meta[name="build670-storage-scope"]').content;
 const binding=document.querySelector('meta[name="build670-session-binding"]').content;
 const user=document.querySelector('meta[name="build670-user"]').content;
 const prefix='build670:user:'+scope+':';
 // Preserve legacy device records. Only the signed-in user's namespace is exposed.
 for(const name of ['localStorage','sessionStorage']){
  const native=window[name],keys=()=>Object.keys(native).filter(k=>k.startsWith(prefix)).map(k=>k.slice(prefix.length));
  const methods={getItem:k=>native.getItem(prefix+String(k)),setItem:(k,v)=>native.setItem(prefix+String(k),String(v)),removeItem:k=>native.removeItem(prefix+String(k)),clear:()=>keys().forEach(k=>native.removeItem(prefix+k)),key:i=>keys()[i]??null};
  const scoped=new Proxy(Object.create(null),{
   get:(_,key)=>key==='length'?keys().length:key===Symbol.toStringTag?'Storage':Object.hasOwn(methods,key)?methods[key]:typeof key==='string'?methods.getItem(key):undefined,
   set:(_,key,value)=>{methods.setItem(key,value);return true;},
   deleteProperty:(_,key)=>{methods.removeItem(key);return true;},
   ownKeys:keys,
   getOwnPropertyDescriptor:(_,key)=>keys().includes(key)?{enumerable:true,configurable:true,value:methods.getItem(key),writable:true}:undefined
  });
  Object.defineProperty(window,name,{value:scoped,configurable:false});
 }
 const originalFetch=window.fetch.bind(window);
 let ending=false;
 function end(){if(!ending){ending=true;location.replace('/');}}
 window.fetch=async(input,init={})=>{
  const url=new URL(input instanceof Request?input.url:input,location.href);
  const protectedPath=/^\/(api\/|scan\/|history(?:\?|$)|auth\/)/.test(url.pathname);
  if(url.origin!==location.origin||!protectedPath)return originalFetch(input,init);
  const headers=new Headers(input instanceof Request?input.headers:undefined);
  new Headers(init.headers).forEach((value,key)=>headers.set(key,value));
  headers.set('X-Build670-Session',binding);
  const response=await originalFetch(input,{...init,headers,credentials:'same-origin'});
  if(response.status===401||response.status===409)end();
  return response;
 };
 // Validate the binding when a background tab becomes visible after account changes.
 addEventListener('focus',()=>fetch('/auth/session').catch(()=>{}));
 addEventListener('pageshow',event=>{if(event.persisted){document.documentElement.style.visibility='hidden';fetch('/auth/session').then(r=>{if(r.ok)document.documentElement.style.visibility='visible';}).catch(end);}});
 addEventListener('DOMContentLoaded',()=>{
  const bar=document.createElement('div');bar.id='build670-session';bar.setAttribute('role','region');bar.setAttribute('aria-label','Sunucu oturumu');
  bar.style.cssText='position:fixed;inset:0 0 auto;z-index:10000;display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:8px 16px;box-sizing:border-box;background:#102d3b;color:#ecf4ff;font:14px sans-serif';
  const label=document.createElement('span');label.textContent='Oturum: '+user;label.style.cssText='min-width:0;overflow-wrap:anywhere';
  const button=document.createElement('button');button.type='button';button.textContent='Oturumu kapat';button.style.cssText='min-height:44px;padding:8px 14px;background:#143d4d;border:1px solid #71c7bd;border-radius:8px;color:white';
  button.style.flexShrink='0';button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(r.ok)end();else button.disabled=false;}catch{button.disabled=false;label.textContent='Çıkış tamamlanamadı. Yeniden deneyin.';}};
  bar.append(label,button);document.body.prepend(bar);
  const style=document.createElement('style');style.textContent='#androidApp{top:var(--build670-session-height,60px)}';document.head.append(style);
  new ResizeObserver(()=>document.documentElement.style.setProperty('--build670-session-height',bar.offsetHeight+'px')).observe(bar);
 });
})();
