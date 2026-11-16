(function(root){
 'use strict';
 const categories=['房租','水電網路','車資','信用卡費','分期款項','醫療','娛樂','人情','飲料','宵夜','其他'];
 const mealNames=['早餐','午餐','晚餐'];
 const clone=x=>JSON.parse(JSON.stringify(x));
 const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 function cycleKey(date=new Date()){const d=new Date(date);if(d.getDate()<5)d.setMonth(d.getMonth()-1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
 function dates(key){const [y,m]=key.split('-').map(Number),end=new Date(y,m,4),out=[];for(let d=new Date(y,m-1,5);d<=end;d.setDate(d.getDate()+1))out.push(iso(d));return out;}
 const defaults=()=>({income:43000,savingTarget:10000,fixed:[{id:'rent',name:'房租',category:'房租',budget:10000,actual:null,done:false,date:null},{id:'subscription',name:'訂閱',category:'其他',budget:800,actual:null,done:false,date:null},{id:'fuel',name:'加油',category:'車資',budget:300,actual:null,done:false,date:null}],days:{}});
 const initial=()=>({version:1,savings:null,cycles:{}});
 const item=()=>({budget:null,actual:null,done:false});
 function day(c,date){return c.days[date]||(c.days[date]={meals:[item(),item(),item()],other:[]});}
 function stats(c){let budget=0,spent=0,forecast=0,unknown=0;const add=x=>{budget+=x.budget??0;spent+=x.actual??0;forecast+=x.done?(x.actual??0):Math.max(x.budget??0,x.actual??0);if(x.budget===null)unknown++;};c.fixed.forEach(add);Object.values(c.days).forEach(d=>{d.meals.forEach(add);d.other.forEach(add);});const unrecorded=dates(c.key||'2000-01').filter(d=>!c.days[d]).length;return {budget,spent,forecast,available:c.income-spent,projected:c.income-forecast,unknown:unknown+unrecorded*3};}
 function validMoney(n,nullable=true){return (nullable&&n===null)||(typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1e9&&Math.abs(Math.round(n*100)-n*100)<0.00001);}
 function validate(s){
  const fail=()=>{throw new Error('備份格式或金額不正確，未變更目前資料。');};
  if(!s||s.version!==1||!validMoney(s.savings)||!s.cycles||typeof s.cycles!=='object'||Array.isArray(s.cycles))fail();
  const check=x=>{if(!x||!validMoney(x.budget)||!validMoney(x.actual)||typeof x.done!=='boolean'||(x.done&&x.actual===null))fail();};
  for(const [key,c] of Object.entries(s.cycles)){
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)||+key.slice(0,4)<1900||+key.slice(0,4)>2200||!c||!validMoney(c.income,false)||!validMoney(c.savingTarget,false)||!Array.isArray(c.fixed)||c.fixed.length>100||!c.days||typeof c.days!=='object'||Array.isArray(c.days))fail();
   const allowed=dates(key),ids=new Set();
   c.fixed.forEach(x=>{check(x);if(typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||x.name.length>80||!categories.includes(x.category)||(x.date!==null&&!allowed.includes(x.date)))fail();ids.add(x.id);});
   for(const [date,d] of Object.entries(c.days)){if(!allowed.includes(date)||!d||!Array.isArray(d.meals)||d.meals.length!==3||!Array.isArray(d.other)||d.other.length>500)fail();d.meals.forEach(check);d.other.forEach(x=>{check(x);if(!categories.includes(x.category)||typeof x.note!=='string'||x.note.length>200)fail();});}
  }
  return s;
 }
 const api={categories,mealNames,clone,iso,cycleKey,dates,defaults,initial,item,day,stats,validate,validMoney};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Ledger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
