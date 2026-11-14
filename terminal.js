/* Same-origin web adapters for Android-core scans and browser-local journals. */
(() => {
  'use strict';
  const by=id=>document.getElementById(id),node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=String(text);return e;};
  const number=(x,d=2)=>Number.isFinite(x)?new Intl.NumberFormat('tr-TR',{maximumFractionDigits:d,minimumFractionDigits:d}).format(x):'—';
  const date=x=>Number.isFinite(x)&&x>0?new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(x):'—';
  const storage={ledger:'bist_viop_ledger_v1',history:'bist_core_scan_history_v1',notifications:'bist_notice_history_v1',settings:'bist_terminal_settings_v1',android:'bist_build670_settings',signals:'bist_build670_signal_history'};
  const read=(key,fallback)=>{const raw=localStorage.getItem(key);if(raw==null)return fallback;return JSON.parse(raw);};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const api=async(path,body)=>{const response=await fetch(path,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});let data;try{data=await response.json();}catch{throw Error('HTTP '+response.status+': sunucu geçerli JSON yanıtı döndürmedi.');}if(!response.ok)throw Error((data?.error||'İstek başarısız')+' (HTTP '+response.status+')');return data;};
  const safe=fn=>(...args)=>Promise.resolve().then(()=>fn(...args)).catch(e=>toast(e.message||String(e)));
  const click=(id,fn)=>by(id).addEventListener('click',safe(fn));
  const option=(value,label)=>{const e=node('option','',label);e.value=value;return e;};
  const button=(text,fn,cls='btn-secondary')=>{const e=node('button',cls,text);e.type='button';e.addEventListener('click',safe(fn));return e;};
  const link=(label,url)=>{const e=node('a','terminal-link',label);e.href=url;e.target='_blank';e.rel='noopener noreferrer';return e;};
  const filters={ALL:'Tüm sonuçlar',A_CLASS:'A sınıfı',BREAKOUT:'Kırılım',REVERSAL:'Dipten dönüş',SQUEEZE:'Sıkışma',PULLBACK:'Geri çekilme',VOLUME:'Hacim ≥ 1,5×',TREND:'Trend',LONG:'Doğrulanmış LONG',SHORT:'Doğrulanmış SHORT',HIGH_POWER:'Doğrulanmış yüksek güç'};
  let universe=null,job=null,pageNumber=1,pageData=null,pollTimer=null,polling=false,requestVersion=0,directoryPage=1,completedSaved=null;
  let history=[],notices=[],ledger=[],ledgerError=null,settings={};
  let instrumentData=null,catalogVersion=0;
  try{history=read(storage.history,[]);if(!Array.isArray(history))throw Error();history=history.slice(0,20);}catch{history=[];}
  try{notices=read(storage.notifications,[]);if(!Array.isArray(notices))throw Error();notices=notices.slice(0,100);}catch{notices=[];}
  try{settings=read(storage.settings,{});if(!settings||Array.isArray(settings)||typeof settings!=='object')settings={};}catch{settings={};}
  try{ledger=ViopLedger.validate(read(storage.ledger,[]));}catch{ledgerError='İşlem defteri okunamadı. Eski kayıt korunuyor; risk sıfır kabul edilmedi. Verilerinizin yedeğini alın.';}

  function mountScanner(){
    const section=by('page-scanner'),head=section.querySelector('.section-head');
    head.querySelector('.eyebrow').textContent='ANDROID HESAPLAMA ÇEKİRDEĞİ';
    head.querySelector('h1').textContent='BIST fırsat tarayıcı';
    head.querySelector('p').textContent='Geniş hisse listesi, kaynaklı veriler ve açıklanabilir teknik gözlemler. Android V5.4.1 hesaplama sınıfları sunucuda çalışır.';
    by('refreshScanner').hidden=true;
    const legacy=node('details','terminal-research');legacy.id='researchScanner';
    legacy.append(node('summary','','Yerel CSV, araştırma filtreleri, MTF laboratuvarı ve geçmiş veri deneyleri'));
    const legacyBody=node('div');while(head.nextSibling)legacyBody.append(head.nextSibling);legacy.append(legacyBody);
    const primary=node('div');primary.id='coreScanner';
    primary.innerHTML='<div class="terminal-stat-grid"><div class="terminal-stat"><strong id="coreUniverseCount">—</strong><span>Keşfedilen hisse</span></div><div class="terminal-stat"><strong id="coreProcessed">0</strong><span>İşlenen / taranan</span></div><div class="terminal-stat"><strong id="coreSuccess">0</strong><span>Teknik sonuç</span></div><div class="terminal-stat"><strong id="coreIssues">0</strong><span>Eksik veri / hata</span></div></div><div class="terminal-panel"><div class="terminal-title"><div><div class="terminal-kicker">TARAMA ÇALIŞMA ALANI</div><h2>Piyasayı tek listede inceleyin</h2></div><span class="terminal-chip warn">YAHOO · GECİKMELİ</span></div><div class="terminal-panel-body"><div class="terminal-toolbar"><label class="terminal-field">Hisse kapsamı<select id="coreScope"><option value="discovered">Keşfedilen hisse evreni</option><option value="selected">Seçtiğim hisseler</option></select></label><label class="terminal-field">Mum periyodu<select id="coreInterval"></select></label><label class="terminal-field">Android sonuç filtresi<select id="coreFilter"></select></label><div class="terminal-actions"><button type="button" class="btn-primary" id="coreRun">Taramayı başlat</button><button type="button" class="btn-secondary" id="coreCancel" disabled>Durdur</button></div></div><label class="terminal-field terminal-controls-extra" id="coreSymbolsLabel" hidden>Semboller · virgül veya boşluk ile ayırın<textarea id="coreSymbols" maxlength="20000" placeholder="ASELS, THYAO, TUPRS, GARAN"></textarea></label><p class="terminal-note" id="coreSourceNote">Hisse listesi yükleniyor…</p><div id="coreError" class="terminal-error" role="alert" hidden></div></div><div class="terminal-progress"><span id="coreJobStatus" class="terminal-progress-status" role="status">Hazır · en az 220 kapanmış mum gerekir. Yahoo verisi işlem sinyali üretmez.</span><progress id="coreProgress" max="100" value="0" aria-label="Tarama ilerlemesi"></progress><div class="terminal-counts"><span><strong id="coreOkCount">0</strong>sonuç</span><span><strong id="coreInsufficientCount">0</strong>yetersiz</span><span><strong id="coreErrorCount">0</strong>hata</span></div></div></div><div class="terminal-panel" id="coreResultsPanel"><div class="terminal-title"><div><div class="terminal-kicker">AYRI PUANLAR · AÇIK GEREKÇELER</div><h2>Tarama sonuçları <span id="coreResultCount"></span></h2></div><button type="button" class="btn-secondary" id="coreExport" disabled>↓ JSON raporu</button></div><div class="terminal-table-wrap"><table class="terminal-table"><thead><tr><th>HİSSE / KAYNAK</th><th class="number">KAPANIŞ ₺</th><th class="number">TEKNİK</th><th class="number">RİSK</th><th class="number">GÜVEN</th><th class="number">RSI / HACİM</th><th>DURUM / GEREKÇE</th></tr></thead><tbody id="coreRows"></tbody></table></div><div class="terminal-empty" id="coreEmpty"><strong>Bir sonraki gözleminizi veriye dayandırın.</strong>Hisse evrenini ve mum periyodunu seçip taramayı başlatın.<br>Eksik geçmiş ve sağlayıcı hataları ayrı gösterilir.</div><div class="terminal-pagination"><span id="corePageLabel">Sayfa 0 / 0</span><div class="terminal-actions"><button type="button" class="btn-secondary" id="corePrev" disabled>← Önceki</button><button type="button" class="btn-secondary" id="coreNext" disabled>Sonraki →</button></div></div></div><details class="terminal-research" id="coreFailureDetails" hidden><summary id="coreFailureSummary">Veri hataları</summary><div id="coreFailureList" class="terminal-note"></div></details>';
    section.append(primary,legacy);
    for(const [value,label] of [['1m','1 dakika'],['3m','3 dakika'],['5m','5 dakika'],['10m','10 dakika'],['15m','15 dakika'],['30m','30 dakika'],['60m','1 saat'],['1d','1 gün']])by('coreInterval').append(option(value,label));
    by('coreInterval').append(option('custom','Özel dakika…'));
    by('coreInterval').value=settings.interval||'1d';
    const custom=node('label','terminal-field terminal-controls-extra');custom.id='coreCustomLabel';custom.hidden=true;custom.append(node('span','','Özel periyot · 1–239 dakika'));const customInput=node('input');customInput.id='coreCustomMinutes';customInput.type='number';customInput.min='1';customInput.max='239';customInput.value='7';custom.append(customInput);by('coreSymbolsLabel').before(custom);
    for(const [value,label] of Object.entries(filters))by('coreFilter').append(option(value,label));
    by('coreScope').addEventListener('change',()=>{by('coreSymbolsLabel').hidden=by('coreScope').value!=='selected';updateRunLabel();});
    by('coreInterval').addEventListener('change',()=>{by('coreCustomLabel').hidden=by('coreInterval').value!=='custom';if(by('coreInterval').value!=='custom')settings.interval=by('coreInterval').value;try{write(storage.settings,settings);}catch{}});
    by('coreFilter').addEventListener('change',safe(async()=>{pageNumber=1;await refreshResults();}));
    click('coreRun',startScan);click('coreCancel',async()=>{if(job){job=await api('/api/scans/'+job.id+'/cancel',{});renderJob();}});
    click('corePrev',async()=>{pageNumber=Math.max(1,pageNumber-1);await refreshResults();});
    click('coreNext',async()=>{pageNumber++;await refreshResults();});
    click('coreExport',exportScan);
  }
  function updateRunLabel(){by('coreRun').textContent=by('coreScope').value==='discovered'?(universe?.count||'Geniş')+' hisseyi tara':'Seçili hisseleri tara';}
  function error(message){by('coreError').hidden=!message;by('coreError').textContent=message||'';}
  async function startScan(){
    error('');const payload={scope:by('coreScope').value,interval:by('coreInterval').value};
    if(payload.interval==='custom'){const minutes=Number(by('coreCustomMinutes').value);if(!Number.isInteger(minutes)||minutes<1||minutes>239){error('Özel periyot 1–239 dakika olmalı.');return;}payload.interval=minutes+'m';}
    if(payload.scope==='selected'){payload.symbols=[...new Set(by('coreSymbols').value.toUpperCase().split(/[\s,;]+/).filter(Boolean))];if(!payload.symbols.length){error('En az bir sembol girin.');return;}}
    by('coreRun').disabled=true;
    try{job=await api('/api/scans',payload);pageNumber=1;completedSaved=null;sessionStorage.setItem('bist_core_job',job.id);renderJob();await poll();}
    catch(e){by('coreRun').disabled=false;error(e.message);}
  }
  function renderJob(){
    if(!job)return;const active=['QUEUED','RUNNING','CANCELLING'].includes(job.status);
    by('coreRun').disabled=active;by('coreCancel').disabled=!active||job.status==='CANCELLING';by('coreExport').disabled=!job.processed;
    by('coreProcessed').textContent=job.processed+' / '+job.total;by('coreSuccess').textContent=job.successful;by('coreIssues').textContent=job.insufficient+job.errors;
    by('coreOkCount').textContent=job.successful;by('coreInsufficientCount').textContent=job.insufficient;by('coreErrorCount').textContent=job.errors;
    by('coreProgress').value=job.total?job.processed/job.total*100:0;
    const labels={QUEUED:'Sırada',RUNNING:'Taranıyor',CANCELLING:'Durduruluyor',CANCELLED:'Durduruldu',COMPLETE:'Tarama bitti',COMPLETED_WITH_ERRORS:'Tarama bitti · veri hataları var',FAILED:'Tarama başarısız'};
    by('coreJobStatus').textContent=(labels[job.status]||job.status)+' · '+job.processed+'/'+job.total+' hisse · '+job.interval+' · '+date(job.createdAt);
    by('coreFailureDetails').hidden=!job.failures?.length;
    by('coreFailureSummary').textContent=(job.failures?.length||0)+' hisse için veri sorunu';
    const failureList=by('coreFailureList');failureList.replaceChildren();
    for(const f of job.failures||[])failureList.append(node('div','',f.symbol+' · '+f.error));
    if(job.benchmarkError)failureList.append(node('div','','XU100 piyasa rejimi verisi alınamadı: '+job.benchmarkError));
    if(job.error)error(job.error);
  }
  async function poll(){
    clearTimeout(pollTimer);if(!job||polling)return;polling=true;
    try{job=await api('/api/scans/'+job.id);renderJob();await refreshResults();if(!['QUEUED','RUNNING','CANCELLING'].includes(job.status))saveCompleted();}
    catch(e){error(e.message);}
    finally{polling=false;if(job&&['QUEUED','RUNNING','CANCELLING'].includes(job.status))pollTimer=setTimeout(poll,2500);}
  }
  async function refreshResults(){
    if(!job)return;const version=++requestVersion;
    const data=await api('/api/scans/'+job.id+'/results?'+new URLSearchParams({filter:by('coreFilter').value,page:pageNumber,size:25}));
    if(version!==requestVersion)return;pageData=data;const body=by('coreRows');body.replaceChildren();
    for(const row of data.results){
      const tr=node('tr'),symbol=node('td');const open=button(row.symbol,()=>showOpportunity(row),'row-open');
      symbol.append(open,node('small','',row.companyName||'Şirket adı eşleşmedi'),node('small','',row.closedBarCount+' kapanmış mum · '+date(row.dataTimestamp)));tr.append(symbol);
      for(const value of [number(row.price),row.score+'/100',row.riskScore+'/100',row.dataConfidenceScore+'/100',number(row.technical?.rsi14,1)+' / '+number(row.technical?.volumeRatio,2)+'×'])tr.append(node('td','number',value));
      const reason=node('td','reason-cell');reason.append(node('span','terminal-chip '+(row.signalValidity==='INSUFFICIENT'?'warn':'muted'),row.signalValidity==='INSUFFICIENT'?'YETERSİZ VERİ':'GECİKMELİ GÖZLEM'));
      reason.append(node('small','',row.presentation?.reasons?.join(' · ')||row.signalValidityReason));tr.append(reason);body.append(tr);
    }
    const pages=Math.ceil(data.total/25);by('coreEmpty').hidden=data.results.length>0;
    if(!data.results.length)by('coreEmpty').textContent=job.processed?by('coreFilter').value==='ALL'?'Henüz teknik sonuç yok. Veri hatalarını inceleyin.':'Bu Android filtresine uyan sonuç yok. LONG/SHORT/yüksek güç yalnız doğrulanmış anlık sinyalleri kabul eder.':'Veriler alınırken sonuçlar burada görünecek.';
    by('coreResultCount').textContent=data.total?'· '+data.total:'';
    by('corePageLabel').textContent='Sayfa '+(pages?pageNumber:0)+' / '+pages+' · '+data.total+' sonuç';
    by('corePrev').disabled=pageNumber<=1;by('coreNext').disabled=pageNumber>=pages;
  }
  function saveCompleted(){
    if(completedSaved===job.id)return;completedSaved=job.id;
    const entry={id:job.id,createdAt:job.createdAt,completedAt:job.completedAt,status:job.status,total:job.total,processed:job.processed,successful:job.successful,insufficient:job.insufficient,errors:job.errors,interval:job.interval};
    history=[entry,...history.filter(x=>x.id!==job.id)].slice(0,20);
    try{write(storage.history,history);}catch{toast('Tarama geçmişi saklanamadı; raporu indirin.');}renderHistory();
    // Delayed Yahoo WATCH observations are not attested AL/SAT signals.
    // Their scan summary/results remain in scan history; do NOT append hundreds
    // of unverified rows to the limited browser-owned signal journal.
    if(job.signalAttestationVerified===true)
      window.AndroidHistory?.recordJob(job).catch(e=>toast('Sinyal geçmişi kaydedilemedi: '+e.message));
  }
  async function exportScan(){
    if(!job)return;const results=[];let page=1,total=Infinity;
    while(results.length<total){const data=await api('/api/scans/'+job.id+'/results?'+new URLSearchParams({filter:by('coreFilter').value,page,size:100}));results.push(...data.results);total=data.total;if(!data.results.length)break;page++;}
    offlineDownload('BIST-ANDROID-TARAMA-'+job.id.slice(0,8)+'.json','application/json',JSON.stringify({schemaVersion:1,job,filter:by('coreFilter').value,universe:{count:universe?.count,discoverySource:universe?.discoverySource,identitySource:universe?.identitySource},results},null,2));
  }
  const dialog=node('dialog','terminal-dialog');dialog.id='terminalDialog';document.body.append(dialog);
  function showDialog(title,content,actions=[]){
    dialog.replaceChildren();const head=node('div','terminal-dialog-head');head.append(node('h2','',title),button('Kapat ×',()=>dialog.close()));
    const body=node('div','terminal-dialog-body');body.append(content);if(actions.length){const group=node('div','terminal-actions');group.style.marginTop='16px';group.append(...actions);body.append(group);}dialog.append(head,body);
    if(!dialog.open)dialog.showModal();
  }
  dialog.addEventListener('click',e=>{if(e.target===dialog&&e.offsetX<0)dialog.close();});
  function showOpportunity(row){
    const content=node('div'),stats=node('div','terminal-stat-grid');
    for(const [value,label] of [[number(row.price),'Kapanmış mum fiyatı'],[row.score+'/100','Teknik gözlem'],[row.riskScore+'/100','Risk'],[row.dataConfidenceScore+'/100','Veri güveni']]){const stat=node('div','terminal-stat');stat.append(node('strong','',value),node('span','',label));stats.append(stat);}content.append(stats);
    content.append(node('p','terminal-note',(row.companyName||row.symbol)+' · '+row.interval+' · '+row.closedBarCount+' kapanmış mum · '+date(row.dataTimestamp)));
    content.append(node('p','terminal-note',row.signalValidityReason));
    const explain=node('div','terminal-explanation');
    for(const [title,values] of [['Teknik gerekçeler',row.presentation?.reasons||[]],['Veri ve risk denetimi',[...(row.signalReasonCodes||[]),row.mtfConsensusLabel,'Sinyal puanı: '+row.signalScore+' · sıralama: '+row.rankingStatus]]]){
      const group=node('div');group.append(node('h3','',title));const ul=node('ul');for(const value of values)ul.append(node('li','',value));group.append(ul);explain.append(group);
    }
    content.append(explain);const detail=node('details');detail.append(node('summary','terminal-note','Bileşen puanları ve hesaplama izi'),node('pre','',(row.scoreBreakdown||[]).join('\n')));content.append(detail);
    if(row.strategies?.length){const strategies=node('div');strategies.append(node('h3','','Android strateji karşılaştırması'));for(const s of row.strategies)strategies.append(node('p','terminal-note',s.id+' · '+s.score+'/100 · '+s.reason));content.append(strategies);}
    content.append(node('p','terminal-note','Girdi SHA-256: '+(row.inputSha256||'—')));
    const actions=[button('Grafikte incele ↗',()=>{dialog.close();openSymbol(row.symbol,'BIST',job?.interval||'1d');},'btn-primary'),button(state.watch.includes(row.symbol)?'Favorilerde ★':'Favoriye ekle ☆',()=>toggleFavorite(row.symbol))];
    if(row.kapUrl)actions.push(link('KAP şirket bilgileri ↗',row.kapUrl));showDialog(row.symbol+' · Teknik gözlem',content,actions);
  }
  function toggleFavorite(symbol){
    if(state.watch.includes(symbol))state.watch=state.watch.filter(s=>s!==symbol);
    else{if(state.watch.length>=30)throw Error('Favori sınırı 30 hisse.');state.watch.push(symbol);}
    store();renderFavorites();renderDirectory();toast(symbol+(state.watch.includes(symbol)?' favorilere eklendi.':' favorilerden çıkarıldı.'));
  }
  function mountDirectory(){
    const workspace=node('div','terminal-panel');workspace.id='stockDirectory';
    workspace.innerHTML='<div class="terminal-title"><div><div class="terminal-kicker">GENİŞ HİSSE LİSTESİ</div><h2>Hisseler ve şirketler</h2></div><span class="terminal-chip muted" id="directoryCount">—</span></div><div class="terminal-panel-body"><label class="terminal-field">Kod veya şirket adıyla ara<input id="directoryQuery" type="search" maxlength="100" placeholder="ASELS, Garanti, demir çelik…"></label></div><div class="terminal-table-wrap"><table class="terminal-table"><thead><tr><th>SEMBOL</th><th>ŞİRKET</th><th>KAYNAK</th><th>İŞLEM</th></tr></thead><tbody id="directoryRows"></tbody></table></div><div class="terminal-pagination"><span id="directoryPage">Liste yükleniyor…</span><div class="terminal-actions"><button type="button" class="btn-secondary" id="directoryPrev">← Önceki</button><button type="button" class="btn-secondary" id="directoryNext">Sonraki →</button></div></div>';
    by('page-markets').querySelector('.section-head').after(workspace);
    by('directoryQuery').addEventListener('input',()=>{directoryPage=1;renderDirectory();});
    click('directoryPrev',()=>{directoryPage=Math.max(1,directoryPage-1);renderDirectory();});click('directoryNext',()=>{directoryPage++;renderDirectory();});
  }
  function renderDirectory(){
    if(!universe)return;const q=by('directoryQuery').value.toLocaleUpperCase('tr-TR').trim();
    const rows=universe.records.filter(x=>!q||(x.symbol+' '+(x.companyName||'')).toLocaleUpperCase('tr-TR').includes(q)),pages=Math.ceil(rows.length/25);
    directoryPage=Math.max(1,Math.min(directoryPage,pages||1));const body=by('directoryRows');body.replaceChildren();
    for(const x of rows.slice((directoryPage-1)*25,directoryPage*25)){
      const tr=node('tr'),sym=node('td'),source=node('td'),actions=node('td');sym.append(button(x.symbol,()=>openSymbol(x.symbol,'BIST','1d'),'row-open'));
      if(x.kapUrl)source.append(link('KAP ↗',x.kapUrl));else source.textContent='Kimlik eşleşmedi';
      actions.append(button(state.watch.includes(x.symbol)?'★ Favoride':'☆ Favori',()=>toggleFavorite(x.symbol)));tr.append(sym,node('td','',x.companyName||'Şirket adı eşleşmedi'),source,actions);body.append(tr);
    }
    by('directoryCount').textContent=rows.length+' HİSSE';by('directoryPage').textContent='Sayfa '+(pages?directoryPage:0)+' / '+pages;
    by('directoryPrev').disabled=directoryPage<=1;by('directoryNext').disabled=directoryPage>=pages;
  }
  function mountNews(){
    const controls=node('div','terminal-panel-body');controls.innerHTML='<div class="terminal-toolbar"><label class="terminal-field">Sembol (isteğe bağlı)<input id="newsSymbol" placeholder="ASELS" maxlength="10"></label><label class="terminal-field">Kategori<select id="newsCategory"><option value="market">Piyasa</option><option value="company">Şirket</option><option value="kap">KAP araması</option><option value="sector">Sektör</option></select></label><div class="terminal-actions"><button class="btn-primary" id="newsSearch" type="button">Başlıkları getir</button></div></div><p class="terminal-note" id="newsSourceInfo">Google News RSS · Android yedek kaynağı. KAP arama başlıkları resmî bildirim doğrulaması değildir.</p>';
    by('page-news').querySelector('.card').prepend(controls);
    by('page-news').querySelector('.section-head p').textContent='Kaynağı ve yayın zamanı gösterilen haber başlıkları. Şirket, sektör, KAP araması ve genel piyasa filtreleri.';
    loadNews=async function(){
      by('newsList').replaceChildren(node('div','inline-status','Haber kaynağı sorgulanıyor…'));
      try{
        const symbol=by('newsSymbol').value.trim().toUpperCase(),category=by('newsCategory').value;
        const data=await api('/api/news?'+new URLSearchParams({symbol,category}));const list=by('newsList');list.replaceChildren();
        for(const item of data.items){const article=node('article','news-item');article.append(link(item.title,item.url),node('span','',item.source+' · '+date(item.publishedAt)));list.append(article);}
        if(!data.items.length)list.append(node('div','inline-status','Bu aramada başlık bulunamadı.'));
        by('newsSourceInfo').textContent=data.provider+' · Alınma: '+date(data.fetchedAt)+' · İçerik doğrulaması yapılmadı.';
      }catch(e){by('newsList').replaceChildren(node('div','terminal-error',e.message));}
    };
    click('newsSearch',loadNews);
    by('refreshNews').addEventListener('click',e=>{e.stopImmediatePropagation();loadNews();},true);
  }
  function mountHistory(){
    labelMap.history='Tarama ve bildirim geçmişi';
    const section=node('section','page');section.id='page-history';
    section.innerHTML='<div class="section-head"><div><div class="eyebrow">İŞLEM İZİ</div><h1>Tarama ve bildirim geçmişi</h1><p>Bu tarayıcıda saklanan çalışma kayıtları. Gecikmeli gözlemler, doğrulanmış AL/SAT sinyali olarak kaydedilmez.</p></div></div><div class="terminal-panel"><div class="terminal-title"><h2>Son 20 tarama</h2><button type="button" class="btn-secondary" id="coreHistoryExport">↓ Geçmişi indir</button></div><div class="terminal-table-wrap"><table class="terminal-table"><thead><tr><th>ZAMAN</th><th>PERİYOT</th><th>İŞLENEN</th><th>SONUÇ / HATA</th><th>DURUM</th></tr></thead><tbody id="coreHistoryRows"></tbody></table></div></div><div class="terminal-panel"><div class="terminal-title"><h2>Bildirim ve gözlem kayıtları</h2><span class="terminal-chip muted">YEREL</span></div><div id="noticeRows" class="terminal-panel-body"></div></div><p class="terminal-note">Doğrulanmış uzak sinyal kaydı yok. Sunucu tarama oturumu iki saat içinde kullanılabilir; kalıcı çalışma raporunu tarama ekranından indirin.</p>';
    by('workspace').append(section);
    const nav=button('◷  Tarama geçmişi',()=>{navigate('history');renderHistory();},'nav-link');nav.dataset.view='history';document.querySelector('.sidebar .navigation').append(nav);
    click('coreHistoryExport',()=>offlineDownload('BIST-TARAMA-GECMISI.json','application/json',JSON.stringify({history,notices},null,2)));renderHistory();
  }
  function renderHistory(){
    if(!by('coreHistoryRows'))return;const body=by('coreHistoryRows');body.replaceChildren();
    for(const h of history){const tr=node('tr');for(const v of [date(h.createdAt),h.interval,h.processed+'/'+h.total,h.successful+' / '+h.errors,h.status])tr.append(node('td','',v));body.append(tr);}
    if(!history.length){const tr=node('tr'),td=node('td','','Henüz tamamlanan tarama yok.');td.colSpan=5;tr.append(td);body.append(tr);}
    const list=by('noticeRows');list.replaceChildren();for(const n of notices)list.append(node('p','terminal-note',date(n.at)+' · '+n.message));if(!notices.length)list.append(node('p','terminal-note','Bildirim kaydı yok.'));
  }
  function addNotice(message){notices=[{at:Date.now(),message},...notices].slice(0,100);write(storage.notifications,notices);renderHistory();}
  function mountSettings(){
    const panel=node('div','terminal-panel');panel.innerHTML='<div class="terminal-title"><h2>Ayar ve işlev ara</h2><span class="terminal-chip muted">HIZLI ERİŞİM</span></div><div class="terminal-panel-body"><label class="terminal-field terminal-search">Arama<input id="settingsQuery" type="search" placeholder="yedek, bildirim, kaynak, VİOP, tarama…" maxlength="80"></label><div id="settingsSearchResults" class="terminal-settings-results"></div></div>';
    by('page-settings').querySelector('.section-head').after(panel);
    const entries=[['Veri yükleme, yedek ve geri yükleme','data','offlineExport'],['Bildirim, fiyat uyarısı ve izin','alerts','foregroundAlertCheck'],['Android tarama ve veri kaynağı','scanner','coreRun'],['VİOP gerçekleşmiş işlem defteri','viop','ledgerForm'],['Hata raporu ve sistem denetimi','settings','diagRun'],['Tarama ve bildirim geçmişi','history','coreHistoryRows'],['Haber kaynağı ve şirket arama','news','newsSymbol'],['Hisse ve favoriler','markets','directoryQuery']];
    const render=()=>{const q=by('settingsQuery').value.toLocaleLowerCase('tr-TR'),out=by('settingsSearchResults');out.replaceChildren();for(const [label,page,id] of entries.filter(x=>x[0].toLocaleLowerCase('tr-TR').includes(q)))out.append(button(label+' ↗',()=>{navigate(page);by(id)?.scrollIntoView({behavior:'smooth',block:'center'});by(id)?.focus();}));if(!out.children.length)out.append(node('p','terminal-note','Eşleşme bulunamadı.'));};
    by('settingsQuery').addEventListener('input',render);render();
  }
  function mountAlerts(){
    const panel=node('div','terminal-panel');panel.innerHTML='<div class="terminal-title"><h2>Ön planda fiyat gözlemi</h2><span class="terminal-chip warn">GECİKMELİ KAPANIŞ</span></div><div class="terminal-panel-body"><div class="terminal-actions"><button type="button" class="btn-primary" id="foregroundAlertCheck">Kayıtlı eşikleri şimdi kontrol et</button><button type="button" class="btn-secondary" id="notificationPermission">Bildirim iznini yönet</button></div><p id="foregroundAlertStatus" class="terminal-note" role="status">Kontrol, düğmeye bastığınızda Yahoo kapanmış günlük fiyatıyla yapılır. Sürekli veya arka planda canlı izleme yoktur.</p></div>';
    by('page-alerts').querySelector('.section-head').after(panel);
    click('foregroundAlertCheck',async()=>{
      const rules=state.alerts;if(!rules.length){by('foregroundAlertStatus').textContent='Önce bir fiyat eşiği ekleyin.';return;}
      by('foregroundAlertCheck').disabled=true;let checked=0,hits=0,errors=0;
      try{for(const symbol of [...new Set(rules.map(x=>x.symbol))]){try{const data=await api('/history?'+new URLSearchParams({symbol,interval:'1d',range:'1mo'}));const bar=data.candles.filter(x=>x.closed).at(-1);if(!bar)throw Error('Kapanmış mum yok.');checked++;
        for(const r of rules.filter(x=>x.symbol===symbol)){if(r.condition==='above'?bar.close>=r.price:bar.close<=r.price){const message=symbol+' · gecikmeli kapanış '+number(bar.close)+' ₺ · eşik '+number(r.price)+' ₺ · '+date(bar.time);if(!notices.some(x=>x.message===message)){addNotice(message);hits++;if('Notification' in window&&Notification.permission==='granted')new Notification('BIST · gecikmeli fiyat gözlemi',{body:message});}}}
      }catch{errors++;}}by('foregroundAlertStatus').textContent=checked+' sembol kontrol edildi · '+hits+' yeni eşik gözlemi · '+errors+' veri hatası. Kaynak: Yahoo, gecikmeli kapanış.';}finally{by('foregroundAlertCheck').disabled=false;}
    });
    click('notificationPermission',async()=>{if(!('Notification' in window))throw Error('Bu tarayıcı bildirim API’sini desteklemiyor.');const permission=await Notification.requestPermission();by('foregroundAlertStatus').textContent='Bildirim izni: '+permission+'. Kontrol yalnız bu sayfa açıkken ve siz başlattığınızda yapılır.';});
  }
  function mountLedger(){
    const section=by('page-viop'),panel=node('div','terminal-panel');panel.id='ledgerPanel';
    panel.innerHTML='<div class="terminal-title"><div><div class="terminal-kicker">VİOP · GERÇEKLEŞMİŞ İŞLEM DEFTERİ</div><h2>Pozisyonlar ve kısmi kapama</h2></div><span class="terminal-chip muted">CİHAZDA SAKLANIR</span></div><div class="terminal-panel-body"><div id="ledgerStats" class="terminal-stat-grid"></div><details id="ledgerEntryDetails"><summary class="terminal-note">+ Gerçekleşmiş işlemi kaydet</summary><form id="ledgerForm"><div class="terminal-ledger-grid terminal-controls-extra"><label class="terminal-field wide">Aracı kurum gerçekleşme referansı<input id="ledgerBroker" required maxlength="100" placeholder="Gerçek işlem referansı"></label><label class="terminal-field">Kontrat kodu<input id="ledgerSymbol" required maxlength="45" placeholder="F_…"></label><label class="terminal-field">Yön<select id="ledgerSide"><option>LONG</option><option>SHORT</option></select></label><label class="terminal-field">Gerçekleşen adet<input id="ledgerQuantity" type="number" min="1" step="1" required></label><label class="terminal-field">Giriş fiyatı<input id="ledgerEntry" type="number" min="0.000001" step="any" required></label><label class="terminal-field">Stop<input id="ledgerStop" type="number" min="0.000001" step="any" required></label><label class="terminal-field">Hedef<input id="ledgerTarget" type="number" min="0.000001" step="any" required></label><label class="terminal-field">Kontrat çarpanı<input id="ledgerMultiplier" type="number" min="0.000001" step="any" required></label><label class="terminal-field">Toplam maliyet / kontrat ₺<input id="ledgerCost" type="number" min="0" step="any" required></label><label class="terminal-field">Teminat / kontrat ₺<input id="ledgerMargin" type="number" min="0.000001" step="any" required></label></div><p class="terminal-note">Gerçekleşmiş işlemleri kendi aracı kurum kaydınızdan girin. Çarpan ve teminat otomatik doğrulanmaz. Android V6 risk sınırını aşan gerçekleşme gizlenmez; uyarıyla kaydedilir. Bu işlem emir göndermez.</p><div class="terminal-actions terminal-controls-extra"><button type="submit" class="btn-primary" id="ledgerRecord">Gerçekleşmeyi deftere kaydet</button><button type="button" class="btn-secondary" id="ledgerSizeCheck">Android risk sınırını hesapla</button></div></form></details><p id="ledgerStatus" class="terminal-ledger-status" role="status"></p></div><div class="terminal-table-wrap terminal-ledger-list"><table class="terminal-table"><thead><tr><th>KONTRAT / REF.</th><th>YÖN</th><th>AÇIK / İLK ADET</th><th>GİRİŞ / STOP / HEDEF</th><th>AÇIK RİSK ₺</th><th>NET GERÇEKLEŞEN ₺</th><th>İŞLEM</th></tr></thead><tbody id="ledgerRows"></tbody></table></div>';
    section.querySelector('.section-head').after(panel);
    by('ledgerForm').addEventListener('submit',e=>{e.preventDefault();safe(()=>{
      if(ledgerError)throw Error(ledgerError);const result=ViopLedger.record(ledger,ledgerInput());if(!result.accepted)throw Error(result.reason);commitLedger(result.positions);by('ledgerStatus').textContent=result.reason+(result.position.riskViolationAtEntry?' · '+result.position.riskViolationAtEntry:'');by('ledgerForm').reset();
    })();});
    click('ledgerSizeCheck',()=>{if(ledgerError)throw Error(ledgerError);const x=ledgerInput(),s=ViopLedger.summarize(ledger),d=ViopLedger.size({entry:x.entry,stop:x.stop,multiplier:x.multiplier,costPerContract:x.cost,marginPerContract:x.margin,openRiskTry:s.openRiskTry,dailyLossTry:s.dailyLossTry,activePositions:s.count,usedMarginTry:s.marginTry,direction:x.side});by('ledgerStatus').textContent='Android V6 · en fazla '+d.contracts+' kontrat · planlanan risk '+number(d.plannedRiskTry)+' ₺ · '+d.reason;});
    renderLedger();
  }
  function mountCatalog(){
    const panel=node('div','terminal-panel');panel.id='androidViopCatalog';
    panel.innerHTML='<div class="terminal-title"><div><div class="terminal-kicker">ANDROID YEREL KATALOG</div><h2>Dayanak ve vade referansları</h2></div><span class="terminal-chip warn">FİYAT İÇERMEZ</span></div><div class="terminal-panel-body"><div class="terminal-toolbar"><label class="terminal-field">Dayanak veya adla ara<input id="viopCatalogQuery" type="search" maxlength="80" placeholder="Garanti, dolar, altın…"></label><label class="terminal-field">Kategori<select id="viopCatalogCategory"><option value="ALL">Tümü</option><option value="BIST30">BIST30 kökleri</option><option value="FX">Döviz</option><option value="COMMODITY">Emtia</option><option value="OTHER">Diğer</option></select></label><div class="terminal-actions"><button id="viopCatalogLoad" class="btn-secondary" type="button">Kataloğu getir</button></div></div><p class="terminal-note">Bu Android kataloğu gerçek kontrat kodu veya aktif sözleşme teyidi değildir. Çarpan, resmî son işlem zamanı ve teminat bağlı sağlayıcı olmadan doğrulanmaz. Gerçek dosya kontratları ve grafikleri aşağıdaki mevcut listede korunur.</p></div><div class="terminal-table-wrap"><table class="terminal-table"><thead><tr><th>DAYANAK</th><th>VADE AYI</th><th>FİYAT / ÇARPAN / TEMİNAT</th><th>DURUM</th><th>İŞLEM</th></tr></thead><tbody id="viopCatalogRows"></tbody></table></div><div class="terminal-panel-body terminal-note" id="viopCatalogStatus" role="status">Katalog henüz sorgulanmadı.</div>';
    by('ledgerPanel').after(panel);
    const load=async()=>{
      const version=++catalogVersion;by('viopCatalogStatus').textContent='Android katalog ve arama politikası çalışıyor…';
      try{const data=await api('/api/viop/catalog?'+new URLSearchParams({query:by('viopCatalogQuery').value,category:by('viopCatalogCategory').value}));if(version!==catalogVersion)return;
        const body=by('viopCatalogRows');body.replaceChildren();
        for(const c of data.contracts){const tr=node('tr');tr.append(node('td','symbol',c.underlying),node('td','',c.expiry),node('td','','— / — / —'),node('td','reason-cell','Yalnız dayanak/vade referansı'));
          const action=node('td');action.append(button('Dayanağı incele',()=>{if(['XU100','XU030','USDTRY','EURTRY','XAUUSD'].includes(c.underlying))showInstrument(c.underlying);else if(['GOLD','SILVER','BRENT'].includes(c.underlying))throw Error('Bu dayanak için doğrulanmış fiyat kaynağı bağlı değil.');else openSymbol(c.underlying,'BIST','1d');}));tr.append(action);body.append(tr);}
        by('viopCatalogStatus').textContent=data.contracts.length+' dayanak/vade referansı · '+data.source;
      }catch(e){by('viopCatalogStatus').textContent=e.message;}
    };
    let timer;by('viopCatalogQuery').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,350);});by('viopCatalogCategory').addEventListener('change',load);click('viopCatalogLoad',load);
  }
  function mountValuation(){
    const panel=node('div','terminal-panel');panel.id='androidValuation';
    panel.innerHTML='<div class="terminal-title"><div><div class="terminal-kicker">ANDROID TEMEL DEĞERLEME</div><h2>Sektörel çarpan karşılaştırması</h2></div><span class="terminal-chip warn">KAP İÇERİĞİ DOĞRULANMADI</span></div><div class="terminal-panel-body"><div class="terminal-toolbar"><label class="terminal-field">Android finansal snapshot JSON<input id="coreFinancialFile" type="file" accept=".json,application/json"></label><label class="terminal-field">Model profili<select id="coreValueStrategy"><option value="BALANCED">Dengeli</option><option value="QUALITY">Kalite öncelikli</option><option value="DISCOUNT">İskonto öncelikli</option></select></label><div class="terminal-actions"><button id="coreValueRun" class="btn-primary" type="button">Dosyayı Android motoruyla hesapla</button><button id="coreValueTemplate" class="btn-secondary" type="button">↓ Şema</button></div></div><p class="terminal-note">Bu düğme seçtiğiniz finansal kayıtları hesaplama için site sunucusuna gönderir; OHLCV dosyalarınızı göndermez. En az 5 karşılaştırılabilir sektör emsali gerekir. Finansal raporun aslı bağımsız doğrulanmadığı için sonuçlar referans hesap olarak gösterilir.</p><p class="terminal-note" id="coreValueStatus" role="status">Doğrulanmış otomatik bilanço bağlantısı yok. Dosya isteğe bağlıdır.</p></div><div class="terminal-table-wrap"><table class="terminal-table"><thead><tr><th>HİSSE</th><th>MODEL DURUMU</th><th>DEĞER / KALİTE / RİSK</th><th>EMSAL</th><th>GEREKÇE</th></tr></thead><tbody id="coreValueRows"></tbody></table></div>';
    by('coreFailureDetails').after(panel);
    click('coreValueTemplate',()=>offlineDownload('ANDROID-FINANSAL-SNAPSHOT-SABLONU.json','application/json',JSON.stringify({financials:[{symbol:'KOD',companyName:'Gerçek şirket adı',sector:'Karşılaştırılabilir sektör',businessType:'NON_FINANCIAL',accountingBasis:'TMS29',financialCurrency:'TRY',financialPeriodEndMs:0,disclosurePublishedAtMs:0,marketObservedAtMs:0,marketCapTry:0,priceTry:0,sharesOutstanding:0,netIncomeTtmTry:null,equityTry:null,ebitdaTtmTry:null,netDebtTry:null,freeCashFlowTtmTry:null,disclosureUrl:'https://kap.org.tr/tr/Bildirim/GERCEK_BILDIRIM_NO'}]},null,2)));
    let valueBusy=false;
    by('coreFinancialFile').addEventListener('change',()=>{by('coreValueRows').replaceChildren();by('coreValueStatus').textContent=by('coreFinancialFile').files[0]?'Dosya seçildi. Hesaplama için düğmeye basın.':'Finansal dosya seçilmedi.';});
    click('coreValueRun',async()=>{
      if(valueBusy)return;
      valueBusy=true;by('coreValueRun').disabled=true;
      const status=by('coreValueStatus');status.setAttribute('role','status');status.textContent='Dosya kontrol ediliyor…';by('coreValueRows').replaceChildren();
      try{
        const file=by('coreFinancialFile').files[0];if(!file)throw Error('Önce finansal JSON dosyasını seçin.');if(file.size>950000)throw Error('Finansal dosya 950 KB sınırını aşıyor.');
        let parsed;try{parsed=JSON.parse(await file.text());}catch{throw Error('Dosya geçerli JSON içermiyor.');}
        const financials=Array.isArray(parsed)?parsed:parsed?.financials;
        if(!Array.isArray(financials)||!financials.length||financials.some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw Error('Şema: financials alanında en az bir finansal kayıt bulunmalı.');
        status.textContent='Android motoru hesaplıyor…';
        const data=await api('/api/valuation',{financials,strategy:by('coreValueStrategy').value}),body=by('coreValueRows');
        if(!Array.isArray(data.results))throw Error('Sunucunun finansal yanıt şeması geçersiz.');
        for(const x of data.results){const a=x.assessment,s=x.score,tr=node('tr');tr.append(node('td','symbol',a.symbol),node('td','reason-cell',a.status+' · REFERANS'),node('td','',s?s.value+' / '+s.quality+' / '+s.risk:'—'),node('td','',a.peerCount),node('td','reason-cell',a.reason));body.append(tr);}
        status.textContent=data.results.length+' referans hesap · '+data.publicationGate+' · '+data.note;
      }catch(e){status.setAttribute('role','alert');status.textContent=e.message;}finally{valueBusy=false;by('coreValueRun').disabled=false;}
    });
  }

  function renderInstrumentTiles(){
    if(!instrumentData)return;
    const mapping={XU100:['homeMetricBist100','homeMetricBist100Sub'],XU030:['homeMetricBist30','homeMetricBist30Sub'],USDTRY:['homeMetricUsd','homeMetricUsdSub'],XAUUSD:['homeMetricGold','homeMetricGoldSub']};
    for(const item of instrumentData.items){
      const ids=mapping[item.key];if(!ids)continue;const value=by(ids[0]),sub=by(ids[1]);if(!value||!sub)continue;
      value.textContent=item.error?'—':number(item.price);sub.textContent=item.error?'Kaynak yanıt vermedi':number(item.changePct)+'% · gecikmeli kapanış';
      value.closest('.home-mini-card').title=item.error||item.name+' · '+date(item.asOf)+' · '+item.ticker;
    }
  }
  function lineChart(bars){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 800 230');svg.setAttribute('role','img');svg.setAttribute('aria-label','Kapanmış günlük fiyat geçmişi');svg.style.width='100%';
    const values=bars.map(b=>b.close),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo||1;
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',bars.map((b,i)=>(i?'L':'M')+(20+i/(bars.length-1)*760).toFixed(2)+','+(210-(b.close-lo)/span*190).toFixed(2)).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#4bdfb5');path.setAttribute('stroke-width','2.5');svg.append(path);return svg;
  }
  async function showInstrument(key){
    const content=node('div');content.append(node('p','terminal-note','Kaynak sorgulanıyor…'));showDialog('Piyasa aracı',content);
    try{const data=await api('/api/instruments/'+key);content.replaceChildren();
      const stat=node('div','terminal-stat');stat.append(node('strong','',number(data.price)+' '+data.currency),node('span','',number(data.changePct)+'% · '+date(data.asOf)));content.append(stat,lineChart(data.candles),node('p','terminal-note',data.description+' · '+data.provider+' · '+data.ticker),node('p','terminal-note','Yalnız kapanmış günlük gözlem. Gerçek zamanlı fiyat değildir.'));
    }catch(e){content.replaceChildren(node('p','terminal-error',e.message));}
  }
  function mountInstruments(){
    const panel=node('div','terminal-panel');panel.innerHTML='<div class="terminal-title"><h2>Piyasa özeti</h2><button type="button" class="btn-secondary" id="instrumentRefresh">↻ Kaynaktan yenile</button></div><div class="terminal-panel-body"><div id="instrumentTiles" class="terminal-ticker"></div><p id="instrumentStatus" class="terminal-note" role="status">Endeks, döviz ve spot altın kaynağı henüz sorgulanmadı.</p></div>';
    by('stockDirectory').before(panel);
    const load=async()=>{
      by('instrumentRefresh').disabled=true;
      try{instrumentData=await api('/api/instruments');const tiles=by('instrumentTiles');tiles.replaceChildren();
        for(const item of instrumentData.items){const tile=button('',()=>showInstrument(item.key),'');tile.append(node('span','',item.name),node('strong','',item.error?'—':number(item.price)),node('small','',item.error?'Kaynak kullanılamıyor':number(item.changePct)+'% · '+date(item.asOf)));tiles.append(tile);}
        by('instrumentStatus').textContent='Yahoo · gecikmeli kapanmış günlük gözlemler · Alınma '+date(instrumentData.fetchedAt);renderInstrumentTiles();
      }catch(e){by('instrumentStatus').textContent=e.message;}finally{by('instrumentRefresh').disabled=false;}
    };
    const old=homeUpdate;homeUpdate=function(){old();renderInstrumentTiles();};
    click('instrumentRefresh',load);
    for(const [key,title] of [['XU100','BIST100'],['XU030','BIST30'],['USDTRY','DOLAR'],['XAUUSD','ONSALTIN']]){
      const tile=[...document.querySelectorAll('.home-mini-card')].find(x=>x.querySelector('.home-mini-title').textContent.replace(/\s/g,'')===title);
      if(tile){tile.tabIndex=0;tile.setAttribute('role','button');tile.addEventListener('click',safe(()=>showInstrument(key)));tile.addEventListener('keydown',e=>{if(e.key==='Enter')showInstrument(key);});}
    }
    load();
  }
  function ledgerInput(){const get=id=>Number(by('ledger'+id).value);return {brokerExecutionId:by('ledgerBroker').value,symbol:by('ledgerSymbol').value,side:by('ledgerSide').value,quantity:get('Quantity'),entry:get('Entry'),stop:get('Stop'),target:get('Target'),multiplier:get('Multiplier'),cost:get('Cost'),margin:get('Margin')};}
  function commitLedger(items){ViopLedger.validate(items);write(storage.ledger,items);ledger=items;renderLedger();}
  function renderLedger(){
    const body=by('ledgerRows'),stats=by('ledgerStats');if(!body)return;body.replaceChildren();stats.replaceChildren();
    if(ledgerError){by('ledgerStatus').textContent=ledgerError;by('ledgerRecord').disabled=true;by('ledgerSizeCheck').disabled=true;return;}
    const summary=ViopLedger.summarize(ledger);
    for(const [value,label] of [[summary.count,'Açık pozisyon'],[number(summary.openRiskTry)+' ₺','Açık risk · sınır 500 ₺'],[number(summary.marginTry)+' ₺','Teminat · sınır 25.000 ₺'],[number(summary.dailyLossTry)+' ₺','Bugünkü zarar · sınır 1.000 ₺']]){const stat=node('div','terminal-stat');stat.append(node('strong','',value),node('span','',label));stats.append(stat);}
    for(const p of [...ledger].reverse()){
      const tr=node('tr'),symbol=node('td');symbol.append(node('span','symbol',p.symbol),node('small','',p.brokerExecutionId));tr.append(symbol,node('td','',p.side),node('td','',ViopLedger.remaining(p)+' / '+p.quantity),node('td','',number(p.entry)+' / '+number(p.stop)+' / '+number(p.target)),node('td','',number(ViopLedger.remaining(p)*(Math.abs(p.entry-p.stop)*p.multiplier+p.cost))),node('td','',number(ViopLedger.realized(p))));
      const actions=node('td');actions.append(button(ViopLedger.remaining(p)?'İncele / kapat':'Kapanışlar',()=>showPosition(p)));tr.append(actions);body.append(tr);
    }
    if(!ledger.length){const tr=node('tr'),td=node('td','','Henüz gerçekleşmiş işlem kaydı yok.');td.colSpan=7;tr.append(td);body.append(tr);}
  }
  function showPosition(p){
    const content=node('div');content.append(node('p','terminal-note',p.symbol+' · '+p.side+' · '+date(p.openedAt)+' · '+ViopLedger.remaining(p)+' açık kontrat'));
    if(p.riskViolationAtEntry)content.append(node('p','terminal-error',p.riskViolationAtEntry));
    for(const f of p.exits??[])content.append(node('p','terminal-note',date(f.executedAt)+' · '+f.quantity+' adet × '+number(f.price)+' · net '+number(ViopLedger.fillPnl(p,f))+' ₺'));
    if(ViopLedger.remaining(p)){
      const form=node('form');form.innerHTML='<div class="terminal-ledger-grid terminal-controls-extra"><label class="terminal-field">Kapanan adet<input id="exitQuantity" type="number" min="1" step="1" required></label><label class="terminal-field">Gerçekleşen çıkış fiyatı<input id="exitPrice" type="number" min="0.000001" step="any" required></label><label class="terminal-field">Ek çıkış masrafı ₺<input id="exitFee" type="number" min="0" step="any" value="0" required></label></div><div class="terminal-actions terminal-controls-extra"><button type="submit" class="btn-primary" id="exitRecord">Kapanışı deftere kaydet</button></div><p class="terminal-note" id="exitStatus" role="status">Kısmi kapama açık adet, risk ve teminatı azaltır. Aracı kuruma emir gönderilmez.</p>';
      form.addEventListener('submit',e=>{e.preventDefault();try{const result=ViopLedger.closePartial(ledger,p.id,Number(by('exitQuantity').value),Number(by('exitPrice').value),Date.now(),Number(by('exitFee').value));if(!result.accepted)throw Error(result.reason);commitLedger(result.positions);dialog.close();toast('Gerçekleşen kapanış kaydedildi.');}catch(err){by('exitStatus').textContent=err.message;}});
      content.append(form);
    }
    const monitor=node('div');monitor.innerHTML='<details class="terminal-controls-extra"><summary class="terminal-note">Manuel fiyatla stop / hedef gözlemi</summary><label class="terminal-field terminal-controls-extra">Kontrol fiyatı<input id="positionMark" type="number" min="0.000001" step="any"></label><button type="button" class="btn-secondary terminal-controls-extra" id="positionCheck">Seviyeleri kontrol et</button><p class="terminal-note" id="positionCheckResult" role="status">Bu fiyat yalnız manuel gözlemdir.</p></details>';content.append(monitor);
    showDialog(p.symbol+' · İşlem defteri',content);
    if(by('exitQuantity')){by('exitQuantity').value=ViopLedger.remaining(p);by('exitQuantity').max=ViopLedger.remaining(p);}
    click('positionCheck',()=>{const price=Number(by('positionMark').value);if(!(price>0&&Number.isFinite(price)))throw Error('Geçerli bir kontrol fiyatı girin.');const stop=p.side==='LONG'?price<=p.stop:price>=p.stop,target=p.side==='LONG'?price>=p.target:price<=p.target;const message=p.symbol+' · manuel '+number(price)+' · '+(stop?'STOP SEVİYESİ':target?'HEDEF SEVİYESİ':'seviyeler arasında')+' · emir gönderilmedi';by('positionCheckResult').textContent=message;addNotice(message);});
  }

  function validateExtensions(value){
    if(!value||value.version!==1)throw Error('Yeni modül yedek sürümü geçersiz.');
    ViopLedger.validate(value.ledger);
    if(!Array.isArray(value.history)||value.history.length>20||value.history.some(x=>!x||typeof x.id!=='string'||!Number.isSafeInteger(x.createdAt)||!(x.interval==='1d'||/^[1-9][0-9]{0,2}m$/.test(x.interval)&&Number(x.interval.slice(0,-1))<=239)||![x.total,x.processed,x.successful,x.insufficient,x.errors].every(v=>Number.isSafeInteger(v)&&v>=0)))throw Error('Tarama geçmişi yedeği geçersiz.');
    if(!Array.isArray(value.notices)||value.notices.length>100||value.notices.some(x=>!Number.isSafeInteger(x.at)||typeof x.message!=='string'||x.message.length>1000))throw Error('Bildirim geçmişi yedeği geçersiz.');
    if(!value.settings||typeof value.settings!=='object'||Array.isArray(value.settings)||Object.keys(value.settings).some(k=>k!=='interval')||(value.settings.interval&&!['1m','3m','5m','10m','15m','30m','60m','1d'].includes(value.settings.interval)))throw Error('Tercih yedeği geçersiz.');
    if(value.androidSettings!=null)BistNativePreferences.validate(value.androidSettings);
    if(value.signalHistory!=null)AndroidHistory.validate(value.signalHistory);
    return value;
  }
  function exportState(){
    if(ledgerError)throw Error(ledgerError);return {version:1,ledger,history,notices,settings,androidSettings:read(storage.android,null),signalHistory:window.AndroidHistory?.exportState()};
  }
  function restoreState(value){
    validateExtensions(value);const previous=Object.fromEntries(Object.entries(storage).map(([name,key])=>[key,localStorage.getItem(key)]));
    const memory={ledger,ledgerError,history,notices,settings};
    const rollback=()=>{for(const [key,raw] of Object.entries(previous)){if(raw==null)localStorage.removeItem(key);else localStorage.setItem(key,raw);}({ledger,ledgerError,history,notices,settings}=memory);renderLedger();renderHistory();window.BistAndroid?.reloadSettings();};
    try{write(storage.ledger,value.ledger);write(storage.history,value.history);write(storage.notifications,value.notices);write(storage.settings,value.settings);if(value.androidSettings!=null)write(storage.android,value.androidSettings);if(value.signalHistory!=null)write(storage.signals,value.signalHistory);}
    catch(e){rollback();throw e;}
    try{ledger=value.ledger;ledgerError=null;history=value.history;notices=value.notices;settings=value.settings;renderLedger();renderHistory();window.BistAndroid?.reloadSettings();}catch(e){rollback();throw e;}
    return rollback;
  }
  function adoptJob(value){job=value;sessionStorage.setItem('bist_core_job',value.id);renderJob();safe(poll)();}
  window.BistTerminal={api,exportState,restoreState,validateExtensions,adoptJob,get job(){return job;},showOpportunity};
  function chrome(){
    document.title='BIST–VİOP | Piyasa terminali';document.querySelector('.brand-subtitle').textContent='PİYASA TERMİNALİ';
    document.querySelector('.readonly-tag').textContent='GECİKMELİ / YEREL';
    document.querySelector('.side-foot').textContent='WEB 1.4 · ANDROID V5.4.1';
    document.querySelector('.connection-card p').textContent='Yahoo gecikmeli geçmişi + yerel dosyalar. Onaylı uzak AL/SAT kaynağı bağlı değil.';
    const oldSettings=document.querySelector('.sidebar [data-view="settings"]');oldSettings.replaceChildren(node('span','nav-symbol','⚙'),document.createTextNode('Ayarlar ve tanılama'));
    const oldSystem=document.querySelector('.sidebar [data-view="system"]');oldSystem.replaceChildren(node('span','nav-symbol','◷'),document.createTextNode('Sistem durumu'));
    for(const el of document.querySelectorAll('.mobile-version-pill'))el.textContent='ANDROID ÇEKİRDEĞİ · WEB 1.4';
    const chart=by('chartArea').closest('.card');
    if(chart){const expand=button('⛶ Tam ekran',()=>{chart.classList.toggle('terminal-chart-expanded');expand.textContent=chart.classList.contains('terminal-chart-expanded')?'↙ Grafiği küçült':'⛶ Tam ekran';},'btn-secondary');expand.id='chartFullscreen';chart.querySelector('.chart-toolbar').append(expand);document.addEventListener('keydown',e=>{if(e.key==='Escape'){chart.classList.remove('terminal-chart-expanded');expand.textContent='⛶ Tam ekran';}});}
  }
  async function boot(){
    chrome();mountScanner();mountDirectory();mountNews();mountHistory();mountSettings();mountAlerts();mountLedger();mountCatalog();mountValuation();mountInstruments();
    try{
      universe=await api('/api/universe');by('coreUniverseCount').textContent=universe.count;
      const note=by('coreSourceNote');note.replaceChildren(document.createTextNode(universe.count+' sembol · '+universe.identityMatched+' KAP kimliği · liste: '+date(universe.fetchedAt)+' · '),link('Kaynaklar ↗',universe.identitySource));
      note.append(document.createTextNode(' · Deneysel keşif; borsa genelinde eksiksizlik resmen doğrulanmadı.'));updateRunLabel();renderDirectory();
    }catch(e){error('Hisse listesi yüklenemedi: '+e.message);}
    const id=sessionStorage.getItem('bist_core_job');if(id){try{job=await api('/api/scans/'+id);renderJob();await poll();}catch{sessionStorage.removeItem('bist_core_job');}}
    window.__BIST_TERMINAL_BOOTED=true;
  }
  safe(boot)();
})();
