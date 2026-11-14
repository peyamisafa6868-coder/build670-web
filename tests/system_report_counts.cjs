/* BUILD670 system report accounting and provider fail-closed regression. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','android-app.js'),'utf8');
const start=source.indexOf('      const renderReport=(ready,provider,health,issues=[])=>{');
const stop=source.indexOf('      const refresh=async()=>{',start);
assert(start>=0&&stop>start,'system report formatter must be found');
const format=new Function('BistTerminal','settings','reportBody','ready','provider','health','issues',
  'let lastReport="";\n'+source.slice(start,stop)+'\nrenderReport(ready,provider,health,issues);return reportBody.textContent;');
const ready={status:'ready',licensedProviderConnected:false,signalAttestationVerified:false};
const health={status:'ok'};
const noProvider={configured:false,connected:false,authenticated:false,reason:'NOT_CONFIGURED'};
function render(job,provider=noProvider,r=ready,h=health){
  return format({job},{auto:false,notifications:false},{textContent:''},r,provider,h,[]);
}
let report=render({status:'COMPLETED_WITH_ERRORS',processed:632,total:632,successful:400,insufficient:200,errors:32});
assert.match(report,/BIST tarama: 632\/632 işlendi • COMPLETED_WITH_ERRORS/);
assert.match(report,/BIST sonuçları: Başarılı 400 • Yetersiz veri 200 • Hata 32/);
assert.match(report,/GÜNCEL SORUNLAR \(3\)/);
assert.doesNotMatch(report,/BACKEND_URL_MISSING/);
assert.match(report,/PROVIDER_NOT_CONFIGURED/);
assert.match(report,/BACKEND_READY \(yalnız web\/çekirdek; piyasa kaynağı değil\)/);
assert.match(report,/Otomasyon: Kapalı • Tarama durumundan bağımsız/);
report=render({status:'COMPLETE',processed:2,total:2,successful:2,insufficient:0,errors:0});
assert.match(report,/GÜNCEL SORUNLAR \(1\)/);
assert.match(report,/Başarılı 2 • Yetersiz veri 0 • Hata 0/);
report=render({status:'COMPLETED_WITH_ERRORS',processed:2,total:2});
assert.match(report,/sayısı belirlenemeyen sağlayıcı\/hesap hatası/);
report=render({status:'COMPLETE',processed:2,total:2,successful:2,insufficient:0,errors:0},
  {reason:'INVALID_CREDENTIAL_CONFIGURATION',connected:false,authenticated:false});
assert.match(report,/VİOP sağlayıcısı: INVALID_CREDENTIAL_CONFIGURATION/);
report=render(null,noProvider,{status:'not_ready',licensedProviderConnected:false},{status:'unavailable'});
assert.match(report,/Durum: NOT_READY/);
assert.match(report,/GÜNCEL SORUNLAR \(2\)/);
console.log('system_report_counts.cjs: 5 cases PASS');
