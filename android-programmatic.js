/* Programmatic layouts ported from CheapStockScanActivity and FullUniverseScanActivity. */
(() => {
  'use strict';
  const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  function render(name,host,h){
    if(name==='cheap')return cheap(host,h);
    if(name==='universe'||name==='delayed')return universe(host,h);
  }
  function cheap(host,h){
    const scroll=make('div','apk-native-scroll apk-value-screen'),root=make('div','apk-value-root');scroll.append(root);host.append(scroll);
    const text=(p,s,size=13)=>{const t=make('div','apk-value-text',s);t.style.fontSize=size+'px';p.append(t);return t;};
    const title=(p,s,size=19,color='#e8f7ff')=>{const t=text(p,s,size);t.style.fontWeight=700;t.style.color=color;return t;};
    const button=(p,s,fn,bg='#1d70f1',fg='#fff')=>{const b=make('button','apk-value-button',s);b.style.background=bg;b.style.color=fg;b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>h.message(e.message));p.append(b);return b;};
    const block=(p,bg='#0b2a40',border)=>{const box=make('div','apk-value-block');box.style.background=bg;if(border)box.style.boxShadow='inset 0 0 0 1px '+border;p.append(box);return box;};
    const back=text(root,'← BIST TARAMAYA DÖN');back.style.color='#79d8f0';back.onclick=h.back;back.tabIndex=0;back.setAttribute('role','button');back.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();h.back();}};
    title(root,'Akıllı Değer ve Fırsat Avcısı',23);
    button(root,'▣  BIST + VİOP • TÜM EVREN DURUMU',()=>h.navigate('universe'),'#175eb6');
    text(root,'BIST • Finansal kalite, göreli değer ve risk analizi');
    const chooser=make('div','apk-value-tabs');chooser.setAttribute('role','tablist');root.append(chooser);
    const fundamentalTab=button(chooser,'⚖ TEMEL DEĞER',()=>{},'#15738a'),delayedTab=button(chooser,'◷ GECİKMELİ TARAMA',()=>h.navigate('universe'),'#17374c','#e0f3ff');
    for(const [tab,selected] of [[fundamentalTab,true],[delayedTab,false]]){tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(selected));}
    const values=make('div');root.append(values);
    const hero=block(values,'#133b4b');title(hero,'BIST genelinde değer fırsatlarını araştır',18);text(hero,'Şirketleri yalnız fiyatlarına göre değil; finansal tablo, emsal karşılaştırması, kârlılık ve bilanço riskiyle değerlendirir.');text(hero,'Yalnız yasal erişimi bulunan kaynaklar kullanılır. Veri yoksa sonuç uydurulmaz.',11);
    title(values,'Tarama stratejini seç',17);
    const strategies=make('div','apk-value-strategies');values.append(strategies);
    // Exact weights from ValueOpportunityScoreEngine.Strategy (Kotlin).
    const profiles={
      BALANCED:{label:'Dengeli',value:50,quality:30,safety:20,summary:'Değer + kalite + sağlamlık'},
      QUALITY:{label:'Kalite Öncelikli',value:25,quality:50,safety:25,summary:'Finansal kalite öncelikli'},
      DISCOUNT:{label:'İskonto Öncelikli',value:65,quality:20,safety:15,summary:'Göreli iskonto öncelikli'}
    };
    const strategyEvidence=text(values,'',12);
    const paint=()=>{
      strategies.replaceChildren();
      const active=profiles[h.settings.valueStrategy]?' '+h.settings.valueStrategy:' BALANCED';
      const profileId=active.trim(),profile=profiles[profileId];
      strategyEvidence.textContent=profile.label+': %'+profile.value+' değer / %'+profile.quality+' kalite / %'+profile.safety+' sağlamlık. Finansal kaynak doğrulanmadıkça değerleme yayınlanmaz.';
      strategyEvidence.dataset.valuationWeights=profileId;
      for(const [id,icon] of [['BALANCED','⚖'],['QUALITY','✓'],['DISCOUNT','◇']]){
        const item=profiles[id],selected=profileId===id,card=make('button','apk-value-strategy');
        card.type='button';card.style.background=selected?'#11566c':'#12334a';
        card.style.boxShadow='inset 0 0 0 2px '+(selected?'#64e7e7':'#356078');
        card.setAttribute('aria-pressed',String(selected));card.dataset.strategy=id;
        title(card,icon,22,selected?'#93f8ee':'#a6dae4');title(card,item.label,12,'#f0faff');
        const detail=text(card,item.summary,10);detail.classList.add('apk-strategy-description');
        card.onclick=()=>{h.settings.valueStrategy=id;h.save();const selector=document.getElementById('coreValueStrategy');if(selector)selector.value=id;paint();};
        strategies.append(card);
      }
    };paint();
    const openFinancials=()=>{
      const selector=document.getElementById('coreValueStrategy');
      if(selector)selector.value=h.settings.valueStrategy||'BALANCED';
      h.legacyPanel('androidValuation');
    };
    button(values,'FINANSAL VERİ YÜKLE',openFinancials,'#127b89');
    button(values,'KAYNAĞI YAPILANDIR',()=>h.navigate('settings_detail',{mode:'data_connection'}),'#124e69');
    const sourceState=text(values,'Finansal kaynak: doğrulanmadı • Rapor dönemi: doğrulanmadı • BIST: gecikmeli teknik gözlem • VİOP: lisanslı kontrat sağlayıcısı bağlı değil.',12);
    sourceState.dataset.financialSource='unverified';
    const evaluate=button(values,'BIST GENELİNİ DEĞERLE • FİNANSAL KAYNAK GEREKLİ',openFinancials,'#274154','#b6cad5');
    evaluate.disabled=true;evaluate.setAttribute('aria-disabled','true');
    evaluate.title='KAP kaynak içeriği ve rapor dönemi doğrulanmadı. Hesaplama için Finansal veri yükle ekranındaki referans modeli kullanın.';
    evaluate.style.minHeight='54px';evaluate.dataset.valuationGate='blocked';
    text(values,'Değerleme düğmesi kapalı: bağımsız finansal kaynak ve rapor dönemi doğrulanmadı. Kullanıcı JSON dosyasıyla yalnız referans model hesabı yapılabilir; onaylı sinyal üretilmez.',12);
    const advanced=make('div');advanced.hidden=true;
    button(values,'⚙  GELİŞMİŞ • SEMBOL ARAMA VE VERİ İÇE AKTARMA',()=>{advanced.hidden=!advanced.hidden;},'#e4eefc','#1e4784');values.append(advanced);
    const controls=block(advanced);title(controls,'Çevrimdışı BIST sembol arama',16);text(controls,'Yalnız bu tarayıcıya kaydedilmiş veya kullanıcı tarafından aktarılmış semboller aranır. Sembolün bulunması finansal veri bulunduğu anlamına gelmez.',11);
    const search=make('input','apk-value-input');search.placeholder='Sembol ara: THYAO, EREGL...';controls.append(search);
    const matches=text(controls,'Önce kayıtlı listeyi açın; fiyat/bilanço uydurulmaz.',11);
    const find=()=>{const q=search.value.toUpperCase(),symbols=[...new Set([...(h.settings.userSymbols||[]),...h.watch()])];matches.textContent=symbols.filter(s=>s.includes(q)).join(' • ')||'Eşleşen yerel sembol yok.';};search.oninput=find;
    button(controls,'KAYITLI SEMBOLLERİ GÖSTER / ARA',find,'#ddd','#171717');
    button(controls,'SEMBOL LİSTESİ (.TXT / .CSV) SEÇ',()=>importSymbols(h,find),'#ddd','#171717');
    title(controls,'Finansal veri ve kaynak',16);button(controls,'FİNANSAL TABLO JSON DOSYASI SEÇ',()=>h.legacyPanel('androidValuation'),'#ddd','#171717');
    button(controls,'KAP RESMÎ FİNANSAL TABLOLARI',()=>window.open('https://www.kap.org.tr/tr/','_blank','noopener'),'#ddd','#171717');
    text(controls,"KAP PDF/.rar bu sürümde otomatik ayrıştırılmaz. İçe aktarılan JSON'un KAP aslıyla bire bir uyumu bağımsız olarak teyit edilemez.",11);
    title(values,'Tarama sonuçları',19);text(values,'Henüz değerleme yapılmadı. Kaynak yoksa aday veya yapay puan üretilmez.',12);
    const warning=block(root,'#3a3222');title(warning,'Veri güvenliği',14,'#ffe0a2');text(warning,"Fiyat listesi bilanço değildir. Kaynak ve dönem doğrulanmadan 'güçlü fırsat' veya AL/SAT kararı gösterilmez. Lisanslı canlı veri bağlantısı bu sürümde mevcut değildir.",12);
    const how=block(root);title(how,'Nasıl çalışır?',16);text(how,'1  Finansalları doğrula    2  Emsalleri karşılaştır    3  İskontoyu ve riskleri açıkla',12);
  }
  function importSymbols(h,done){
    const picker=make('input');picker.type='file';picker.accept='.csv,.txt,text/plain,text/csv';picker.onchange=async()=>{try{const file=picker.files?.[0];if(!file)return;if(file.size>200000)throw Error('Sembol dosyası 200 KB sınırını aşıyor.');const raw=await file.text(),parts=raw.toLocaleUpperCase('tr-TR').split(/[\s,;]+/).map(x=>x.replace(/\.IS$/,'')),symbols=[...new Set(parts.filter(x=>/^[A-Z0-9]{3,10}$/.test(x)&&!['SYMBOL','SEMBOL','TICKER'].includes(x)))];if(!symbols.length||symbols.length>2000)throw Error('1–2000 geçerli sembol gerekli.');h.settings.userSymbols=symbols;h.save();done?.();h.message(symbols.length+' sembol içe aktarıldı.');}catch(e){h.message(e.message);}};picker.click();
  }
  function universe(host,h){
    const outer=make('div','apk-universe-screen'),scroll=make('div','apk-universe-controls'),root=make('div','apk-universe-root'),results=make('div','apk-universe-results');outer.append(scroll);scroll.append(root);host.append(outer);
    const text=(p,s,size=12,strong=false)=>{const t=make('div','apk-universe-text',s);t.style.fontSize=size+'px';if(strong)t.style.fontWeight=700;p.append(t);return t;};
    const button=(p,s,fn,secondary=false)=>{const b=make('button','apk-universe-button'+(secondary?' secondary':''),s);b.type='button';b.onclick=()=>Promise.resolve().then(fn).catch(e=>h.message(e.message));p.append(b);return b;};
    const tabs=make('div','apk-value-tabs');tabs.setAttribute('role','tablist');root.append(tabs);
    const fundamentalTab=button(tabs,'⚖ TEMEL DEĞER',()=>h.navigate('cheap'),true),scanTab=button(tabs,'◷ GECİKMELİ TARAMA',()=>{},false);
    for(const [tab,selected] of [[fundamentalTab,false],[scanTab,true]]){tab.setAttribute('role','tab');tab.setAttribute('aria-selected',String(selected));}
    text(root,'BIST + VİOP • TARAMA',18,true);
    text(root,'V6.3.45 • Gecikmeli teknik gözlem • İşlem sinyali değildir',10);
    text(root,'MOD: GECİKMELİ TEKNİK GÖZLEM • Tam borsa kapsamı değildir',12,true);
    button(root,'⚙ YETKİLİ BIST/VİOP BAĞLANTISI',()=>h.navigate('settings_detail',{mode:'data_connection'}));
    const secondary=make('div','apk-universe-horizontal');root.append(secondary);button(secondary,'📄 LİSTE YÜKLE',()=>importSymbols(h),true);button(secondary,'⚙ BAĞLANTI AYARLARI',()=>h.navigate('settings_detail',{mode:'data_connection'}),true);
    let market='ALL',order='price',valuation=false;
    const marketTabs=make('div','apk-universe-horizontal');root.append(marketTabs);for(const [id,label] of [['ALL','TÜMÜ'],['BIST','HİSSELER'],['VIOP','VİOP']])button(marketTabs,label,()=>{market=id;paint();},true);
    const toggle=button(root,'GÖRÜNÜM: FİYATA GÖRE',()=>{valuation=!valuation;toggle.textContent=valuation?'GÖRÜNÜM: TEMEL DEĞERLEMEYE GÖRE':'GÖRÜNÜM: FİYATA GÖRE';paint();});
    const select=make('select','apk-universe-sort');for(const [id,label] of [['price','Fiyat: düşükten yükseğe'],['price_desc','Fiyat: yüksekten düşüğe'],['symbol','Sembol: A → Z'],['score','Teknik puan: yüksekten düşüğe']]){const o=make('option','',label);o.value=id;select.append(o);}root.append(select);select.onchange=()=>{order=select.value;paint();};
    const query=make('input','apk-universe-search');query.placeholder='Sembol veya isim ara';root.append(query);query.oninput=paint;
    const start=button(root,'▶ GECİKMELİ TARAMAYI BAŞLAT',async()=>{const j=h.job();if(j&&['QUEUED','RUNNING','CANCELLING'].includes(j.status)){await h.api('/api/scans/'+j.id+'/cancel',{});return;}await h.startScan(h.settings.userSymbols?.length?h.settings.userSymbols:undefined);});
    button(root,'↻ KAYITLI TARAMAYA DEVAM ET',async()=>{const j=h.job();if(j&&['QUEUED','RUNNING','CANCELLING'].includes(j.status))return;if(!j)throw Error('Devam edilecek kayıtlı tarama yok.');await h.startScan(undefined,j.id);});
    button(root,'↻ BAŞARISIZ VE EKSİKLERİ YENİDEN DENE',async()=>{const j=h.job();if(!j||!(j.insufficient+j.errors))throw Error('Yeniden denenecek kayıt yok.');await h.startScan(undefined,j.id,true);});
    const status=text(root,'Henüz tarama yapılmadı.',12,true);
    text(outer,'YALNIZCA BIST TEKNİK GÖZLEMİ • VİOP sözleşmeleri taranmadı. TÜMÜ sekmesi gerçek VİOP kapsamını değildir.',10);outer.append(results);
    let timer,rows=[],stamp='',loading=false;
    async function paint(){if(!outer.isConnected){clearInterval(timer);return;}const j=h.job();start.textContent=j&&['QUEUED','RUNNING','CANCELLING'].includes(j.status)?'■ TARAMAYI DURDUR':'▶ GECİKMELİ TARAMAYI BAŞLAT';status.textContent=j?j.status+' • '+j.processed+'/'+j.total+' • Başarılı '+j.successful+' • Yetersiz '+j.insufficient+' • Hata '+j.errors:'Henüz tarama yapılmadı.';
      if(j&&stamp!==j.id+':'+j.processed&&!loading){loading=true;try{const all=[];for(let page=1;page<=20;page++){const data=await h.api('/api/scans/'+j.id+'/results?size=100&page='+page);all.push(...data.results);if(all.length>=data.total)break;}rows=all;stamp=j.id+':'+j.processed;}finally{loading=false;}}
      results.replaceChildren();if(market==='VIOP'){text(results,'Lisanslı VİOP verisi yok. VİOP sonucu üretilmedi.');return;}
      const q=query.value.toLocaleUpperCase('tr-TR'),items=rows.filter(x=>(x.symbol+' '+(x.companyName||'')).toLocaleUpperCase('tr-TR').includes(q));items.sort((a,b)=>order==='symbol'?a.symbol.localeCompare(b.symbol):order==='score'?b.score-a.score:order==='price_desc'?b.price-a.price:a.price-b.price);
      for(const x of items){const row=make('button','apk-universe-result');row.append(make('strong','',x.symbol),make('span','',valuation?'Finansal veri doğrulanmadı':fmtPrice(x.price)+' • '+x.signalValidity+' • '+x.score+'/100'));row.onclick=()=>h.navigate('stock_detail',{symbol:x.symbol,opportunity:x});results.append(row);}
    }
    timer=setInterval(()=>paint().catch(e=>status.textContent=e.message),2000);paint();
  }
  const fmtPrice=x=>Number.isFinite(x)?x.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  window.AndroidProgrammatic={render};
})();
