(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 function shift(date,amount){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+amount);return L.iso(d);}
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 function budgetStatus(c,key){
  const s=L.stats({...c,key}),days=L.dates(key).length,mealBudget=s.buckets.meals.budget,otherBudget=s.buckets.other.budget;
  const fixedReserve=round(Math.max(s.buckets.fixed.budget??0,L.fixedRows(c).reduce((n,x)=>n+Math.max(x.budget??0,x.actual??0),0)));
  const savings=c.budgets?c.budgets.savings:c.savingTarget;
  const configured=mealBudget!==null&&otherBudget!==null?round(mealBudget+otherBudget):null;
  const incomePool=c.income!==null&&savings!==null?round(c.income-savings-fixedReserve):null;
  const pool=configured!==null&&incomePool!==null?Math.min(configured,incomePool):configured??incomePool;
  return {mealBudget,days,fixedReserve,pool,dailyMealBudget:mealBudget===null?null:mealBudget/days,dailyTotalBudget:pool===null?null:pool/days,remainingMeals:mealBudget===null?null:round(mealBudget-s.buckets.meals.spent),remainingTotal:pool===null?null:round(pool-s.buckets.meals.spent-s.buckets.other.spent)};
 }
 function summary(c,date){
  const d=c.days[date]||{meals:[L.item(),L.item(),L.item()],other:[]};
  const others=d.other;
  const entries=d.meals.map((x,i)=>({...x,name:L.mealNames[i],kind:String(i)}));
  entries.push({name:'其他',kind:'other',actual:others.some(x=>x.actual!==null)?others.reduce((n,x)=>n+(x.actual??0),0):null,budget:others.some(x=>x.budget!==null)?others.reduce((n,x)=>n+(x.budget??0),0):null,done:others.length>0&&others.every(x=>x.done)});
  const spent=Math.round(entries.reduce((n,x)=>n+(x.actual??0),0)*100)/100;
  const cycle=L.stats({...c,key:L.cycleKey(new Date(date+'T12:00:00'))});
  const budgets=budgetStatus(c,L.cycleKey(new Date(date+'T12:00:00'))),mealSpent=round(d.meals.reduce((n,x)=>n+(x.actual??0),0));
  const overspent=(budgets.dailyMealBudget!==null&&mealSpent>budgets.dailyMealBudget+0.000001)||(budgets.dailyTotalBudget!==null&&spent>Math.max(0,budgets.dailyTotalBudget)+0.000001);
  return {entries,spent,mealSpent,cycleSpent:cycle.spent,cycleBudget:cycle.budget,ratio:budgets.dailyMealBudget>0?mealSpent/budgets.dailyMealBudget*100:null,incomplete:cycle.unknown>0,...budgets,overspent};
 }
 function watchDay(onChange,{now=()=>new Date(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let last=L.iso(now()),timer;
  function check(){const current=L.iso(now());if(current!==last){last=current;onChange(current);}return current;}
  function schedule(){clearTimer(timer);const d=now(),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);timer=setTimer(()=>{check();schedule();},Math.max(1,next-d+50));timer?.unref?.();}
  schedule();return {check,stop(){clearTimer(timer);}};
 }
 const api={shift,summary,budgetStatus,watchDay};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DailyLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
