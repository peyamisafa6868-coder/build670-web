/* FullscreenChartActivity workspace. Every period owns its series and request generation. */
(() => {
 'use strict';
 function render(host,ctx){
  const node=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
  const root=node('div','apk-fullscreen');host.append(root);const header=node('div','apk-full-row apk-full-header'),pages=node('div','apk-full-pages'),notice=node('div','apk-full-notice'),selection=node('div','apk-full-label');let data=null,sequence=0,comparisonSequence=0,period=ctx.params.interval||ctx.params.data?.interval||'1d',panels=true;
  const symbol=ctx.params.symbol||ctx.params.data?.symbol||'ASELS',market=ctx.params.market==='VIOP'?'VIOP':'BIST';
  const options={toggleEma9:true,toggleEma21:true,toggleSma50:false,toggleSma200:false,toggleVwap:true,toggleEma20:false,toggleEma50:false,toggleEma200:false,toggleBollinger:false,toggleTrend:false,toggleChannel:false,toggleSupportResistance:true,toggleSupport:true,toggleResistance:true,toggleVolume:true,toggleRsi:true,toggleMacd:false,toggleAtr:false};
  const intervals=[['1m','1 DK'],['5m','5 DK'],['10m','10 DK'],['15m','15 DK'],['30m','30 DK'],['60m','1 SAAT'],['240m','4 SAAT'],['1d','1 GÜN'],['1w','1 HAFTA'],['1mo','1 AY']],label=tf=>intervals.find(x=>x[0]===(tf||period))?.[1]||tf||period;
  const number=(x,d=2)=>Number.isFinite(x)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(x):'—',date=t=>new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(t);
  function action(text,fn,id){const b=node('button','apk-full-action',text);b.type='button';if(id)b.id=id;b.onclick=()=>Promise.resolve().then(fn).catch(e=>{notice.textContent=e.message;});return b;}
  const title=node('button','apk-full-title');title.type='button';title.id='apk-fullTitle';title.setAttribute('aria-label','Sembol ve zaman dilimi; dönem seçmek için dokunun');title.onclick=()=>{const d=node('dialog','terminal-dialog');for(const [tf,text] of intervals)d.append(action(text,()=>{d.close();load(tf);}));d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();};header.append(action('‹',ctx.back,'apk-fullBack'),title);root.append(header);
  const tv=action('↗  TRADINGVIEW GRAFİĞİNİ AÇ',()=>{if(!/^[A-Z0-9._-]{1,40}$/.test(symbol))throw Error('TradingView için geçerli bir sembol seçin.');window.open(market==='VIOP'?'https://www.tradingview.com/symbols/?query='+encodeURIComponent(symbol):'https://www.tradingview.com/chart/?symbol=BIST%3A'+encodeURIComponent(symbol),'_blank','noopener');},'apk-fullTradingView');tv.classList.add('apk-full-tv');root.append(tv,notice);
  const nav=node('div','apk-full-row apk-full-tabs'),chartPage=node('div'),summary=node('div'),details=node('div'),financial=node('div');chartPage.dataset.fullPage='chart';summary.dataset.fullPage='summary';details.dataset.fullPage='details';financial.dataset.fullPage='financial';
  const tabButtons=[];function show(which){for(const panel of [chartPage,summary,details,financial])panel.hidden=panel.dataset.fullPage!==which;for(const [key,b] of tabButtons)b.setAttribute('aria-selected',String(key===which));}
  for(const [key,text] of [['chart','GRAFİK'],['summary','TEKNİK'],['details','PLAN'],['financial','FİNANSAL']]){const b=action(text,()=>show(key),'apk-fullTab-'+key);b.setAttribute('role','tab');tabButtons.push([key,b]);nav.append(b);}nav.append(action('YENİLE',()=>{load(period);comparisons();},'apk-fullRefresh'));root.append(nav,pages);pages.append(chartPage,summary,details,financial);
  const trendPanel=node('div','apk-full-trends');trendPanel.hidden=true;chartPage.append(trendPanel);
  const periodStrip=node('div','apk-full-strip'),periodRow=node('div','apk-full-row'),periodButtons=[];for(const [tf,text] of intervals.filter(([tf])=>['5m','10m','60m','1d'].includes(tf))){const b=action(text,()=>load(tf));b.dataset.fullInterval=tf;periodRow.append(b);periodButtons.push([tf,b]);}periodStrip.append(periodRow);chartPage.append(periodStrip,selection);selection.classList.add('chart-focus-selection');
  const chart=node('div','apk-full-chart');chart.id='apk-fullChart';chartPage.append(chart);
  const indicatorStrip=node('div','apk-full-strip'),indicatorRow=node('div','apk-full-row'),refreshers=[];
  for(const [key,text] of [['toggleSupportResistance','S/D'],['toggleSupport','DESTEK'],['toggleResistance','DİRENÇ'],['toggleEma9','EMA9'],['toggleEma21','EMA21'],['toggleSma50','SMA50'],['toggleSma200','SMA200'],['toggleVwap','VWAP'],['toggleBollinger','Bollinger'],['toggleAtr','ATR14']]){
    const b=action('',()=>{options[key]=!options[key];
      if(key==='toggleSupportResistance')options.toggleSupport=options.toggleResistance=options[key];
      else if(key==='toggleSupport'||key==='toggleResistance')options.toggleSupportResistance=options.toggleSupport||options.toggleResistance;
      refreshers.forEach(fn=>fn());draw();
    });
    b.dataset.chartToggle=key;
    const refresh=()=>{const active=key==='toggleSupportResistance'?options[key]:key==='toggleSupport'||key==='toggleResistance'?options.toggleSupportResistance&&options[key]:options[key];
      const palette={toggleSupportResistance:'#00cda8',toggleSupport:'#16f2a3',toggleResistance:'#ff5b7f',toggleEma9:'#30bcff',toggleEma21:'#ffd247',toggleSma50:'#b58dff',toggleSma200:'#ffb15c',toggleVwap:'#00e6a8',toggleBollinger:'#bac6da',toggleAtr:'#fa9c75'};
      b.textContent=text+(active?' ✓':'');b.setAttribute('aria-pressed',String(!!active));
      b.style.background=active?(palette[key]||'#00cda8'):'#08293d';b.style.color=active?'#041827':'#d5e4f0';
      b.style.borderColor=active?'transparent':'#315167';
    };
    refreshers.push(refresh);refresh();indicatorRow.append(b);
   }indicatorStrip.append(indicatorRow);indicatorStrip.hidden=true;chartPage.append(indicatorStrip);
  const legend=node('div','chart-focus-legend');
  for(const [key,text,color] of [['toggleEma9','EMA9','#30bcff'],['toggleEma21','EMA21','#ffd247'],['toggleVwap','VWAP','#00e6a8']]){
   const b=action('● '+text,()=>{options[key]=!options[key];b.setAttribute('aria-pressed',String(options[key]));b.style.opacity=options[key]?'1':'.45';draw();});b.style.setProperty('--legend-color',color);b.setAttribute('aria-pressed',String(!!options[key]));legend.append(b);
  }
  legend.append(action('Göstergeler ▾',()=>{indicatorStrip.hidden=!indicatorStrip.hidden;}));periodStrip.append(legend);
  const tools=node('div','apk-full-row apk-full-tools chart-focus-tools');
  tools.append(action('✥',()=>{chart.dataset.mode='pan';},'apk-fullPan'),action('⌖',()=>{chart.dataset.mode='crosshair';},'apk-fullCrosshair'),action('−',()=>AndroidPriceChart.zoom(chart,1/1.35),'apk-fullZoomOut'),action('+',()=>AndroidPriceChart.zoom(chart,1.35),'apk-fullZoomIn'),action('⊞',()=>AndroidPriceChart.getState(chart)?.fit?.(),'apk-fullReset'),action('⛶',()=>{const el=chartPage;if(document.fullscreenElement)document.exitFullscreen?.();else el.requestFullscreen?.();},'apk-fullNativeFullscreen'),action('Son muma dön',()=>AndroidPriceChart.getState(chart)?.last?.(),'apk-fullLast'));
  chartPage.append(tools,node('div','chart-focus-hint','İmleç merkezli yakınlaştırma · Tut ve sürükle'));
  const readable=node('div','apk-full-label'),levelSource=node('div','apk-full-label');chartPage.append(readable,levelSource);financial.append(node('div','apk-full-card','Doğrulanmış otomatik finansal veri kaynağı bağlı değil. KAP belge içeriği ve finansal dönem doğrulanmadan değer/analist hedefi üretilmez.'),action('Temel değerleme',()=>ctx.navigate('cheap',{symbol})));
  function selected(b){selection.textContent=b?date(b.timestamp)+' · '+label()+' · '+(b.closed===true?'KAPANMIŞ MUM':b.closed===false?'OLUŞAN MUM':'Kapanış bilgisi dönem meta verisinden')+'\nA '+number(b.open)+'  Y '+number(b.high)+'  D '+number(b.low)+'  K '+number(b.close)+'  H '+number(b.volume,0):'Fiyat / OHLCV: —';}
  function card(parent,heading,value){const n=node('div','apk-full-card');n.append(node('strong','',heading),node('div','',value));parent.append(n);}
  // Only known closed candles participate in analysis. A missing final-bar flag
  // is treated conservatively as open; explicit per-bar flags take precedence.
  function confirmedCandles(dataset){
   const candles=Array.isArray(dataset?.candles)?dataset.candles:[];
   return candles.filter((bar,index)=>{
    if(!bar||!Number.isFinite(Number(bar.timestamp??bar.time))||Number(bar.timestamp??bar.time)<=0)return false;
    if(bar.closed===false)return false;
    if(bar.closed===true)return true;
    return index<candles.length-1 || dataset.lastBarClosed===true;
   });
  }
  function analysis(m){
   summary.replaceChildren();details.replaceChildren();const bars=confirmedCandles(data),last=bars.at(-1);if(!last){card(summary,'VERİ YETERSİZ','Doğrulanmış kapanmış mum bulunamadı.');readable.textContent='Kapanmış mum bulunamadı.';return;}const s=m.series,tail=k=>s[k]?.at(-1),previous=bars.slice(0,-1).slice(-20),support=previous.length===20?Math.min(...previous.map(x=>x.low)):null,resistance=previous.length===20?Math.max(...previous.map(x=>x.high)):null,average=previous.length===20?previous.reduce((n,x)=>n+x.volume,0)/20:null,ratio=average>0?last.volume/average:null,fast=tail('ema9'),slow=tail('ema21');
   const trend=fast==null||slow==null?'EMA9/21 için yetersiz geçmiş':fast>slow&&last.close>fast?'Yükseliş eğilimi · Kapanış > EMA9 > EMA21':fast<slow&&last.close<fast?'Düşüş eğilimi · Kapanış < EMA9 < EMA21':'Karışık / yatay · EMA sıralaması teyitli değil';
   card(summary,'ÖNCEKİ MUM REFERANSI · '+label(),number(last.close)+' · Kapanış kesinliği ve güncellik ayrıca doğrulanmalıdır; anlık alış/satış fiyatı değildir');card(summary,'TREND',trend);card(summary,'REFERANS DESTEK / DİRENÇ',number(support)+' / '+number(resistance)+'\nSon mum hariç önceki 20 mumun alt / üst seviyesi');card(summary,'HACİM','Son mum: '+number(last.volume,0)+'\nÖnceki 20 mum ortalaması: '+number(average,0)+' · Oran: '+number(ratio)+'×');card(summary,'RİSK / OYNAKLIK','ATR14: '+number(tail('atr'),4)+' · ATR/Fiyat: %'+number(100*tail('atr')/last.close));card(summary,'İŞLEM SİNYALİ: YOK','Verinin güncelliği ve son mumun kapanışı birlikte doğrulanmadı. Hesaplanan eğilim alış/satış onayı değildir.');
   for(const [name,key] of [['EMA9','ema9'],['EMA21','ema21'],['SMA50','sma50'],['SMA200','sma200'],['VWAP (gün içi)','vwap'],['Bollinger20 üst','upper'],['Bollinger20 alt','lower'],['RSI14 (Wilder)','rsi'],['MACD12/26','macd'],['MACD sinyal9','signal'],['MACD histogram','histogram'],['ATR14 (Wilder)','atr']])card(details,name,tail(key)==null?'Hesaplanamadı / yetersiz veri':number(tail(key),4));
   card(details,'HESAPLAMA / VERİ',bars.length+' doğrulanmış kapanmış OHLCV mumu · '+label());readable.textContent=trend+'\nHer dönem kendi kapanmış mumlarıyla hesaplanır. Canlı işlem sinyali değildir.';
  }
  function draw(){if(data)AndroidPriceChart.mount(chart,data,{options,onSelect:selected,onModel:()=>{
    const st=AndroidPriceChart.getState(chart),levels=st?.mergedLevels;
    if(!levels)return;const show=k=>(levels[k]||[]).map(x=>number(x.price)+' ['+(x.source.includes('KOTLIN')?'Kotlin':'Pivot')+(x.source.includes('KOTLIN')&&x.source.includes('PIVOT')?'+Pivot':'')+']').join(' · ')||'—';
    levelSource.textContent='SEVİYE KAYNAKLARI • Destek: '+show('support')+' • Direnç: '+show('resistance')+'\nKotlin referansı ve kapanmış mum pivotları birleştirilir; seviyeler işlem onayı değildir.';
  }});}
  async function fetchData(tf){if(market==='VIOP')throw Error('Yetkili VİOP geçmiş kaynağı bağlı değil. Hisse/Yahoo verisi kullanılmadı.');const local=OFFLINE_DB.get(OFFLINE_KEY('BIST',symbol,tf));return local&&offlineSourceFamily(local)==='USER_FILE'?local:await BistYahooAuto.fetch(symbol,tf);}
  async function load(tf,initial){
   period=tf;const token=++sequence;data=null;AndroidPriceChart.clear(chart);summary.replaceChildren();details.replaceChildren();readable.textContent='';levelSource.textContent='Seviye kaynakları yenileniyor…';selected(null);title.textContent=symbol+' · '+(market==='VIOP'?'VİOP':'BIST')+' · '+label()+' ▾';for(const [key,b] of periodButtons)b.style.opacity=key===tf?'1':'.55';notice.textContent='Gerçek OHLCV yükleniyor…';
   if(ctx.reference&&!initial){notice.textContent='Referans görünüm • gerçek veri yüklenmedi.';return;}
   try{const next=initial||await fetchData(tf);if(!root.isConnected||token!==sequence)return;
    if(next.interval!==tf||next.symbol!==symbol)throw Error('Veri sembolü veya dönemi istenen grafikle uyuşmuyor.');
    if(!window.Build670ChartIntegrity?.inspect(next)?.valid)throw Error('Ham OHLCV veri bütünlüğü doğrulanamadı.');
    data=next;draw();selected(data.candles.at(-1));notice.textContent=(offlineSourceFamily(data)==='YAHOO'?'GECİKMELİ VERİ':'KAYITLI VERİ')+' · '+data.source+'\nSon mum başlangıcı: '+date(data.candles.at(-1).timestamp)+' · Canlı fiyat değildir.';if(confirmedCandles(data).length>1){const result=await BistTerminal.api('/api/chart-analysis',{candles:confirmedCandles(data),intraday:!['1d','1w','1mo'].includes(tf),excludeNewestForTrend:false});if(root.isConnected&&token===sequence)analysis(result);}}
   catch(e){if(!root.isConnected||token!==sequence)return;data=null;AndroidPriceChart.clear(chart);notice.textContent=e.message+' Grafik ve analiz temizlendi.';chart.append(node('div','apk-full-card','Grafik verisi alınamadı'),action('Yeniden dene',()=>load(tf)));}
  }
  async function comparisons(){
   const token=++comparisonSequence;trendPanel.replaceChildren();const heading=node('div','apk-full-row'),grid=node('div','apk-full-trend-grid');heading.append(node('strong','apk-full-label','ÇOKLU ZAMAN DİLİMİ · TREND'),action('↻ Yenile',comparisons));trendPanel.append(heading,grid);const resolved=[];
   await Promise.all(['5m','10m','60m','1d'].map(async tf=>{const cell=node('div','apk-full-trend-cell'),status=node('div','',ctx.reference?'Veri yok · Yorum yapılmadı':'Veri kontrol ediliyor');cell.append(node('strong','',label(tf)),status);grid.append(cell);if(ctx.reference)return;try{const series=await fetchData(tf);if(!root.isConnected||token!==comparisonSequence)return;if(series.interval!==tf||series.symbol!==symbol||!window.Build670ChartIntegrity?.inspect(series)?.valid)throw Error('MTF veri bağlamı veya OHLCV geçersiz');
      const normalized=series.candles.map((b,i)=>({...b,closed:b.closed===true||(b.closed==null&&(i<series.candles.length-1||series.lastBarClosed===true))})),value=BistStockAnalysis.readable(normalized,tf,calculateIndicators),aged=value&&Date.now()-value.sampleTime>(tf==='1d'?14:7)*86400000;status.textContent=!value?'Veri yok · Yorum yapılmadı':aged?'Eski veri · Yön teyitsiz':value.direction==='RISING'?'↗ Yükseliş eğilimi':value.direction==='FALLING'?'↘ Düşüş eğilimi':'→ Yatay / karışık';if(value){cell.append(node('small','',date(value.sampleTime)+' · GECİKMELİ'));if(!aged)resolved.push(value.direction);}}catch{if(token===comparisonSequence)status.textContent='Veri yok · Yorum yapılmadı';}}));
   if(root.isConnected&&token===comparisonSequence){if(new Set(resolved).size>1)card(trendPanel,'⚠ ZAMAN DİLİMLERİ FARKLI YÖNDE','Kısa ve uzun dönem aynı şeyi söylemiyor.');trendPanel.append(node('div','apk-full-label','Her dönem yalnızca kendi doğrulanmış kapanmış mumlarıyla hesaplanır. Canlı işlem sinyali değildir.'));}
  }
  show('chart');load(period,ctx.params.data);comparisons();
 }
 window.AndroidFullscreen={render};
})();
