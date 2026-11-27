(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 const D=typeof module!=='undefined'&&module.exports?require('./daily.js'):root.DailyLedger;
 const I=typeof module!=='undefined'&&module.exports?require('./insights.js'):root.LedgerInsights;
 const round=n=>Math.round(n*100)/100;
 const pick=(o)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==null&&v!==undefined));

 // 小光只拿到彙總：金額、日期與分類。備註、訂閱名稱、帳號資料都不會送出。
 function dayEntries(c,date){
  const day=c.days[date];if(!day)return [];
  const rows=day.meals.map((x,i)=>({name:L.mealNames[i],amount:x.actual??0}));
  for(const x of day.other)rows.push({name:'其他·'+x.category,amount:x.actual??0});
  return rows.filter(x=>x.amount>0);
 }
 function buildSummary(c,key,today){
  const dates=L.dates(key),a=I.analyze(c,key),s=a.stats,b=D.budgetStatus(c,key,s);
  const elapsed=dates.filter(d=>d<=today);
  const rows=elapsed.map(date=>{const entries=dayEntries(c,date),spent=round(entries.reduce((n,x)=>n+x.amount,0));
   const meals=round(entries.filter(x=>!x.name.startsWith('其他')).reduce((n,x)=>n+x.amount,0));
   const recorded=!!c.days[date]&&(c.days[date].meals.some(x=>x.actual!==null)||c.days[date].other.some(x=>x.actual!==null));
   const top=entries.slice().sort((x,y)=>y.amount-x.amount)[0];
   return {date,spent,meals,recorded,top:top?`${top.name} ${round(top.amount)}`:undefined};});
  const dayLimit=b.dailyTotalBudget,mealLimit=b.dailyMealBudget;
  const over=rows.filter(r=>(dayLimit!==null&&r.spent>Math.max(0,dayLimit)+0.000001)||(mealLimit!==null&&r.meals>mealLimit+0.000001))
   .sort((x,y)=>y.spent-x.spent).slice(0,5).map(r=>({date:r.date,spent:r.spent,top:r.top}));
  const heavy=rows.filter(r=>r.spent>0).sort((x,y)=>y.spent-x.spent).slice(0,3).map(r=>({date:r.date,spent:r.spent,top:r.top}));
  const savings=c.budgets?c.budgets.savings:c.savingTarget;
  return pick({
   period:{key,start:dates[0],end:dates[dates.length-1],today,daysTotal:dates.length,daysElapsed:elapsed.length},
   income:c.income,
   budgets:pick({meals:s.buckets.meals.budget,other:s.buckets.other.budget,fixed:s.buckets.fixed.budget,savings}),
   spent:{meals:s.buckets.meals.spent,other:s.buckets.other.spent,fixed:s.buckets.fixed.spent,total:s.spent},
   projectedSaving:s.projected,
   remainingBudget:b.remainingTotal,
   dailyAllowance:dayLimit===null?null:round(dayLimit),
   recordedDays:rows.filter(r=>r.recorded).length,
   overspentDays:over.length?over:undefined,
   heaviestDays:heavy.length?heavy:undefined,
   categories:a.categories.slice(0,5).map(x=>({name:x.name,spent:x.spent}))
  });
 }
 function fingerprint(summary){
  const text=JSON.stringify(summary);let h=5381;
  for(let i=0;i<text.length;i++)h=((h<<5)+h+text.charCodeAt(i))>>>0;
  return h.toString(36);
 }
 // 資料不足時不呼叫模型，避免對空帳本胡說八道。
 function hasData(summary){return (summary.spent?.meals||0)+(summary.spent?.other||0)>0;}
 const messages={401:'需要先用 Google 登入，我才能看你的帳。',429:'慢一點，我還在看上一份帳，等幾秒再問。',413:'這期的帳太長了，我讀不完。',503:'我現在連不上腦袋，晚點再試。',502:'我這次想不出話來，再問一次看看。'};
 async function requestReview(summary,fetchImpl=globalThis.fetch){
  const response=await fetchImpl('/minimalist-ledger-auth/review',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(summary)});
  let data={};try{data=await response.json();}catch{}
  if(!response.ok||typeof data.reply!=='string'||!data.reply)throw Error(messages[response.status]||'小光暫時無法點評，請稍後再試。');
  return data.reply;
 }
 const api={buildSummary,fingerprint,hasData,requestReview};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LedgerAI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
