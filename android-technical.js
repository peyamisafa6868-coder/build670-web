/* TechnicalAnalysisActivity: native indicator rows and four independent OHLCV trends. */
(() => {
  'use strict';
  const frames=[['3m','3 DK'],['5m','5 DK'],['60m','1 SA'],['1d','1 GÜN']];
  function mount({get,text,L,item,opportunity:x,current,api}){
    let disposed=false;const alive=()=>!disposed&&current(),fmt=v=>Number.isFinite(v)?v.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'VERİ YOK';
    const color=d=>L.value('@color/'+(d==='UP'?'green':d==='DOWN'?'red':'text_secondary'));
    function row(index,r={direction:'INSUFFICIENT',slopePct:null,rSquared:null}){
      const prefix=['3m','5m','1h','1d'][index],d=r.direction;
      const values={Label:frames[index][1],Arrow:({UP:'↗',DOWN:'↘',SIDEWAYS:'→',INSUFFICIENT:'•'})[d],Trend:({UP:'YÜKSELİŞ',DOWN:'DÜŞÜŞ',SIDEWAYS:'YATAY',INSUFFICIENT:'YETERSİZ VERİ'})[d],Delta:Number.isFinite(r.slopePct)?(r.slopePct>0?'+':'')+fmt(r.slopePct)+'%':'—',R2:Number.isFinite(r.rSquared)?fmt(r.rSquared):'—',Comment:d==='INSUFFICIENT'?'VERİ YOK':d==='SIDEWAYS'?'NÖTR':r.rSquared>=.70?'GÜÇLÜ':r.rSquared>=.35?'ORTA':'ZAYIF'};
      for(const [suffix,value] of Object.entries(values)){const id='trend'+prefix+suffix;text(id,value);if(get(id))get(id).style.color=suffix==='R2'?L.value('@color/text_primary'):color(d);}
      const bg=d==='UP'?'up':d==='DOWN'?'down':'neutral';if(get('trendRow'+prefix))L.background(get('trendRow'+prefix),'@drawable/bg_trend_row_'+bg);if(get('trend'+prefix+'Comment'))L.background(get('trend'+prefix+'Comment'),'@drawable/bg_trend_chip_'+bg);
    }
    const container=get('indicatorContainer');container?.replaceChildren();
    // XML exposes three native tabs, but no click handlers were registered.
    // Keep indicators as the default panel and never fabricate chart patterns.
    const tabIds=['techTabIndicators','techTabPattern','techTabLevels'];
    const detailPanel=document.createElement('section');
    detailPanel.id='apk-tech-tab-detail';
    detailPanel.setAttribute('aria-live','polite');
    detailPanel.style.cssText='margin-top:10px;padding:14px;background:#092a3e;border-radius:8px;color:#e9f3f7;line-height:1.6';
    container?.insertAdjacentElement('afterend',detailPanel);
    function selectTab(tab){
      if(!alive())return;
      for(const id of tabIds){
        const node=get(id),active=id===tab;
        if(!node)continue;
        node.dataset.techActive=String(active);
        node.setAttribute('aria-pressed',String(active));
        node.setAttribute('aria-selected',String(active));
        node.style.background=active?'#146a87':'';
        node.style.outline=active?'2px solid #64d4ed':'';
      }
      if(container)container.hidden=tab!=='techTabIndicators';
      detailPanel.hidden=tab==='techTabIndicators';
      detailPanel.replaceChildren();
      if(tab==='techTabPattern'){
        const heading=document.createElement('strong');heading.textContent='Formasyon analizi';
        const note=document.createElement('p');note.textContent='Doğrulanmış mum formasyonu sonucu mevcut değil. OHLCV verisinden doğrulanmayan formasyon veya AL/SAT sinyali üretilmez.';
        detailPanel.append(heading,note);
      }else if(tab==='techTabLevels'){
        const heading=document.createElement('strong');heading.textContent='Destek / Direnç';
        detailPanel.append(heading);
        for(const [label,value] of [['Destek',x?.technical?.support],['Direnç',x?.technical?.resistance]]){
          const line=document.createElement('p');
          line.textContent=label+': '+fmt(value);
          detailPanel.append(line);
        }
        const note=document.createElement('small');note.textContent='Seviyeler mevcut teknik analiz kaydından gösterilir; canlı fiyat veya işlem onayı değildir.';
        detailPanel.append(note);
      }
    }
    for(const id of tabIds){const node=get(id);if(node){node.addEventListener('click',()=>selectTab(id));node.setAttribute('type','button');}}
    selectTab('techTabIndicators');
    if(!x){text('techSubtitle','Seçili hisse yok');text('techSignal','VERİ YOK');text('techScoreLine','Teknik analiz için bir hisse seçin.');text('multiTfStatus','Çoklu zaman dilimi analizi için bir hisse seçin.');text('techAdviceLabel','VERİ YOK');text('techAdviceDetail','Teknik sinyal özeti üretilemedi.');frames.forEach((_,i)=>row(i));return ()=>{disposed=true;};}
    const t=x.technical||{},price=x.price;
    text('techSubtitle',(x.companyName||x.symbol)+'  ('+x.symbol.toUpperCase()+')');
    text('techSignal','TEKNİK İZLEME • AL/SAT ONAYI YOK');text('techScoreLine','Önceki tarama sonucu — Gecikmeli teknik gözlem • İşlem onayı yok • '+(x.technicalLabel||''));
    const statePrice=v=>!Number.isFinite(v)?'YOK':price>v?'ÜSTÜ':price<v?'ALTI':'EŞİT';
    const pair=(a,b)=>!Number.isFinite(a)||!Number.isFinite(b)?'YOK':a>b?'AL':a<b?'SAT':'NÖTR';
    const rows=[['RSI (14)',t.rsi14,'Göreli güç',!Number.isFinite(t.rsi14)?'YOK':t.rsi14<30?'AL':t.rsi14>70?'SAT':'NÖTR'],['MACD',t.macd,'Signal '+fmt(t.macdSignal),pair(t.macd,t.macdSignal)],['EMA 20',t.ema20,'Kısa trend',statePrice(t.ema20)],['EMA 50',t.ema50,'Orta trend',statePrice(t.ema50)],['EMA 200',t.ema200,'Uzun trend',statePrice(t.ema200)],['Bollinger',null,fmt(t.bbLower)+' / '+fmt(t.bbUpper),'BANT'],['ATR (14)',t.atr14,'Volatilite','BİLGİ'],['Hacim',t.volumeRatio,'Oran',Number.isFinite(t.volumeRatio)?fmt(t.volumeRatio)+'x':'VERİ YOK'],['VWMA20',t.vwma20??t.vwap,'20 dönem hacim ağırlıklı fiyat',statePrice(t.vwma20??t.vwap)],['Session VWAP',t.sessionVwap,'Gerçek intraday seans VWAP',statePrice(t.sessionVwap)],['Destek',t.support,'Fiyat seviyesi',statePrice(t.support)],['Direnç',t.resistance,'Fiyat seviyesi',statePrice(t.resistance)]];
    for(const [indicatorName,value,indicatorHint,indicatorState] of rows)container?.append(item('indicator',{indicatorName,indicatorValue:fmt(value),indicatorHint,indicatorState}));
    text('multiTfStatus','3 DK, 5 DK, 1 SA ve 1 GÜN kapanmış OHLCV verileri analiz ediliyor...');text('trendAlignment','Ana uyum: HESAPLANIYOR');text('techAdviceLabel','HESAPLANIYOR');text('techAdviceScore','');text('techAdviceDetail','Zaman dilimleri yüklendikten sonra teknik sinyal özeti oluşturulacak.');text('techAdviceConfidence','Kanıt kalitesi hesaplanıyor...');text('techAdviceEvidence','İstatistiksel kanıtlar hazırlanıyor...');text('techAdviceRisk','Risk bayrakları hazırlanıyor...');text('techAdviceInvalidation','Geçersizleşme seviyesi hazırlanıyor...');frames.forEach((_,i)=>row(i));
    function parts(id,values){const n=get(id);if(!n)return;text(id,'');const p=n.querySelector('.apk-text')||n;for(const [value,c] of values){const span=document.createElement('span');span.textContent=value;if(c)span.style.color=c;p.append(span);}}
    function paint(result){
      if(!alive())return;result.frames.forEach((r,i)=>row(i,r.result));const s=result.summary;
      const alignmentColor=L.value('@color/'+(['ÇOK GÜÇLÜ','GÜÇLÜ'].includes(s.alignmentLabel)?'green':['KARIŞIK','ORTA'].includes(s.alignmentLabel)?'yellow':'red'));
      parts('trendAlignment',[['Ana uyum: '],[s.alignmentLabel,alignmentColor]]);
      text('techAdviceLabel',({STRONG_BUY:'GÜÇLÜ YÜKSELİŞ GÖZLEMİ',BUY:'YÜKSELİŞ GÖZLEMİ',NEUTRAL:'NÖTR GÖZLEM',SELL:'DÜŞÜŞ GÖZLEMİ',STRONG_SELL:'GÜÇLÜ DÜŞÜŞ GÖZLEMİ'})[s.advice]||'VERİ YOK');if(get('techAdviceLabel'))get('techAdviceLabel').style.color=L.value('@color/'+(s.advice.includes('BUY')?'green':s.advice.includes('SELL')?'red':'yellow'));
      text('techAdviceScore','Teknik sinyal puanı: '+s.score+'/100');parts('techAdviceConfidence',[['Kanıt güveni: '+s.confidence+'/100',L.value('@color/blue')],[' • Ana uyum: '],[s.alignmentLabel,alignmentColor]]);
      text('techAdviceEvidence',s.evidenceSummary);text('techAdviceRisk',s.riskSummary);text('techAdviceInvalidation',s.invalidationSummary);text('techAdviceDetail',s.explanation);
      const dirs=result.frames.map(f=>f.result.direction),up=dirs.slice(0,2).filter(d=>d==='UP').length,down=dirs.slice(0,2).filter(d=>d==='DOWN').length;
      const short=up>down?'yükseliş eğilimi baskın':down>up?'düşüş eğilimi baskın':'karışık / yatay görünüm var';
      const phrase=d=>({UP:'yükseliş eğilimi güçlü',DOWN:'düşüş eğilimi belirgin',SIDEWAYS:'yatay / kararsız'})[d]||'yetersiz veri';
      parts('multiTfStatus',[['Kapanmış OHLCV verilerinden bağımsız zaman dilimi regresyonları hesaplandı. '],['Kısa vadede '+short,color(up>down?'UP':down>up?'DOWN':'SIDEWAYS')],[', '],['orta vadede '+phrase(dirs[2]),color(dirs[2])],[' ve '],['uzun vadede '+phrase(dirs[3]),color(dirs[3])],[' görünümü izleniyor. Ana uyum '],[s.alignmentLabel,alignmentColor],[' seviyesindedir.']]);
    }
    function confirmedCandles(source){
      const candles=Array.isArray(source?.candles)?source.candles:[];
      return candles.filter((bar,index)=>{
        const time=Number(bar?.timestamp??bar?.time);
        if(!Number.isFinite(time)||time<=0||time>Date.now()+60000)return false;
        // No unknown-close candle can become a confirmed technical signal.
        return bar.closed===true||(bar.closed==null&&(index<candles.length-1||source.lastBarClosed===true));
      });
    }
    async function run(){
      try{
        const data=new Array(4);let index=0;
        async function worker(){while(index<frames.length){const i=index++,[interval,label]=frames[i];let bars=[];try{
          let source=OFFLINE_DB.get(OFFLINE_KEY('BIST',x.symbol,interval));if(!source||offlineSourceFamily(source)!=='USER_FILE')source=await BistYahooAuto.fetch(x.symbol,interval);
          if(!alive())return;bars=confirmedCandles(source);
        }catch{bars=[];}data[i]={label,candles:bars};}}
        await Promise.all([worker(),worker()]);if(!alive())return;
        const result=await api('/api/technical-view',{frames:data,price,technical:t});paint(result);
      }catch(e){if(!alive())return;text('multiTfStatus','Çoklu zaman dilimi analizi alınamadı: '+e.message);frames.forEach((_,i)=>row(i));text('trendAlignment','Ana uyum: HESAPLANAMADI');text('techAdviceLabel','VERİ YOK');text('techAdviceScore','');text('techAdviceDetail','Teknik sinyal özeti için gerekli çoklu zaman dilimi verisi alınamadı.');text('techAdviceConfidence','Kanıt güveni hesaplanamadı.');text('techAdviceEvidence','Yeterli istatistiksel kanıt yok.');text('techAdviceRisk','Risk analizi için veri yetersiz.');text('techAdviceInvalidation','Geçersizleşme seviyesi hesaplanamadı.');}
    }
    run();return ()=>{disposed=true;};
  }
  window.AndroidTechnical={mount};
})();
