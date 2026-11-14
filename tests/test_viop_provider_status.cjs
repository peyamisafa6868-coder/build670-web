/* V6.3.43: VIOP status states, async retry and stale-route isolation. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','android-app.js'),'utf8');
const first=src.indexOf('  function viopConnectionView(provider,ready){');
const last=src.indexOf('  async function contracts(',first);
assert(first>=0&&last>first,'VIOP status code must exist');
const code=src.slice(first,last);
const make=new Function('env',`
  let version=1,screen='viop';
  const texts={},handlers={},visible={},calls=[];
  const text=(id,t)=>{texts[id]=t;};
  const show=(id,on=true)=>{visible[id]=on;};
  const bind=(id,fn)=>{handlers[id]=fn;};
  const navigateTo=()=>{};
  const api=path=>{calls.push(path);return env.api(path);};
  ${code}
  return {texts,handlers,visible,calls,view:viopConnectionView,
    start:viop,leave:()=>{version++;screen='settings';}};
`);
const ready={status:'ready',coreReady:true,licensedProviderConnected:false};
const noProvider={configured:false,connected:false,authenticated:false,reason:'NOT_CONFIGURED'};
function from(api){return make({api});}
async function run(){
  let app=from(async p=>p==='/api/provider/status'?noProvider:ready);
  await app.start();
  assert.match(app.texts.providerTitle,/SAĞLAYICI KURULMADI/);
  assert.match(app.texts.providerStatus,/sunucuda yapılandırılmamış/);
  assert.match(app.texts.status,/Web ve hesap motoru hazır/);
  assert.equal(app.visible.providerLastUpdate,true);
  assert.equal(app.calls.length,2);
  assert.match(app.texts.providerLastUpdate,/Durum bilgisi, canlı fiyat akışı değildir/);
  assert.doesNotMatch(app.texts.status,/VİOP fiyatı doğrulandı/);
  app=from(async p=>p==='/api/provider/status'?{reason:'UNVERIFIED_PROVIDER_CONNECTIVITY'}:ready);
  await app.start();
  assert.match(app.texts.providerStatus,/bağlantı ve yetkilendirme doğrulanmadı/);
  app=from(async p=>p==='/api/provider/status'?{reason:'INVALID_CREDENTIAL_CONFIGURATION'}:ready);
  await app.start();
  assert.match(app.texts.providerStatus,/kimlik bilgileri eksik/);
  app=from(async p=>{if(p==='/ready')return ready;throw new Error('offline');});
  await app.start();
  assert.match(app.texts.providerStatus,/durum sorgusu başarısız/);
  // A previous request must not update an unrelated screen after navigation.
  const waiters=[];
  app=from(p=>new Promise(resolve=>waiters.push({p,resolve})));
  const running=app.start();
  app.leave();
  for(const w of waiters)w.resolve(w.p==='/api/provider/status'?noProvider:ready);
  await running;
  assert.equal(app.texts.providerTitle,'VİOP • BAĞLANTI KONTROL EDİLİYOR');
  // Two refreshes: an earlier, late response must not overwrite the latest.
  const q=[];
  app=from(p=>new Promise(resolve=>q.push({p,resolve})));
  const a=app.start();
  const b=app.handlers.refresh();
  for(const x of q.slice(2))x.resolve(x.p==='/api/provider/status'?noProvider:ready);
  await b;
  for(const x of q.slice(0,2))x.resolve(x.p==='/api/provider/status'?{reason:'INVALID_ENDPOINT_OR_ALLOWLIST'}:ready);
  await a;
  assert.match(app.texts.providerStatus,/sunucuda yapılandırılmamış/);
  console.log('test_viop_provider_status.cjs: 6 cases PASS');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
