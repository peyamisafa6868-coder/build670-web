/* Exact view predicates/order from ScanResultsActivity and OpportunityActivity. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.AndroidResults=api;})(typeof window==='object'?window:globalThis,()=>{
  'use strict';
  const sorts=['SCORE','DATA_QUALITY','LOW_RISK','HIGH_VOLUME','CHEAPEST'];
  const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
  // Original Kotlin TrendUiState is authoritative. Direction, daily change,
  // opportunity score and LIVE/AL/SAT must never be inferred from visual colors.
  // Two discrete brightness tiers correspond to BULLISH/STRONG_BULLISH and
  // BEARISH/STRONG_BEARISH. Unknown, stale and unverified trends stay neutral.
  function trendGlow(trend){
    const palettes={
      BULLISH:{direction:'UP',level:1,red:108,green:245,blue:65},
      STRONG_BULLISH:{direction:'UP',level:2,red:57,green:255,blue:20},
      BEARISH:{direction:'DOWN',level:1,red:255,green:94,blue:103},
      STRONG_BEARISH:{direction:'DOWN',level:2,red:255,green:28,blue:64}
    };
    const match=trend&&typeof trend.state==='string'?palettes[trend.state]:null;
    return match?{...match,state:trend.state}:null;
  }
  function apply(rows,{view='scan_results',filter='ALL',sort='SCORE',verifiedOnly=false,delayed=true,mode='ALL'}={}){
    let result=rows.filter(x=>{
      if(view!=='opportunity')return mode==='LONG'||mode==='SHORT'?!delayed&&x.direction?.toUpperCase()===mode:mode==='HIGH_POWER'?(delayed?x.score:x.finalSignalScore)>=85:true;
      const p=x.discovery||{},verified=x.trendDisplay?.verifiedSignal===true;
      const selected=({ALL:()=>true,STRONG_BUY:()=>verified&&x.direction?.toUpperCase()==='LONG'&&['GÜÇLÜ AL','AL'].includes(p.classification),STRONG_SELL:()=>verified&&x.direction?.toUpperCase()==='SHORT'&&['GÜÇLÜ SAT','SAT'].includes(p.classification),WATCH:()=>!verified&&!['YETERSİZ VERİ','REDDEDİLDİ'].includes(p.classification),INSUFFICIENT:()=>p.classification==='YETERSİZ VERİ',REJECTED:()=>p.classification==='REDDEDİLDİ',CATALYST:()=>p.catalystAvailable===true,LOW_RISK:()=>p.lowRisk===true,HIGH_VOLUME:()=>p.highVolume===true})[filter];
      return !!selected?.()&&(!verifiedOnly||verified);
    });
    if(view==='opportunity'){
      const compare={SCORE:(a,b)=>finite(b.rankingScore)-finite(a.rankingScore)||finite(b.finalSignalScore)-finite(a.finalSignalScore)||finite(a.riskScore)-finite(b.riskScore),DATA_QUALITY:(a,b)=>finite(b.dataConfidenceScore)-finite(a.dataConfidenceScore),LOW_RISK:(a,b)=>finite(a.riskScore)-finite(b.riskScore),HIGH_VOLUME:(a,b)=>finite(b.technical?.volumeRatio,-1)-finite(a.technical?.volumeRatio,-1),CHEAPEST:(a,b)=>(a.price>0?a.price:Number.MAX_VALUE)-(b.price>0?b.price:Number.MAX_VALUE)}[sort];
      if(compare)result.sort(compare);
    }else result.sort((a,b)=>Number(b.rankingStatus==='CALCULATED')-Number(a.rankingStatus==='CALCULATED')||finite(b.rankingScore)-finite(a.rankingScore)||finite(b.finalSignalScore)-finite(a.finalSignalScore)||finite(b.dataConfidenceScore)-finite(a.dataConfidenceScore)||finite(a.riskScore)-finite(b.riskScore)||a.symbol.localeCompare(b.symbol,'en'));
    return result;
  }
  // Home trend comes only from the Kotlin TrendUiPolicy output. Signal validity
  // and ranking score are deliberately not used to infer market direction.
  function trendCategory(row){
    const state=row?.trendDisplay?.trend?.state;
    if(['BULLISH','STRONG_BULLISH'].includes(state))return 'UP';
    if(['BEARISH','STRONG_BEARISH'].includes(state))return 'DOWN';
    if(state==='NEUTRAL')return 'FLAT';
    if(['CONFLICTING','MIXED'].includes(state))return 'MIXED';
    return 'UNKNOWN';
  }
  function signalCategory(row,attestationVerified=false){
    if(row?.signalValidity==='INSUFFICIENT')return 'INSUFFICIENT';
    if(row?.signalValidity==='ERROR')return 'ERROR';
    const verified=attestationVerified&&row?.signalValidity==='VALID'&&row?.trendDisplay?.verifiedSignal===true;
    if(verified&&row.direction==='LONG')return 'BUY';
    if(verified&&row.direction==='SHORT')return 'SELL';
    if(row?.signalValidity==='WATCH')return 'WATCH';
    return 'NONE';
  }
  function homeSelect(rows,{trend='ALL',signal='ALL',attestationVerified=false}={}){
    return rows.filter(row=>(trend==='ALL'||trendCategory(row)===trend)
      &&(signal==='ALL'||(signal==='VERIFIED'?['BUY','SELL'].includes(signalCategory(row,attestationVerified)):signalCategory(row,attestationVerified)===signal)));
  }
  const trendNames={UP:'Yükseliş',DOWN:'Düşüş',FLAT:'Yatay',MIXED:'Çelişkili',UNKNOWN:'Belirsiz'};
  const signalNames={WATCH:'İzleniyor',NONE:'Sinyal yok',INSUFFICIENT:'Yetersiz veri',ERROR:'İşlem hatası',BUY:'Onaylı AL',SELL:'Onaylı SAT'};
  function scanStatusLabel(job){
    if(!job)return 'Tarama yapılmadı';
    if(job.status==='CANCELLED')return 'İptal edildi';
    if(job.status==='FAILED'||job.status==='INTERRUPTED')return 'Tarama başarısız';
    if(job.status==='COMPLETED_WITH_ERRORS')return 'Hatalarla tamamlandı';
    if(job.status==='COMPLETE')return job.insufficient>0?'Eksik veriyle tamamlandı':'Tamamlandı';
    if(job.status==='CANCELLING')return 'İptal ediliyor';
    return ['QUEUED','RUNNING'].includes(job.status)?'Tarama sürüyor':'Tarama durumu bilinmiyor';
  }
  function scanProgress(job){
    const total=Number.isInteger(job?.total)&&job.total>0?job.total:0;
    const processed=total?Math.min(total,Math.max(0,job.processed||0)):0;
    const completed=total>0&&processed===total;
    return {total,processed,pending:total-processed,
      percentage:total?Math.min(completed?100:99.9,processed/total*100):0};
  }
  return {apply,sorts,trendGlow,trendCategory,signalCategory,homeSelect,trendNames,signalNames,scanStatusLabel,scanProgress};
});
