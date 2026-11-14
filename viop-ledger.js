/* Browser-local port of ViopManualPositionStore and ViopV6Policy.size.
   Checked against the unchanged Kotlin classes; never sends a brokerage order. */
((root,factory)=>{const legacy=typeof module==='object'?require('./legacy-ledger.js'):(root.ViopLedger||{});const api={...legacy,...factory()};if(typeof module==='object')module.exports=api;else root.ViopLedger=api;})(globalThis,()=>{
  'use strict';
  const finite=Number.isFinite,integer=x=>Number.isSafeInteger(x)&&x>=0;
  const clone=x=>JSON.parse(JSON.stringify(x));
  function validate(items){
    if(!Array.isArray(items)||items.length>2000)throw Error('POSITION_STORAGE_CORRUPT');
    const ids=new Set(),brokers=new Set();
    for(const p of items){
      const fills=p.exits??[],broker=(p.brokerExecutionId||'LEGACY:'+p.id).trim();
      if(typeof p.id!=='string'||!p.id||ids.has(p.id)||brokers.has(broker)||
        typeof p.symbol!=='string'||!p.symbol||!['LONG','SHORT'].includes(p.side)||
        !integer(p.quantity)||p.quantity<1||!integer(p.openedAt)||p.openedAt<=0||
        ![p.entry,p.stop,p.target,p.multiplier,p.margin].every(x=>finite(x)&&x>0)||
        !finite(p.cost)||p.cost<0||!Array.isArray(fills)||
        (p.closedAt!=null&&(!integer(p.closedAt)||p.closedAt<p.openedAt||p.exitPrice==null))||
        (p.closedAt==null&&p.exitPrice!=null)||(p.exitPrice!=null&&(!finite(p.exitPrice)||p.exitPrice<=0))||
        fills.some(f=>!integer(f.quantity)||f.quantity<1||!finite(f.price)||f.price<=0||
          !integer(f.executedAt)||f.executedAt<p.openedAt||(p.closedAt!=null&&f.executedAt>p.closedAt)||
          !finite(f.extraFeeTry??0)||(f.extraFeeTry??0)<0)||
        fills.reduce((n,f)=>n+f.quantity,0)>p.quantity||
        (fills.length>0&&((fills.reduce((n,f)=>n+f.quantity,0)===p.quantity)!==(p.closedAt!=null))))
        throw Error('POSITION_STORAGE_CORRUPT');
      ids.add(p.id);brokers.add(broker);
    }
    return items;
  }
  const remaining=p=>Math.max(0,p.quantity-((p.exits??[]).length?p.exits.reduce((n,f)=>n+f.quantity,0):p.closedAt!=null?p.quantity:0));
  const fillPnl=(p,f)=>(f.price-p.entry)*(p.side==='LONG'?1:-1)*f.quantity*p.multiplier-f.quantity*p.cost-(f.extraFeeTry??0);
  const realized=p=>(p.exits??[]).length?p.exits.reduce((n,f)=>n+fillPnl(p,f),0):p.exitPrice!=null?(p.exitPrice-p.entry)*(p.side==='LONG'?1:-1)*p.quantity*p.multiplier-p.cost*p.quantity:null;
  const day=x=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(x);
  function summarize(items,now=Date.now()){
    validate(items);const active=items.filter(p=>remaining(p)>0),today=day(now);
    const loss=items.reduce((sum,p)=>sum+((p.exits??[]).length?
      p.exits.filter(f=>day(f.executedAt)===today).reduce((n,f)=>n+Math.min(0,fillPnl(p,f)),0):
      p.closedAt!=null&&day(p.closedAt)===today?Math.min(0,realized(p)??0):0),0);
    return {count:active.length,openRiskTry:active.reduce((n,p)=>n+remaining(p)*(Math.abs(p.entry-p.stop)*p.multiplier+p.cost),0),
      marginTry:active.reduce((n,p)=>n+remaining(p)*p.margin,0),dailyLossTry:-loss};
  }
  function size(x){
    const fail=reason=>({contracts:0,plannedRiskTry:0,reason});
    const {entry,stop,multiplier,costPerContract,marginPerContract}=x;
    const openRiskTry=x.openRiskTry??0,dailyLossTry=x.dailyLossTry??0,activePositions=x.activePositions??0,usedMarginTry=x.usedMarginTry??0;
    if(![entry,stop,multiplier,marginPerContract].every(v=>finite(v)&&v>0)||!finite(costPerContract)||costPerContract<0)return fail('RISK_INPUT_UNVERIFIED');
    if(![usedMarginTry,openRiskTry,dailyLossTry].every(v=>finite(v)&&v>=0)||!integer(activePositions))return fail('RISK_STATE_INVALID');
    if(activePositions>=2||dailyLossTry>=1000)return fail('RISK_CIRCUIT_BREAKER');
    const side=(x.direction??'LONG').toUpperCase();
    if(!(side==='LONG'&&stop<entry||side==='SHORT'&&stop>entry))return fail('INVALID_STOP_DIRECTION');
    if(usedMarginTry>=25000)return fail('MARGIN_LIMIT_REACHED');
    const per=Math.abs(entry-stop)*multiplier+costPerContract;
    if(per<=0||!finite(per))return fail('ZERO_STOP_DISTANCE');
    const count=Math.min(Math.floor(Math.min(250,500-openRiskTry,1000-dailyLossTry)/per),Math.floor((25000-usedMarginTry)/marginPerContract));
    const contracts=finite(count)&&count>=1&&count<=2147483647?count:0;
    return {contracts,plannedRiskTry:contracts*per,reason:contracts?'MANUAL_CONFIRMATION_REQUIRED':'NO_CONTRACT_FITS_LIMITS'};
  }
  function record(items,x,now=Date.now(),id=null){
    validate(items);const symbol=String(x.symbol??'').trim().toUpperCase(),side=String(x.side??'').trim().toUpperCase();
    const broker=String(x.brokerExecutionId??'').trim().toUpperCase(),fail=reason=>({accepted:false,reason,positions:items});
    if(!broker)return fail('BROKER_EXECUTION_ID_REQUIRED');
    if(!symbol||!['LONG','SHORT'].includes(side)||!integer(x.quantity)||x.quantity<1||x.quantity>2147483647||
      ![x.entry,x.stop,x.target,x.multiplier,x.margin].every(v=>finite(v)&&v>0)||!finite(x.cost)||x.cost<0||!integer(now)||now<=0)
      return fail('EXECUTED_TRADE_FIELDS_INVALID');
    if(items.some(p=>p.brokerExecutionId===broker))return fail('DUPLICATE_BROKER_EXECUTION');
    const s=summarize(items,now),limit=size({entry:x.entry,stop:x.stop,multiplier:x.multiplier,costPerContract:x.cost,marginPerContract:x.margin,
      openRiskTry:s.openRiskTry,dailyLossTry:s.dailyLossTry,activePositions:s.count,usedMarginTry:s.marginTry,direction:side});
    const breached=x.quantity>limit.contracts?'RISK_LIMIT_EXCEEDED:'+limit.reason+';allowed='+limit.contracts+';executed='+x.quantity:null;
    const position={id:id??globalThis.crypto.randomUUID(),symbol,side,quantity:x.quantity,entry:x.entry,stop:x.stop,target:x.target,
      multiplier:x.multiplier,cost:x.cost,margin:x.margin,openedAt:now,closedAt:null,exitPrice:null,brokerExecutionId:broker,riskViolationAtEntry:breached,exits:[]};
    const positions=[...clone(items),position];validate(positions);
    return {accepted:true,reason:breached?'RISK_BREACH_RECORDED':'EXECUTED_TRADE_RECORDED',positions,position};
  }
  function closePartial(items,id,quantity,price,executedAt=Date.now(),fee=0){
    validate(items);const fail=reason=>({accepted:false,reason,positions:items});
    if(!integer(quantity)||quantity<1||!finite(price)||price<=0||!finite(fee)||fee<0||!integer(executedAt))return fail('EXIT_FIELDS_INVALID');
    const p=items.find(p=>p.id===id&&remaining(p)>0);if(!p)return fail('OPEN_POSITION_NOT_FOUND');
    if(executedAt<p.openedAt)return fail('EXIT_BEFORE_ENTRY');
    if(quantity>remaining(p))return fail('EXIT_EXCEEDS_OPEN_QUANTITY');
    if(executedAt<Math.max(p.openedAt,...(p.exits??[]).map(f=>f.executedAt)))return fail('EXIT_BEFORE_PREVIOUS_FILL');
    const positions=clone(items),position=positions.find(x=>x.id===id),left=remaining(p)-quantity;
    position.exits=[...(position.exits??[]),{quantity,price,executedAt,extraFeeTry:fee}];
    position.closedAt=left===0?executedAt:null;position.exitPrice=left===0?price:null;validate(positions);
    return {accepted:true,reason:left===0?'MANUAL_JOURNAL_CLOSED':'PARTIAL_EXIT_RECORDED',positions,position};
  }
  return {validate,remaining,realized,fillPnl,summarize,size,record,closePartial};
});
