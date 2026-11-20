(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 function analyze(c,key){
  const stats=L.stats({...c,key}),dates=L.dates(key),daily=dates.map(date=>({date,spent:Math.round(L.breakdown(c,date).reduce((n,x)=>n+x.actual,0)*100)/100}));
  const categories={};for(const x of [...Object.values(c.days).flatMap(d=>d.other),...(c.undatedOther||[])])categories[x.category]=(categories[x.category]||0)+(x.actual??0);
  let cumulative=0;daily.forEach(x=>{cumulative=Math.round((cumulative+x.spent)*100)/100;x.cumulative=cumulative;});
  return {stats,daily,categories:Object.entries(categories).map(([name,spent])=>({name,spent:Math.round(spent*100)/100})).filter(x=>x.spent>0).sort((a,b)=>b.spent-a.spent),undated:[...L.fixedRows(c).filter(x=>x.date===null),...(c.undatedOther||[])].reduce((n,x)=>n+(x.actual??0),0)};
 }
 function monthDates(key){const [y,m]=key.split('-').map(Number),last=new Date(y,m,0).getDate();return Array.from({length:last},(_,i)=>`${key}-${String(i+1).padStart(2,'0')}`);}
 const api={analyze,monthDates};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LedgerInsights=api;
})(typeof globalThis!=='undefined'?globalThis:this);
