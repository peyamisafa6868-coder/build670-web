'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ids=['easyPriceMovement','easyImportantLevels','easyChangeConditions','easyCompany','easyWhyInterest','easyRisks','easyDataSource','indStoch','indCci','indAdx','indMomentum','stockPivotSupports','stockPivotResistances'];
class Node{
 constructor(tag='p'){this.tag=tag;this.children=[];this.style={};this.textContent='';this.parent=null;}
 setAttribute(){} append(x){this.children.push(x);x.parent=this;}
 insertBefore(x){this.append(x);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(v=>v!==this);}
 closest(){return this.parent;}
 querySelector(s){return s==='p'?this.children.find(x=>x.tag==='p'):this.children.find(x=>x.tag==='svg'||x.className==='build670-evidence-visual');}
}
const elements={};for(const id of ids){const section=new Node('section'),p=new Node('p');p.parent=section;section.children=[p];elements[id]=p;}
elements.chartMode={textContent:"VERİ YOK"};
const document={getElementById:id=>elements[id]||null,createElementNS:(_,tag)=>new Node(tag),createElement:tag=>new Node(tag),querySelectorAll:()=>Object.values(elements).flatMap(p=>p.parent?.children.filter(x=>x!==p)??[])};
const context={document,console,Date,Intl,Number,Set,Math,globalThis:null,state:{symbol:'TEST',interval:'5m'},resetIndicators:()=>{},emptyChart:()=>{},showChart:()=>{},closedCandles:p=>p.candles.filter(x=>x.closed===true),offlineIsTestSource:()=>false,calculateIndicators:rows=>({ema9:rows.map(x=>x.close-1),ema21:rows.map(x=>x.close-2),rsi:rows.map(()=>55),atr:rows.map(()=>2)})};
context.globalThis=context;vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../stock-analysis.js'),'utf8'),context);
const candles=Array.from({length:45},(_,i)=>({timestamp:1794300000000+i*300000,open:100+i*.2,close:101+i*.2,high:102+i*.2,low:99+i*.2,volume:100+i,closed:true}));
context.showChart({symbol:'TEST',interval:'5m',source:'TEST PROVIDER',candles});
for(const id of ['easyPriceMovement','easyImportantLevels','easyChangeConditions','easyWhyInterest','easyRisks']){
 assert(!/Doğrulanmış bilgi bekleniyor/.test(elements[id].textContent),id+' stuck');
 assert(elements[id].parent.children.some(x=>x!==elements[id]),id+' missing visual');
}
assert.match(elements.easyCompany.textContent,/KAP faaliyet raporu henüz doğrulanmadı/);
assert.match(elements.easyWhyInterest.textContent,/önceki 20 mum ortalaması/i);
assert.match(elements.easyRisks.textContent,/ATR\(14\)/);
context.showChart({symbol:'TEST',interval:'5m',source:'TEST PROVIDER',candles:candles.slice(0,8)});
assert.match(elements.easyImportantLevels.textContent,/20 önceki kapanmış mum gerekiyor/);
assert.match(elements.easyPriceMovement.textContent,/Son 5 dk kapanışı/);
console.log('PASS six cards: independent numeric evidence, visuals, KAP unavailable, short-history partial');

context.emptyChart('Test sağlayıcısı yanıt vermedi.');
assert.equal(elements.easyDataSource.textContent,'Test sağlayıcısı yanıt vermedi.');
assert.equal(elements.easyPriceMovement.textContent,'Grafik verisi kullanılamıyor.');
assert.match(elements.easyCompany.textContent,/yüklenmedi/);
context.showChart({symbol:'TEST',interval:'5m',source:'TEST PROVIDER',candles});
assert.match(elements.easyPriceMovement.textContent,/Son 5 dk kapanışı/);
console.log('PASS failed chart request reports error and cards recover on success');
