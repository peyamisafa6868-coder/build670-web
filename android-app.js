/* BUILD670 screen/flow adapter. XML resources are rendered directly by AndroidLayout. */
(() => {
  'use strict';
  if(new URLSearchParams(location.search).has('legacy'))return;
  const L=window.AndroidLayout,reference=new URLSearchParams(location.search).has('reference');
  document.body.classList.add('apk-mode');
  const app=document.createElement('div');app.id='androidApp';app.setAttribute('aria-label','BIST VİOP BUILD670');document.body.append(app);
  let screen='main',params={},version=0,settings,universe,market,lastRows=[],lastJob=null,filter='ALL',page=1,chartData=null,autoTimer=null;
  let historyCleanup=null,technicalCleanup=null,marketError=null,marketCheckedAt=0;
  let resultUi={},pendingResultJobId=null;
  let homeTrendFilter='ALL',homeSignalFilter='ALL',homeSourceId=null,homeCache=[],homeStamp='',homeLoading=false,homeLoadError=null,homeTicket=0,homeObservers=[];
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  let preferenceRecovery=null;
  function loadPreferences(){
    let raw;try{raw=localStorage.getItem('bist_build670_settings');}catch{return BistNativePreferences.defaults();}
    if(raw==null){preferenceRecovery=null;return BistNativePreferences.defaults();}
    let parsed;try{parsed=JSON.parse(raw);}catch{preferenceRecovery={raw};return BistNativePreferences.defaults();}
    const result=BistNativePreferences.recover(parsed);preferenceRecovery=result.issues.length?{raw}:null;return result.settings;
  }
  settings=loadPreferences();
  const settingsItems=[
    ['Sistem Durumu','backend https authentication provider bist viop servis','system_status'],
    ['Veri Bağlantısı','api provider backend url bağlantı','data_connection'],
    ['API Anahtarları','api key token kimlik güvenli','api_keys'],
    ['Tarama','tarama analiz timeframe cadence otomatik scan forward','scan'],
    ['İşlem Simülasyonu','simülasyon miktar komisyon slippage kayma hesapla','simulation'],
    ['Bildirimler','bildirim izin alarm realtime','notifications'],
    ['Bildirim Geçmişi','bildirim geçmiş olay alarm','notification_history'],
    ['Görünüm','tema koyu görünüm','appearance'],
    ['Dil ve Bölge','dil türkçe bölge saat dilimi tarih sayı','locale'],
    ['Sistem Tanılama','diagnostics tanılama health readiness ohlcv','diagnostics'],
    ['Uygulama Hakkında','hakkında sürüm build application id lisans gizlilik','about'],
    ['Çalışma Modu','canlı veri yedek provider çalışma','work_mode']
  ];
  const $=id=>app.querySelector('[data-apk-id="'+id+'"]');
  const text=(id,t)=>L.setText($(id),t);
  const show=(id,on=true)=>{if($(id))$(id).hidden=!on;};
  const el=(tag,cls,t)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(t!==undefined)n.textContent=t;return n;};
  const num=(n,d=2)=>Number.isFinite(n)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d}).format(n):'—';
  const date=n=>n?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(n):'—';
  const safe=fn=>(...a)=>Promise.resolve().then(()=>fn(...a)).catch(e=>message(e.message||String(e)));
  const api=(path,body)=>BistTerminal.api(path,body);
  function save(){
    BistNativePreferences.validate(settings);
    if(preferenceRecovery)localStorage.setItem('bist_build670_settings_recovery_'+Date.now(),preferenceRecovery.raw);
    localStorage.setItem('bist_build670_settings',JSON.stringify(settings));preferenceRecovery=null;document.getElementById('apk-preferenceRecovery')?.remove();
  }
  function recoveryNotice(){
    document.getElementById('apk-preferenceRecovery')?.remove();if(!preferenceRecovery)return;
    const raw=preferenceRecovery.raw,box=el('div','apk-recovery-note');box.id='apk-preferenceRecovery';box.setAttribute('role','alert');
    box.append(el('p','','Bazı tercihler okunamadı. Geçerli liste kayıtlarınız korundu; geçersiz alanlarda varsayılanlar kullanılıyor. Özgün kayıt değiştirilmedi.'),action('ÖZGÜN KAYDI İNDİR',()=>offlineDownload('BIST-TERCIH-KURTARMA.txt','text/plain',raw)),action('KURTARILAN TERCİHLERİ KULLAN',save));document.body.append(box);
  }
  function bind(id,fn){const n=$(id);if(!n)return;n.classList.add('apk-action');n.tabIndex=0;n.setAttribute('role','button');n.onclick=safe(fn);if(n.tagName!=='BUTTON')n.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();safe(fn)();}};}
  function message(content){const box=el('div','apk-status-card',content);const d=document.createElement('dialog');d.className='terminal-dialog';d.style.padding='20px';d.append(box,action('TAMAM',()=>d.close()));d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();}
  function action(label,fn){const b=el('button','apk-detail-button',label);b.type='button';b.addEventListener('click',safe(fn));return b;}
  function note(parent,value){const n=el('div','apk-detail-note',value);parent.append(n);return n;}
  function row(parent,title,subtitle,fn){const n=el('div','apk-dynamic-row');n.append(el('strong','',title),el('span','',subtitle));if(fn){n.tabIndex=0;n.addEventListener('click',safe(fn));n.addEventListener('keydown',e=>{if(e.key==='Enter')safe(fn)();});}parent.append(n);return n;}
  let itemId=0;
  function nativeItem(name,fields,fn,actions={}){
    const n=L.render(L.resources.layouts['item_'+name],{prefix:'apk-item-'+(++itemId)+'-'});n.dataset.nativeItem=name;
    const find=id=>n.dataset.apkId===id?n:n.querySelector('[data-apk-id="'+id+'"]');for(const [id,value] of Object.entries(fields))L.setText(find(id),value);
    if(fn){n.tabIndex=0;n.classList.add('apk-action');n.onclick=safe(fn);n.onkeydown=e=>{if(e.target===n&&(e.key==='Enter'||e.key===' ')){e.preventDefault();safe(fn)();}};}
    for(const [id,handler] of Object.entries(actions)){const b=find(id);if(b){b.classList.add('apk-action');b.tabIndex=0;b.setAttribute('role','button');b.onclick=e=>{e.stopPropagation();safe(handler)();};b.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.stopPropagation();e.preventDefault();safe(handler)();}};}}
    return n;
  }
  const favoriteSymbols=()=>settings.favorites||[];
  const watchedSymbols=()=>settings.watchlist||[];
  function input(parent,label,value,type='text'){const wrap=el('label','apk-detail-note',label),field=el('input','apk-node apk-EditText');field.type=type;field.value=value??'';field.style.cssText='width:100%;min-height:44px;padding:10px;background:#08293d;border:1px solid #15506e;border-radius:7px;color:#fff';wrap.append(field);parent.append(wrap);return field;}
  function choices(parent,items,selected,callback){const bar=el('div','apk-chip-row');for(const [id,label] of items){const b=el('button','apk-chip'+(id===selected?' selected':''),label);b.type='button';b.addEventListener('click',safe(()=>callback(id)));bar.append(b);}parent.append(bar);return bar;}
  function toolbar(parent,title,back=true){if(back)parent.append(action('‹ Geri',()=>goBack()));note(parent,title).style.cssText='font-size:24px;font-weight:700;color:inherit;padding:10px 0';}
  let routeDepth=0;
  function goBack(){if(routeDepth>0)history.back();else render('main');}
  function routeParams(p){return Object.fromEntries(Object.entries({symbol:p.symbol,key:p.key,mode:p.mode,interval:p.interval||p.data?.interval,jobId:p.jobId,trendFilter:p.trendFilter,signalFilter:p.signalFilter}).filter(([,v])=>typeof v==='string'));}
  function recordRoute(name,p,replace=false){const publicParams=routeParams(p),query=new URLSearchParams(publicParams).toString();if(!replace)routeDepth++;history[replace?'replaceState':'pushState']({apkRoute:true,screen:name,params:publicParams,depth:routeDepth},'',location.pathname+location.search+'#'+name+(query?'?'+query:''));}
  function navigateTo(name,p={}){
    if(name===screen&&JSON.stringify(p)===JSON.stringify(params))return;
    render(name,p);
  }
  function footer(){
    for(const [id,target] of [['navHome','main'],['navBist','stocks'],['navViop','viop'],['navFav','favorites'],['navSettings','settings']])bind(id,()=>navigateTo(target));
    const selected={main:'navHome',stocks:'navBist',stock_detail:'navBist',viop:'navViop',viop_detail:'navViop',viop_contracts:'navViop',favorites:'navFav',settings:'navSettings',settings_search:'navSettings',settings_detail:'navSettings'}[screen];
    if($(selected))$(selected).style.color=L.value('@color/blue');
    if(screen==='main'&&$(selected))$(selected).style.fontWeight='700';
    if(['stocks','viop'].includes(screen)){
      for(const button of app.querySelectorAll('button'))BistNativeMarket.chip(button,false);
      if($('bottomNav'))$('bottomNav').style.background=L.value('@color/market_bg');
      for(const [id,glyph,label] of [['navHome','⌂','Ana Sayfa'],['navBist','▥','Hisseler'],['navViop','Ⅱ','VİOP'],['navFav','☆','Favoriler'],['navSettings','⚙','Ayarlar']])if($(id)){
        const n=$(id),span=n.querySelector('.apk-text');if(span){span.replaceChildren(el('span','apk-market-nav-glyph',glyph),document.createElement('br'),document.createTextNode(label));}n.style.fontSize='10px';n.style.fontWeight=id===selected?'700':'400';n.style.color=L.value('@color/'+(id===selected?'market_mint':'market_muted'));
      }
    }
  }
  function render(name,p={},updateHistory=true){
    // A manual route change cancels this job's automatic results handoff.
    if(name!=='bist_scan')pendingResultJobId=null;
    historyCleanup?.();historyCleanup=null;technicalCleanup?.();technicalCleanup=null;
    version++;screen=name;params=p;app.dataset.screen=name;app.replaceChildren();
    if(['cheap','universe','delayed','fullscreen'].includes(name))programmatic(name,p);
    else app.append(L.screen(name));
    footer();commonActions();Promise.resolve(bindScreen()).catch(e=>message(e.message));
    if(updateHistory)recordRoute(name,p);
    document.title='BIST / VİOP · '+name.replaceAll('_',' ');
  }
  function commonActions(){
    for(const id of ['btnHeaderSettings','stocksSettings','openSettings','analysisSettings','marketDetailSettings','btnConnectionSettings','viopEmptyAction','analysisEmptyAction','notificationSettings','btnConfigureProvider'])bind(id,()=>navigateTo('settings_detail',{mode:'data_connection'}));
    for(const id of ['btnBackDetail','analysisBack','detailBack','searchBack'])bind(id,goBack);
    for(const id of ['stocksFavorites','openFavorites'])bind(id,()=>navigateTo('favorites'));
    for(const id of ['stocksNotifications','openNotifications','notificationButton'])bind(id,()=>navigateTo('notifications'));
  }
  function bindScreen(){
    return {main:home,bist_scan:scanner,scan_results:resultsScreen,opportunity:resultsScreen,stocks,favorites,settings:settingsScreen,settings_search:settingsSearch,settings_detail:settingsDetail,stock_detail:stockDetail,technical_analysis:technical,news:newsScreen,notifications,signal_history:historyScreen,viop,viop_contracts:contracts,viop_analysis:viopAnalysis,viop_detail:viopDetail,market_instrument_detail:instrumentDetail,info_screen:info}[screen]?.();
  }
  async function home(){
    for(const [id,target] of [['actionBist','bist_scan'],['actionOpportunity','opportunity'],['actionSignal','signal_history'],['actionViop','viop'],['actionWatchlist','favorites'],['actionNotifications','notifications'],['actionCheapStock','cheap'],['btnMarketDetails','settings']])bind(id,()=>navigateTo(target));
    bind('btnSeeAllOpportunities',()=>navigateTo('opportunity',{jobId:BistTerminal.job?.id||'',trendFilter:homeTrendFilter,signalFilter:homeSignalFilter}));
    bind('btnHeaderSettings',()=>navigateTo('settings'));
    text('txtVersionBadge','V6.3.45');
    text('txtHeaderDateTime',new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date()).replace(/(\d{4})\s+(\d\d:\d\d)/,'$1 • $2'));
    text('txtMarketSummary',reference?'Veri alınmadı • veri zamanı yok • gecikme sonucu ilgili ekranda doğrulanır':'Kaynak: '+(settings.delayed?'Yahoo Finance • YEDEK / GECİKMELİ':'Production Backend')+'\nCanlı AL/SAT doğrulanmadı');
    show('todayHorizontal',false);
    for(const [id,key] of [['marketBist100Card','XU100'],['marketBist30Card','XU030'],['marketUsdCard','USDTRY'],['marketGoldCard','XAUUSD'],['marketViopCard','VIOP30']])bind(id,()=>key==='VIOP30'?navigateTo('viop'):navigateTo('market_instrument_detail',{key}));
    for(const [id,mode] of [['todayAllTab','ALL'],['todayLongTab','UP'],['todayShortTab','DOWN']])bind(id,()=>{homeTrendFilter=mode;homeSignalFilter='ALL';homeRows();});
    if(!reference){marketControls();if(!market||Date.now()-marketCheckedAt>=300000)await refreshMarket();}
    marketTiles();homeRows();safe(refreshHomeRows)();
  }
  async function refreshMarket(){
    try{market=await api('/api/instruments');marketError=null;marketCheckedAt=Date.now();}
    catch(e){marketError=e.message||String(e);}
    marketTiles();
  }
  function marketControls(){
    if(document.getElementById('apk-market-status'))return;
    const box=el('details','apk-detail-note');box.id='apk-market-status';box.append(el('summary','','Veri kaynakları ve hata ayrıntıları'));
    const details=el('div');details.id='apk-market-diagnostics';details.setAttribute('role','status');
    box.append(details,action('PİYASA VERİSİNİ YENİDEN DENE',refreshMarket));
    $('txtMarketSummary')?.parentElement?.parentElement?.after(box);
  }
  function marketTiles(){
    if(screen!=='main')return;
    if(reference&&!market)return;
    const ids={XU100:'marketBist100',XU030:'marketBist30',USDTRY:'marketUsd',XAUUSD:'marketGold'},diagnostics=[];
    for(const [key,prefix] of Object.entries(ids)){
      const x=market?.items?.find(i=>i.key===key),valid=x&&!x.error&&Number.isFinite(x.price)&&x.price>0;
      const reason=x?.error||marketError||'Kaynak geçerli fiyat döndürmedi';
      text(prefix+'Value',valid?num(x.price):'—');
      text(prefix+'Change',valid?(x.changePct>0?'▲ ':x.changePct<0?'▼ ':'')+num(Math.abs(x.changePct))+'%':'Veri alınamadı');
      text(prefix+'Spark',valid?'Günlük • '+date(x.asOf):x?.status?'HTTP '+x.status:'Kaynak hatası');
      if($(prefix+'Spark')){$(prefix+'Spark').style.height='auto';$(prefix+'Spark').style.whiteSpace='normal';}
      diagnostics.push(valid?key+': '+x.ticker+' • '+x.provider+' • günlük gözlem '+date(x.asOf)+' • gecikme süresi sağlayıcı tarafından doğrulanmadı':key+': '+reason);
    }
    text('marketViopValue','—');text('marketViopChange','Bağlantı yok');text('marketViopSpark','Kontrat doğrulanmadı');
    diagnostics.push('VİOP: Lisanslı kontrat ve fiyat kaynağı doğrulanmadı.');
    if(marketError)diagnostics.unshift('Yenileme başarısız: '+marketError+' • Varsa önceki gözlemler korunuyor.');
    const detail=document.getElementById('apk-market-diagnostics');if(detail){detail.replaceChildren(...diagnostics.map(x=>el('p','',x)));}
  }
  // The dashboard never starts a scan. It reads the SAME authenticated job used
  // by scan_results, orders the complete retrieved set, then limits display to 8.
  async function refreshHomeRows(){
    const job=BistTerminal.job;
    if(screen!=='main'||!job?.id||homeLoading)return;
    const stamp=job.id+':'+job.status+':'+job.processed;
    if(homeSourceId===job.id&&homeStamp===stamp)return;
    const request=version,ticket=++homeTicket;homeLoading=true;
    const current=()=>screen==='main'&&version===request&&homeTicket===ticket&&BistTerminal.job?.id===job.id;
    try{
      const all=[];let expected=0;
      for(let pg=1;pg<=20;pg++){
        const payload=await api('/api/scans/'+job.id+'/results?'+new URLSearchParams({filter:'ALL',page:pg,size:100}));
        if(!current())return;
        if(!Array.isArray(payload?.results)||!Number.isInteger(payload.total)||payload.total<0||payload.total>2000)
          throw Error('Tarama sonuç listesi geçersiz.');
        all.push(...payload.results);expected=payload.total;
        if(all.length>=expected)break;
        if(!payload.results.length)throw Error('Sunucu sayfalaması sonuç toplamıyla uyuşmuyor.');
      }
      if(all.length<expected)throw Error('Tüm sonuç sayfaları getirilemedi.');
      if(!current())return;
      homeCache=all;homeSourceId=job.id;homeStamp=stamp;homeLoadError=null;
    }catch(error){
      if(current())homeLoadError=String(error?.message||error);
    }finally{homeLoading=false;if(current())homeRows();}
  }
  async function showHomeFailures(kind){
    const job=BistTerminal.job;if(!job?.id)return message('Tarama başlatılmadı.');
    try{
      const records=[];
      for(let pg=1;pg<=7;pg++){
        const data=await api('/api/scans/'+job.id+'/failures?'+new URLSearchParams({page:pg,size:100}));
        if(BistTerminal.job?.id!==job.id)return;
        if(!Array.isArray(data.failures))throw Error('Hata ayrıntıları geçersiz.');
        records.push(...data.failures);
        if(records.length>=data.total)break;
      }
      const subset=records.filter(x=>kind==='INSUFFICIENT'
        ?x.classification==='INSUFFICIENT_DATA'||x.code==='INSUFFICIENT_HISTORY'
        :x.classification!=='INSUFFICIENT_DATA'&&x.code!=='INSUFFICIENT_HISTORY');
      message(subset.length+' kayıt (iş: '+job.id+')\n'+(subset.map(x=>x.symbol+' • '+(x.closedBarCount!=null?x.closedBarCount+'/220 kapanmış mum • ':'')+(x.error||x.code)).join('\n')||'Ayrıntı kaydı yok.').slice(0,10000));
    }catch(error){message('Tarama ayrıntıları alınamadı: '+error.message);}
  }
  function homeRows(){
    if(screen!=='main')return;
    const list=$('todayOpportunityRows'),viewport=$('todayHorizontal');if(!list)return;
    for(const observer of homeObservers)observer.disconnect();homeObservers=[];
    list.replaceChildren();list.style.width='100%';list.style.minWidth='0';
    const job=BistTerminal.job;
    const all=job?.id===homeSourceId?homeCache:[]; // never sort an incomplete result-page cache
    const delayed=job?.signalAttestationVerified!==true;
    const selected=AndroidResults.homeSelect(all,{trend:homeTrendFilter,signal:homeSignalFilter,attestationVerified:!delayed});
    const rows=[...selected].sort((a,b)=>(Number(b.dataTimestamp)||0)-(Number(a.dataTimestamp)||0)||a.symbol.localeCompare(b.symbol,'tr'));
    const host=viewport?.parentElement||list.parentElement;
    let dashboard=app.querySelector('[data-home-dashboard]');
    if(!dashboard){dashboard=el('section','apk-today-dashboard');dashboard.dataset.homeDashboard='true';host.insertBefore(dashboard,viewport||list);}
    dashboard.replaceChildren();
    const meta=el('div','apk-today-meta');
    const progress=AndroidResults.scanProgress(job);
    const lastTime=all.reduce((latest,x)=>Math.max(latest,Number(x.candles?.at(-1)?.timestamp||x.dataTimestamp)||0),0);
    meta.append(
      el('strong','','Tarama: '+(job?.id||'Henüz başlatılmadı')+' • '+AndroidResults.scanStatusLabel(job)),
      el('span','','Periyot: '+(job?.interval||settings.interval)+' • Sağlayıcı: '+(job?.provider||'Kaynak doğrulanmadı')),
      el('span','','Son kapanmış mum (TR): '+date(lastTime)+' • İş bitişi (TR): '+date(job?.completedAt)),
      ...(job?.benchmarkError?[el('span','','XU100 karşılaştırma verisi alınamadı: '+job.benchmarkError)]:[]),
      el('span','',progress.processed+'/'+progress.total+' işlendi • %'+num(progress.percentage,1)+(homeLoading?' • Sonuçlar yükleniyor':'')+(homeLoadError?' • Yükleme hatası: '+homeLoadError:''))
    );
    if(delayed)meta.append(el('strong','apk-today-delayed','Gecikmeli analiz • Onaylı AL/SAT yok'));
    dashboard.append(meta);
    const badges=el('div','apk-today-counters');
    for(const [label,value,callback] of [
      ['Analiz üretildi',job?.successful||0,()=>navigateTo('scan_results',{jobId:job?.id})],
      ['Yetersiz veri',job?.insufficient||0,()=>showHomeFailures('INSUFFICIENT')],
      ['Hata',job?.errors||0,()=>showHomeFailures('ERROR')],
      ['Bekliyor',progress.pending,()=>message('Henüz işlenmemiş '+progress.pending+' sembol var. Sunucu bekleyen sembol listesini bu API sürümünde paylaşmıyor.')]]){
      const button=el('button','apk-today-counter',label+'  '+value);
      button.type='button';button.addEventListener('click',safe(callback));badges.append(button);
    }
    dashboard.append(badges);
    const options=el('div','apk-today-extra-filters');
    const counts=(t,s)=>AndroidResults.homeSelect(all,{trend:t,signal:s,attestationVerified:!delayed}).length;
    for(const [id,value,label] of [['todayAllTab','ALL','Tümü'],['todayLongTab','UP','Yükseliş'],['todayShortTab','DOWN','Düşüş']]){
      const button=$(id);if(!button)continue;
      text(id,label+' ('+counts(value,'ALL')+')');
      const active=homeTrendFilter===value&&homeSignalFilter==='ALL';
      button.dataset.todayActive=String(active);button.setAttribute('aria-pressed',String(active));
      button.style.color=active?'#f3fdff':'#c2d7e5';
      button.style.outline=active?'2px solid #40e0eb':'1px solid #285873';
      button.style.background=active?'#116383':'#0b2b42';
    }
    const extra=(group,items,current,update)=>{
      const container=el('div','apk-today-filter-row');
      container.append(el('span','apk-today-filter-label',group));
      for(const [value,label] of items){
        const count=counts(group==='Trend'?value:'ALL',group==='Sinyal'?value:'ALL');
        const button=el('button','apk-today-filter'+(current===value?' is-active':''),label+' ('+count+')');
        button.type='button';button.dataset.homeFilter=group+'-'+value;button.setAttribute('aria-pressed',String(current===value));
        button.addEventListener('click',()=>{update(value);homeRows();});container.append(button);
      }
      options.append(container);
    };
    extra('Trend',[['FLAT','Yatay'],['MIXED','Çelişkili'],['UNKNOWN','Belirsiz']],homeTrendFilter,value=>{homeTrendFilter=value;});
    extra('Sinyal',[['ALL','Tümü'],['WATCH','İzleniyor'],['NONE','Sinyal yok'],['VERIFIED','Onaylı AL/SAT'],['INSUFFICIENT','Yetersiz veri']],homeSignalFilter,value=>{homeSignalFilter=value;});
    dashboard.append(options);
    const summary=el('div','apk-today-filter-summary',rows.length+' / '+all.length+' sonuç • Son kapanmış mum zamanına göre sıralandı • İlk 8 kayıt gösteriliyor');
    summary.dataset.homeResultCount=String(rows.length);dashboard.append(summary);
    show('todayEmpty',!rows.length);show('todayHorizontal',!!rows.length);
    if(!rows.length){
      text('todayEmpty',!job?'Henüz tarama yapılmadı. BIST taramayı başlatın.'
        :homeLoading?'Tarama sonuçları yükleniyor…'
        :homeLoadError?'Sonuçlar alınamadı: '+homeLoadError
        :all.length?'Bu trend/sinyal filtresine uygun kayıt yok. Gecikmeli WATCH kayıtları onaylı AL/SAT değildir.'
        :job.insufficient>0?'Analiz üretilemedi; eksik mum kayıtlarını Yetersiz veri sayacından inceleyin.'
        :'Henüz analiz sonucu yok. '+AndroidResults.scanStatusLabel(job)+'.');
    }
    if(viewport)viewport.style.width='100%';
    for(const x of rows.slice(0,8)){
      const category=AndroidResults.trendCategory(x),signal=AndroidResults.signalCategory(x,!delayed);
      const trend=x.trendDisplay?.trend;
      const evidence=category==='MIXED'?{red:228,green:183,blue:100,strengthLevel:0}:trend;
      const price=BistNativeMarket.price(x),change=BistNativeMarket.change(x),valid=Number.isFinite(price)&&price>0;
      const card=el('button','apk-today-card');card.type='button';
      card.dataset.homeSymbol=x.symbol;card.dataset.homeTrend=category;card.dataset.homeSignal=signal;
      const company=el('span','apk-today-company',x.companyName||x.symbol);
      const identity=el('div','apk-today-identity');identity.append(el('strong','',x.symbol),company);
      const priceBox=el('div','apk-today-price');
      priceBox.append(el('strong','',valid?num(price)+' TL':'Fiyat verisi yok'),el('span','',Number.isFinite(change)?'Günlük değişim: '+(change>0?'+':'')+num(change)+'%':'Günlük değişim: veri yok'));
      const spark=el('div','apk-today-spark');spark.dataset.homeSpark=x.symbol;
      spark.setAttribute('role','img');spark.setAttribute('aria-label',x.symbol+' kapanış mini grafiği');
      const candles=Array.isArray(x.candles)?x.candles.filter(b=>Number.isFinite(b?.close)&&b.close>0):[];
      if(candles.length<2)spark.textContent='Grafik verisi yok';
      const label=el('div','apk-today-trend',AndroidResults.trendNames[category]);
      label.dataset.trend=category;
      const signalBox=el('div','apk-today-signal',AndroidResults.signalNames[signal]);
      const reason=el('div','apk-today-reason',(x.discovery?.reason||x.signalValidityReason||'Doğrulanmış tarama gerekçesi bulunmuyor.').slice(0,180));
      const recent=el('small','',date(x.candles?.at(-1)?.timestamp||x.dataTimestamp)+' TR • '+(x.closedBarCount??'—')+' kapanmış mum');
      reason.append(recent);
      card.append(identity,priceBox,spark,label,signalBox,reason);
      card.addEventListener('click',safe(()=>navigateTo('stock_detail',{symbol:x.symbol,opportunity:x,interval:job?.interval||settings.interval})));
      list.append(card);
      if(candles.length>=2){
        const draw=()=>{if(!spark.isConnected||spark.clientWidth<1||spark.clientHeight<1)return;
          BistNativeMarket.sparkline(spark,candles,evidence);
          if(!spark.querySelector('canvas'))spark.textContent='Grafik verisi yok';};
        requestAnimationFrame(draw);
        if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(draw);observer.observe(spark);homeObservers.push(observer);}
      }
    }
  }
  function scanner(){
    bind('btnHowItWorks',()=>message('Ham OHLCV → teknik göstergeler → bileşen puanları → risk/güven → yayın kapıları. Gecikmeli veride AL/SAT üretilmez.'));
    bind('btnCheapStockScan',()=>navigateTo('cheap'));bind('quickCustom',()=>navigateTo('settings_detail',{mode:'scan'}));
    bind('quickFavorites',()=>startScan([...favoriteSymbols()]));bind('quickPopular',()=>navigateTo('universe'));
    bind('btnScanFilter',()=>filterDialog());bind('btnStartScan',async()=>{const j=BistTerminal.job;if(j&&['QUEUED','RUNNING','CANCELLING'].includes(j.status))await api('/api/scans/'+j.id+'/cancel',{});else await startScan();});bind('btnAllTools',()=>navigateTo('settings'));
    bind('btnStatusDetail',()=>navigateTo('scan_results'));
    bind('quickSectors',()=>navigateTo('stocks'));bind('quickCriteria',filterDialog);bind('quickHistory',()=>navigateTo('signal_history'));bind('quickSaved',()=>savedSearches());
    const tf=settings.interval==='1d'?'1 GÜN':settings.interval.replace('m',' DK');
    text('txtActiveScanTime','AKTİF TARAMA: '+tf);
    text('txtActiveTimeframeDetails','BIST hisseleri '+tf+' verileri üzerinden taranacak\nOHLCV: '+tf+'   •   Teknik analiz: '+tf+'\nTrend: '+tf+'   •   Momentum: '+tf+'\nHacim: '+tf+'   •   Kırılım: '+tf+'\nOtomatik tarama: '+(settings.auto?'ETKİN':'KAPALI')+' • '+tf);
    text('txtAutoScanStatus',(settings.auto?'ETKİN':'KAPALI')+' • '+tf+'\nYahoo YEDEK/GECİKMELİ • AL/SAT YOK\n'+(settings.auto?'Web sekmesi açıkken '+settings.cadence+' dk aralıkla çalışır.':'Otomatik tarama kapalı • Manuel BAŞLAT kullanılabilir.'));
    text('txtSource','Kaynak: '+(settings.delayed?'Yahoo Finance • YEDEK / GECİKMELİ':'Yetkili sağlayıcı bağlantısı gerekli'));
    bind('btnScanTime',()=>timeframeDialog(tf=>{if(!['1m','3m','5m','10m','15m','30m','60m','1d'].includes(tf))throw Error('Tarama periyodu için 1–239 dk veya günlük seçim kullanın.');settings.interval=tf;save();scanner();}));
    bind('txtActiveScanTime',()=>navigateTo('settings_detail',{mode:'scan'}));bind('txtScanTimeArrow',()=>navigateTo('settings_detail',{mode:'scan'}));
    const auto=$('autoScanSwitch')||app.querySelector('.apk-SwitchCompat');if(auto){auto.setAttribute('aria-checked',String(settings.auto));auto.onclick=safe(()=>{settings.auto=!settings.auto;save();schedule();scanner();});auto.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();auto.click();}};}
    if(!BistTerminal.job){text('txtStatus','READY');text('txtProgress','TARAMA BAŞLAMADI');text('txtScanHeroEyebrow','BIST hisseleri taranıyor');text('txtScanHeroSubtitle','Yahoo Finance '+tf+' yedek/gecikmeli teknik analiz hazır • doğrulanmış AL/SAT sinyali üretilmez.');text('btnStartScan','▶\nBAŞLAT');}
    text('navViop','⌕\nBIST Tarama');if($('navViop'))$('navViop').style.color='#159ff0';
    jobStatus();
  }
  async function startScan(symbols,resumeFrom,retryFailuresOnly=false){
    if(!settings.delayed){message('Yetkili sağlayıcı ve imzalı sinyal bağlantısı doğrulanmadı. Veri bağlantısı ayarlarını kontrol edin.');return;}
    if(BistTerminal.job&&['QUEUED','RUNNING','CANCELLING'].includes(BistTerminal.job.status)){navigateTo('scan_results');return;}
    const body={scope:'discovered',interval:settings.interval};if(symbols)body.symbols=symbols;
    if(resumeFrom){body.resumeFrom=resumeFrom;body.retryFailuresOnly=retryFailuresOnly;body.interval=BistTerminal.job?.interval||settings.interval;}
    const initiatedOnScanner=screen==='bist_scan',routeAtStart=version;
    const job=await api('/api/scans',body);
    pendingResultJobId=(initiatedOnScanner&&screen==='bist_scan'&&version===routeAtStart)?job.id:null;
    BistTerminal.adoptJob(job);lastJob=job;lastRows=[];jobStatus();
    // A slow POST response must not override a newer user navigation.
    if(version!==routeAtStart)return;
    if(!initiatedOnScanner)navigateTo('scan_results');
    else openCompletedScanResults(job);
  }
  function openCompletedScanResults(job){
    if(!job||job.id!==pendingResultJobId||screen!=='bist_scan')return;
    // Only a new scan started from this screen may navigate automatically.
    // Do not redirect on reload, cancelled/failed jobs or a user-chosen route.
    if(!['COMPLETE','COMPLETED_WITH_ERRORS'].includes(job.status))return;
    if(!Number.isInteger(job.total)||job.total<=0||job.processed!==job.total)return;
    pendingResultJobId=null;
    navigateTo('scan_results');
  }
  function jobStatus(){
    const job=BistTerminal.job;if(!job)return;
    const progress=AndroidResults.scanProgress(job),statusLabel=AndroidResults.scanStatusLabel(job);
    text('txtProgress',progress.processed+'/'+progress.total+' • %'+num(progress.percentage,1));
    text('txtStatus',statusLabel);text('txtScanHeroSubtitle','Başarılı: '+job.successful+' • Yetersiz: '+job.insufficient+' • Hata: '+job.errors);
    text('txtScanHeroEyebrow',job.status==='RUNNING'?'BIST hisseleri taranıyor':'Tarama durumu');
    text('scanState',statusLabel+' • '+progress.processed+'/'+progress.total);
    text('btnStartScan',['QUEUED','RUNNING','CANCELLING'].includes(job.status)?'■\nDURDUR':'▶\nBAŞLAT');show('progress',['QUEUED','RUNNING','CANCELLING'].includes(job.status));
    const storage=job.storage,stored=storage?storage.error?'Tarama kaydı yazılamadı: '+storage.error:storage.checkpointSaved?(storage.ephemeral?'Geçici kayıt':'Yeniden açılış için kaydedildi')+' • son '+storage.maxRetainedJobs+' tarama / '+storage.retentionHours+' saat':'Kontrol noktası henüz yazılmadı':'';
    text('scanCoverageSummary','Analiz üretildi '+job.successful+' • Veri yetersiz '+job.insufficient+' • Hata '+job.errors+' • Bekliyor '+progress.pending+'\n'+job.provider+((['QUEUED','RUNNING','CANCELLING'].includes(job.status)&&job.lastRetry)?'\nSağlayıcı yeniden denenecek: '+job.lastRetry.symbol+' • '+job.lastRetry.attempt+' deneme • '+num(job.lastRetry.waitSeconds,1)+' sn bekleme':'')+(stored?'\n'+stored:''));
    for(const bar of app.querySelectorAll('progress'))bar.value=job.total?job.processed/job.total*100:0;
  }
  function filterDialog(){
    const content=el('div');for(const [id,label] of Object.entries({ALL:'Tümü',A_CLASS:'A Sınıfı',BREAKOUT:'Kırılım',REVERSAL:'Dipten Dönüş',SQUEEZE:'Sıkışma',PULLBACK:'Geri Çekilme',VOLUME:'Hacim',TREND:'Trend',LONG:'LONG',SHORT:'SHORT',HIGH_POWER:'Yüksek güç'}))content.append(action(label,()=>{filter=id;document.querySelector('dialog[open]')?.close();navigateTo('scan_results');}));
    const d=document.createElement('dialog');d.className='terminal-dialog';d.style.padding='18px';d.append(content,action('KAPAT',()=>d.close()));d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
  }
  async function resultsScreen(){
    jobStatus();
    const delayed=BistTerminal.job?.signalAttestationVerified!==true;
    resultUi={view:screen,filter:'ALL',sort:'SCORE',mode:['LONG','SHORT','HIGH_POWER'].includes(filter)?filter:'ALL',delayed,verifiedOnly:false,
      homeTrend:params.jobId===BistTerminal.job?.id?params.trendFilter||'ALL':'ALL',homeSignal:params.jobId===BistTerminal.job?.id?params.signalFilter||'ALL':'ALL'};
    for(const [id,mode] of [['scanAll','ALL'],['scanLong','LONG'],['scanShort','SHORT'],['scan85','HIGH_POWER'],['scanScore','SCORE']])bind(id,()=>{resultUi.mode=mode;paintResults();});
    for(const [id,value] of [['btnFilterAll','ALL'],['btnFilterStrongBuy','STRONG_BUY'],['btnFilterStrongSell','STRONG_SELL'],['btnFilterHighVolume','HIGH_VOLUME'],['btnFilterWatch','WATCH'],['btnFilterInsufficient','INSUFFICIENT'],['btnFilterRejected','REJECTED'],['btnFilterLowRisk','LOW_RISK'],['btnFilterCatalyst','CATALYST']])bind(id,()=>{resultUi.filter=value;paintResults();});
    bind('btnRealOpportunityScan',()=>navigateTo('bist_scan'));bind('btnSignalHistory',()=>navigateTo('signal_history'));bind('btnSortOpportunity',()=>{resultUi.sort=AndroidResults.sorts[(AndroidResults.sorts.indexOf(resultUi.sort)+1)%5];paintResults();});
    bind('btnVerifiedOnly',()=>{resultUi.verifiedOnly=!resultUi.verifiedOnly;paintResults();});bind('btnCandidatesOnly',()=>{resultUi.verifiedOnly=false;resultUi.filter='WATCH';paintResults();});
    bind('btnLowPriceSort',()=>{resultUi.sort='CHEAPEST';paintResults();});
    if(delayed){show('scanLong',false);show('scanShort',false);text('scan85','85+ TEKNİK');text('scanScore','TEKNİK PUAN');}
    // Diagnostics are independent of successful technical scan rows. Each
    // exception is shown by symbol and backend reason, never as a trade signal.
    const failureHost=$('scanList')||$('list');
    if(failureHost&&BistTerminal.job?.id){
      const jobId=BistTerminal.job.id,route=version;
      const failuresBox=el('section','apk-detail-note');failuresBox.dataset.scanFailureDetails='true';
      failuresBox.setAttribute('role','region');failuresBox.setAttribute('aria-label','Tarama eksik ve hata kayıtları');
      const open=action('YETERSİZ VERİ / HATA NEDENLERİNİ GÖSTER',async()=>{
        if(version!==route||screen!=='scan_results'&&screen!=='opportunity')return;
        failuresBox.replaceChildren(el('div','','Hata kayıtları yükleniyor…'));
        try{
          const records=[],first=await api('/api/scans/'+jobId+'/failures?page=1&size=100');
          records.push(...first.failures);
          for(let pg=2;records.length<first.total&&pg<=7;pg++){
            const next=await api('/api/scans/'+jobId+'/failures?page='+pg+'&size=100');
            if(version!==route)return;records.push(...next.failures);
          }
          if(version!==route)return;
          const insufficient=records.filter(issue=>issue.code==='INSUFFICIENT_HISTORY'||issue.classification==='INSUFFICIENT_DATA');
          const providerErrors=records.filter(issue=>issue.code!=='INSUFFICIENT_HISTORY'&&issue.classification!=='INSUFFICIENT_DATA');
          const heading=el('strong','',records.length+' / '+first.total+' kayıt • '+insufficient.length+' yetersiz geçmiş • '+providerErrors.length+' sağlayıcı/hesap hatası');
          const explanation=el('p','terminal-note','Yetersiz geçmiş bir fiyat hatası değildir: gerekli kapanmış mum sayısına ulaşılamadı, teknik hesap üretilmedi. 404 sembol/kaynak eşleşmesi; 502 ise veri sağlayıcısı/yanıt sorunu olabilir. Bunlar doğrulanmış AL/SAT sinyali değildir.');
          failuresBox.replaceChildren(heading,explanation);
          for(const issue of records){
            const code=String(issue.code||'HATA');
            const reason=String(issue.error||'Neden belirtilmedi').replace(new RegExp('^'+code+':\\s*'),'').slice(0,240);
            const have=Number.isInteger(issue.closedBarCount)?issue.closedBarCount+' / '+(issue.requiredClosedBars||220)+' kapanmış mum • ':'';
            const label=(code==='INSUFFICIENT_HISTORY'||issue.classification==='INSUFFICIENT_DATA')?'YETERSİZ GEÇMİŞ':(issue.classification==='PROVIDER'?'SAĞLAYICI HATASI':code);
            const line=el('div','',String(issue.symbol||'—')+' • '+have+label+' • '+reason);
            line.dataset.failureCategory=(code==='INSUFFICIENT_HISTORY'||issue.classification==='INSUFFICIENT_DATA')?'insufficient':'provider';
            failuresBox.append(line);
          }
          if(!records.length)failuresBox.append(el('div','','Kaydedilmiş ayrıntılı hata yok.'));
          failuresBox.append(action('SADECE EKSİK / HATALI KAYITLARI YENİDEN KONTROL ET',()=>startScan(undefined,jobId,true)));
        }catch(error){if(version===route)failuresBox.replaceChildren(el('div','','Hata kayıtları alınamadı: '+error.message),action('YENİDEN DENE',()=>open.click()));}
      });
      // Render outside the virtualized result list so repaint does not remove this action.
      const home=$('scanCoverageSummary')?.parentElement||$('txtScanEvidence')?.parentElement||failureHost.parentElement;
      home?.append(open,failuresBox);
    }
    text('txtScanModeDisclosure','GECİKMELİ TEKNİK GÖZLEM • AL/SAT ÜRETİLMEDİ • DOĞRULANMAMIŞ GÖZLEMLER SİNYAL DEFTERİNE YAZILMAZ');
    text('txtMarketRegime','Piyasa rejimi: '+(lastRows[0]?.marketRegime||'Veri yok'));
    await loadRows();
  }
  let rowRequest=0,rowsInFlight=null;
  async function loadRows(){
    const job=BistTerminal.job;
    if(!job){text('scanState','Tarama henüz başlatılmadı');text('txtSummary','Henüz gerçek tarama yapılmadı.');return;}
    const stamp=job.status+':'+job.processed;
    if(rowsInFlight?.id===job.id&&rowsInFlight.version===version){
      // Polling the same state must not trigger another full page traversal.
      if(rowsInFlight.stamp!==stamp)rowsInFlight.refresh=true;
      return;
    }
    const request=version,ticket=++rowRequest,ctx={id:job.id,version:request,stamp,refresh:false,failed:false};
    rowsInFlight=ctx;
    const activeFilter=['LONG','SHORT','HIGH_POWER'].includes(filter)?'ALL':filter;
    const list=$('scanList')||$('list'),rows=[];
    // A manual retry replaces an old actionable error instead of stacking
    // multiple buttons when backend polling and explicit retry overlap.
    list?.querySelectorAll('[data-scan-results-error],[data-scan-results-retry]').forEach(node=>node.remove());
    const stillCurrent=()=>request===version&&ticket===rowRequest&&BistTerminal.job?.id===job.id&&['scan_results','opportunity'].includes(screen);
    const reportLoading=(done,total)=>{
      if(!stillCurrent())return;
      const host=$('scanList')||$('list');if(!host)return;
      const existing=host.querySelector('[data-scan-results-progress]')||el('div','apk-detail-note');
      existing.dataset.scanResultsProgress='true';
      existing.setAttribute('role','status');
      existing.textContent=done?done+'/'+total+' teknik sonuç yüklendi • diğer sayfalar getiriliyor…':'Teknik tarama sonuçları sunucudan yükleniyor…';
      if(!existing.isConnected)host.prepend(existing);
    };
    if(lastJob?.id!==job.id||!lastRows.length){lastRows=[];lastJob=job;list?.replaceChildren();reportLoading(0,0);}
    try{
      for(let currentPage=1;currentPage<=20;currentPage++){
        const data=await api('/api/scans/'+job.id+'/results?'+new URLSearchParams({filter:activeFilter,page:currentPage,size:100}));
        if(!stillCurrent())return;
        if(!data||!Array.isArray(data.results)||!Number.isInteger(data.total)||data.total<0||data.total>2000)
          throw Error('Sunucu geçerli bir sonuç listesi döndürmedi.');
        rows.push(...data.results);
        // Render page one immediately; never leave the screen blank while
        // repeatedly filtering 589+ rows over the backend Kotlin bridge.
        lastRows=rows.slice();lastJob=job;paintResults();
        if(rows.length>=data.total)break;
        if(!data.results.length)throw Error('Sunucu sonuç sayısıyla gelen sayfalar tutarsız.');
        reportLoading(rows.length,data.total);
      }
      if(!rows.length&&job.successful>0&&stillCurrent())
        throw Error('Tarama başarılı görünüyor fakat sunucu teknik sonuç döndürmedi.');
      if(stillCurrent()){
        const host=$('scanList')||$('list');
        host?.querySelector('[data-scan-results-progress]')?.remove();
        // The actual Android scan-results layout has no txtSummary field.
        // Put a visible, machine-testable loaded count inside its real list.
        const summary=el('div','apk-detail-note',rows.length+' teknik sonuç yüklendi'+(job.successful>rows.length?' • kalan sonuçlar için filtre/kapsamı kontrol edin':''));
        summary.dataset.scanResultsLoaded=String(rows.length);
        summary.setAttribute('role','status');
        host?.prepend(summary);
      }
    }catch(error){
      if(!stillCurrent())return;
      // Preserve any already loaded rows; do not silently report zero
      // results or clear existing user content on provider/network failures.
      const host=$('scanList')||$('list');
      ctx.failed=true;
      host?.querySelector('[data-scan-results-progress]')?.remove();
      host?.querySelectorAll('[data-scan-results-error],[data-scan-results-retry]').forEach(node=>node.remove());
      const problem=note(host,(rows.length?'Kısmi sonuçlar gösteriliyor. ':'Sonuçlar gösterilemiyor. ')+error.message);
      problem.dataset.scanResultsError='true';
      const retry=action('SONUÇLARI YENİDEN YÜKLE',()=>loadRows());
      retry.dataset.scanResultsRetry='true';
      host?.append(retry);
      text('txtSummary',rows.length+' sonuç • yükleme hatası');
    }finally{
      if(rowsInFlight===ctx){
        rowsInFlight=null;
        if(ctx.refresh&&!ctx.failed&&stillCurrent())safe(loadRows)();
      }
    }
  }
  function paintResults(validity,condition){
    const list=$('scanList')||$('list');if(!list)return;list.replaceChildren();
    const rows=AndroidResults.homeSelect(AndroidResults.apply(lastRows,resultUi),{trend:resultUi.homeTrend||'ALL',signal:resultUi.homeSignal||'ALL',attestationVerified:!resultUi.delayed}).filter(x=>(!validity||x.signalValidity===validity)&&(!condition||condition(x)));
    if(resultUi.homeTrend!=='ALL'||resultUi.homeSignal!=='ALL')note(list,'Ana panel filtresi: trend '+(AndroidResults.trendNames[resultUi.homeTrend]||'Tümü')+' • sinyal '+(AndroidResults.signalNames[resultUi.homeSignal]||'Tümü'));
    for(const [id,on] of [['btnVerifiedOnly',resultUi.verifiedOnly],['scanAll',resultUi.mode==='ALL'],['scan85',resultUi.mode==='HIGH_POWER'],['scanScore',resultUi.mode==='SCORE']])$(id)?.setAttribute('aria-pressed',String(!!on));
    let rendered=0;
    const appendBatch=()=>{for(const x of rows.slice(rendered,rendered+50)){
      const display=x.trendDisplay,discovery=x.discovery,price=x.displayQuote?.price??x.price,change=x.displayQuote?.changePct;
      const move=num(price)+(Number.isFinite(change)?'  '+(change>0?'▲':'▼')+' '+num(Math.abs(change))+'%':' • Günlük değişim —');
      const open=()=>navigateTo('stock_detail',{symbol:x.symbol,opportunity:x});
      const fields=screen==='opportunity'?{symbolBadge:x.symbol.slice(0,5),symbol:x.symbol,company:x.companyName||x.symbol,priceMovement:move,favoriteToggle:favoriteSymbols().includes(x.symbol)?'★':'☆',opportunityScore:display?.scoreLabel||'—',discoveryLabel:display?.signalLabel||x.signalValidity,signalQualityLabel:'Sinyal yönü doğrulanamadı',discoveryReason:discovery?.reason||x.signalValidityReason,riskMetric:'Risk\n'+(x.riskScore<=30?'Düşük':x.riskScore<=60?'Orta':'Yüksek'),volumeMetric:'Hacim\n'+(x.technical?.volumeRatio?num(x.technical.volumeRatio,1)+'x':'Veri yok'),catalystMetric:'Katalizör\nVeri yok',factorSummary:'KARAR DESTEK ÖZETİ\n'+x.direction+' • LONG '+x.longScore+'/100 • SHORT '+x.shortScore+'/100 • Nihai '+x.finalSignalScore+'/100 • Sıralama '+x.rankingScore+'/100\n'+(discovery?.factors.filter(f=>f.score!=null).map(f=>f.label+' '+f.score+'/100').join(' • ')||''),coverageText:'Kanıt kapsamı '+(discovery?.coveragePct??'—')+'% • Veri güveni '+x.dataConfidenceScore+'/100 • '+(display?.dataLabel||'GECİKMELİ')}:{symbol:x.symbol,company:x.companyName||x.symbol,priceMovement:move,directionBadge:display?.signalLabel||x.signalValidity,strengthValue:Number.isFinite(x.score)?'Teknik '+num(x.score,0)+'/100':'Teknik veri yok',strengthTier:(display?.trend?.label||'TEKNİK GÖZLEM')+' • AL/SAT onayı yok',technicalScore:'Teknik Skor\n'+x.score+'/100',riskScore:'Risk\n'+x.riskScore+'/100',confidenceScore:'Veri güveni\n'+x.dataConfidenceScore+'/100',dataMode:display?.dataLabel||'GECİKMELİ',source:x.source,timeInfo:'Veri: '+date(x.dataTimestamp),levels:x.riskPlan?'Giriş '+num(x.riskPlan.entry)+' • Stop '+num(x.riskPlan.stop)+' • Hedef '+num(x.riskPlan.target1):'GECİKMELİ GÖZLEM • Giriş, stop ve hedef üretilmedi.',coverage:x.closedBarCount+' kapanmış mum • '+(x.analysisTimeframeMinutes||'')+' DK',reason:x.signalValidityReason};
      const card=nativeItem(screen==='opportunity'?'opportunity':'scan_result',fields,open,{openDetail:open,openGraph:open,favoriteToggle:()=>{favorite(x.symbol);paintResults(validity,condition);}}),trend=display?.trend;
      const glow=AndroidResults.trendGlow(trend);
      if(glow){
        const strong=glow.level===2,rgb=[glow.red,glow.green,glow.blue].join(',');
        const tint=strong?.36:.20,halo=strong?.58:.27,edge=strong?.98:.72;
        // Strong technical trend = saturated phosphor green / vivid red and
        // brighter glow. These colors never grant a trade-signal entitlement.
        card.dataset.trendState=glow.state;
        card.dataset.trendLevel=String(glow.level);
        card.style.background='linear-gradient(105deg,rgba('+rgb+','+tint+') 0%,#07243a 49%,#051c2d 100%)';
        card.style.outline=(strong?'2px':'1px')+' solid rgba('+rgb+','+edge+')';
        card.style.outlineOffset='-1px';
        card.style.boxShadow='inset 5px 0 0 rgba('+rgb+','+edge+'),0 0 '+(strong?25:12)+'px rgba('+rgb+','+halo+'),0 0 '+(strong?8:4)+'px rgba('+rgb+','+(strong?.58:.30)+')';
        card.style.borderRadius='14px';
        const symbolNode=card.querySelector('[data-apk-id="symbol"]');
        const trendNode=card.querySelector('[data-apk-id="strengthTier"]');
        for(const node of [symbolNode,trendNode])if(node){
          node.style.color='rgb('+rgb+')';
          node.style.textShadow='0 0 '+(strong?13:6)+'px rgba('+rgb+','+(strong?.87:.45)+')';
        }
        card.title='TEKNİK TREND: '+(trend.label||glow.state)+' • Canlı AL/SAT onayı değildir.';
      }
      list.append(card);
    }rendered=Math.min(rows.length,rendered+50);};appendBatch();
    if(rows.length>50){const more=action('Daha fazla sonuç',()=>{more.remove();appendBatch();if(rendered<rows.length)list.append(more);});list.append(more);}
    if(!rows.length)note(list,'Bu filtreye uyan doğrulanmış sonuç yok. Gecikmeli kayıtlar LONG/SHORT işlem filtresine girmez.');
    text('txtWatchedCount',String(lastJob?.total||0));text('txtFoundCount',String(rows.length));text('txtSummary',rows.length+' sonuç');text('txtScanEvidence',lastJob?lastJob.processed+'/'+lastJob.total+' işlendi • '+lastJob.provider:'Tarama yapılmadı');
  }
  async function getUniverse(){return universe??(universe=await api('/api/universe'));}
  async function stocks(){
    const request=version;
    return AndroidStocks.render({$,text,show,bind,action,message,nativeItem,navigate:navigateTo,favorite,favoriteSymbols,api,num,date,reference,
      current:()=>version===request&&screen==='stocks',job:()=>BistTerminal.job,indices:indexTiles,company:symbol=>universe?.records.find(x=>x.symbol===symbol)?.companyName,
      references:async()=>{universe=await api('/api/universe/refresh',{});market=await api('/api/instruments');}});
  }
  function indexTiles(){for(const [key,id] of [['XU100','index100'],['XU030','index30']]){const x=market?.items?.find(x=>x.key===key);text(id+'Value',x&&!x.error?num(x.price):'—');text(id+'Change',x&&!x.error?num(x.changePct)+'%':'—');}text('stocksIndexNotice','Yahoo Finance • Gecikmeli • Üyelik doğrulanmadı');}
  function favorites(){
    text('favoriteCount',String(favoriteSymbols().length));text('favoriteSummary',favoriteSymbols().length+' kayıt');show('favoriteEmptyState',!favoriteSymbols().length);
    const paint=()=>{const list=$('favoriteList');if(list){list.replaceChildren();for(const symbol of favoriteSymbols())list.append(nativeItem('favorite',{favoriteSymbol:symbol,favoriteCompany:universe?.records.find(x=>x.symbol===symbol)?.companyName||'Ad doğrulanmadı',favoriteDetails:'Yerel favori'},()=>navigateTo('stock_detail',{symbol}),{favoriteRemove:()=>{favorite(symbol);favorites();}}));}};paint();
    bind('openStocksSource',()=>navigateTo('stocks'));bind('openOpportunities',()=>navigateTo('opportunity'));
    bind('tabFavorites',()=>{show('favoritesPanel');show('bistPanel',false);});bind('tabBistList',()=>{show('favoritesPanel',false);show('bistPanel');hydrateWatchlist();});
    $('bistSearch')?.addEventListener('input',safe(async()=>{const u=await getUniverse(),q=$('bistSearch').value.toUpperCase(),list=$('bistSuggestions');list.replaceChildren();for(const x of u.records.filter(x=>(x.symbol+' '+x.companyName).toUpperCase().includes(q)).slice(0,15))row(list,x.symbol,x.companyName,()=>{watchToggle(x.symbol);favorites();});}));
    text('watchlistCount',watchedSymbols().length+'/20');const watch=$('bistWatchlist');if(watch){watch.replaceChildren();for(const symbol of watchedSymbols())watch.append(nativeItem('bist_watchlist',{watchSymbol:symbol,watchCompany:universe?.records.find(x=>x.symbol===symbol)?.companyName||'',watchLast:'—',watchChange:'—',watchMeta:'Veri bekleniyor',watchBid:'Alış —',watchAsk:'Satış —'},()=>navigateTo('stock_detail',{symbol}),{watchRemove:()=>{watchToggle(symbol);favorites();}}));}
  }
  async function hydrateWatchlist(){
    if(reference)return;const request=version,symbols=[...watchedSymbols()];let cursor=0,done=0,failed=0;text('watchlistStatus','Gecikmeli günlük fiyatlar yükleniyor…');
    await Promise.all([0,1,2,3].map(async()=>{while(cursor<symbols.length&&version===request&&screen==='favorites'){
      const symbol=symbols[cursor++];try{const q=await api('/api/stocks/quote?symbol='+encodeURIComponent(symbol));if(q.symbol!==symbol||q.realtime!==false||q.delayed!==true||!Number.isFinite(q.price)||q.price<=0)throw Error('Fiyat kimliği doğrulanamadı.');if(version!==request||screen!=='favorites'||!watchedSymbols().includes(symbol))return;AndroidStocks.quotes.set(symbol,q);
        const card=[...app.querySelectorAll('[data-native-item=bist_watchlist]')].find(n=>n.querySelector('[data-apk-id=watchSymbol]')?.textContent===symbol);if(card){const find=id=>card.querySelector('[data-apk-id="'+id+'"]'),c=BistNativeMarket.change({},q);L.setText(find('watchLast'),num(q.price));L.setText(find('watchChange'),c==null?'—':(c>0?'+':'')+num(c)+'%');L.setText(find('watchMeta'),'GECİKMELİ • '+q.source+'\nGünlük mum başlangıcı: '+date(q.timestamp));}
      }catch{failed++;}done++;if(version===request)text('watchlistStatus',done+'/'+symbols.length+' kontrol • '+failed+' fiyat hatası • canlı veri değildir');
    }}));
  }
  function favorite(symbol){settings.favorites=favoriteSymbols().includes(symbol)?favoriteSymbols().filter(x=>x!==symbol):[...favoriteSymbols(),symbol];save();text('btnFavoriteDetail',favoriteSymbols().includes(symbol)?'★':'☆');}
  function watchToggle(symbol){if(watchedSymbols().includes(symbol))settings.watchlist=watchedSymbols().filter(x=>x!==symbol);else{if(watchedSymbols().length>=20)throw Error('Android BIST takip listesi sınırı 20.');settings.watchlist=[...watchedSymbols(),symbol];}save();}
  function settingsScreen(){
    text('versionBadge','B670 • 6.3.45');text('systemStatusBadge',reference?'YAPILANDIRILMAMIŞ':'KONTROL EDİLİYOR');
    text('systemStatusSummary',reference?'Production Backend yapılandırılmamış. Gerçek HTTPS backend adresi ve API erişim anahtarı girin.':'Web sunucusu ve lisanslı piyasa veri bağlantısı kontrol ediliyor.');
    text('connectionBadge',reference?'EKSİK':'KONTROL EDİLİYOR');text('scanBadge',settings.auto?'ETKİNLEŞTİRİLDİ':'KAPALI');text('notificationsBadge',settings.notifications?'İZİN KONTROLÜ':'KAPALI');text('workModeBadge',settings.delayed?'GECİKMELİ YEDEK':'YAPILANDIRILMAMIŞ');
    if(!reference){
      const request=version;
      Promise.allSettled(['/ready','/health','/api/provider/status'].map(path=>api(path))).then(results=>{
        if(screen!=='settings'||version!==request)return;
        const [ready,health,provider]=results.map(r=>r.status==='fulfilled'?r.value:null);
        const backendReady=ready?.status==='ready'&&health?.status==='ok';
        const providerReady=backendReady&&ready?.licensedProviderConnected===true&&provider?.connected===true&&provider?.authenticated===true;
        text('systemStatusBadge',backendReady?(providerReady?'SAĞLAYICI BAĞLI':'KISMEN HAZIR'):'DOĞRULANMADI');
        text('systemStatusSummary',backendReady?(providerReady?'Web backend ve yetkili sağlayıcı bağlantısı doğrulandı; canlı piyasa kapsamı ayrıca test edilmelidir.':'Web backend sağlıklı. Lisanslı BIST/VİOP piyasa sağlayıcısı bağlı veya doğrulanmış değil.'):'Web backend ya da Android hesap çekirdeği doğrulanamadı. Sistem raporu ve sağlık testini kontrol edin.');
        text('connectionBadge',providerReady?'DOĞRULANDI':backendReady?'SAĞLAYICI YOK':'TEST EDİLEMEDİ');
      }).catch(()=>{});
    }
    for(const id of ['systemStatusBadge','connectionBadge','scanBadge','notificationsBadge'])if($(id))$(id).style.color='#7f9ab0';
    show('notificationUnreadBadge',false);
    const mapping={systemStatusCard:'system_status',dataConnectionCard:'data_connection',apiKeysCard:'api_keys',scanSettingsCard:'scan',tradeSimulationCard:'simulation',notificationsCard:'notifications',notificationHistoryCard:'notification_history',appearanceCard:'appearance',localeCard:'locale',diagnosticsCard:'diagnostics',aboutCard:'about',workModeCard:'work_mode'};
    for(const [id,mode] of Object.entries(mapping))bind(id,()=>navigateTo('settings_detail',{mode}));
    bind('searchButton',()=>navigateTo('settings_search'));bind('notificationButton',()=>navigateTo('notifications'));bind('moreButton',()=>navigateTo('settings_detail',{mode:'about'}));
    bind('clearCacheButton',async()=>{await api('/api/cache/clear',{});universe=null;market=null;message('Yalnız geçici veri önbelleği temizlendi. Dosyalar, favoriler ve defter korundu.');});
    bind('refreshDataButton',async()=>{market=await api('/api/instruments');message('Piyasa kaynakları kontrol edildi.');});
    bind('resetSettingsButton',()=>{if(confirm('Tarama ve görünüm tercihleri sıfırlansın mı? Favoriler, takip listeleri, veri dosyaları ve defter korunur.')){const preserved=Object.fromEntries(['favorites','watchlist','userSymbols'].filter(k=>Array.isArray(settings[k])).map(k=>[k,[...settings[k]]]));settings={...BistNativePreferences.defaults(),...preserved};save();schedule();settingsScreen();}});
  }
  function settingsSearch(){
    const search=$('settingsSearchView'),list=$('settingsSearchResults');if(!search||!list)return;
    search.placeholder='Ayarlar içinde ara';const paint=()=>{list.replaceChildren();const q=search.value.trim().toLocaleLowerCase('tr-TR'),items=settingsItems.filter(x=>(x[0]+' '+x[1]).toLocaleLowerCase('tr-TR').includes(q));for(const [label,,mode] of items){const n=el('div','apk-settings-row',label);n.addEventListener('click',()=>navigateTo('settings_detail',{mode}));list.append(n);}text('searchEmpty',items.length?items.length+' sonuç':'Bu ifadeyle eşleşen gerçek bir ayar bulunamadı.');show('searchEmpty');};
    search.addEventListener('input',paint);paint();
  }
  function settingsDetail(){
    const mode=params.mode||'system_status',title=settingsItems.find(x=>x[2]===mode)?.[0]||'Ayarlar',content=$('detailContent');
    text('detailTitle',title);text('detailSubtitle','Uygulama ve veri bağlantıları');if(!content)return;content.replaceChildren();
    if(mode==='system_status'){
      text('detailTitle','SİSTEM RAPORU');
      text('detailSubtitle','Kısa özet • Güncel durum • Sorunlar');
      const reportCard=el('section','apk-system-report-card');
      reportCard.setAttribute('aria-label','Sistem raporu');
      const reportBody=el('div','apk-system-report-body','Sistem raporu hazırlanıyor…');
      reportBody.id='apk-system-report-body';
      reportBody.setAttribute('role','status');
      reportCard.append(reportBody);
      content.append(reportCard);
      let lastReport='',active=true,requestNumber=0;
      const renderReport=(ready,provider,health,issues=[])=>{
        const providerLive=provider?.connected===true&&provider?.authenticated===true&&ready?.licensedProviderConnected===true;
        const reachable=ready?.status==='ready'&&health?.status==='ok';
        const job=BistTerminal.job||null;
        const count=n=>Number.isInteger(n)&&n>=0?n:null;
        const done=count(job?.processed)??count(job?.done)??0;
        const total=count(job?.total)??0;
        const success=count(job?.successful),insufficient=count(job?.insufficient),errors=count(job?.errors);
        const scanStatus=job?.status||'Başlatılmadı';
        const localTime=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(Date.now());
        const problems=[...issues];
        if(!providerLive)problems.push('Yetkili VİOP veri sağlayıcısı doğrulanmadı; lisanslı sağlayıcı sunucu tarafında yapılandırılmalı ve bağlantısı test edilmelidir.');
        if(!reachable)problems.push('Backend/Android çekirdeği sağlık denetimi tamamlanmadı.');
        if(scanStatus==='COMPLETED_WITH_ERRORS'||(errors!==null&&errors>0)){
          problems.push('BIST taramasında '+(errors===null?'sayısı belirlenemeyen':errors)+' sağlayıcı/hesap hatası var. İşlenen hisseler başarılı analiz sayısı değildir.');
        }
        if(insufficient!==null&&insufficient>0)problems.push('BIST taramasında '+insufficient+' hisse için yeterli kapanmış mum bulunamadı; bu hisselerde teknik analiz üretilmedi.');
        const providerReason=providerLive?'DOĞRULANDI':provider?.reason==='NOT_CONFIGURED'?'PROVIDER_NOT_CONFIGURED':provider?.reason||'PROVIDER_UNVERIFIED';
        lastReport=[
          'SİSTEM RAPORU • V6.3.45 / 670',
          'Durum: '+(reachable?'PARTIAL_READY':'NOT_READY')+' • '+localTime,
          'VİOP sağlayıcısı: '+providerReason,
          'Bağlantı açıklaması: '+(reachable?(providerLive?'Web backend ve sağlayıcı bağlantısı doğrulandı; fiyat kapsamı ayrıca test edilmelidir.':'Web backend sağlıklı; lisanslı piyasa sağlayıcısı bağlı/doğrulanmış değil.'):'Web backend veya Android hesap çekirdeği doğrulanamadı.'),
          'BIST bağlantı testi: '+(reachable?'BACKEND_READY (yalnız web/çekirdek; piyasa kaynağı değil)':'NOT_TESTED'),
          'BIST tarama: '+done+'/'+total+' işlendi • '+scanStatus,
          'BIST sonuçları: Başarılı '+(success??'bilinmiyor')+' • Yetersiz veri '+(insufficient??'bilinmiyor')+' • Hata '+(errors??'bilinmiyor'),
          'VİOP: Test edilmedi — doğrulanmış kontrat/fiyat akışı yok',
          'Otomasyon: '+(settings.auto?'Açık • Yalnız sekme açıkken':'Kapalı')+' • Tarama durumundan bağımsız',
          'Bildirim: '+(settings.notifications?'İzin kayıtlı • Arka plan doğrulanmadı':'Kapalı / İzin gerekli'),
          'Cihaz testi: Doğrulanmadı • Canlı işlem: Doğrulanmadı',
          'APK–Web tam eşdeğerlik kabulü: Doğrulanmadı',
          'Uzak sinyal imzası: '+(ready?.signalAttestationVerified===true?'Doğrulandı':'Doğrulanmadı'),
          '',
          'GÜNCEL SORUNLAR ('+problems.length+')',
          ...(problems.length?problems.map(issue=>'• '+issue):['• Sağlayıcı ve APK tam eşdeğerliği ayrıca doğrulanmalıdır.'])
        ].join('\n');
        reportBody.textContent=lastReport;
      };
      const refresh=async()=>{
        const ticket=++requestNumber;lastReport='';
        reportBody.textContent='Sistem raporu hazırlanıyor…';
        if(reference){
          // Deterministic native APK capture fixture; production never reads this sample.
          const stamp=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(Date.now());
          lastReport=[
            'SİSTEM RAPORU • V6.3.45 / 670',
            'Durum: PARTIAL_READY • '+stamp,
            'VİOP sağlayıcısı: PROVIDER_NOT_CONFIGURED • BACKEND_URL_MISSING',
            'Bağlantı açıklaması: Production Backend yapılandırılmamış.',
            'Gerçek HTTPS backend adresi ve API erişim anahtarı girin.',
            'BIST bağlantı testi: NOT_TESTED',
            'BIST tarama: 0/0 • Başlatılmadı',
            'VİOP: 0/0',
            'Otomasyon: Kapalı • IDLE',
            'Bildirim: Kapalı / İzin gerekli',
            'Cihaz testi: Doğrulanmadı • Canlı işlem: Doğrulanmadı',
            '',
            'GÜNCEL SORUNLAR (1)',
            '• Yetkili veri kaynağı doğrulanmadı — Bağlantı ayarlarını ve sağlık testini kontrol edin'
          ].join('\n');
          reportBody.textContent=lastReport;
          return;
        }
        const paths=['/ready','/api/provider/status','/health'];
        const results=await Promise.allSettled(paths.map(path=>api(path)));
        if(!active||screen!=='settings_detail'||params.mode!=='system_status'||ticket!==requestNumber)return;
        const [ready,provider,health]=results.map(r=>r.status==='fulfilled'?r.value:null);
        const errors=results.flatMap((r,i)=>r.status==='rejected'?[paths[i]+': bağlantı hatası']:[]);
        renderReport(ready,provider,health,errors);
      };
      const appendAction=(label,handler)=>{
        const b=action(label,handler);
        b.classList.add('apk-system-report-action');
        content.append(b);
        return b;
      };
      appendAction('RAPORU YENİLE',refresh);
      appendAction('TEKNİK DETAYLAR / DERİN TEŞHİS',async()=>{
        if(reference){message('Referans görsel modu: canlı tanılama kapalı.');return;}
        const checks=await Promise.allSettled(['/ready','/health','/api/core/metadata','/api/provider/status'].map(path=>api(path)));
        message(checks.map((r,i)=>{
          const name=['Çekirdek','Sunucu','Hesap motoru','Yetkili kaynak'][i];
          if(r.status==='rejected')return name+': BAŞARISIZ (erişim doğrulanmadı)';
          if(i===3)return name+': '+(r.value.connected&&r.value.authenticated?'BAĞLI':'DOĞRULANMADI');
          return name+': '+(i===0?r.value.status:i===1?r.value.status:'Yanıt alındı');
        }).join('\n'));
      });
      appendAction('CANLI PROVIDER / OHLCV TESTİ YAP',async()=>{
        if(reference){message('Referans modu: canlı veri testi çalıştırılmadı.');return;}
        const p=await api('/api/provider/status');
        if(!p.connected||!p.authenticated){
          message('Lisanslı canlı sağlayıcı doğrulanmadı; canlı test geçmedi. Yalnız gecikmeli geçmiş OHLCV ayrı kontrol edilebilir.');
          return;
        }
        // Do not equate a configured token with a successful licensed quote.
        message('Sağlayıcı bağlantısı raporlandı; gerçek kontrat, teklif ve yetki kapsamı ayrıca doğrulanmalıdır.');
      });
      appendAction('KISA RAPORU KOPYALA',async()=>{
        if(!lastReport)throw Error('Önce rapor oluşturulmalıdır.');
        if(!navigator.clipboard?.writeText)throw Error('Tarayıcı kopyalama izni veya HTTPS gerektiriyor.');
        await navigator.clipboard.writeText(lastReport);
        message('Sistem raporu panoya kopyalandı.');
      });
      appendAction('TARAMA HATA / EKSİK VERİ JSON İNDİR',async()=>{
        const job=BistTerminal.job;if(!job?.id)throw Error('Önce bir tarama başlatın veya kayıtlı taramayı açın.');
        const current=await api('/api/scans/'+encodeURIComponent(job.id));
        offlineDownload('BIST-TARAMA-AYRINTILARI.json','application/json',JSON.stringify({generatedAt:new Date().toISOString(),...current},null,2));
      });
      appendAction('KISA TXT İNDİR',()=>{
        if(!lastReport)throw Error('Önce rapor oluşturulmalıdır.');
        const url=URL.createObjectURL(new Blob([lastReport],{type:'text/plain;charset=utf-8'}));
        const link=document.createElement('a');link.href=url;link.download='BIST-VIOP-BUILD670-SISTEM-RAPORU.txt';
        document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),0);
      });
      refresh().catch(e=>{if(active)reportBody.textContent='Sistem raporu okunamadı: '+e.message;});
      return;
    }else if(mode==='scan'){
      note(content,'Analiz periyodu, tarama yenileme sıklığından ayrıdır.');
      const select=el('select','apk-node apk-Spinner');for(const v of [1,3,5,10,15,30,60,1440]){const o=el('option','',v===1440?'1 GÜN':v+' DK');o.value=v===1440?'1d':v+'m';select.append(o);}select.value=settings.interval;content.append(select);
      const custom=input(content,'Özel periyot (1–239 DK; boş = seçim)','', 'number'),cadence=input(content,'Otomatik tarama sıklığı (dk)',settings.cadence,'number');
      choices(content,[['on','Otomatik açık'],['off','Otomatik kapalı']],settings.auto?'on':'off',id=>{settings.auto=id==='on';save();schedule();settingsDetail();});
      content.append(action('KAYDET',()=>{const n=Number(custom.value);if(custom.value&&(!Number.isInteger(n)||n<1||n>239))throw Error('1–239 dakika gerekli.');const c=Number(cadence.value);if(!Number.isInteger(c)||c<1||c>1440)throw Error('Tarama sıklığı 1–1440 dakika olmalı.');settings.interval=custom.value?n+'m':select.value;settings.cadence=c;save();schedule();goBack();}));
      note(content,'Web otomatik tarama yalnız sekme açıkken yürür. Android foreground service/cihaz yeniden başlatma davranışı webde doğrulanmadı.');
    }else if(mode==='data_connection'||mode==='work_mode'){
      text('detailSubtitle','Production Backend ve mevcut ProviderRouter bağlantısı');
      note(content,'Bu web kurulumunda imzalı/lisanslı canlı BIST–VİOP sağlayıcısı bağlı değil.');
      choices(content,[['delayed','Yahoo • Gecikmeli gözlem'],['strict','Yetkili sağlayıcı']],settings.delayed?'delayed':'strict',id=>{settings.delayed=id==='delayed';save();settingsDetail();});
      content.append(action('KAYITLI BAĞLANTIYI TEST ET',async()=>{
        const [health,meta,provider]=await Promise.all([api('/health'),api('/api/core/metadata'),api('/api/provider/status')]);
        message(JSON.stringify({health,engine:meta.engineVersion,
          providerConfiguration:{configured:provider.configured,configurationValid:provider.configurationValid,
            connected:provider.connected,authenticated:provider.authenticated,reason:provider.reason},
          licensedLiveMarketVerified:false,signalAttestationVerified:false},null,2));
      }));
      content.append(action('CSV / JSON VERİ VE TAM YEDEK',()=>legacyPanel('page-data')));
    }else if(mode==='simulation'){
      text('detailSubtitle','Gerçek emir göndermez; mevcut TradeForwardEngine maliyet formülünü kullanır');
      const q=input(content,'Miktar',settings.quantity,'number'),fee=input(content,'Tek yön komisyon',settings.commission,'number'),slip=input(content,'Tek yön slippage (bps)',settings.slippage,'number');
      const directionLabel=el('label','apk-detail-note','Yön'),direction=el('select','apk-node apk-Spinner');for(const side of ['LONG','SHORT']){const option=el('option','',side);option.value=side;direction.append(option);}directionLabel.append(direction);content.append(directionLabel);
      const entry=input(content,'Giriş fiyatı','','number'),exit=input(content,'Çıkış fiyatı','','number'),result=note(content,'Hesaplama yapılmadı.');result.id='apk-simulationResult';
      const values=()=>[q,fee,slip].map(field=>field.value.trim()?Number(field.value):NaN);
      content.append(action('SİMÜLASYON AYARLARINI KAYDET',()=>{const data=values();if(!data.every(Number.isFinite)||data.some(x=>x<0)){result.textContent='Miktar/komisyon/slippage geçerli ve negatif olmayan sayılar olmalıdır.';return;}[settings.quantity,settings.commission,settings.slippage]=data;save();result.textContent='Simülasyon maliyet ayarları kaydedildi.';}));
      let calculation=0;const calculate=action('HESAPLA',async()=>{const [quantity,commissionPerSide,slippageBpsPerSide]=values(),body={direction:direction.value,entry:entry.value.trim()?Number(entry.value):null,exit:exit.value.trim()?Number(exit.value):null,quantity,commissionPerSide,slippageBpsPerSide},request=version,ticket=++calculation;calculate.disabled=true;result.textContent='Hesaplama yapılıyor…';try{const r=await api('/api/trade-estimate',body);if(version!==request||ticket!==calculation)return;result.textContent='Yön: '+body.direction+'\nGiriş: '+num(r.entry)+'\nÇıkış: '+num(r.exit)+'\nMiktar: '+num(quantity)+'\nBrüt P/L: '+num(r.grossPnl)+'\nKomisyon + kayma: '+num(r.totalCosts)+'\nNet P/L: '+num(r.netPnl)+'\nNet getiri: '+num(r.netReturnPct)+'%\n\nBu sonuç simülasyondur; emir gönderilmedi.';}catch(e){if(version===request&&ticket===calculation)result.textContent='Hesaplama başarısız: '+e.message;}finally{calculate.disabled=false;}});content.append(calculate);
    }else if(mode==='notifications'){
      note(content,'Bildirim izni yalnız bu düğmeye basıldığında istenir.');
      content.append(action('BİLDİRİM İZNİNİ AÇ',async()=>{if(!('Notification' in window))throw Error('Bildirim desteği yok.');const p=await Notification.requestPermission();settings.notifications=p==='granted';save();message('İzin: '+p);}),action('BİLDİRİM GEÇMİŞİ',()=>navigateTo('notifications')),action('FİYAT EŞİĞİ OLUŞTUR / KONTROL ET',()=>legacyPanel('page-alerts')));
      note(content,'Arka plan canlı fiyat servisi bağlı değil. Gecikmeli eşik kontrolü kullanıcı düğmesiyle yapılır.');
    }else if(mode==='notification_history')navigateTo('notifications');
    else if(mode==='appearance'){
      text('detailSubtitle','Yalnız gerçekten desteklenen görünüm seçenekleri gösterilir');
      note(content,'Tema: Koyu\n\nBu kaynak sürümünde renk/drawable yapısı koyu tema için tasarlanmıştır. Açık/Sistem tema desteği bütün ekranlarda doğrulanmış bir altyapı olarak bulunmadığı için sahte tema seçeneği sunulmamıştır.');
    }else if(mode==='locale'){
      text('detailSubtitle','Uygulamanın gerçek kaynak ve cihaz bölge bilgileri');
      const zone=Intl.DateTimeFormat().resolvedOptions().timeZone,sampleDate=new Intl.DateTimeFormat('tr-TR',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric'}).format(Date.now());
      note(content,'Dil: Türkçe (TR)\nSaat dilimi: '+zone+'\nSayı örneği: '+num(10642.35)+'\nTarih biçimi: '+sampleDate+'\n\nKaynaklarda doğrulanmış ek uygulama dili bulunmadığı için sahte dil seçeneği gösterilmez.');
    }
    else if(mode==='api_keys'){note(content,'Doğrulanmış canlı sağlayıcı bağlantısı yapılandırılmadığı için API anahtarı istenmez. Android Keystore, tarayıcıda mevcut değildir. Anahtar veya erişim bilgisi rapora eklenmez.');}
    else if(mode==='about'){note(content,'BIST / VİOP\nReferans: V6.3.45 BUILD670\nHesaplama çekirdeği: V5.4.1\nWeb aktarımı — tüm APK eşdeğerliği henüz onaylanmadı');content.append(action('KAYNAK VE TEST BİLGİSİ',()=>navigateTo('info_screen')));}
    else{
      note(content,'Sunucu ve hesaplama çekirdeği kontrol ediliyor…');
      if(!reference)api('/health').then(h=>{if(screen==='settings_detail')note(content,'Sunucu: '+h.status+'\nSürüm: '+h.version+'\nKaynak commit: '+h.sourceCommit+'\nAndroid çekirdeği: '+h.androidCoreBuilt);}).catch(e=>note(content,e.message));
      note(content,'Lisanslı canlı veri: DOĞRULANMADI\nİmzalı uzak sinyal: DOĞRULANMADI\nTarama: '+(BistTerminal.job?.status||'BAŞLATILMADI'));
      content.append(action('SİSTEM TANILAMASINI ÇALIŞTIR',async()=>{
        const routes=['/ready','/health','/api/core/metadata','/api/provider/status'];
        const checks=await Promise.allSettled(routes.map(path=>api(path)));
        const verdicts=checks.map((result,i)=>{
          if(result.status==='rejected')return {name:routes[i],passed:false};
          const p=result.value;
          const passed=i===0?p.status==='ready'&&p.coreReady===true:
            i===1?p.status==='ok':i===2?p.requiredClosedBars===220:
            p.connected===true&&p.authenticated===true;
          return {name:routes[i],passed};
        });
        message(verdicts.map(x=>x.name+': '+(x.passed?'GEÇTİ':'DOĞRULANMADI')).join('\n')
          +'\n'+verdicts.filter(x=>!x.passed).length+' kontrol doğrulanmadı. Lisanslı canlı veri ve APK tam eşdeğerliği test edilmiş sayılmaz.');
      }),action('TEKNİK RAPOR / YEDEK',()=>legacyPanel('page-settings')));
    }
  }
  function legacyPanel(id){
    const panel=document.getElementById(id);if(!panel)throw Error('Korunan araç bulunamadı.');
    const existing=panel.closest('dialog');if(existing){if(!existing.open)existing.showModal();existing.focus();return;}
    if(document.querySelector('dialog[open]'))throw Error('Önce açık pencereyi kapatın.');
    const d=document.createElement('dialog');d.className='terminal-dialog';d.style.padding='16px';d.setAttribute('aria-label','Korunan araç');
    const parent=panel.parentNode,next=panel.nextSibling,active=panel.classList.contains('active'),display=panel.style.display,focus=document.activeElement;
    panel.classList.add('active');panel.style.display='block';
    d.append(action('‹ Geri',()=>d.close()),panel);document.body.append(d);
    d.addEventListener('close',()=>{parent.insertBefore(panel,next?.parentNode===parent?next:null);panel.style.display=display;panel.classList.toggle('active',active);d.remove();if(focus?.isConnected&&!document.querySelector('dialog[open]')&&(document.activeElement===document.body||d.contains(document.activeElement)))focus.focus();},{once:true});d.showModal();
  }
  async function companyPanel(kind,symbol){
    if(document.querySelector('dialog[open]'))return;
    const titles={company:'Şirket Bilgileri',financial:'Finansal Tablolar',dividend:'Temettü geçmişi',ownership:'Ortaklık Yapısı',legislation:'Resmî Mevzuat',analyst:'Analist Raporları'};
    const d=el('dialog','terminal-dialog'),title=el('h2','',symbol+' · '+titles[kind]),body=el('div','terminal-panel-body'),focus=document.activeElement;
    title.id='companyPanelTitle';d.setAttribute('aria-labelledby',title.id);
    let record;try{record=(await getUniverse()).records.find(x=>x.symbol===symbol);}catch{}
    if(document.querySelector('dialog[open]'))return;
    body.append(el('p','company-identity',record?.companyName||symbol+' · Şirket dizini alınamadı.'));
    const source=(label,url)=>{const a=el('a','terminal-link',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';body.append(a,el('br'));};
    const kapSummary=record?.kapUrl&&/^https:\/\/(?:www\.)?kap\.org\.tr\/tr\/sirket-bilgileri\/ozet\//.test(record.kapUrl)?record.kapUrl:null;
    const kapGeneral=kapSummary?.replace('/sirket-bilgileri/ozet/','/sirket-bilgileri/genel/'),kapFinancial=kapSummary?.replace('/sirket-bilgileri/ozet/','/sirket-finansal-bilgileri/'),kapNotices=kapSummary?.replace('/sirket-bilgileri/ozet/','/sirket-bildirimleri/');
    if(kapSummary)source(symbol+' · KAP şirket sayfasını aç',kind==='financial'?kapFinancial:kind==='dividend'?kapNotices:kapGeneral);else source('KAP şirket aramasını aç','https://www.kap.org.tr/tr/arama');

    if(kind==='financial'&&kapNotices)source('Tam finansal rapor / nakit akış bildirimlerini aç',kapNotices);
    if(kind==='legislation'){source('SPK · sermaye piyasası mevzuatı','https://spk.gov.tr/mevzuat');source('Borsa İstanbul · resmî kaynak','https://www.borsaistanbul.com');}
    const live=el('section','company-source-content');live.setAttribute('aria-live','polite');
    if(kind==='company')live.append(el('p','terminal-note','Şirket kimliği KAP eşlemesinden alınmıştır. Faaliyet konusu, iletişim ve güncel şirket formu yukarıdaki şirkete özel resmî sayfada açılır.'));
    else if(['financial','ownership'].includes(kind))live.append(el('p','terminal-note',reference?'Referans modu: otomatik kaynak isteği yapılmadı.':'KAP şirket tablosu yükleniyor…'));
    else if(kind==='dividend')live.append(el('p','terminal-note','Şirkete ait KAP bildirimleri yukarıdaki bağlantıda açılır. Aşağıda temettü haberleri kaynak ve tarihleriyle aranır; haber başlığı ödeme yapıldığının kanıtı değildir.'));
    else if(kind==='analyst'){source(symbol+' · İş Yatırım analiz ve şirket kartını aç','https://www.isyatirim.com.tr/tr-tr/analiz/hisse/Sayfalar/sirket-karti.aspx?hisse='+encodeURIComponent(symbol));live.append(el('p','terminal-note','Aracı kurum raporları kaynak sayfada açılır. Haber başlıklarından hedef fiyat veya onaylı yatırım sinyali üretilmez.'));}
    body.append(live);
    const loadOfficial=async()=>{
      live.replaceChildren(el('p','terminal-note','KAP şirket tablosu yükleniyor…'));
      try{const data=await api('/api/company?'+new URLSearchParams({symbol,kind}));if(!d.open)return;
        if(data.symbol!==symbol||!Array.isArray(data.tables)||!data.tables.length)throw Error('Şirkete ait dolu KAP tablosu alınamadı.');
        live.replaceChildren(el('p','terminal-note',data.note+' · Erişim: '+date(data.fetchedAt)+(data.cached?' · önbellek':'')));
        for(const [index,rows] of data.tables.entries()){
          live.append(el('h3','',kind==='ownership'?(index===0?'Doğrudan ortaklık payları':'Dolaylı ortaklık payları'):'KAP finansal özet'));
          const wrap=el('div','terminal-table-wrap'),table=el('table','terminal-table');
          for(const [i,values] of rows.entries()){const tr=el('tr');for(const value of values)tr.append(el(i===0?'th':'td','',value));table.append(tr);}wrap.append(table);live.append(wrap);
        }
      }catch(e){if(!d.open)return;const error=el('p','terminal-error',e.message);error.setAttribute('role','alert');live.replaceChildren(error,action('KAP TABLOSUNU YENİDEN DENE',loadOfficial));}
    };
    const loadHeadlines=async()=>{
      live.append(el('p','terminal-note','İlgili başlıklar aranıyor…'));
      try{const data=await api('/api/news?'+new URLSearchParams({symbol,category:kind,company:record?.companyName||''}));if(!d.open)return;
        const pattern=kind==='dividend'?/temettü|kar payı|kâr payı/i:/analiz|rapor|hedef|tavsiye/i,items=(data.items||[]).filter(x=>pattern.test(x.title));live.replaceChildren(el('p','terminal-note',
          (items.length?'Eşleşen haber başlıkları · '+data.provider+' · '+date(data.fetchedAt):'Bu aramada eşleşen haber başlığı yok. Resmî/kurumsal kaynak bağlantısını kullanın.')+
          ' · '+(data.stale?'ESKİ ÖNBELLEK':'Gecikmeli RSS')+
          ' · Yalnız başlık ve bağlantı: temettü ödeme kaydı veya doğrulanmış analist raporu arşivi değildir.'));
        for(const item of items.slice(0,20)){if(!/^https:\/\//.test(item.url))continue;const row=el('article','company-headline'),a=el('a','terminal-link',item.title);a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,el('p','terminal-note',item.source+' · '+date(item.publishedAt)));live.append(row);}
      }catch(e){if(d.open)live.append(el('p','terminal-note','Haber kaynağı: '+e.message));}
    };
    if(kind==='financial'){
      const label=el('label','terminal-field','Finansal tablo JSON dosyası'),input=el('input');input.type='file';input.accept='.json,application/json';label.append(input);
      const status=el('p','terminal-note','Dosya seçilmedi.'),result=el('div','terminal-table-wrap');status.setAttribute('role','status');
      input.addEventListener('change',async()=>{result.replaceChildren();try{
        const f=input.files[0];if(!f)throw Error('Dosya seçilmedi.');if(f.size>950000)throw Error('Dosya 950 KB sınırını aşıyor.');
        let v;try{v=JSON.parse(await f.text());}catch{throw Error('Dosya geçerli JSON içermiyor.');}
        if(v?.symbol!==symbol||!Array.isArray(v.periods)||!v.periods.length||v.periods.length>24||!['balanceSheet','incomeStatement','cashFlow'].every(k=>Array.isArray(v[k])&&v[k].length<=200)||!/^https:\/\//.test(v.sourceUrl||'')||!v.asOf)throw Error('Şema: eşleşen symbol, sourceUrl, asOf, periods, balanceSheet, incomeStatement ve cashFlow gerekli.');
        for(const key of ['balanceSheet','incomeStatement','cashFlow'])for(const row of v[key])if(typeof row?.label!=='string'||!Array.isArray(row.values)||row.values.length!==v.periods.length||row.values.some(n=>n!==null&&(typeof n!=='number'||!Number.isFinite(n))))throw Error('Satırlar label ve dönem sayısı kadar sayısal values içermeli.');
        const fragment=document.createDocumentFragment();
        for(const [key,heading] of [['balanceSheet','Bilanço'],['incomeStatement','Gelir tablosu'],['cashFlow','Nakit akış tablosu']]){
          fragment.append(el('h3','',heading));const table=el('table','terminal-table'),head=el('tr');head.append(el('th','','Kalem'));for(const period of v.periods)head.append(el('th','',String(period)));table.append(head);
          for(const row of v[key]){const tr=el('tr');tr.append(el('td','',row.label));for(const value of row.values)tr.append(el('td','',num(value)));table.append(tr);}fragment.append(table);
        }result.append(fragment);status.setAttribute('role','status');status.textContent='Kullanıcı dosyası · içerik doğrulanmadı · '+v.sourceUrl+' · '+v.asOf+' · '+(v.currency||'Para birimi belirtilmedi');
      }catch(e){status.setAttribute('role','alert');status.textContent=e.message;}});
      body.append(label,status,action('↓ TABLO ŞEMASI',()=>offlineDownload('FINANSAL-TABLO-SABLONU.json','application/json',JSON.stringify({symbol,sourceUrl:'https://www.kap.org.tr/tr/arama',asOf:'YYYY-MM-DD',currency:'TRY',periods:['2025','2024'],balanceSheet:[],incomeStatement:[],cashFlow:[]},null,2))),result,action('SEKTÖREL ÇARPAN KARŞILAŞTIRMASI',()=>{d.close();legacyPanel('androidValuation');}));
    }
    d.append(action('‹ Geri',()=>d.close()),title,body);document.body.append(d);d.addEventListener('close',()=>{d.remove();if(focus?.isConnected&&!document.querySelector('dialog[open]')&&(document.activeElement===document.body||d.contains(document.activeElement)))focus.focus();},{once:true});d.showModal();
    if(!reference&&['financial','ownership'].includes(kind))loadOfficial();
    if(!reference&&['dividend','analyst'].includes(kind))loadHeadlines();
  }
  async function stockDetail(){
    if($('chartFrame'))$('chartFrame').style.height=Math.min(360,Math.max(260,Math.floor(Math.max(innerHeight,480)*.43)))+'px';
    const symbol=params.symbol||'ASELS';getUniverse().catch(()=>{});text('title',symbol);text('btnFavoriteDetail',favoriteSymbols().includes(symbol)?'★':'☆');bind('btnFavoriteDetail',()=>favorite(symbol));
    const quoteVersion=version;
    if(!reference)api('/api/stocks/quote?symbol='+encodeURIComponent(symbol)).then(q=>{
      if(version!==quoteVersion||screen!=='stock_detail'||q.symbol!==symbol||q.realtime!==false||q.delayed!==true||!Number.isFinite(q.price)||q.price<=0)return;
      AndroidStocks.quotes.set(symbol,q);paintDisplayQuote(symbol);
    }).catch(()=>{if(version===quoteVersion)text('liveConnectionStatus','Gecikmeli günlük fiyat alınamadı. Canlı veri bağlı değil.');});
    for(const [id,target] of [['btnTechnicalScreen','technical_analysis'],['btnNewsScreen','news'],['btnSignalScreen','signal_history']])bind(id,()=>navigateTo(target,{symbol,opportunity:params.opportunity}));
    // XML already defines the TradingView button. A deferred window.open
    // (via safe()->Promise.then) can be blocked by mobile popup policies.
    // Make that exact native control a normal, keyboard-friendly HTTPS link,
    // preserving its APK styling and original external-link drawable.
    const tvButton=$('btnTradingViewChart');
    if(tvButton){
      if(/^[A-Z0-9]{3,12}$/.test(symbol)){
        const tvLink=document.createElement('a');
        tvLink.id=tvButton.id;tvLink.dataset.apkId='btnTradingViewChart';
        tvLink.className=tvButton.className+' apk-action apk-tradingview-link';
        tvLink.dataset.apkInteractive='true';tvLink.style.cssText=tvButton.style.cssText;
        tvLink.style.display='flex';tvLink.style.flexDirection='row';
        tvLink.style.justifyContent='center';tvLink.style.alignItems='center';
        tvLink.style.gap='12px';tvLink.style.textDecoration='none';
        tvLink.href='https://www.tradingview.com/chart/?symbol='+encodeURIComponent('BIST:'+symbol);
        tvLink.target='_blank';tvLink.rel='noopener noreferrer';
        tvLink.setAttribute('aria-label',symbol+' TradingView grafiğini yeni sekmede aç');
        tvLink.title='Harici TradingView grafiği • piyasa verisi ve gecikme durumu TradingView tarafından belirlenir.';
        tvLink.append(...tvButton.childNodes);
        const icon=L.vector('@drawable/ic_open_external');
        if(icon){icon.style.flex='0 0 auto';tvLink.append(icon);}
        tvButton.replaceWith(tvLink);
      }else{tvButton.disabled=true;tvButton.title='Geçersiz BIST sembolü.';}
    }
    // All three detail tabs share ONE selected state. XML default colors are
    // initial-only; never leave the Grafik button highlighted when Plan is open.
    const detailTabs=[
      ['detailTabChart','detailChartSection'],
      ['detailTabTechnical','detailTechnicalSection'],
      ['detailTabPlan','detailPlanSection']
    ];
    function selectDetailTab(activeId){
      for(const [tabId,sectionId] of detailTabs){
        const tab=$(tabId),selected=tabId===activeId;
        show(sectionId,selected);
        if(!tab)continue;
        tab.dataset.detailActive=String(selected);
        tab.setAttribute('aria-selected',String(selected));
        tab.setAttribute('aria-pressed',String(selected));
        tab.setAttribute('role','tab');
        tab.tabIndex=selected?0:-1;
      }
    }
    for(const [tabId] of detailTabs){
      bind(tabId,()=>selectDetailTab(tabId));
      const tab=$(tabId);
      if(tab)tab.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const index=detailTabs.findIndex(([id])=>id===tabId);
        const target=event.key==='Home'?0:event.key==='End'?detailTabs.length-1:
          (index+(event.key==='ArrowRight'?1:-1)+detailTabs.length)%detailTabs.length;
        selectDetailTab(detailTabs[target][0]);$(detailTabs[target][0])?.focus();
      });
    }
    selectDetailTab('detailTabChart');
    bind('otherIndicatorsToggle',()=>show('advancedIndicatorRow',$('advancedIndicatorRow')?.hidden));bind('chartFullscreen',()=>navigateTo('fullscreen',{symbol,data:chartData}));
    // Each extended timeframe owns its own validated history and UI state.
    // These requests never replace the selected chart, and stale routes cannot paint.
    const detailVersion=version;
    const extendedFrames=[['expTrendFive','5m','5 Dakika'],['expTrendTen','10m','10 Dakika'],
      ['expTrendHour','60m','1 Saat'],['expTrendDaily','1d','Günlük'],
      ['expTrendWeekly','1w','Haftalık'],['expTrendMonthly','1mo','Aylık']];
    const extendedTickets=new Map();
    async function loadExtendedFrame(id,interval,label){
      const ticket=(extendedTickets.get(id)||0)+1;extendedTickets.set(id,ticket);
      const alive=()=>version===detailVersion&&screen==='stock_detail'&&extendedTickets.get(id)===ticket;
      text(id,label+' — Yükleniyor…');
      try{
        let source=OFFLINE_DB.get(OFFLINE_KEY('BIST',symbol,interval));
        if(!source||offlineSourceFamily(source)!=='USER_FILE')source=await BistYahooAuto.fetch(symbol,interval);
        if(!alive())return;
        if(source.symbol!==symbol||source.interval!==interval)throw Error('Sembol veya periyot eşleşmiyor');
        const bars=closedCandles(source);
        if(bars.length<220){text(id,label+' — Veri yetersiz: '+bars.length+'/220 kapanmış mum');return;}
        const series=calculateIndicators(bars,{intraday:!['1d','1w','1mo'].includes(interval)});
        const last=bars.at(-1),ema9=series.ema9?.at(-1),ema21=series.ema21?.at(-1);
        if(!Number.isFinite(ema9)||!Number.isFinite(ema21))throw Error('EMA hesaplanamadı');
        const direction=last.close>ema9&&ema9>ema21?'YÜKSELİŞ':last.close<ema9&&ema9<ema21?'DÜŞÜŞ':'YATAY / NÖTR';
        text(id,label+' — '+direction+' • '+bars.length+' mum • '+date(bars.at(-1).timestamp));
        const node=$(id);if(node)node.style.color=direction==='YÜKSELİŞ'?'#39ff85':direction==='DÜŞÜŞ'?'#ff526b':'#e6cb76';
      }catch(error){if(alive())text(id,label+' — Veri alınamadı: '+(error?.message||'Kaynak hatası'));}
    }
    for(const [id,tf,label] of extendedFrames){
      // A tap refreshes that individual card instead of switching the main chart.
      bind(id,()=>loadExtendedFrame(id,tf,label));
      if(!reference)loadExtendedFrame(id,tf,label);
    }
    let requestedInterval=settings.interval||'1d',loadNumber=0;
    const load=async interval=>{
      requestedInterval=interval;const token=++loadNumber,request=version;chartData=null;AndroidPriceChart.clear($('chart'));
      for(const [id,value] of Object.entries({graphSupport:'DESTEK —',graphResistance:'DİRENÇ —',supportDetail:'Destek —',resistanceDetail:'Direnç —',trendInfoPanel:'Veri bekleniyor',trendCard:'TREND\n—',momentumCard:'RSI 14 —\nMomentum 10 %—',macdCard:'MACD\n—',extraCard:'Stochastic 14 —\nCCI 20 —\nADX 14 —',metricRsi:'RSI 14\n—',metricAtr:'ATR 14\n—',metricVolume:'Hacim\n—',plainExplanation:'Seçilen periyodun gerçek verisi bekleniyor.'}))text(id,value);
      for(const [id,label] of [['expRsi','RSI (14)'],['expMacd','MACD (12,26,9)'],
        ['expStochastic','Stokastik %K (14)'],['expCci','CCI (20)'],['expAdx','ADX (14)'],
        ['expMomentum','Momentum (10)']])text(id,label+' — Yükleniyor…');
      for(const [id,label] of [['expRes3','Direnç 3'],['expRes2','Direnç 2'],['expRes1','Direnç 1'],
        ['expLastPrice','Son fiyat'],['expSup1','Destek 1'],['expSup2','Destek 2'],['expSup3','Destek 3']])text(id,label+' —');
      text('expLevelSource','Seçili zaman diliminin doğrulanmış kapanmış mumları bekleniyor.');
      show('chartUnavailablePanel',false);text('chartStatus','Gerçek OHLCV yükleniyor…');
      try{
        let data=OFFLINE_DB.get(OFFLINE_KEY('BIST',symbol,interval));
        if(!data||offlineSourceFamily(data)!=='USER_FILE')data=await BistYahooAuto.fetch(symbol,interval);
        if(request!==version||token!==loadNumber)return;
        if(data?.symbol!==symbol||data?.interval!==interval)throw Error('Sembol/periyot yanıtı seçili grafikle eşleşmedi.');
        chartData=data;paintStock(data);
      }catch(e){if(request!==version||token!==loadNumber)return;show('chartUnavailablePanel');text('chartUnavailableReason',e.message);text('chartStatus','Veri alınamadı');text('plainExplanation','Seçilen periyotta veri alınamadı.');
        for(const [id,label] of [['expRsi','RSI'],['expMacd','MACD'],['expStochastic','Stokastik'],['expCci','CCI'],['expAdx','ADX'],['expMomentum','Momentum']])text(id,label+' — Veri alınamadı');
        text('expLevelSource','Destek/direnç hesaplanamadı: '+e.message);
      }
    };
    for(const [id,tf] of [['quick5m','5m'],['quick10m','10m'],['quick1h','60m'],['quick1d','1d']])bind(id,()=>load(tf));
    for(const [id,tf] of [['trend5m','5m'],['trend15m','15m'],['trend1h','60m'],['trend1d','1d'],['tech5m','5m'],['tech10m','10m'],['tech1h','60m'],['tech1d','1d']])bind(id,()=>load(tf));
    bind('expNavGraph',()=>{selectDetailTab('detailTabChart');$('chart')?.scrollIntoView({behavior:'smooth'});});bind('expNavNews',()=>navigateTo('news',{symbol}));
    for(const [id,kind] of [['expNavCompany','company'],['expNavFinancial','financial'],['expNavDividend','dividend'],['expNavOwnership','ownership'],['expNavLegislation','legislation'],['expNavAnalyst','analyst']])bind(id,()=>companyPanel(kind,symbol));
    bind('btnChartRetry',()=>load(requestedInterval));bind('btnTimeframeMenu',()=>timeframeDialog(load));bind('btnDetailedCommentary',()=>message(chartData?readableText(chartData):'Gerçek veri gerekli.'));
    let refreshSideButtons=()=>{};
    for(const id of ['toggleEma9','toggleEma21','toggleSma50','toggleSma200','toggleVwap','toggleBollinger','toggleEma20','toggleEma50','toggleEma200','toggleTrend','toggleChannel','toggleSupportResistance']){
      const paint=()=>{const button=$(id);if(!button)return;const active=!!chartOptions[id];
        const palette={toggleEma9:'#30bcff',toggleEma21:'#ffd247',toggleSma50:'#b58dff',toggleSma200:'#ffb15c',toggleVwap:'#00e6a8',toggleBollinger:'#bac6da',toggleSupportResistance:'#00cda8'};
        button.style.background=active?(palette[id]||'#19c99f'):'#08293d';button.style.color=active?'#041827':'#d5e4f0';
        button.style.borderColor=active?'transparent':'#315167';button.setAttribute('aria-pressed',String(active));
        text(id,id==='toggleSupportResistance'?'S/D'+(active?' ✓':''):id.replace('toggle','').toUpperCase()+(active?' ✓':''));};
      bind(id,()=>{chartOptions[id]=!chartOptions[id];if(id==='toggleSupportResistance'){chartOptions.toggleSupport=chartOptions.toggleResistance=chartOptions[id];refreshSideButtons();}paint();if(chartData)drawChart($('chart'),chartData);});paint();
    }
    const nativeToggle=$('toggleSupportResistance'),toggleHost=nativeToggle?.parentElement;
    if(toggleHost){
      const entries=[['toggleSupport','DESTEK','#16f2a3'],['toggleResistance','DİRENÇ','#ff5b7f']];
      const built=[];
      for(const [name,label,color] of entries){
        const button=document.createElement('button');
        button.type='button';button.className='apk-node apk-Button apk-action apk-chart-level-button';
        button.dataset.apkId=name;button.id='apk-'+name;
        button.textContent=label;
        button.style.cssText='flex:0 0 auto;min-width:90px;min-height:48px;padding:0 10px;'+
          'border-radius:7px;border:1px solid #175775;font-size:13px;font-weight:700;cursor:pointer';
        toggleHost.insertBefore(button,name==='toggleSupport'?nativeToggle.nextSibling:null);
        const update=()=>{const on=chartOptions.toggleSupportResistance&&chartOptions[name];
          button.setAttribute('aria-pressed',String(!!on));button.style.background=on?color:'#08293d';
          button.style.color=on?'#042132':'#d6e9f5';button.textContent=label+(on?' ✓':'');};
        button.onclick=()=>{chartOptions[name]=!chartOptions[name];
          if(chartOptions[name])chartOptions.toggleSupportResistance=true;
          if(!chartOptions.toggleSupport&&!chartOptions.toggleResistance)chartOptions.toggleSupportResistance=false;
          update();refreshSideButtons();const master=$('toggleSupportResistance');
          if(master){const active=chartOptions.toggleSupportResistance;
            master.style.background=active?'#00cda8':'#08293d';master.style.color=active?'#041827':'#d5e4f0';master.setAttribute('aria-pressed',String(active));
            text('toggleSupportResistance','S/D'+(active?' ✓':''));}
          if(chartData)drawChart($('chart'),chartData);};
        built.push(update);
      }
      refreshSideButtons=()=>built.forEach(fn=>fn());refreshSideButtons();
    }
    bind('chartZoomIn',()=>AndroidPriceChart.zoom($('chart'),1.35));bind('chartZoomOut',()=>AndroidPriceChart.zoom($('chart'),1/1.35));
    if(!reference)load(params.interval||settings.interval||'1d');
  }
  function readableText(data){const bars=data.candles.map((b,i)=>({...b,closed:b.closed===true||(b.closed==null&&(i<data.candles.length-1||data.lastBarClosed===true))}));const x=BistStockAnalysis.readable(bars,data.interval,calculateIndicators);if(!x)return 'Açıklama için yeterli kapanmış veri yok.';return (x.direction==='RISING'?'Yükseliş':x.direction==='FALLING'?'Düşüş':'Kararsız')+' • '+x.period+'\nİncelenen fiyat '+num(x.examinedPrice)+' • Destek '+num(x.support)+' • Direnç '+num(x.resistance)+'\nRSI '+num(x.rsi,1)+' • Hacim oranı '+num(x.volumeRatio)+' • ATR %'+num(x.atrPercent);}
  // The publication audit is intentionally not a readable paragraph. Keep its
  // original lines available under an accessible disclosure; never replace
  // a blocked delayed-data decision with a fabricated LONG/SHORT signal.
  function paintPlan(opportunity,context){
    const host=$('overview');if(!host)return;
    host.classList.add('apk-plan-overview');
    host.replaceChildren();
    const plan=window.Build670Plan?.summarize(opportunity,context);
    if(!plan){host.append(el('div','apk-plan-notice','Plan açıklama bileşeni yüklenemedi. Kaynak uygulamayı yeniden açın.'));return;}
    const head=el('div','apk-plan-head');
    head.append(el('strong','apk-plan-headline',plan.title),el('span','apk-plan-state',plan.status));
    host.append(head);
    if(plan.hasScan){
      const metrics=el('div','apk-plan-metrics');
      for(const [label,value,kind] of [['Teknik puan',plan.technical,'technical'],['Risk',plan.risk,'risk'],['Veri güveni',plan.confidence,'confidence']]){
        const item=el('div','apk-plan-metric');
        item.append(el('span','apk-plan-metric-label',label),el('strong','apk-plan-metric-value',(Number.isFinite(value)?num(value,0):'—')+' / 100'));
        if(Number.isFinite(value)){
          const track=el('div','apk-plan-track');track.setAttribute('aria-hidden','true');
          const fill=el('div','apk-plan-fill apk-plan-fill-'+kind);fill.style.width=value+'%';track.append(fill);item.append(track);
        }
        metrics.append(item);
      }
      host.append(metrics,el('p','apk-plan-caption','Teknik puan, risk ve veri güveni farklı ölçümlerdir; hiçbiri tek başına AL/SAT onayı değildir.'));
    }
    const reasons=el('section','apk-plan-reasons');
    reasons.append(el('h3','apk-plan-subtitle',plan.hasScan?'Kararın gerekçeleri':'Plan durumu'));
    for(const card of plan.cards){
      const item=el('div','apk-plan-reason');
      item.append(el('strong','',card.title),el('p','',card.detail));
      reasons.append(item);
    }
    host.append(reasons);
    if(plan.notes.length){
      const notesBox=el('section','apk-plan-notes');notesBox.append(el('h3','apk-plan-subtitle','Veri ve hesaplama notları'));
      for(const message of plan.notes)notesBox.append(el('p','',message));
      host.append(notesBox);
    }
    if(plan.raw.length){
      const technical=el('details','apk-plan-audit');
      technical.append(el('summary','','Teknik ayrıntılar • '+plan.raw.length+' özgün kayıt'),el('pre','',plan.raw.join('\n')));
      host.append(technical);
    }
  }
  function paintStock(data){
    const bars=closedCandles(data),last=bars.at(-1),t=calculateIndicators(bars,{intraday:data.interval!=='1d'});if(!last)return;
    const frameNumber=Number(params.opportunity?.analysisTimeframeMinutes);
    const periodMatches=Number.isFinite(frameNumber)&&frameNumber>0&&data.interval===frameNumber+'m';
    const stamp=data.symbol+' • '+data.interval+' • '+data.source+' • '+bars.length+' kapanmış mum • '+date(last.timestamp);
    for(const [section,label] of [['detailChartSection','GRAFİK'],['detailTechnicalSection','TEKNİK'],['detailPlanSection','PLAN']]){
      const host=$(section);if(!host)continue;
      let note=host.querySelector('[data-chart-context]');if(!note){note=document.createElement('div');note.dataset.chartContext='true';note.className='apk-context-note';host.prepend(note);}
      note.textContent=label+' VERİ BAĞLAMI: '+stamp+(label==='PLAN'?' • Tarama planı '+(periodMatches?'aynı periyotta fakat ayrı hesaplama anındadır.':'ayrı veya doğrulanmamış periyottadır.')+' Plan canlı grafikle otomatik eşzamanlı AL/SAT onayı değildir.':' • Yalnız kapanmış mumlar teknik hesaplamada kullanılır.');
    }
        text('quoteCompany',universe?.records.find(x=>x.symbol===data.symbol)?.companyName||'Şirket adı doğrulanmadı');text('quotePrice',num(last.close)+' TL');text('quoteChange','Günlük değişim: —');
    text('dataBadge',offlineSourceFamily(data)==='YAHOO'?'GECİKMELİ':'KULLANICI DOSYASI');text('quoteSource',data.source+'\n'+date(last.timestamp));
    text('chartStatus',data.interval+' • '+bars.length+' kapanmış mum');show('chartUnavailablePanel',false);
    const current=x=>Array.isArray(x)?x.at(-1):x;
    text('metricRsi','RSI 14\n'+num(current(t.rsi),1));text('metricAtr','ATR 14\n'+num(current(t.atr)));text('metricVolume','Hacim\n'+num(last.volume,0));
    const opportunity=params.opportunity?.symbol===data.symbol?params.opportunity:null;
    const plan=window.Build670Plan?.summarize(opportunity,{symbol:data.symbol,periodMatches,lastVolume:last.volume});
    text('scoreSummary',opportunity?(periodMatches?'AYRI ANLIK TARAMA • ':'FARKLI/DOĞRULANMAMIŞ PERİYOT • ')+
      'Teknik '+(plan?.scoreLabel||'—')+'/100 • Risk '+(plan?.riskLabel||'—')+'/100 • Güven '+(plan?.confidenceLabel||'—')+'/100':'Seçili sembol için tarama planı yok • Grafik ayrı incelenebilir');
    text('validity',opportunity?'TARAMA KAYDI • Grafikle eşzamanlı değil • '+(opportunity.signalValidityReason||'Onaylı AL/SAT yok'):'Gecikmeli veri • Onaylı AL/SAT yok');
    paintPlan(opportunity,{symbol:data.symbol,periodMatches,lastVolume:last.volume});
    text('plainExplanation',readableText(data));
    drawChart($('chart'),data);
    paintDisplayQuote(data.symbol);
  }
  function paintDisplayQuote(symbol){
    const quote=AndroidStocks.quotes.get(symbol);if(!quote)return;const change=BistNativeMarket.change({},quote);
    // A delayed quote must never overwrite a selected intraday chart's price/context.
    const active=chartData?.symbol===symbol?closedCandles(chartData).at(-1):null;
    if(active){
      text('quotePrice',num(active.close)+' TL');
      text('quoteChange','Seçili '+chartData.interval+' kapanmış grafiğin fiyatı; günlük değişim ayrı veri setidir.');
      text('quoteSource',chartData.source+' • '+date(active.timestamp)+'\nAyrı gecikmeli gözlem: '+num(quote.price)+' TL • '+date(quote.timestamp));
    }else{
      text('quotePrice',num(quote.price)+' TL');text('quoteChange','Günlük değişim: '+(change==null?'—':(change>0?'+':'')+num(change)+'%'));
      text('quoteSource',quote.source+' • GECİKMELİ\nGünlük mum başlangıcı: '+date(quote.timestamp));
    }
    text('liveConnectionStatus','GECİKMELİ GÖZLEM • canlı fiyat değildir');text('liveQuote','Fiyat '+num(quote.price)+' TL');text('liveVolume','Günlük hacim '+num(quote.volume,0));text('liveDecision','Canlı işlem sinyali yok. Tarama kararı değiştirilmedi.');
  }
  function timeframeDialog(callback){
    const d=document.createElement('dialog');d.className='terminal-dialog';d.style.padding='16px';
    for(const [tf,label] of [['1m','1 DK'],['3m','3 DK'],['5m','5 DK'],['10m','10 DK'],['15m','15 DK'],['30m','30 DK'],['60m','1 SAAT'],['240m','4 SAAT'],['1d','1 GÜN'],['1w','1 HAFTA'],['1mo','1 AY'],['all','TÜMÜ']])d.append(action(label,()=>{d.close();callback(tf);}));
    d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal();
  }
  const chartOptions={toggleEma9:true,toggleEma21:true,toggleVwap:true,toggleEma20:false,toggleEma50:false,toggleEma200:false,toggleBollinger:false,toggleMacd:false,toggleTrend:false,toggleChannel:false,toggleSupportResistance:true,toggleSupport:true,toggleResistance:true};
  function drawChart(container,data){return AndroidPriceChart.mount(container,data,{options:chartOptions,onModel:m=>{
    if(screen!=='stock_detail'||chartData!==data)return;const e=m.extended,t=m.trend,l=m.levels;
    // Expanded indicators come from the exact same closed-candle chart model.
    const sourceBars=closedCandles(data),lastBar=sourceBars.at(-1);
    const ind=[['expRsi','RSI (14)',e.rsi14,1],['expMacd','MACD (12,26,9)',e.macd,4],
      ['expStochastic','Stokastik %K (14)',e.stochastic14,1],['expCci','CCI (20)',e.cci20,2],
      ['expAdx','ADX (14)',e.adx14,1],['expMomentum','Momentum (10)',e.momentum10Pct,2]];
    for(const [id,label,value,precision] of ind)text(id,label+' — '+(Number.isFinite(value)?num(value,precision):'Veri yetersiz'));
    text('expIndicatorSource',data.symbol+' • '+data.interval+' • '+data.source+' • '+sourceBars.length+' kapanmış mum • '+(lastBar?date(lastBar.timestamp):'Tarih yok'));
    const pivots=window.Build670ChartLevels?.compute(data.candles,{lastBarClosed:data.lastBarClosed})||{supports:[],resistances:[],reason:'UNAVAILABLE'};
    // Preserve Kotlin reference levels, then add confirmed pivot levels only.
    // Never invent a third value. The expanded table deliberately shares
    // the selected chart's context, rather than an unrelated scan result.
    const refPrice=lastBar?.close;
    const normalize=(kind)=>window.Build670ChartIntegrity?.mergeLevels(kind,refPrice,pivots[kind==='support'?'supports':'resistances'],l?.[kind],pivots.tolerance||0,3)||[];
    const res=normalize('resistance'),sup=normalize('support');
    for(const [items,ids,label] of [[res,['expRes1','expRes2','expRes3'],'Direnç'],[sup,['expSup1','expSup2','expSup3'],'Destek']])
      ids.forEach((id,i)=>text(id,label+' '+(i+1)+'    '+(items[i]?num(items[i].price)+' ['+(items[i].source.includes('KOTLIN')?'K':'P')+(items[i].source.includes('KOTLIN')&&items[i].source.includes('PIVOT')?'+P':'')+']':'—')));
    text('expLastPrice','Son fiyat    '+(Number.isFinite(refPrice)?num(refPrice):'—'));
    text('expLevelSource',data.symbol+' • '+data.interval+' • '+data.source+' • '+sourceBars.length+' kapanmış mum • '+(lastBar?date(lastBar.timestamp):'Tarih yok')+' • K=Kotlin referansı, P=teyitli pivot, K+P=birleşik bölge; fiyat doğrulaması harici veri kaynağıyla yapılmadı.');
    text('graphSupport','DESTEK '+num(sup[0]?.price));text('graphResistance','DİRENÇ '+num(res[0]?.price));
    text('supportDetail',sup[0]?'Destek '+num(sup[0].price)+' • '+sup[0].source:'Bu veri aralığında ek destek bulunamadı');
    text('resistanceDetail',res[0]?'Direnç '+num(res[0].price)+' • '+res[0].source:'Bu veri aralığında ek direnç bulunamadı');
    text('trendInfoPanel',(t.main?.direction||'Veri yok')+' • '+(t.main?.strength||'')+'\nDestek '+num(t.supportNow)+' • Direnç '+num(t.resistanceNow)+'\n'+t.breakout+' • '+t.volumeConfirmation);
    const direction=t.main?.direction||'Belirsiz',rsiText=Number.isFinite(e.rsi14)?num(e.rsi14,1):'—';
    const supportText=sup[0]?num(sup[0].price)+' ('+num((refPrice/sup[0].price-1)*100,1)+'% yukarıda)':'hesaplanamadı';
    const resistanceText=res[0]?num(res[0].price)+' ('+num((res[0].price/refPrice-1)*100,1)+'% aşağıda)':'hesaplanamadı';
    text('plainExplanation',
      'Fiyat nasıl hareket ediyor? '+direction+' • RSI (14): '+rsiText+' • '+sourceBars.length+' kapanmış mum.\n'+
      'Hangi seviyeler önemli? Destek '+supportText+'; direnç '+resistanceText+'.\n'+
      'Bu yorum ne zaman değişir? Kapanmış mum, RSI ve teyitli seviyeler değiştiğinde değerlendirme yenilenir.\n'+
      'Kısaca ne iş yapıyor? Şirket faaliyeti için doğrulanmış şirket bilgisi gerekir.\n'+
      'Neden ilgi görüyor? Haber gerekçesi doğrulanmadı; fiyat hareketinden haber uydurulmaz.\n'+
      'Dikkat: '+data.source+' • '+date(lastBar?.timestamp)+' • Gecikmeli/veri kaynağı durumunu kontrol edin.');
    text('trendCard','TREND\n'+(t.main?.direction||'Yeterli veri yok'));text('momentumCard','RSI 14 '+num(e.rsi14,1)+'\nMomentum 10 %'+num(e.momentum10Pct));text('macdCard','MACD\n'+num(e.macd,4));text('extraCard','Stochastic 14 '+num(e.stochastic14,1)+'\nCCI 20 '+num(e.cci20)+'\nADX 14 '+num(e.adx14,1));
  },onError:error=>{if(screen!=='stock_detail'||chartData!==data)return;
    const detail=String(error?.message||error||'Teknik analiz servisi başarısız');
    const bars=closedCandles(data),local=calculateIndicators(bars,{intraday:!['1d','1w','1mo'].includes(data.interval)});
    const take=key=>Array.isArray(local[key])?local[key].at(-1):null;
    for(const [id,label,key] of [['expRsi','RSI (14)','rsi'],['expMacd','MACD','macd'],['expStochastic','Stokastik','stochastic'],['expCci','CCI','cci'],['expAdx','ADX','adx'],['expMomentum','Momentum','momentum']]){
      const v=take(key);text(id,label+' — '+(Number.isFinite(v)?num(v,id==='expRsi'?1:3)+' • yerel gösterge (çekirdek doğrulanamadı)':'Hesaplanamadı • '+detail));
    }
    text('expLevelSource','Hesaplama servisi hatası: '+detail);text('chartStatus','Hesaplama hatası • '+detail);
  },onSelect:b=>text('chartStatus',date(b.timestamp)+' • A '+num(b.open)+' Y '+num(b.high)+' D '+num(b.low)+' K '+num(b.close)+' • H '+num(b.volume,0)),onFullscreen:()=>navigateTo('fullscreen',{symbol:data.symbol,data})});}
  function technical(){
    const routeVersion=version,x=params.opportunity||lastRows.find(x=>x.symbol===(params.symbol||state.symbol));
    technicalCleanup=AndroidTechnical.mount({get:$,text,L,item:nativeItem,opportunity:x,current:()=>version===routeVersion&&screen==='technical_analysis',api});
  }
  let newsRequest=0;
  async function newsScreen(category='all',force=false){
    for(const [id,cat] of [['newsAll','all'],['newsKap','kap'],['newsCompany','company'],['newsSector','sector'],['newsMarket','market']])bind(id,()=>newsScreen(cat));
    bind('newsRetry',()=>newsScreen(category,true));text('newsTitle',params.symbol?params.symbol+' • Haberler':'Haberler');
    const request=version,ticket=++newsRequest,list=app.querySelector('.apk-RecyclerView'),current=()=>request===version&&ticket===newsRequest&&screen==='news';if(!list||reference)return;
    list.replaceChildren();show('newsEmpty',false);show('newsProgress');show('newsRetry',false);text('newsStatus','Haber kaynağı kontrol ediliyor…');
    try{const data=await api('/api/news?'+new URLSearchParams({symbol:params.symbol||'',company:universe?.records.find(x=>x.symbol===params.symbol)?.companyName||'',category,force:force?'1':'0'}));if(!current())return;list.replaceChildren();for(const x of data.items)list.append(nativeItem('news',{newsHeadline:x.title,newsSource:x.source,newsTime:date(x.publishedAt),newsBadge:'RSS',newsSummary:'Haber bağlantısı • içerik bağımsız doğrulanmadı'},()=>window.open(x.url,'_blank','noopener')));show('newsEmpty',!data.items.length);show('newsProgress',false);show('newsRetry',!data.items.length);text('newsStatus',data.provider+' • '+(data.stale?'ESKİ ÖNBELLEK • Kaynak yenilenemedi':data.fromCache?'Önbellek':'Kaynak yenilendi')+' • '+date(data.fetchedAt)+' • İçerik doğrulanmadı');}catch(e){if(!current())return;list.replaceChildren();show('newsEmpty');show('newsProgress',false);show('newsRetry');text('newsStatus',e.message);}
  }
  function notifications(){
    const saved=BistTerminal.exportState();
    const notices=Array.isArray(saved?.notices)?saved.notices:[];
    text('notificationState',settings.notifications?'TERCİH AÇIK • ARKA PLAN DOĞRULANMADI':'TERCİH KAPALI');
    text('notificationRefresh','Yenileme aralığı: '+(Number.isInteger(settings.cadence)?settings.cadence:60)+' dk');
    text('notificationEmpty',notices.length
      ?notices.map(x=>date(x.at)+' • '+x.message).join('\n\n')
      :'Henüz kalıcı alarm olayı yok. Olaylar gerçek tarama sonuçlarından üretildiğinde burada saklanır.');
    show('notificationEmpty');
    text('tradingViewStatus','TradingView webhook sinyalleri alınamadı');
    text('tradingViewSignals','TradingView sinyalleri için doğrulanmış imzalı Production Backend bağlantısı gerekli.');
    bind('notificationSettings',()=>navigateTo('settings_detail',{mode:'notifications'}));
    bind('tradingViewRefresh',()=>message('İmzalı TradingView webhook bağlantısı doğrulanmadı; gecikmeli veriden canlı sinyal uydurulmadı.'));
  }
  function historyScreen(){
    const routeVersion=version;historyCleanup=AndroidHistory.mount({get:$,text,show,bind,item:nativeItem,api,current:()=>version===routeVersion&&screen==='signal_history'});
  }
  // This only describes verified connection metadata. It NEVER turns a configured
  // provider into a live data source or invents contracts, quotes or trade signals.
  function viopConnectionView(provider,ready){
    const backendReady=ready?.status==='ready'&&ready?.coreReady===true;
    const live=backendReady&&ready?.licensedProviderConnected===true&&
      provider?.connected===true&&provider?.authenticated===true;
    if(live)return {
      title:'VİOP • SAĞLAYICI BAĞLANTISI DOĞRULANDI',
      summary:'Sağlayıcı bağlantısı bildirildi; gerçek kontrat ve fiyat akışı ayrıca kontrol edilmelidir.',
      detail:'Bağlantı kaydı, doğrulanmış sözleşme ve canlı işlem sinyali yerine geçmez.'
    };
    const states={
      NOT_CONFIGURED:['VİOP • SAĞLAYICI KURULMADI','Yetkili VİOP fiyat ve sözleşme sağlayıcısı sunucuda yapılandırılmamış.'],
      INVALID_ENDPOINT_OR_ALLOWLIST:['VİOP • BAĞLANTI AYARI GEÇERSİZ','Sağlayıcı HTTPS adresi veya izin verilen alan adı listesi geçersiz.'],
      INVALID_CREDENTIAL_CONFIGURATION:['VİOP • ERİŞİM AYARI GEÇERSİZ','Sağlayıcı kimlik bilgileri eksik ya da kurallara uymuyor.'],
      UNVERIFIED_PROVIDER_CONNECTIVITY:['VİOP • BAĞLANTI DOĞRULANMADI','Sağlayıcı ayarları mevcut; ancak bağlantı ve yetkilendirme doğrulanmadı.']
    };
    const reason=typeof provider?.reason==='string'?provider.reason:'UNVERIFIED';
    const state=provider?states[reason]||['VİOP • DOĞRULAMA BEKLİYOR','Sağlayıcı bağlantısı doğrulanmadı.']:
      ['VİOP • DURUM ALINAMADI','Sağlayıcı durum sorgusu başarısız oldu; yeniden kontrol edin.'];
    return {title:state[0],summary:state[1],
      detail:(backendReady?'Web ve hesap motoru hazır. ':'Web/hesap motoru hazır oluşu doğrulanamadı. ')+
      'Gerçek VİOP fiyatı, kontratı ve AL/SAT sinyali gösterilmez. Sağlayıcı sunucu tarafında bağlanıp test edilmelidir.'};
  }
  function viop(){
    const routeVersion=version;
    let checkSequence=0;
    const current=()=>screen==='viop'&&version===routeVersion;
    const refreshProvider=async()=>{
      const ticket=++checkSequence;
      text('providerTitle','VİOP • BAĞLANTI KONTROL EDİLİYOR');
      text('providerStatus','Web ve veri sağlayıcısı durumu sorgulanıyor…');
      text('status','Gerçek kontrat/fiyat doğrulanmadan işlem sinyali gösterilmez.');
      const responses=await Promise.allSettled([api('/api/provider/status'),api('/ready')]);
      if(!current()||ticket!==checkSequence)return;
      const provider=responses[0].status==='fulfilled'?responses[0].value:null;
      const ready=responses[1].status==='fulfilled'?responses[1].value:null;
      const view=viopConnectionView(provider,ready);
      text('providerTitle',view.title);
      text('providerStatus',view.summary);
      text('status',view.detail);
      text('providerLastUpdate','Son kontrol: '+new Intl.DateTimeFormat('tr-TR',{
        timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',
        hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false
      }).format(Date.now())+' • Durum bilgisi, canlı fiyat akışı değildir.');
      show('providerLastUpdate');
    };
    bind('openContracts',()=>navigateTo('viop_contracts'));bind('openAnalysis',()=>navigateTo('viop_analysis'));bind('openSignals',()=>navigateTo('signal_history'));
    bind('refresh',refreshProvider);bind('openExpiries',()=>navigateTo('viop_contracts'));
    for(const id of ['filterAll','filterLong','filterShort','filterIndex','filterFx','filterCommodity','filterRate','viopSort'])bind(id,()=>text('signalSummary','Bu filtrede doğrulanmış canlı sözleşme yok.'));
    bind('viopEmptyAction',()=>navigateTo('settings_detail',{mode:'data_connection'}));
    return refreshProvider();
  }
  async function contracts(category='ALL'){
    const mapping={viopBist30:'BIST30',viopFx:'FX',viopCommodity:'COMMODITY',viopOther:'OTHER'};
    for(const [id,c] of Object.entries(mapping))bind(id,()=>contracts(c));
    bind('viopAddButton',()=>legacyPanel('ledgerPanel'));
    const query=$('viopSearch'),list=$('viopContractsList');if(!list||reference)return;
    const load=async()=>{const request=version;const data=await api('/api/viop/catalog?'+new URLSearchParams({query:query?.value||'',category}));if(request!==version)return;list.replaceChildren();for(const x of data.contracts)row(list,x.underlying+' • '+x.expiry,'Dayanak/vade referansı • gerçek kontrat/fiyat değil',()=>navigateTo('viop_detail',{contract:x}));text('viopStatus',data.contracts.length+' dayanak/vade referansı • fiyat içermez');text('viopWatchCount','0');};
    let timer;query?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(safe(load),250);});await load();
  }
  function viopAnalysis(){
    text('analysisSource','Sağlayıcı sözleşmeleri · tüm vadeler');text('analysisCount','0 / 0 sözleşme');show('analysisEmpty');text('analysisEmptyTitle','VİOP bağlantısı gerekli');text('analysisEmptyMessage','Gerçek VİOP sözleşme listesi için veri sağlayıcı bağlantısını kurun. BIST dayanakları ve yerel örnekler bu listeye eklenmez.');text('analysisEmptyAction','Bağlantı ayarları');
    const picker=$('analysisExpiry');if(picker){picker.replaceChildren(el('option','','Tüm vadeler'));picker.value='Tüm vadeler';picker.style.fontSize='12px';}
    if($('analysisAll'))$('analysisAll').style.color=L.value('@color/market_mint');
    bind('analysisRefresh',viopAnalysis);bind('analysisClear',()=>{$('analysisSearch').value='';viopAnalysis();});
    for(const id of ['analysisAll','analysisFutures','analysisOptions'])bind(id,()=>{for(const key of ['analysisAll','analysisFutures','analysisOptions'])if($(key))$(key).style.color=key===id?'#00ec91':'#a7c2c8';text('analysisCount','0 / 0 sözleşme');});
  }
  function viopDetail(){
    const c=params.contract;
    const selected=Boolean(c&&typeof c.underlying==='string'&&typeof c.expiry==='string');
    text('viopDetailSubtitle',selected?c.underlying+' • '+c.expiry:'Seçili sözleşme yok');
    text('viopDataState',selected?'VERİ DOĞRULANMADI':'VERİ YOK');
    text('viopContractBody',selected?JSON.stringify(c,null,2):'Önce VİOP sözleşmeleri ekranından sözleşme seçin.');
    text('viopDetailStatusMessage',selected
      ?'Dayanak/vade referansı, gerçek VİOP kontratı veya fiyatı değildir.'
      :'VİOP sözleşmeleri ekranından bir sözleşme seçin.');
    text('viopChartTitle',selected?'GRAFİK • VERİ BEKLENİYOR':'VİOP • 5 DAKİKA • VERİ YOK');
    for(const [id,section] of [['viopTabChart','viopGraphSection'],['viopTabDepth','viopDepthSection'],['viopTabSignal','viopSignalSection'],['viopTabContract','viopContractSection']])bind(id,()=>{for(const s of ['viopGraphSection','viopDepthSection','viopSignalSection','viopContractSection'])show(s,s===section);});
    for(const id of ['viopActionLong','viopActionShort'])bind(id,()=>legacyPanel('ledgerPanel'));
    bind('viopActionWatch',()=>message('Bu dayanak referansı izlenebilir; gerçek kontrat ve işlem onayı değildir.'));
    for(const id of ['viopTf1m','viopTf3m','viopTf5m','viopTf15m','viopTf1h','viopTf4h','viopTf1d'])bind(id,()=>text('viopChartTitle','Bu periyotta doğrulanmış VİOP geçmişi yok.'));
  }
  let instrumentRequest=0;
  async function instrumentDetail(){
    const key=params.key||'XU100',request=++instrumentRequest,routeVersion=version,current=()=>request===instrumentRequest&&routeVersion===version&&screen==='market_instrument_detail'&&(params.key||'XU100')===key;
    text('marketDetailTitle',key);bind('marketDetailRefresh',()=>instrumentDetail());if(reference)return;
    text('marketDetailValue','—');text('marketDetailChange','—');text('marketDetailMeta','Veri yükleniyor…');text('marketDetailStats','');
    try{const x=await api('/api/instruments/'+key);if(!current())return;if(x.key!==key)throw Error('Piyasa aracı kaynak kimliği uyuşmuyor.');text('marketDetailValue',num(x.price)+' '+x.currency);text('marketDetailChange',num(x.changePct)+'%');text('marketDetailMeta',x.provider+' • '+x.ticker+' • '+date(x.asOf));text('marketDetailStats',x.candles.length+' günlük gözlem • canlı fiyat değildir');}catch(e){if(current())text('marketDetailMeta',e.message);}
  }
  function info(){text('infoTitle','BIST / VİOP');text('infoBody','Referans APK: V6.3.45 BUILD670\nWeb hesaplama çekirdeği V5.4.1\nAktarımın bütün ekran ve servislerde birebirliği henüz onaylanmadı.');}
  function programmatic(name,p){
    if(name==='fullscreen'){AndroidFullscreen.render(app,{params:p,back:goBack,navigate:navigateTo,reference});return;}
    if(['cheap','universe','delayed'].includes(name)){AndroidProgrammatic.render(name,app,{settings,save,navigate:navigateTo,back:goBack,message,legacyPanel,startScan,api,job:()=>BistTerminal.job,watch:watchedSymbols,reference});return;}
    const root=el('div','apk-node apk-ScrollView');root.style.cssText='height:100%;overflow:auto;padding:15px;background:'+(name==='cheap'?'#f6f9fd':'#001b2b');if(name==='cheap')root.style.color='#14243a';app.append(root);
  }
  function schedule(){clearInterval(autoTimer);if(settings.auto)autoTimer=setInterval(()=>{if(!document.hidden&&settings.delayed&&!['RUNNING','QUEUED','CANCELLING'].includes(BistTerminal.job?.status))safe(startScan)();},settings.cadence*60000);}
  async function boot(){
    const response=await fetch('/android-resources.json');if(!response.ok)throw Error('APK yerleşim kaynakları yüklenemedi.');L.load(await response.json());
    for(let i=0;i<200&&!window.__BIST_TERMINAL_BOOTED;i++)await new Promise(r=>setTimeout(r,50));
    const [initial,query]=location.hash.slice(1).split('?'),initialParams=Object.fromEntries(new URLSearchParams(query||''));
    const initialScreen=L.resources.layouts['activity_'+initial]||['cheap','universe','delayed','fullscreen'].includes(initial)?initial:'main';
    render(initialScreen,initialParams,false);recordRoute(initialScreen,initialParams,true);
    addEventListener('popstate',event=>{routeDepth=event.state?.depth||0;const [name,q]=location.hash.slice(1).split('?');render(event.state?.screen||name||'main',event.state?.params||Object.fromEntries(new URLSearchParams(q||'')),false);});
    addEventListener('keydown',event=>{if(event.key==='Escape'&&screen==='fullscreen'&&!document.querySelector('dialog[open]')){event.preventDefault();goBack();}});
    schedule();window.__BIST_ANDROID_UI_READY=true;
    window.BistAndroid={navigate:navigateTo,get screen(){return screen;},get params(){return params;},drawChart,reference,
      reloadSettings(){settings=loadPreferences();schedule();recoveryNotice();},
      coverage(){return {screen,xmlSource:!['cheap','universe','delayed','fullscreen'].includes(screen),unboundButtons:[...app.querySelectorAll('[data-apk-interactive=true]')].filter(x=>x.getClientRects().length&&!x.classList.contains('apk-action')&&!x.onclick&&!x.disabled).map(x=>x.dataset.apkId||x.textContent)};}};
    recoveryNotice();let previous='';
    setInterval(()=>{const job=BistTerminal.job;if(!job)return;const current=job.id+job.status+job.processed;if(current===previous)return;previous=current;jobStatus();if(screen==='bist_scan')openCompletedScanResults(job);if(['scan_results','opportunity'].includes(screen))safe(loadRows)();if(screen==='main'){homeRows();safe(refreshHomeRows)();}},2000);
  }
  boot().catch(e=>{app.replaceChildren(el('div','apk-error',e.message));});
})();
