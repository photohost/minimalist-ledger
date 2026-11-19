(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 function shift(date,amount){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+amount);return L.iso(d);}
 function summary(c,date){
  const d=c.days[date]||{meals:[L.item(),L.item(),L.item()],other:[]};
  const fixed=c.fixed.filter(x=>x.date===date),others=[...d.other,...fixed];
  const entries=d.meals.map((x,i)=>({...x,name:L.mealNames[i],kind:String(i)}));
  entries.push({name:'其他',kind:'other',actual:others.some(x=>x.actual!==null)?others.reduce((n,x)=>n+(x.actual??0),0):null,budget:others.some(x=>x.budget!==null)?others.reduce((n,x)=>n+(x.budget??0),0):null,done:others.length>0&&others.every(x=>x.done)});
  const spent=Math.round(entries.reduce((n,x)=>n+(x.actual??0),0)*100)/100;
  const cycle=L.stats({...c,key:L.cycleKey(new Date(date+'T12:00:00'))});
  return {entries,spent,cycleSpent:cycle.spent,cycleBudget:cycle.budget,ratio:cycle.budget>0?cycle.spent/cycle.budget*100:null,incomplete:cycle.unknown>0};
 }
 function watchDay(onChange,{now=()=>new Date(),setTimer=setTimeout,clearTimer=clearTimeout}={}){
  let last=L.iso(now()),timer;
  function check(){const current=L.iso(now());if(current!==last){last=current;onChange(current);}return current;}
  function schedule(){clearTimer(timer);const d=now(),next=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);timer=setTimer(()=>{check();schedule();},Math.max(1,next-d+50));timer?.unref?.();}
  schedule();return {check,stop(){clearTimer(timer);}};
 }
 const api={shift,summary,watchDay};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DailyLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
