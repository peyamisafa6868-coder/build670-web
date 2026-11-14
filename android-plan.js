/* BUILD670 Plan: read-only presentation of the Kotlin scan audit.
 * No trading criteria, prices, or technical calculations are changed here.
 */
(() => {
  'use strict';
  const codeMap={
    STALE_DATA:['Veri güncelliği doğrulanamadı','Tarama verisi güncel kabul edilmiyor. Yeni kapanmış mum ve kaynak zamanını doğrulayın.'],
    MISSING_VOLUME:['Hacim teyidi yok','Tarama kaydında pozitif ve doğrulanmış hacim kanıtı bulunmuyor. Eksik hacim sıfır kabul edilmemeli.'],
    DIRECTION_CONFLICT:['Teknik yönler birbirini doğrulamıyor','LONG ve SHORT bileşenlerinin puan farkı karar eşiği için yetersiz. Bu, farklı zaman dilimi cezasından ayrı bir kontroldür.'],
    LOW_SCORE:['Teknik puan yetersiz','Karar motorunun puan eşiği aşılmadı. Puan tek başına işlem onayı değildir.'],
    TIMEFRAME_CONFLICT:['Zaman dilimleri uyuşmuyor','Bağımsız zaman dilimi değerlendirmelerinin ortak yönü doğrulanmadı.'],
    INSUFFICIENT_SIGNAL_COVERAGE:['Sinyal kanıtı eksik','Kullanılabilir sinyal bileşenlerinin ağırlığı gerekli seviyeye ulaşmadı.'],
    LOW_CONFIDENCE:['Veri güveni düşük','Veri güveni eşiği sağlanmadı.'],
    DATA_CONFIDENCE_BLOCKED:['Veri güveni işlemi engelliyor','Zorunlu veri güveni şartı yerine getirilemedi.'],
    MISSING_CANDLE:['Kapanmış mum kanıtı eksik','Yeterli doğrulanmış kapanmış mum olmadan işlem onayı verilmez.'],
    PROVIDER_DEGRADED:['Veri kaynağı doğrulanmadı','Sağlayıcı durumu yeterli güveni sağlamıyor.'],
    CONTRACT_UNRESOLVED:['Sembol doğrulaması başarısız','Sembol ve veri kaynağı kimliği eşleştirilemedi.'],
    MISSING_OI:['Açık pozisyon verisi yok','Bu piyasa için gerekliyse açık pozisyon verisi doğrulanmalı.']
  };
  function unique(items){return [...new Set(items.filter(Boolean))];}
  function number(value){return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=100?value:null;}
  function formatScore(value){return value===null?'—':new Intl.NumberFormat('tr-TR',{maximumFractionDigits:0}).format(value);}
  function parse(lines){
    const raw=Array.isArray(lines)?lines.filter(v=>typeof v==='string').map(x=>x.trim()).filter(Boolean):[];
    const reasons=[];const riskNotes=[];
    let conflictPenalty=null,anomaly=null,decision='';
    for(const line of raw){
      if(line.startsWith('V531_REASON='))reasons.push(line.slice('V531_REASON='.length).trim());
      if(line.startsWith('V531_AUDIT=REASONS='))reasons.push(...line.slice('V531_AUDIT=REASONS='.length).split(','));
      if(line.startsWith('RISK_NOTE='))riskNotes.push(line.slice('RISK_NOTE='.length).trim());
      const conflict=line.match(/^(?:V531_AUDIT=)?(?:V531_)?CONFLICT_PENALTY=(\d+)$/);
      if(conflict)conflictPenalty=Number(conflict[1]);
      if(line.startsWith('V531_AUDIT=DECISION='))decision=line.slice('V531_AUDIT=DECISION='.length).trim();
      const volume=line.match(/^VOLUME_ANOMALY_PCT=(-?\d+(?:\.\d+)?)$/);
      if(volume)anomaly=Number(volume[1]);
    }
    const supported=unique(reasons.map(x=>x.trim()).filter(x=>Object.hasOwn(codeMap,x)));
    // Preserve every original audit line in the detail disclosure; remove only
    // duplicate summaries in the user-facing overview.
    const notes=unique(riskNotes.flatMap(s=>s.split(/(?<=[.!?])\s+/).map(v=>v.trim())));
    return {raw,reasons:supported,riskNotes:notes,conflictPenalty,anomaly,decision};
  }
  function summarize(opportunity,context={}){
    if(!opportunity||typeof opportunity!=='object'||(context.symbol&&opportunity.symbol!==context.symbol)){
      return {hasScan:false,title:'Tarama planı bulunamadı',status:'VERİ YOK',technical:null,risk:null,confidence:null,
        cards:[],notes:['Seçili sembol için eşleşen tarama kaydı yok. Grafik göstergeleri ayrı olarak incelenebilir.'],raw:[]};
    }
    const audit=parse(opportunity.scoreBreakdown),technical=number(opportunity.score),risk=number(opportunity.riskScore),confidence=number(opportunity.dataConfidenceScore);
    const confirmed=opportunity.licensedProviderConnected===true&&opportunity.signalAttestationVerified===true&&
      ['LONG','SHORT'].includes(opportunity.publishedDirection)&&opportunity.signalValidity==='VALID';
    const title=confirmed?(opportunity.publishedDirection==='LONG'?'Onaylı LONG':'Onaylı SHORT'):'İZLE — Onaylı AL/SAT yok';
    const cards=audit.reasons.map(code=>({code,title:codeMap[code][0],detail:codeMap[code][1]}));
    if(!confirmed&&!cards.length)cards.push({code:'NOT_VERIFIED',title:'İşlem onayı yok',detail:'Tarama kaydı doğrulanmış, lisanslı ve imzalı canlı işlem sinyali sağlamıyor.'});
    const notes=[];
    if(audit.conflictPenalty===0&&audit.reasons.includes('DIRECTION_CONFLICT'))
      notes.push('Yön uyuşmazlığı, LONG/SHORT puan farkı kontrolüdür. CONFLICT_PENALTY=0 ise ayrı zaman dilimi cezası uygulanmamış olabilir; bunlar çelişen ölçümler değildir.');
    if(audit.reasons.includes('MISSING_VOLUME')){
      const vol=context.lastVolume;
      const volumeObservation=typeof vol==='number'&&Number.isFinite(vol)?(vol===0?'Seçili grafiğin son kapanmış mum hacmi 0.':vol>0?'Seçili grafiğin son kapanmış mumunda pozitif hacim var.':'Grafiğin hacmi geçersiz.'):'Grafikteki son hacim mevcut değil.';
      notes.push(volumeObservation+' Bu grafik gözlemi, farklı zamanda hesaplanmış tarama hacim kanıtının yerine geçmez.');
      if(audit.anomaly!==null)notes.push('Tarama anomali kaydı '+audit.anomaly.toLocaleString('tr-TR')+'%. Hacim teyidi eksikken bu değer gerçek piyasa hacminin o oranda değiştiği biçiminde yorumlanamaz.');
    }
    if(context.periodMatches===false)notes.push('Plan farklı veya doğrulanmamış bir periyottaki taramadan geliyor; grafikle anlık sinyal eşleşmesi değildir.');
    else notes.push('Tarama planı ve seçili grafik aynı periyotta olsa bile farklı hesaplama anlarına aittir.');
    if(audit.riskNotes.length)notes.push('Diğer risk notları: '+audit.riskNotes.join(' · '));
    return {hasScan:true,title,status:confirmed?'DOĞRULANMIŞ':'İZLE',technical,risk,confidence,cards,notes,raw:audit.raw,
      reasonCodes:audit.reasons,conflictPenalty:audit.conflictPenalty,anomaly:audit.anomaly,
      scoreLabel:formatScore(technical),riskLabel:formatScore(risk),confidenceLabel:formatScore(confidence),
      signalVerified:confirmed};
  }
  const api=Object.freeze({parse,summarize});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.Build670Plan=api;
})();
