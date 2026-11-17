/* Source: BUILD670 ExtendedStockEvidence.kt and ReadableStockAnalysis.kt.
   Descriptive display only; does not change scanner weights or decision gates. */
(() => {
  'use strict';
  const daily = new Set(['1d','1w','1mo','all']);
  const labels = {'1m':'1 dk','3m':'3 dk','5m':'5 dk','10m':'10 dk','15m':'15 dk','30m':'30 dk','60m':'1 saat','240m':'4 saat','1d':'1 gün','1w':'1 hafta','1mo':'1 ay','all':'tüm zamanlar'};
  const clean = input => {const seen=new Set();return input.filter(b => b.timestamp > 0 &&
    [b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite) &&
    Math.min(b.open,b.high,b.low,b.close)>0 && b.high>=Math.max(b.open,b.close,b.low) &&
    b.low<=Math.min(b.open,b.close,b.high) && b.volume>=0
  ).filter(b=>{if(seen.has(b.timestamp))return false;seen.add(b.timestamp);return true;}).sort((a,b)=>a.timestamp-b.timestamp);};
  const mean = values => values.reduce((a,b)=>a+b,0)/values.length;
  const finite = v => Number.isFinite(v)?v:null;
  const dayFormat = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'});
  function adx(rows,period=14) {
    if(period<2||rows.length<period*2+1)return null;
    const tr=Array(rows.length).fill(0),pos=tr.slice(),neg=tr.slice();
    for(let i=1;i<rows.length;i++){
      const up=rows[i].high-rows[i-1].high,down=rows[i-1].low-rows[i].low;
      pos[i]=up>down&&up>0?up:0;neg[i]=down>up&&down>0?down:0;
      tr[i]=Math.max(rows[i].high-rows[i].low,Math.abs(rows[i].high-rows[i-1].close),Math.abs(rows[i].low-rows[i-1].close));
    }
    let st=tr.slice(1,period+1).reduce((a,b)=>a+b,0),sp=pos.slice(1,period+1).reduce((a,b)=>a+b,0),sn=neg.slice(1,period+1).reduce((a,b)=>a+b,0);
    const dx=()=>{if(st<=0)return 0;const p=100*sp/st,n=100*sn/st;return p+n>0?100*Math.abs(p-n)/(p+n):0;};
    const values=[dx()];
    for(let i=period+1;i<rows.length;i++){
      st=st-st/period+tr[i];sp=sp-sp/period+pos[i];sn=sn-sn/period+neg[i];values.push(dx());
    }
    let value=mean(values.slice(0,period));
    for(let i=period;i<values.length;i++)value=(value*(period-1)+values[i])/period;
    return value>=0&&value<=100?finite(value):null;
  }
  function extended(input) {
    const rows=clean(input.filter(b=>b.closed===true)),last=rows.at(-1);
    if(!last)return {stochastic14:null,cci20:null,adx14:null,momentum10Pct:null};
    const w=rows.slice(-14),hi=Math.max(...w.map(b=>b.high)),lo=Math.min(...w.map(b=>b.low));
    const typical=rows.slice(-20).map(b=>(b.high+b.low+b.close)/3),avg=mean(typical),dev=mean(typical.map(v=>Math.abs(v-avg)));
    const previous=rows.at(-11)?.close;
    return {stochastic14:w.length===14&&hi>lo?finite((last.close-lo)/(hi-lo)*100):null,
      cci20:typical.length===20&&dev>0?finite((typical.at(-1)-avg)/(0.015*dev)):null,
      adx14:adx(rows),momentum10Pct:previous>0?finite((last.close/previous-1)*100):null};
  }
  function pivotLevels(input) {
    const rows=clean(input.filter(b=>b.closed===true)),levels=[];
    function follow(index,price,support){
      let changed=false,count=0;
      for(let j=index+3;j<rows.length;j++){
        const crossed=support?rows[j].close<price*0.999:rows[j].close>price*1.001;
        count=crossed?count+1:0;
        if(count===2){support=!support;changed=true;count=0;}
      }
      return {price,support,roleChanged:changed};
    }
    for(let i=2;i<rows.length-2;i++){
      const neighbors=rows.slice(i-2,i+3).filter((_,j)=>j!==2);
      if(neighbors.every(b=>rows[i].high>b.high))levels.push(follow(i,rows[i].high,false));
      if(neighbors.every(b=>rows[i].low<b.low))levels.push(follow(i,rows[i].low,true));
    }
    return levels;
  }
  function ladder(input,referencePrice) {
    if(!Number.isFinite(referencePrice)||referencePrice<=0)return {resistances:[],supports:[]};
    const levels=pivotLevels(input);
    function distinct(support){
      const ordered=levels.filter(l=>l.support===support).map(l=>l.price)
        .filter(v=>support?v<referencePrice:v>referencePrice).sort((a,b)=>support?b-a:a-b);
      const result=[];
      for(const v of ordered){if(result.every(x=>Math.abs(x-v)/referencePrice>=0.003))result.push(v);if(result.length===3)break;}
      return result;
    }
    return {resistances:distinct(false),supports:distinct(true)};
  }
  function readable(input,interval,calculator,now=Date.now(),alreadyClosed=false) {
    const rows=clean(input);
    if(rows.length<31||rows.some(b=>b.timestamp>now+60000))return null;
    // Preserve Kotlin parity for raw provider series; normalized closed-only input opts out of dropping the last bar.
    const closed=(alreadyClosed?rows:rows.slice(0,-1)).filter(b=>b.closed===true);
    if(closed.length<30)return null;
    if(!daily.has(interval)){
      const ms=Number.parseInt(interval,10)*60000,last=closed.slice(-30);let pairs=0;
      if(last.length<30||!Number.isFinite(ms))return null;
      for(let i=1;i<last.length;i++)if(dayFormat.format(last[i].timestamp)===dayFormat.format(last[i-1].timestamp)){
        if(last[i].timestamp-last[i-1].timestamp!==ms)return null;pairs++;
      }
      if(pairs<6)return null;
    }
    const calc=calculator||(typeof calculateIndicators==='function'?calculateIndicators:null);
    if(!calc)return null;
    const series=calc(closed,{intraday:!daily.has(interval)}),recent=closed.at(-1),earlier=closed.slice(-21,-1);
    const e9=series.ema9.at(-1),e21=series.ema21.at(-1);
    if(e9==null||e21==null)return null;
    const direction=recent.close>e9&&e9>e21?'RISING':recent.close<e9&&e9<e21?'FALLING':'MIXED';
    const support=Math.min(...earlier.map(b=>b.low)),resistance=Math.max(...earlier.map(b=>b.high));
    const referenceVolume=mean(earlier.map(b=>b.volume));
    return {direction,period:labels[interval],examinedPrice:recent.close,support,resistance,
      rsi:series.rsi.at(-1),volumeRatio:referenceVolume>0?finite(recent.volume/referenceVolume):null,
      atrPercent:finite(100*series.atr.at(-1)/recent.close),sampleTime:recent.timestamp};
  }
  const api=Object.freeze({extended,adx,pivotLevels,ladder,readable});
  globalThis.BistStockAnalysis=api;
  if(typeof module!=='undefined')module.exports=api;
  if(typeof document==='undefined'||typeof showChart!=='function')return;
  const put=(id,text)=>{const node=document.getElementById(id);if(node)node.textContent=text;};
  const format=v=>Number.isFinite(v)?new Intl.NumberFormat('tr-TR',{maximumFractionDigits:2}).format(v):'—';
  function evidenceGraphic(id,values,kind='line'){
    const target=document.getElementById(id)?.closest('section');
    if(!target)return;
    target.querySelector('.build670-evidence-visual')?.remove();
    const good=values.filter(Number.isFinite);
    if(good.length<2)return;
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('class','build670-evidence-visual');svg.setAttribute('viewBox','0 0 240 52');
    svg.setAttribute('role','img');svg.setAttribute('aria-label',kind==='bars'?'Geçmiş 20 kapanmış mumun göreli hacimleri':'Geçmiş kapanışların fiyat hareketi');
    svg.style.cssText='display:block;width:100%;height:52px;margin:8px 0;color:#40e5d3';
    const min=Math.min(...good),max=Math.max(...good),range=max-min||1;
    if(kind==='bars'){
      const w=224/good.length;
      good.forEach((v,i)=>{const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');
        const h=Math.max(1,(v/Math.max(max,1))*42);rect.setAttribute('x',String(8+i*w));
        rect.setAttribute('y',String(48-h));rect.setAttribute('width',String(Math.max(1,w-2)));
        rect.setAttribute('height',String(h));rect.setAttribute('fill','#4ca9ed');svg.append(rect);});
    }else{
      const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
      poly.setAttribute('points',good.map((v,i)=>`${8+i*224/(good.length-1)},${46-(v-min)/range*38}`).join(' '));
      poly.setAttribute('fill','none');poly.setAttribute('stroke',good.at(-1)>=good[0]?'#39e7c4':'#ff7984');
      poly.setAttribute('stroke-width','2.5');poly.setAttribute('stroke-linejoin','round');svg.append(poly);
    }
    target.insertBefore(svg,target.querySelector('p'));
  }
  function clearEvidenceGraphics(){
    document.querySelectorAll('.build670-evidence-visual').forEach(node=>node.remove());
  }
  function reset(){
    clearEvidenceGraphics();
    ['indStoch','indCci','indAdx','indMomentum'].forEach(id=>put(id,'—'));
    ['easyPriceMovement','easyImportantLevels','easyChangeConditions','easyWhyInterest','stockPivotSupports','stockPivotResistances'].forEach(id=>put(id,'Doğrulanmış bilgi bekleniyor.'));
    put('easyDataSource','Veri bekleniyor. Teyitsiz fiyat veya yön yorumu gösterilmez.');
  }
  const originalReset=resetIndicators;
  resetIndicators=function(...args){originalReset(...args);reset();};
  const originalShow=showChart;
  showChart=function(payload,options={}){
    originalShow(payload,options);reset();
    let closed;try{closed=closedCandles(payload);}catch{return;}
    const e=extended(closed),levels=ladder(closed,closed.at(-1)?.close);
    put('indStoch',format(e.stochastic14));put('indCci',format(e.cci20));put('indAdx',format(e.adx14));put('indMomentum',format(e.momentum10Pct)+(e.momentum10Pct==null?'':'%'));
    put('stockPivotSupports',levels.supports.length?levels.supports.map(format).join(' · '):'Bu dönemde doğrulanmış destek pivotu yok.');
    put('stockPivotResistances',levels.resistances.length?levels.resistances.map(format).join(' · '):'Bu dönemde doğrulanmış direnç pivotu yok.');
    const synthetic=options.demo||offlineIsTestSource(payload.source);
    if(synthetic){put('easyPriceMovement','SENTETİK TEST VERİSİ: Gerçek hisse yorumu değildir.');put('easyDataSource',payload.source||'SENTETİK DEMO');return;}
    const analysis=readable(closed.map(b=>({...b,closed:true})),payload.interval||state.interval,undefined,Date.now(),true);
    put('easyDataSource',`${payload.symbol||state.symbol} · ${labels[payload.interval||state.interval]} · Kaynak: ${payload.source||'KULLANICI DOSYASI'}. Yalnızca doğrulanmış kapanmış mumlar kullanılır; yatırım tavsiyesi değildir.`);
    if(!analysis){put('easyPriceMovement','En az 31 geçerli sağlayıcı mumu ve seçilen döneme uygun süreklilik gerekir. Eksik veriden yön üretilmez.');return;}
    // closedCandles() already excludes forming observations; preserve its result
    // even when the transport omits an explicit closed=true property.
    const verified=closed;
    const last20=verified.slice(-20),last36=verified.slice(-36);
    evidenceGraphic('easyPriceMovement',last36.map(b=>b.close));
    evidenceGraphic('easyImportantLevels',last20.map(b=>b.close));
    evidenceGraphic('easyChangeConditions',last20.map(b=>b.close));
    evidenceGraphic('easyWhyInterest',[...verified.slice(-21,-1).map(b=>b.volume),verified.at(-1)?.volume],'bars');
    const previous=verified.at(-2)?.close,nowPrice=verified.at(-1)?.close;
    const pct=Number.isFinite(previous)&&previous>0?100*(nowPrice/previous-1):null;
    const text=analysis.direction==='RISING'?'fiyat, kısa ve orta vadeli fiyat ortalamalarının üstünde. Bu durum incelenen mumlarda yukarı yönün daha belirgin olduğunu gösterir; sonraki fiyatı garanti etmez.':analysis.direction==='FALLING'?'fiyat, kısa ve orta vadeli fiyat ortalamalarının altında. Bu durum incelenen mumlarda satış yönünün daha baskın olduğunu gösterir; düşüşün süreceği kesin değildir.':'fiyat ve kısa vadeli ortalamalar aynı yönde değil. Bu yüzden net bir yükseliş veya düşüş demek için yeterli uyum yok.';
    put('easyPriceMovement',`Son kapanış ${format(nowPrice)} TL${pct==null?'':', önceki kapanışa göre '+(pct>=0?'+':'')+format(pct)+'%'}. Seçilen ${analysis.period} grafiğinde ${text}`);
    put('easyImportantLevels',`Son kapanış ${format(nowPrice)} TL; destek ${format(analysis.support)} TL (${format((nowPrice/analysis.support-1)*100)}% aşağıda), direnç ${format(analysis.resistance)} TL (${format((analysis.resistance/nowPrice-1)*100)}% yukarıda). Bunlar önceki 20 mumdan hesaplanan izleme seviyeleridir; kesin alım veya satım noktası değildir.`);
    put('easyChangeConditions',`Sonraki doğrulanmış kapanışlar ${format(analysis.resistance)} üstüne çıkar ve işlem hacmi de artarsa yukarı yön güçlenebilir. ${format(analysis.support)} altına inerlerse görünüm zayıflayabilir. İki seviye arasında kalırsa yön hâlâ belirsiz olabilir.`);
    put('easyWhyInterest',`RSI(14) ${format(analysis.rsi)} · Son hacim ${format(last20.at(-1)?.volume)} · Önceki 20 mum ortalamasına oran ${format(analysis.volumeRatio)} kat · ATR(14) %${format(analysis.atrPercent)}. Bunlar geçmiş mumları açıklar; alım gerekçesi veya hedef fiyat değildir.`);
    put('easyDataSource',document.getElementById('easyDataSource').textContent+` İncelenen mum: ${new Date(analysis.sampleTime).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'})}.`);
  };
})();
