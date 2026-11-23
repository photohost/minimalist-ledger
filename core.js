(function(root){
 'use strict';
 const categories=['房租','水電網路','車資','信用卡費','分期款項','醫療','娛樂','人情','飲料','宵夜','其他'];
 // 每日「其他」不列出固定支出專用的分類，避免與設定中的房租重複記帳。
 const dailyCategories=categories.filter(x=>x!=='房租');
 const mealNames=['早餐','午餐','晚餐'],budgetKeys=['meals','other','fixed','savings'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function cycleKey(date=new Date()){const d=new Date(date);if(d.getDate()<5)d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
 function dates(key){const [y,m]=key.split('-').map(Number),end=new Date(y,m,4),out=[];for(let d=new Date(y,m-1,5);d<=end;d.setDate(d.getDate()+1))out.push(iso(d));return out;}
 const item=()=>({budget:null,actual:null,done:false});
 const fixedItem=(id,name,category)=>({id,name,category,...item(),date:null});
 const defaults=()=>({income:null,savingTarget:null,budgets:{meals:null,other:null,fixed:null,savings:null},fixed:[fixedItem('rent','房租','房租'),{...fixedItem('subscription','訂閱','其他'),items:[]}],days:{}});
 const initial=()=>({version:1,savings:null,cycles:{}});
 function day(c,date){return c.days[date]||(c.days[date]={meals:[item(),item(),item()],other:[]});}
 function fixedRows(c){return c.fixed.flatMap(x=>x.id==='subscription'&&Array.isArray(x.items)&&x.items.length?x.items.map(y=>({...y,category:'其他',parent:'subscription'})):[x]);}
 function fixedTotal(x){const rows=x.id==='subscription'&&x.items?.length?x.items:[x];return {budget:rows.some(y=>y.budget!==null)?rows.reduce((n,y)=>n+(y.budget??0),0):null,actual:rows.some(y=>y.actual!==null)?rows.reduce((n,y)=>n+(y.actual??0),0):null,done:rows.every(y=>y.done),count:x.items?.length||0};}
 const round=n=>Math.round((n+Number.EPSILON)*100)/100;
 function stats(c){
  const groups={meals:[],other:[...(c.undatedOther||[])],fixed:fixedRows(c)};Object.values(c.days).forEach(d=>{groups.meals.push(...d.meals);groups.other.push(...d.other);});
  const buckets={};for(const [key,rows] of Object.entries(groups))buckets[key]={spent:round(rows.reduce((n,x)=>n+(x.actual??0),0)),planned:round(rows.reduce((n,x)=>n+(x.budget??0),0)),forecast:round(rows.reduce((n,x)=>n+(x.done?(x.actual??0):Math.max(x.budget??0,x.actual??0)),0))};
  const grouped=!!c.budgets;let budget=0,forecast=0,unknown=0;
  for(const [key,b] of Object.entries(buckets)){b.budget=grouped?c.budgets[key]:b.planned;budget+=b.budget??0;forecast+=grouped?Math.max(b.budget??0,b.forecast):b.forecast;}
  if(grouped)unknown=budgetKeys.filter(k=>c.budgets[k]===null).length;
  else {unknown=Object.values(groups).flat().filter(x=>x.budget===null).length;unknown+=dates(c.key||'2000-01').filter(d=>!c.days[d]).length*3;}
  const spent=round(Object.values(buckets).reduce((n,b)=>n+b.spent,0)),savingTarget=grouped?c.budgets.savings:c.savingTarget;
  return {budget:round(budget),spent,forecast:round(forecast),available:c.income===null?null:round(c.income-spent),projected:c.income===null?null:round(c.income-forecast),unknown,buckets,savingTarget,allocation:round(budget+(savingTarget??0))};
 }
 function validMoney(n,nullable=true){return (nullable&&n===null)||(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9&&Math.abs(Math.round(n*100)-n*100)<0.00001);}
 function validate(s){
  const fail=()=>{throw new Error('備份格式或金額不正確，未變更目前資料。');};
  if(!s||s.version!==1||!validMoney(s.savings)||!s.cycles||typeof s.cycles!=='object'||Array.isArray(s.cycles))fail();
  const check=x=>{if(!x||!validMoney(x.budget)||!validMoney(x.actual)||typeof x.done!=='boolean'||(x.done&&x.actual===null))fail();};
  for(const [key,c] of Object.entries(s.cycles)){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)||+key.slice(0,4)<1900||+key.slice(0,4)>2200||!c||!validMoney(c.income)||!validMoney(c.savingTarget)||!Array.isArray(c.fixed)||c.fixed.length>100||!c.days||typeof c.days!=='object'||Array.isArray(c.days))fail();
   if(c.budgets!==undefined&&(!c.budgets||Array.isArray(c.budgets)||budgetKeys.some(k=>!validMoney(c.budgets[k]))))fail();
   if(c.undatedOther!==undefined){if(!Array.isArray(c.undatedOther)||c.undatedOther.length>100)fail();c.undatedOther.forEach(x=>{check(x);if(!categories.includes(x.category)||typeof x.note!=='string'||x.note.length>200)fail();});}
   const allowed=new Set(dates(key)),ids=new Set();
   const named=(x,set)=>{check(x);if(typeof x.id!=='string'||set.has(x.id)||typeof x.name!=='string'||x.name.length>80||(x.date!==null&&!allowed.has(x.date)))fail();set.add(x.id);};
   c.fixed.forEach(x=>{named(x,ids);if(!categories.includes(x.category))fail();if(x.items!==undefined){if(x.id!=='subscription'||!Array.isArray(x.items)||x.items.length>100)fail();const subIds=new Set();x.items.forEach(y=>named(y,subIds));}});
   for(const [date,d] of Object.entries(c.days)){if(!allowed.has(date)||!d||!Array.isArray(d.meals)||d.meals.length!==3||!Array.isArray(d.other)||d.other.length>500)fail();d.meals.forEach(check);d.other.forEach(x=>{check(x);if(!categories.includes(x.category)||typeof x.note!=='string'||x.note.length>200)fail();});}
  }
  return s;
 }
 function migrate(s){
  validate(s);const out=clone(s);
  for(const [key,c] of Object.entries(out.cycles)){
   for(const x of c.fixed.filter(x=>!['rent','subscription'].includes(x.id)))if(x.actual!==null||x.budget!==null){const row={category:x.category,note:'舊固定支出・'+x.name,budget:x.budget,actual:x.actual,done:x.done};if(x.date)day(c,x.date).other.push(row);else(c.undatedOther??=[]).push(row);}
   c.fixed=c.fixed.filter(x=>['rent','subscription'].includes(x.id));
   for(const x of defaults().fixed)if(!c.fixed.some(y=>y.id===x.id))c.fixed.push(x);
   const sub=c.fixed.find(x=>x.id==='subscription');
   if(!Array.isArray(sub.items)){
    sub.items=[];if(sub.budget!==null||sub.actual!==null)sub.items.push({id:'legacy-subscription',name:'既有訂閱（未分類）',budget:sub.budget,actual:sub.actual,done:sub.done,date:sub.date});
    sub.budget=null;sub.actual=null;sub.done=false;sub.date=null;
   }
   c.fixed.find(x=>x.id==='rent').name='房租';sub.name='訂閱';
  }
  return out;
 }
 function breakdown(c,date){
  const d=c.days[date]||{meals:[item(),item(),item()],other:[]},rows=[];
  d.meals.forEach((x,i)=>{if(x.actual!==null)rows.push({name:mealNames[i],category:'三餐開銷',actual:x.actual});});
  d.other.forEach(x=>{if(x.actual!==null)rows.push({name:x.note||x.category,category:x.category,actual:x.actual});});
  return rows;
 }
 function normalizeAmount(text){
  return text.replace(/[０-９＋－＊／]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xfee0)).replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-');
 }
 function calculateAmount(text){
  if(text==='')return null;
  const expression=normalizeAmount(text);
  if(expression.length>80||!/^\d+(?:[+*/-]\d+)*$/.test(expression))throw Error('請用整數和加減乘除輸入完整算式。');
  // Accumulate exact fractions so intermediate divisions never round the bill.
  let total=0n,denominator=1n,term=0n,divisor=1n;
  for(const [,operator,digits] of expression.matchAll(/([+*/-]?)(\d+)/g)){
   const n=BigInt(digits);
   if(operator==='*'){term*=n;continue;}
   if(operator==='/'){
    if(n===0n)throw Error('無法除以 0，請修改算式。');
    divisor*=n;continue;
   }
   total=total*divisor+term*denominator;
   denominator*=divisor;
   term=operator==='-'?-n:n;
   divisor=1n;
  }
  total=total*divisor+term*denominator;
  denominator*=divisor;
  if(total<0n||total>1000000000n*denominator)throw Error('金額須介於 0 與 10 億元之間。');
  if(total%denominator!==0n)throw Error('算式結果有餘數，請調整為整元後再儲存。');
  return Number(total/denominator);
 }
 const api={round,categories,dailyCategories,mealNames,budgetKeys,clone,iso,cycleKey,dates,defaults,initial,item,day,stats,validate,validMoney,fixedRows,fixedTotal,migrate,breakdown,normalizeAmount,calculateAmount};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Ledger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
