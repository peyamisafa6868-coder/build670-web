/* SignalHistoryActivity controls; all statistics/filter math uses the Android store. */
(() => {
  'use strict';
  const key='bist_build670_signal_history',horizons={h15m:'15m',h30m:'30m',h1h:'1h',h4h:'4h',h1d:'1d'};
  const empty=()=>({version:1,records:[],viopRecords:[]});
  const validInterval=v=>typeof v==='string'&&(v==='1d'||/^[1-9][0-9]{0,2}m$/.test(v)&&Number(v.slice(0,-1))<=239);
  function validate(value){
    if(!value||value.version!==1||Object.keys(value).some(k=>!['version','records','viopRecords'].includes(k)))throw Error('Sinyal geçmişi yedek biçimi geçersiz.');
    for(const [name,max] of [['records',3000],['viopRecords',1500]])if(!Array.isArray(value[name])||value[name].length>max||value[name].some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Sinyal geçmişi kayıt sınırı veya biçimi geçersiz.');
    for(const row of [...value.records,...value.viopRecords]){
      for(const name of ['id','symbol','direction'])if(name in row&&(typeof row[name]!=='string'||row[name].length>200))throw Error('Geçmiş kimlik alanı geçersiz.');
      for(const name of ['signalGeneratedAt','generatedAt'])if(name in row&&(!Number.isSafeInteger(row[name])||row[name]<0))throw Error('Geçmiş zaman alanı geçersiz.');
      for(const name of ['signalPrice','finalSignalScore','technicalScore','riskScore'])if(name in row&&(!Number.isFinite(row[name])||row[name]<0))throw Error('Geçmiş sayısal alanı geçersiz: '+name);
      if('interval' in row&&!validInterval(row.interval))throw Error('Geçmiş tarama periyodu geçersiz.');
      if('strategyIds' in row&&(!Array.isArray(row.strategyIds)||row.strategyIds.some(s=>typeof s!=='string'||s.length>100)))throw Error('Geçmiş strateji alanı geçersiz.');
      if('outcomes' in row&&(!row.outcomes||typeof row.outcomes!=='object'||Array.isArray(row.outcomes)||Object.values(row.outcomes).some(v=>!v||typeof v!=='object'||Array.isArray(v))))throw Error('Geçmiş outcome alanı geçersiz.');
    }
    function finite(x,depth=0){if(depth>30)throw Error('Geçmiş içeriği aşırı iç içe.');if(typeof x==='number'&&!Number.isFinite(x))throw Error('Geçmiş sonlu olmayan sayı içeriyor.');if(x&&typeof x==='object')Object.values(x).forEach(v=>finite(v,depth+1));}
    finite(value);return value;
  }
  function read(){const raw=localStorage.getItem(key);if(raw===null)return empty();try{return validate(JSON.parse(raw));}catch{throw Error('HISTORY_LOAD_ERROR • Sinyal geçmişi okunamadı. Özgün kayıt değiştirilmedi.');}}
  let queue=Promise.resolve();const recorded=new Set();
  function saveJournal(value){
    // localStorage.setItem is atomic: a failed write must leave the user's
    // original signal journal intact. Do not auto-delete prior trade records.
    const serialized=JSON.stringify(validate(value));
    try{localStorage.setItem(key,serialized);}
    catch(e){
      if(e?.name==='QuotaExceededError'||e?.code===22||e?.code===1014)
        throw Error('Tarayıcı sinyal geçmişi alanı dolu. Önce Ayarlar bölümünden verilerinizi yedekleyin. Mevcut geçmiş silinmedi; yeni kayıt eklenemedi.');
      throw e;
    }
  }
  function recordJob(job){
    // WATCH-only delayed Yahoo observations are scan results, not verified
    // signals. Keep them in the bounded scan summary instead of flooding
    // a localStorage journal after every five-minute scan.
    if(!job||job.signalAttestationVerified!==true||recorded.has(job.id))return Promise.resolve({skipped:'UNVERIFIED_SCAN'});
    const run=async()=>{for(let attempt=0;attempt<3;attempt++){
      const before=localStorage.getItem(key),journal=read();
      const result=await BistTerminal.api('/api/history/record',{records:journal.records,viopRecords:journal.viopRecords,jobId:job.id});
      if(localStorage.getItem(key)!==before)continue;
      if(result.added){saveJournal({...journal,records:result.records});dispatchEvent(new Event('bist-signal-history-changed'));}
      recorded.add(job.id);return;
    }throw Error('Geçmiş başka sekmede değişti; kayıt yeniden denenmeli.');};
    const task=queue.then(run);queue=task.catch(()=>{});return task;
  }
  function update(api=BistTerminal.api){
    const run=async()=>{
      const before=localStorage.getItem(key),journal=read();if(!journal.records.length)return;
      const pref=BistNativePreferences.recover(JSON.parse(localStorage.getItem('bist_build670_settings')||'{}')).settings;
      const result=await api('/api/history/update',{records:journal.records,viopRecords:journal.viopRecords,costs:{quantity:pref.quantity,commissionPerSide:pref.commission,slippageBpsPerSide:pref.slippage}});
      if(localStorage.getItem(key)!==before)throw Error('Geçmiş başka sekmede değişti; eski forward sonucu kaydedilmedi.');
      if(JSON.stringify(result.records)!==JSON.stringify(journal.records)){saveJournal({...journal,records:result.records});dispatchEvent(new Event('bist-signal-history-changed'));}
      return result;
    };const task=queue.then(run);queue=task.catch(()=>{});return task;
  }
  function drawCurve(host,values){
    if(!host)return;
    let canvas=host.tagName==='CANVAS'?host:host.querySelector('canvas');
    if(!canvas){canvas=document.createElement('canvas');canvas.style.cssText='display:block;width:100%;height:100%;min-height:160px';host.replaceChildren(canvas);}
    const w=host.clientWidth||320,h=host.clientHeight||180,ratio=devicePixelRatio||1;canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);
    const c=canvas.getContext('2d');c.scale(ratio,ratio);c.clearRect(0,0,w,h);const pad=18;
    c.strokeStyle=AndroidLayout.value('@color/text_secondary');c.lineWidth=1;c.beginPath();c.moveTo(pad,h/2);c.lineTo(w-pad,h/2);c.stroke();
    const v=values.filter(Number.isFinite);if(v.length<2)return;
    const min=Math.min(...v),max=Math.max(...v),span=max-min>1e-9?max-min:1;
    c.strokeStyle=AndroidLayout.value('@color/blue');c.lineWidth=4;c.beginPath();v.forEach((n,i)=>{const x=pad+i/(v.length-1)*(w-2*pad),y=pad+(max-n)/span*(h-2*pad);if(i)c.lineTo(x,y);else c.moveTo(x,y);});c.stroke();
  }
  function mount({get,text,show,bind,item,api,current}){
    let direction=null,minScore=null,horizon='15m',market='BIST',tab='history',ticket=0,curve=[];
    const num=n=>Number.isFinite(n)?n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):null;
    const pct=n=>num(n)===null?'VERİ YETERSİZ':(n>=0?'+':'')+num(n)+'%';
    const factor=n=>n==='POSITIVE_INFINITY'?'∞ (kayıp gözlenmedi)':num(n)??'VERİ YETERSİZ';
    const label=h=>({'15m':'15 dk','30m':'30 dk','1h':'1 sa','4h':'4 sa','1d':'1 gün'})[h];
    const list=get('historyList');
    const extra={},advancedBody=document.createElement('div');let advancedDialog=null;
    function select(name,label,options){
      const host=advancedBody;
      const wrap=document.createElement('label');wrap.className='apk-detail-note';wrap.textContent=label;
      const field=document.createElement('select');field.id='apk-'+name;field.style.cssText='display:block;width:100%;min-height:44px;background:#08293d;color:#fff;border:1px solid #15506e';
      for(const [value,text] of options){const option=document.createElement('option');option.value=value;option.textContent=text;field.append(option);}
      wrap.append(field);host.append(wrap);extra[name]=field;field.addEventListener('change',()=>load());
    }
    select('historyStrategy','Strateji',[['','Tüm stratejiler'],['TREND','Trend'],['MOMENTUM','Momentum'],['BREAKOUT','Breakout'],['MEAN_REVERSION','Mean Reversion'],['MTF_REGIME','MTF + Rejim'],['COMBINED','Mevcut Birleşik']]);
    let savedIntervals=[];try{savedIntervals=read().records.map(r=>r.interval).filter(validInterval);}catch{}
    const intervals=[...new Set(['1m','3m','5m','15m','30m','60m','1d',...savedIntervals])];
    select('historyInterval','Tarama periyodu',[['','Tüm tarama periyotları'],['UNKNOWN','Periyodu kayıtlı değil'],...intervals.map(v=>[v,v==='1d'?'1 GÜN':v.slice(0,-1)+' DK'])]);
    const filterMenu=document.createElement('button');filterMenu.type='button';filterMenu.id='apk-historyExtraFilters';filterMenu.textContent='⋮';filterMenu.title='Ek filtreler';filterMenu.setAttribute('aria-label','Ek filtreler: strateji ve tarama periyodu');filterMenu.setAttribute('aria-haspopup','dialog');filterMenu.setAttribute('aria-expanded','false');filterMenu.style.cssText='position:absolute;right:0;bottom:0;width:44px;height:48px;padding:0;border:0;border-radius:4px;background:transparent;box-shadow:none;color:#fff;font-size:22px;line-height:1;z-index:1';get('historyFilters')?.append(filterMenu);
    filterMenu.addEventListener('click',()=>{
      if(advancedDialog)return;
      const dialog=document.createElement('dialog'),title=document.createElement('h2'),apply=document.createElement('button');dialog.className='terminal-dialog';dialog.style.padding='20px';title.textContent='Ek filtreler';apply.type='button';apply.textContent='UYGULA';apply.className='apk-detail-button';dialog.append(title,advancedBody,apply);document.body.append(dialog);advancedDialog=dialog;filterMenu.setAttribute('aria-expanded','true');
      apply.addEventListener('click',()=>{dialog.close();load();});dialog.addEventListener('close',()=>{if(dialog.contains(advancedBody))advancedBody.remove();dialog.remove();if(advancedDialog===dialog){advancedDialog=null;filterMenu.setAttribute('aria-expanded','false');}});dialog.showModal();
    });
    const lines=items=>{list?.replaceChildren();for(const value of items)list?.append(item('history',{historyRowText:value}));};
    const mark=()=>{
      for(const [id,on] of Object.entries({tabHistory:tab==='history',tabForward:tab==='forward',tabStats:tab==='stats',tabStrategies:tab==='strategies',historyAll:direction===null&&minScore===null,historyLong:direction==='LONG',historyShort:direction==='SHORT',history85:minScore===85,history75:minScore===75,strategyBist:market==='BIST',strategyViop:market==='VIOP'})){const b=get(id);if(b)b.setAttribute('aria-pressed',String(on));}
      for(const [id,h] of Object.entries(horizons))get(id)?.setAttribute('aria-pressed',String(h===horizon));
    };
    async function load(statOnly=tab==='stats'){
      const call=++ticket;mark();
      show('historyFilters',tab==='history');show('horizonBar',tab!=='history');show('strategyMarketBar',tab==='strategies');show('forwardPanel',tab==='forward'||tab==='stats');show('historyList',tab==='history'||tab==='strategies');
      text('historyStatus','Geçmiş okunuyor…');
      try{
        const journal=read(),f={direction,minScore,symbol:get('historySymbol')?.value.trim()||'',fromDate:get('historyFrom')?.value.trim()||'',toDate:get('historyTo')?.value.trim()||'',strategy:extra.historyStrategy?.value||'',interval:extra.historyInterval?.value||''};
        const effectiveHorizon=tab==='strategies'&&market==='VIOP'?'1h':horizon;
        const view=await api('/api/history/view',{records:journal.records,viopRecords:journal.viopRecords,filter:tab==='history'?f:{},horizon:effectiveHorizon});
        if(!current()||call!==ticket)return;
        for(const id of ['historyFrom','historyTo'])get(id)?.removeAttribute('aria-invalid');
        if(tab==='history'){
          const advanced=[extra.historyStrategy?.value?'Strateji: '+extra.historyStrategy.selectedOptions[0].textContent:'',extra.historyInterval?.value?'Tarama: '+extra.historyInterval.selectedOptions[0].textContent:''].filter(Boolean).join(' • ');
          filterMenu.title='Ek filtreler'+(advanced?' • '+advanced:'');filterMenu.setAttribute('aria-label','Ek filtreler: '+(advanced||'strateji ve tarama periyodu'));
          const o=view.overview,info='Filtre: '+(direction||'TÜM YÖNLER')+' • '+(minScore?minScore+'+':'TÜM PUANLAR')+' • Gösterilen '+view.lines.length+'/toplam '+o.totalRecords+' (ekran üst sınırı 200, saklama üst sınırı 3000)'+(advanced?'\n'+advanced:'');
          const states={NO_HISTORY:'NO_HISTORY • Geçerli sinyal geçmişi yok.',PARTIAL_HISTORY:'PARTIAL_HISTORY • Kısmi taramadan '+o.totalRecords+' geçerli sinyal kaydı mevcut.',COMPLETE_HISTORY:'COMPLETE_HISTORY • '+o.totalRecords+' geçerli sinyal kaydı mevcut.',HISTORY_LOAD_ERROR:'HISTORY_LOAD_ERROR • Sinyal geçmişi okunamadı.'};
          text('historyStatus',states[o.state]+'\n'+info);lines(view.lines.length?view.lines:[o.totalRecords?'Seçili filtreye uyan kayıt yok.':'Kayıt yok.']);
        }else if(tab==='forward'||tab==='stats'){
          const s=view.forward;text('historyStatus',s.totalVerified<2?'FORWARD • VERİ YETERSİZ • '+horizon:'FORWARD • DOĞRULANMIŞ TARİHSEL SONUÇLAR • '+horizon);
          text('forwardSummary','Periyot: '+label(horizon)+'\nToplam doğrulanmış sinyal: '+s.totalVerified+'\nPozitif: '+s.positive+' • Negatif: '+s.negative+'\nBaşarı oranı: '+pct(s.successRatePct)+'\nOrtalama getiri: '+pct(s.averageReturnPct)+'\nMedyan getiri: '+pct(s.medianReturnPct)+'\nOrt. kazanç: '+pct(s.averageGainPct)+'\nOrt. kayıp: '+pct(s.averageLossPct)+'\nProfit Factor: '+factor(s.profitFactor)+'\n\n'+(statOnly?'İstatistikler yalnız VERIFIED_HISTORICAL outcome kayıtlarından hesaplanır.':'Getiri eğrisi aşağıda gerçek doğrulanmış outcome serisinden çizilir.'));
          curve=s.curve;drawCurve(get('forwardCurve'),curve);
        }else{
          text('historyStatus',(market==='VIOP'?'VİOP':'BIST')+' STRATEJİ KARŞILAŞTIRMA • '+label(effectiveHorizon)+' • VERIFIED_HISTORICAL • V5.1.48');
          lines((market==='VIOP'?view.viopStrategies:view.strategies).map(s=>s.strategyLabel+' • '+s.confidenceLabel+'\nDoğrulanmış örnek: '+s.totalVerified+' • Pozitif '+s.positive+' • Negatif '+s.negative+'\nBaşarı: '+pct(s.successRatePct)+' • Ort. getiri: '+pct(s.averageReturnPct)+' • PF: '+factor(s.profitFactor)+'\nMax DD: '+pct(Number.isFinite(s.maxDrawdownPct)?-s.maxDrawdownPct:null)+(market==='BIST'?' • T1 '+s.target1Count+' • T2 '+s.target2Count+' • Stop '+s.stopCount:'')+'\n'+(market==='BIST'?'Net P&L: '+(num(s.netPnl)??'MALİYET MODELİ YOK / ÖRNEK YOK')+' ('+s.netPnlSampleCount+' kayıt)\n':'')+(s.sampleSufficient?'Karşılaştırılabilir örnek eşiği sağlandı. Canlı ağırlık yalnız yön + rejim bağlamında, tavan ve ±5 puan adım limitiyle güncellenir.':'DYNAMIC ENSEMBLE DEVRE DIŞI: minimum 20 doğrulanmış örnek gerekli.')));
        }
      }catch(e){if(!current()||call!==ticket)return;text('historyStatus','FİLTRE / GEÇMİŞ HATASI • '+e.message);if(/tarih/i.test(e.message))for(const id of ['historyFrom','historyTo'])get(id)?.setAttribute('aria-invalid','true');else{lines(['Geçmiş okunamadı; kayıt yokmuş gibi gösterilmedi.']);text('forwardSummary','Geçmiş okunamadı.');curve=[];drawCurve(get('forwardCurve'),curve);}}
    }
    for(const [id,value] of [['tabHistory','history'],['tabForward','forward'],['tabStats','stats'],['tabStrategies','strategies']])bind(id,()=>{tab=value;return load();});
    bind('strategyBist',()=>{market='BIST';return load();});bind('strategyViop',()=>{market='VIOP';return load();});
    bind('historyAll',()=>{direction=null;minScore=null;return load();});
    for(const [id,d] of [['historyLong','LONG'],['historyShort','SHORT']])bind(id,()=>{direction=d;minScore=null;return load();});
    bind('history85',()=>{minScore=85;return load();});bind('history75',()=>{minScore=75;return load();});bind('historyApply',()=>load());
    for(const [id,value] of Object.entries(horizons))bind(id,()=>{horizon=value;return load(false);});
    for(const id of ['historySymbol','historyFrom','historyTo'])get(id)?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load();}});
    const changed=()=>{if(current())load();};addEventListener('bist-signal-history-changed',changed);
    const host=get('forwardCurve'),observer=host?new ResizeObserver(()=>{if(current()&&(tab==='forward'||tab==='stats'))drawCurve(host,curve);}):null;observer?.observe(host);
    load().then(()=>{if(current()&&!new URLSearchParams(location.search).has('reference'))update(api).then(r=>{const failed=Object.keys(r?.updateErrors||{}).length;if(current()&&failed)text('historyStatus',get('historyStatus').textContent+'\n'+failed+' sembolün forward verisi alınamadı; mevcut kayıtlar korundu.');}).catch(e=>{if(current())text('historyStatus','Forward güncellenemedi • '+e.message);});});return ()=>{ticket++;observer?.disconnect();advancedDialog?.close();advancedDialog?.remove();removeEventListener('bist-signal-history-changed',changed);};
  }
  window.AndroidHistory={key,validate,exportState:read,recordJob,update,mount};
})();
