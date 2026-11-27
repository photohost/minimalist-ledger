'use strict';
/* 日常留白 1.10.0 · 由 build.cjs 產生，請勿直接編輯。 */
// --- core.js ---
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

// --- daily.js ---
(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 function shift(date,amount){const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+amount);return L.iso(d);}
const round=L.round;
 function budgetStatus(c,key,precomputed){
  const s=precomputed??L.stats({...c,key}),days=L.dates(key).length,mealBudget=s.buckets.meals.budget,otherBudget=s.buckets.other.budget;
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
  const budgets=budgetStatus(c,L.cycleKey(new Date(date+'T12:00:00')),cycle),mealSpent=round(d.meals.reduce((n,x)=>n+(x.actual??0),0));
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

// --- insights.js ---
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

// --- ai.js ---
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

// --- google-config.js ---
// Public Google OAuth Web application Client ID, configured once for all visitors.
// Never put a client secret or access token here.
window.LEDGER_GOOGLE_CONFIG = {
  clientId: '706785860796-s43aag5ai8d9tv132mo1j2oobuo57obt.apps.googleusercontent.com',
  keepSignedIn: true
};

// --- drive-store.js ---
(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 const SESSION_PATH='/minimalist-ledger-auth';
 const SCOPE='https://www.googleapis.com/auth/drive.file',API='https://www.googleapis.com/drive/v3/',MAX_BYTES=800000;
 function config(value){let x=value;if(typeof x==='string'){x=x.trim();if(x.startsWith('{'))x=JSON.parse(x);else x={clientId:x};}if(!x||Object.keys(x).some(k=>k!=='clientId'&&k!=='keepSignedIn')||(x.keepSignedIn!==undefined&&typeof x.keepSignedIn!=='boolean')||!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(x.clientId||''))throw Error('請填寫網頁應用程式的 Google OAuth 用戶端 ID（結尾為 .apps.googleusercontent.com），不是 Firebase 設定或用戶端密碼。');return {clientId:x.clientId,...(x.keepSignedIn?{keepSignedIn:true}:{})};}
 function payload(data){const text=JSON.stringify(L.migrate(data));if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('帳目上限為 800 KB，請先匯出備份。');return text;}
 function message(e){return e?.message||'Google Drive 操作未完成，請稍後重試。';}
 class DriveStore{
  constructor({token,user,clientId,expiresAt=0,fetchImpl=root.fetch,now=Date.now,refresh=null,retention=null}){this.retention={keepDays:7,keepCount:60,maxDeletes:6,...(retention||{})};this.token=token;this.user=user;this.uid=user.uid;this.projectId=clientId;this.expiresAt=expiresAt;this.now=now;this.fetchImpl=fetchImpl.bind(root);this.revision=undefined;this.busy=false;this.folderId=null;this.pending=null;this.preferredId=null;this.acceptedContent=null;this.availableIds=[];this.refresh=refresh;this.renewing=null;this.disconnected=false;}
  expired(){return !this.token||(this.expiresAt&&this.now()>=this.expiresAt);}
  setAccess(token,expiresAt){this.token=token;this.expiresAt=expiresAt;}
  disconnect(){this.disconnected=true;this.token='';}
  async authorize(force=false){
   if(this.disconnected)throw signInRequired();
   if(this.refresh&&(force||this.expired()||this.expiresAt-this.now()<60000)){
    this.renewing??=this.refresh(force).then(session=>{
     if(this.disconnected||session.user.uid!==this.uid)throw signInRequired();
     this.setAccess(session.accessToken,session.expiresAt);
    }).finally(()=>this.renewing=null);
    await this.renewing;
   }
   if(this.expired())throw signInRequired();
  }
  async request(path,{method='GET',body,headers={},text=false}={}){
   await this.authorize();
   const send=async()=>{
    try{return await this.fetchImpl(path.startsWith('https://')?path:API+path,{method,body,headers:{Authorization:'Bearer '+this.token,...headers},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});}
    catch{throw Error('無法連線 Google Drive。資料仍留在此瀏覽器，請稍後重試。');}
   };
   let r=await send();
   if(r.status===401&&this.refresh){await this.authorize(true);r=await send();}
   if(this.disconnected)throw signInRequired();
   if(!r.ok){
    let details={};try{details=await r.json();}catch{}
    const error=details?.error||{},reasons=[...(Array.isArray(error.errors)?error.errors.map(x=>x.reason):[]),...(Array.isArray(error.details)?error.details.map(x=>x.reason):[]),error.status].filter(x=>typeof x==='string'&&/^[A-Za-z0-9_]{1,80}$/.test(x));
    const mappings=[
     [['accessNotConfigured','SERVICE_DISABLED','API_DISABLED'],'網站專案尚未啟用 Google Drive API。請管理者在 Google Cloud 專案 '+this.projectId.split('-')[0]+' 啟用 Drive API，稍候再按「讀取雲端帳目」。'],
     [['insufficientPermissions','ACCESS_TOKEN_SCOPE_INSUFFICIENT'],'Google 授權未包含 Drive 檔案權限。請先匯出備份，再登出並重新登入，同意儲存帳目的檔案權限。'],
     [['storageQuotaExceeded'],'你的 Google Drive 儲存空間已滿，請釋出空間後重試。'],
     [['rateLimitExceeded','userRateLimitExceeded','dailyLimitExceeded','RATE_LIMIT_EXCEEDED'],'Google Drive 請求達到用量限制，請稍後再試；持續發生時請管理者檢查 API 配額。'],
     [['domainPolicy','DOMAIN_POLICY','adminPolicyEnforced'],'此帳號的機構管理政策禁止 Drive 存取，請聯絡 Google Workspace 管理者。'],
     [['insufficientFilePermissions','appNotAuthorizedToFile'],'目前帳號沒有此 Drive 檔案的存取權。請確認登入正確帳號，並由原本建立帳目的網站讀取。']
    ];
    let info=mappings.find(([codes])=>codes.some(c=>reasons.includes(c)))?.[1];
    if(r.status===401){this.token='';throw signInRequired();}
    if(r.status===404)info='Drive 帳目檔案已移除或無存取權，請重新讀取雲端。';
    if(r.status===429&&!info)info='Google Drive 請求過於頻繁，請稍後重試。';
    const code=reasons[0]||'HTTP_'+r.status;
    const failure=Error((info||'Google Drive 拒絕此操作，請將以下代碼提供給網站管理者。')+'（'+r.status+' / '+code+'）目前帳目仍留在此瀏覽器。');failure.code=code;failure.status=r.status;throw failure;
   }
   return text?await r.text():await r.json();
  }
  async list(query){let files=[],pageToken='';do{const p=new URLSearchParams({q:query,spaces:'drive',pageSize:'1000',fields:'nextPageToken,files(id,name,modifiedTime,appProperties,headRevisionId)',...(pageToken?{pageToken}:{})});const r=await this.request('files?'+p);if(!Array.isArray(r.files))throw Error('Drive 檔案清單格式錯誤。');files.push(...r.files);pageToken=r.nextPageToken||'';if(files.length>20000)throw Error('帳目版本過多，請先匯出備份並整理 Drive 資料夾。');}while(pageToken);return files;}
  async history(){
   const files=await this.list("trashed = false and appProperties has { key='ledger' and value='minimalist-v1' }");
   const parentsById=new Map(files.map(file=>[file.id,Object.entries(file.appProperties||{}).filter(([key])=>/^p\d+$/.test(key)).map(([,id])=>id)]));
   const parentIds=new Set([...parentsById.values()].flat());
   const heads=files.filter(file=>!parentIds.has(file.id)).sort((a,b)=>a.id.localeCompare(b.id));
   if(!heads.length&&files.length)throw Error('Drive 帳目版本關係異常，請先保留本機帳目。');
   const reachable=new Set(),remaining=heads.map(file=>file.id);
   while(remaining.length){const id=remaining.pop();if(reachable.has(id))continue;reachable.add(id);remaining.push(...(parentsById.get(id)||[]));}
   const extendsLocal=!this.revision||this.revision.split(',').every(id=>reachable.has(id));
   return {heads,revision:heads.map(file=>file.id).join(','),extendsLocal,files};
  }
  async read(history){
   const {heads,revision,extendsLocal}=history??await this.history();
   if(!heads.length)return {revision,data:null};
   const file=heads.length===1?heads[0]:heads.find(head=>head.id===this.preferredId);
   if(!file)return {revision,data:null,conflicts:heads};
   // Drive still reports the version we already hold: reuse it instead of downloading the ledger again.
   const known=this.acceptedContent;
   if(known&&known.id===file.id&&known.headRevisionId&&known.headRevisionId===file.headRevisionId)return {revision,data:JSON.parse(known.text),file,extendsLocal,unchanged:true};
   const text=await this.request('files/'+encodeURIComponent(file.id)+'?alt=media',{text:true});
   if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Drive 帳目超過大小上限，未覆寫資料。');
   let data;
   try{data=L.migrate(JSON.parse(text));}catch{throw Error('Drive 帳目格式錯誤，未覆寫目前帳目。');}
   return {revision,data,file,extendsLocal};
  }
  accept(remote){
   if(remote.conflicts)throw Error('請先選擇衝突版本。');
   this.revision=remote.revision;
   const text=typeof remote.text==='string'?remote.text:remote.data===undefined||remote.data===null?null:JSON.stringify(remote.data);
   this.acceptedContent=remote.file&&text!==null?{id:remote.file.id,headRevisionId:remote.file.headRevisionId,text}:null;
   this.pending=null;
  }
  async folder(){if(this.folderId)return this.folderId;const folders=await this.list("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='ledgerFolder' and value='minimalist-v1' }");if(folders.length)this.folderId=folders[0].id;else{const f=await this.request('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'日常留白記帳',mimeType:'application/vnd.google-apps.folder',appProperties:{ledgerFolder:'minimalist-v1'}})});this.folderId=f.id;}return this.folderId;}
  async nextId(){
   if(!this.availableIds.length){
    const result=await this.request('files/generateIds?count=8&space=drive');
    this.availableIds=Array.isArray(result.ids)?result.ids:[];
   }
   const id=this.availableIds.shift();
   if(!id)throw Error('Drive 無法建立檔案 ID。');
   return id;
  }
  async prune(history,{keepDays,keepCount,maxDeletes}=this.retention){
   // Every save adds a snapshot. Without this the file list grows for ever and each sync gets slower.
   const files=history?.files||[];
   if(history.heads.length!==1||files.length<=keepCount)return 0;
   const time=file=>Date.parse(file.modifiedTime||'')||0;
   const ordered=[...files].sort((a,b)=>time(b)-time(a));
   const keep=new Set([...history.heads.map(file=>file.id),...ordered.slice(0,keepCount).map(file=>file.id)]);
   if(this.acceptedContent)keep.add(this.acceptedContent.id);
   const cutoff=this.now()-keepDays*86400000;
   const stale=ordered.filter(file=>!keep.has(file.id)&&time(file)&&time(file)<cutoff).slice(-maxDeletes);
   let removed=0;
   for(const file of stale){
    // Trash keeps Drive's own 30-day recovery; a failure here must never fail the save.
    try{await this.request('files/'+encodeURIComponent(file.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});}catch{break;}
    removed++;
   }
   return removed;
  }
  async save(data,{baseText}={}){
   if(this.busy)throw Error('上一筆 Drive 儲存尚未完成。');
   if(this.revision===undefined)throw Error('請先選擇要使用的帳目版本。');
   const text=payload(data);
   this.busy=true;
   try{
    const history=await this.history();
    const {heads,revision}=history;
    const selected=heads.length===1?heads[0]:heads.find(file=>file.id===this.preferredId);
    if(heads.length&&!selected)throw Error('Drive 有多個同時編輯的版本，請先讀取雲端並選擇版本。');
    const known=this.acceptedContent;
    const expectedText=known?.text??baseText;
    const unchanged=selected?.headRevisionId&&revision===this.revision&&selected.id===known?.id&&selected.headRevisionId===known.headRevisionId;
    let remoteText;
    if(unchanged)remoteText=known.text;
    else if(selected){
     const remote=await this.read(history);
     remoteText=JSON.stringify(remote.data);
     if(remoteText===text&&history.extendsLocal&&heads.length===1){this.accept(remote);return;}
    }
    if(revision!==this.revision||(selected&&typeof expectedText==='string'&&remoteText!==expectedText))throw Error('另一裝置已更新帳目。請匯出本機備份，再讀取雲端或確認取代。');
    if(unchanged&&heads.length===1&&remoteText===text)return;
    const parents=heads.map(file=>file.id);
    if(parents.length>24)throw Error('衝突版本過多，請先備份並整理 Drive。');
    const folderId=await this.folder();
    if(!this.pending||this.pending.text!==text||this.pending.base!==revision){
     this.pending={id:await this.nextId(),text,base:revision};
    }
    const {id}=this.pending;
    const metadata={id,name:'日常留白-'+new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'.json',mimeType:'application/json',parents:[folderId],appProperties:{ledger:'minimalist-v1',...Object.fromEntries(parents.map((parent,i)=>['p'+i,parent]))}};
    const boundary='ledger_upload_boundary';
    const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+text+'\r\n--'+boundary+'--';
    // Keep both versions if two devices upload against the same parent.
    const uploaded=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    if(uploaded.id!==id)throw Error('無法確認 Drive 回傳的檔案，帳目仍保存在本機。');
    this.preferredId=null;
    const latest=await this.history();
    if(latest.revision===revision)throw Error('Drive 已收到上傳，版本清單尚未更新。請稍後重試。');
    if(latest.revision!==id)throw Error('Drive 已保留上傳版本，但偵測到其他裝置同時更新。請讀取雲端並選擇版本。');
    const file=latest.heads[0];
    if(!file.headRevisionId||file.headRevisionId!==uploaded.headRevisionId){
     const remote=await this.read(latest);
     if(JSON.stringify(remote.data)!==text)throw Error('Drive 上傳後的帳目已有變更，本機版本仍保留。');
    }
    this.accept({revision:id,data:JSON.parse(text),file});
    try{await this.prune(latest);}catch{}
   }finally{this.busy=false;}
  }

 }
 let sdkPromise;
 function loadSDK(){if(root.google?.accounts?.oauth2)return Promise.resolve(root.google);if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;const timer=setTimeout(()=>{script.remove();sdkPromise=null;reject(Error('Google 登入元件載入逾時，請確認網路再重試。'));},20000);script.onload=()=>{clearTimeout(timer);resolve(root.google)};script.onerror=()=>{clearTimeout(timer);sdkPromise=null;reject(Error('Google 登入元件無法載入，請確認網路與內容封鎖設定。'));};document.head.append(script);});return sdkPromise;}
 function signInRequired(){const error=Error('Google 授權已到期。請重新連線以繼續同步，帳目仍保存在此瀏覽器。');error.code='sign_in_required';return error;}
 async function connectHosted(cfg,{fetchImpl,now,navigate}){
  let store=null;
  async function request(action){
   const response=await fetchImpl(SESSION_PATH+'/'+action,{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
   if(response.status===401)throw signInRequired();
   if(!response.ok)throw Error('暫時無法連線登入服務，請稍後再試。');
   return response.json();
  }
  async function session(force=false){
   const result=await request(force?'refresh':'session');
   if(typeof result.user?.uid!=='string'||!result.user.uid||typeof result.user.email!=='string'||typeof result.accessToken!=='string'||!result.accessToken||!(result.expiresAt>now()))throw signInRequired();
   return result;
  }
  return {
   cfg,
   async restore(){
    let result;
    try{result=await session();}catch(e){if(e.code==='sign_in_required')return null;throw e;}
    store=new DriveStore({token:result.accessToken,user:result.user,clientId:cfg.clientId,expiresAt:result.expiresAt,fetchImpl,now,refresh:session});
    return {user:result.user};
   },
   async signIn(){
    const target=new URL((await request('start')).url);
    if(target.origin!=='https://accounts.google.com'||target.pathname!=='/o/oauth2/v2/auth')throw Error('無法開啟 Google 登入。');
    navigate(target.href);
    return {redirecting:true};
   },
   store:()=>store,
   observe:()=>()=>{},
   async signOut(){await request('logout');store?.disconnect();store=null;}
  };
 }
 async function connect(value,{load=loadSDK,fetchImpl=root.fetch?.bind(root),now=Date.now,navigate=url=>root.location.assign(url)}={}){
  const cfg=config(value);
  if(cfg.keepSignedIn)return connectHosted(cfg,{fetchImpl,now,navigate});
  const g=await load(),listeners=new Set();
  let store=null,pending=null;
  const oauth=g.accounts.oauth2.initTokenClient({
   client_id:cfg.clientId,scope:'openid email '+SCOPE,include_granted_scopes:false,
   callback:async result=>{
    const request=pending;if(!request)return;
    try{
     if(result.error)throw Error('Google 授權未完成（'+result.error+'）。');
     if(!result.access_token||!g.accounts.oauth2.hasGrantedAllScopes(result,SCOPE))throw Error('請同意網站儲存帳目至 Drive 的檔案權限。');
     const response=await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+result.access_token},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});
     if(!response.ok)throw Error('無法確認 Google 帳號，請重新登入。');
     const profile=await response.json();
     if(!profile.sub||!profile.email||profile.email_verified!==true)throw Error('Google 帳號資料無效，請重新登入。');
     const user={uid:profile.sub,email:profile.email};
     if(request.uid&&request.uid!==user.uid)throw Error('請使用目前帳本的 Google 帳號重新連線。');
     if(pending!==request)return;
     const expiresAt=now()+Number(result.expires_in||3600)*1000;
     if(store?.uid===user.uid)store.setAccess(result.access_token,expiresAt);
     else store=new DriveStore({token:result.access_token,user,clientId:cfg.clientId,expiresAt,fetchImpl,now});
     request.resolve({user});
    }catch(e){request.reject(e);}
    finally{if(pending===request)pending=null;}
   },
   error_callback:error=>{
    if(!pending)return;
    const request=pending;pending=null;
    request.reject(Error(error.type==='popup_closed'?'已取消 Google 登入。':'Google 登入視窗無法開啟，請使用 Safari／Chrome 並允許彈出視窗。'));
   }
  });
  return {
   cfg,
   signIn:({uid}={})=>new Promise((resolve,reject)=>{
    if(pending){reject(Error('請先完成目前的登入。'));return;}
    pending={resolve,reject,uid};
    try{oauth.requestAccessToken(uid?{login_hint:uid,prompt:''}:{prompt:'select_account'});}
    catch(e){pending=null;reject(e);}
   }),
   store:user=>{if(!store||store.uid!==user.uid)throw Error('Google 帳號不一致，請重新登入。');return store;},
   observe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
   signOut:async()=>{store?.disconnect();store=null;g.accounts.id?.disableAutoSelect();listeners.forEach(fn=>fn(null));}
  };
 }
 const api={DriveStore,config,connect,payload,message,SCOPE};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoogleLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);

// --- app.js ---
/* 日常留白 — local-first ledger with Google Drive sync; no external dependencies. */
'use strict';
const L=Ledger, $=s=>document.querySelector(s), LOCAL_KEY='minimalist-ledger-v1', ACCOUNT_KEY='minimalist-ledger-account';
// 字型樣式表以 media=print 非阻塞載入；腳本在此切換生效（取代內嵌 onload，以符合 CSP）。
{const font=document.querySelector('link[data-font]');if(font)font.media='all';}
// Reopen straight into the ledger this browser used last, so recording never waits for the cloud session.
function lastLedgerKey(){try{const key=localStorage.getItem(ACCOUNT_KEY);return typeof key==='string'&&key.startsWith(LOCAL_KEY+'-drive-')&&localStorage.getItem(key)!==null?key:LOCAL_KEY;}catch{return LOCAL_KEY;}}
let KEY=lastLedgerKey(),BACKUP=KEY+'-previous',ledgerStorage=localStorage,googleMode=false,accountSwitching=false;
let state=L.initial(), raw=null, blocked=false, selected=L.cycleKey(), editing=null;
let selectedDate=L.iso(new Date()),editingCycle=selected;
let currentView='daily';
const D=DailyLedger;
const I=LedgerInsights;
const AI=LedgerAI;
const money=n=>n===null?'—':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const statusLabels={login:'登入中',guest:'未登入',syncing:'雲端同步中',pending:'雲端尚未同步',latest:'雲端均最新'};
let badgeState='';
function syncText(element,message,phase=''){
 if(!element)return;element.textContent=message;
 if(!phase)return;
 const label=statusLabels[phase],detail=message===label?'':message;
 element.innerHTML='<span class="sync-coin is-'+phase+'" role="img" aria-label="'+label+'">'+Array.from(label).map((letter,index)=>'<span class="coin-letter" aria-hidden="true" style="--coin-index:'+index+'">'+letter+'</span>').join('')+'</span>'+(detail?'<span class="sync-detail"> · '+esc(detail)+'</span>':'');
}
function syncBadge(phase=''){
 if(!phase)phase=googleMode?'pending':'guest';
 if(phase===badgeState)return;
 badgeState=phase;
 syncText($('#syncBadge'),statusLabels[phase],phase);
}
function toast(s){$('#notice').textContent=s;$('#notice').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#notice').hidden=true,6000);toast.timer?.unref?.();}
try{raw=ledgerStorage.getItem(KEY);if(raw!==null)state=L.migrate(JSON.parse(raw));}catch(e){blocked=true;$('#saveStatus').textContent='無法讀取資料：請先匯出原始資料，或匯入有效備份';}
function cycle(){return state.cycles[selected]||L.defaults();}
function commit(candidate,fromCloud=false){
 if(accountSwitching)throw Error("正在切換帳號，請稍候再記帳。");
 if(blocked)throw Error('目前儲存不可用，請先匯出原始資料並匯入有效備份。');
 candidate=L.migrate(candidate);
 if(ledgerStorage.getItem(KEY)!==raw)throw Error('另一個分頁已更新資料。請先重新整理，再輸入本次變更。');
 const next=JSON.stringify(candidate);
 if(raw!==null)ledgerStorage.setItem(BACKUP,raw);
 ledgerStorage.setItem(KEY,next);raw=next;state=candidate;
 $('#saveStatus').textContent='已儲存於此瀏覽器 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
 if(!fromCloud)queueCloud();
}
function download(data,name){const u=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
// 只重畫目前看得到的分頁；切換分頁時 setView 會再呼叫一次，所以隱藏分頁不需要提前更新。
function render(){
 renderDaily();
 if(currentView==='overview')renderOverview();
 else if(currentView==='analysis')renderAnalysis();
 else if(currentView==='settings')renderSettings();
}
function renderOverview(){
 const c=cycle(),ds=L.dates(selected),s=L.stats({...c,key:selected});$('#month').value=selected;
 $('#periodTitle').textContent=`${selected.slice(0,4)} 年 ${Number(selected.slice(5))} 月`;
 $('#periodRange').textContent=ds[0].replaceAll('-','.')+' — '+ds.at(-1).replaceAll('-','.');
 $('#calendarLegend').textContent=`本期 ${ds[0].slice(5).replace('-','/')} 至 ${ds.at(-1).slice(5).replace('-','/')} · 共 ${ds.length} 天`;
 const reserve=D.budgetStatus(c,selected);
 const cards=[['支出預算',c.budgets&&['meals','other','fixed'].every(k=>c.budgets[k]===null)?null:s.budget,'三餐＋其他＋固定支出'],['已花費',s.spent,'依實際金額累計，含固定付款'],['剩餘總預算',reserve.remainingTotal,'已預留固定支出 NT$'+money(reserve.fixedReserve)+' 與儲蓄；未知費用未預留'],['本期預計可存',s.projected,s.unknown?'預算未完整，估計可能偏高':'收入 − 預估支出'],['儲蓄預算',s.savingTarget,'獨立預留，不計入消費']];
 $('#metrics').innerHTML=cards.map(([label,n,note])=>`<div class="metric"><p class="muted">${label}</p><strong class="${n<0?'negative':''}">${money(n)}</strong><small>${note}</small></div>`).join('');
 $('#goalProgress').value=state.savings??0;$('#goalProgress').setAttribute('aria-label','目前已存金額，目標二十萬元');
 $('#goalText').textContent=state.savings===null?'目前存款待設定 · 尚無實際進度':`已存 NT$${money(state.savings)} · ${(state.savings/200000*100).toFixed(1)}%`;
 $('#goalNote').textContent=state.savings===null||s.projected===null?'設定目前存款與本期收入後，可查看預計期末總額。':`預計期末存款 NT$${money(state.savings+s.projected)}（目前存款＋本期預計可存）`;
 let html='';for(let n=0;n<new Date(ds[0]+'T12:00:00').getDay();n++)html+='<span class="calendar-empty" aria-hidden="true"></span>';
 for(const date of ds){const rows=L.breakdown(c,date),spent=rows.reduce((n,x)=>n+x.actual,0);const amount=spent>=10000?new Intl.NumberFormat('zh-TW',{notation:'compact',maximumFractionDigits:1}).format(spent):money(spent);html+=`<button class="calendar-day ${date===L.iso(new Date())?'today':''} ${date.slice(0,7)===selected?'':'next-month'}" data-day="${date}" aria-label="${date}，${rows.length?'花費 '+money(spent)+' 元':'尚無紀錄'}"><span>${Number(date.slice(8))}</span><small>${rows.length?esc(amount):'—'}</small></button>`;}$('#calendar').innerHTML=html;
}
function renderSettings(){
 const c=cycle(),s=L.stats({...c,key:selected}),ds=L.dates(selected);
 $('#settingsPeriod').textContent=`${selected.slice(0,4)} 年 ${Number(selected.slice(5))} 月 · ${ds[0].slice(5).replace('-','/')} 至 ${ds.at(-1).slice(5).replace('-','/')}`;
 $('#settingsMonth').value=selected;
 $('#fixed').innerHTML=c.fixed.map(x=>{const t=L.fixedTotal(x);return `<button class="fixed-card" data-fixed="${esc(x.id)}"><strong>${x.name}</strong><span>${x.id==='subscription'?t.count+' 筆訂閱 · ':''}每期金額 ${t.budget===null?'未設定':'NT$'+money(t.budget)}　實際 ${t.actual===null?'未填':'NT$'+money(t.actual)}</span></button>`;}).join('');
 $('#budgetSummary').textContent=c.budgets?`支出預算 NT$${money(s.budget)} · 儲蓄 NT$${money(s.savingTarget)} · ${s.unknown?'尚有預算未設定':'配置合計 NT$'+money(s.allocation)}`:'目前沿用舊明細預算，請設定四類預算。';
 $('#budgetSummary').classList.toggle('negative',c.income!==null&&s.allocation>c.income);
 if(c.income!==null&&s.allocation>c.income)$('#budgetSummary').textContent+=' · 配置超過收入 NT$'+money(s.allocation-c.income);
 $('#legacyRecords').innerHTML=c.undatedOther?.length?`<details><summary>舊支出（未指定日期）</summary><p class="muted">以下保留於「其他」統計，不自行指定日期或畫入每日趨勢。</p><ul class="expense-list">${c.undatedOther.map(x=>`<li><div>${esc(x.note)}<small>預算 ${money(x.budget)}</small></div><span>實際 ${money(x.actual)}</span></li>`).join('')}</ul></details>`:'';
}

function openDateDetails(date){
 const key=L.cycleKey(new Date(date+'T12:00:00')),c=state.cycles[key]||L.defaults(),rows=L.breakdown(c,date),sum=rows.reduce((n,x)=>n+x.actual,0);
 $('#detailsTitle').textContent=date.replaceAll('-',' / ');$('#detailsBody').innerHTML=rows.length?`<ul class="expense-list">${rows.map(x=>`<li><div><strong>${esc(x.name)}</strong><small>${esc(x.category)}</small></div><span>NT$ ${money(x.actual)}</span></li>`).join('')}</ul>`:'<p class="empty-state">這一天尚無實際支出紀錄。</p>';
 $('#detailsTotal').textContent='當日總花費 NT$ '+money(sum);$('#detailsEdit').onclick=()=>{$('#dayDetails').close();selectedDate=date;setView('daily');};$('#dayDetails').showModal();
}
$('#detailsClose').onclick=()=>$('#dayDetails').close();
function renderAnalysis(){
 const c=cycle(),a=I.analyze(c,selected),s=a.stats,colors=['#a15e4b','#81917b','#676f7d'],names=['三餐開銷','其他','固定支出'],keys=['meals','other','fixed'],circ=2*Math.PI*52;let offset=0;
 const rings=keys.map((key,i)=>{const value=s.buckets[key].spent,length=s.spent?value/s.spent*circ:0;const html=`<circle cx="80" cy="80" r="52" fill="none" stroke="${colors[i]}" stroke-width="18" stroke-dasharray="${length} ${circ-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"><title>${names[i]}：${money(value)} 元</title></circle>`;offset+=length;return html;}).join('');
 $('#spendingChart').innerHTML=`<svg viewBox="0 0 160 160" role="img" aria-label="本期支出分布：${keys.map((k,i)=>names[i]+money(s.buckets[k].spent)+'元').join('、')}"><circle cx="80" cy="80" r="52" fill="none" stroke="#e5ded2" stroke-width="18"/>${rings}<text x="80" y="75" text-anchor="middle" font-size="12">${s.spent?'本期支出':'尚無支出'}</text><text x="80" y="99" text-anchor="middle" font-size="18">${money(s.spent)}</text></svg><ul class="chart-legend">${keys.map((k,i)=>`<li><span class="color-key" style="background:${colors[i]}"></span><span>${names[i]}</span><strong>NT$ ${money(s.buckets[k].spent)}</strong><small>${s.spent?(s.buckets[k].spent/s.spent*100).toFixed(1):'0'}%</small></li>`).join('')}</ul>`;
 $('#budgetChart').innerHTML=keys.map((k,i)=>{const b=s.buckets[k],ratio=b.budget>0?b.spent/b.budget*100:null;return `<div class="budget-bar-row"><div><span>${names[i]}</span><small>${money(b.spent)} / ${money(b.budget)}</small></div><div class="budget-track"><span style="width:${ratio===null?0:Math.min(100,ratio)}%;background:${ratio>100?'#ad493d':colors[i]}"></span></div><p class="${ratio>100?'negative':'muted'}">${b.budget===null?'預算未設定':b.budget===0?(b.spent?'無配置，已有花費':'未配置'):ratio.toFixed(1)+'%'+(ratio>100?' · 已超支':'')}</p></div>`;}).join('')+`<div class="saving-plan"><span>儲蓄預算 NT$ ${money(s.savingTarget)}</span><p class="muted">本期預計可存 NT$ ${money(s.projected)}；為估計值，不代表已實際存入。</p></div>`;
 const max=Math.max(...a.daily.map(x=>x.cumulative),1),points=a.daily.map((x,i)=>`${20+i*280/(a.daily.length-1)},${124-x.cumulative/max*100}`).join(' ');
 $('#trendChart').innerHTML=`<svg viewBox="0 0 320 160" role="img" aria-label="已指定日期的累計支出趨勢，合計 ${money(a.daily.at(-1).cumulative)} 元"><path d="M20 24V124H300" fill="none" stroke="#b9ad9d"/><polyline points="${points}" fill="none" stroke="#a15e4b" stroke-width="2.5"/><text x="20" y="148" font-size="12">${a.daily[0].date.slice(5).replace('-','/')}</text><text x="300" y="148" text-anchor="end" font-size="12">${a.daily.at(-1).date.slice(5).replace('-','/')}</text><text x="20" y="16" font-size="12">NT$ ${money(a.daily.at(-1).cumulative)}</text></svg><p class="muted">僅計三餐與其他；固定支出另列，不畫入每日趨勢。未記錄日暫按 0 加總；未指定日期的舊支出不畫入。</p>`;
 $('#categoryTable').innerHTML=a.categories.length?`<table><caption>其他支出分類</caption><thead><tr><th>分類</th><th>實際金額</th></tr></thead><tbody>${a.categories.map(x=>`<tr><td>${esc(x.name)}</td><td>NT$ ${money(x.spent)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">尚無「其他」分類消費，記帳後即時更新。</p>';
 $('#analysisNote').textContent=`${selected} · ${s.unknown?'預算尚未設定完整；':''}僅統計實際輸入的消費，不含儲蓄。`;
 $('#analysisMonth').value=selected;
 renderAi();
}
// 小光點評：只送彙總（金額、日期、分類），結果只存在這個瀏覽器。
let aiBusy=false,aiError='';
const aiCacheKey=()=>KEY+'-xiaoguang';
function aiSaved(){try{return JSON.parse(localStorage.getItem(aiCacheKey())||'{}');}catch{return {};}}
function aiSave(cycleKey,entry){try{const all=aiSaved();all[cycleKey]=entry;const keys=Object.keys(all).sort().slice(-6);localStorage.setItem(aiCacheKey(),JSON.stringify(Object.fromEntries(keys.map(k=>[k,all[k]]))));}catch{}}
const botBubble=text=>`<div class="chat-row bot"><img class="chat-avatar" src="xiaoguang.png" alt="" width="44" height="44"><div class="chat-body"><span class="chat-name">小光</span><p class="chat-bubble">${esc(text)}</p></div></div>`;
const meBubble=text=>`<div class="chat-row me"><p class="chat-bubble">${esc(text)}</p></div>`;
function renderAi(){
 const box=$('#aiThread');if(!box)return;
 const summary=AI.buildSummary(cycle(),selected,L.iso(new Date())),print=AI.fingerprint(summary),saved=aiSaved()[selected],ask=$('#aiAsk');
 let html;
 if(aiBusy)html=meBubble('幫我點評這期開銷')+'<div class="chat-row bot"><img class="chat-avatar" src="xiaoguang.png" alt="" width="44" height="44"><div class="chat-body"><span class="chat-name">小光</span><p class="chat-bubble typing" aria-label="小光正在看帳"><i></i><i></i><i></i></p></div></div>';
 else if(!AI.hasData(summary))html=botBubble('這期還沒有花費可以點評。先記幾筆，我再來挑毛病。');
 else if(aiError)html=meBubble('幫我點評這期開銷')+botBubble(aiError);
 else if(saved)html=meBubble('幫我點評這期開銷')+botBubble(saved.reply)+(saved.print===print?'':'<p class="chat-stale">帳目已更新，這是更新前的點評。</p>');
 else html=botBubble(googleMode?'想知道我怎麼看這期的帳？按下面的按鈕，我會挑出該省的地方。':'登入 Google 之後，我才能幫你點評這期的帳。');
 box.innerHTML=html;
 ask.disabled=aiBusy||!googleMode||!AI.hasData(summary);
 ask.textContent=aiBusy?'小光看帳中…':saved?'重新點評':'請小光點評';
 box.scrollTop=box.scrollHeight;
}
async function askAi(){
 if(aiBusy||!googleMode)return;
 const cycleKey=selected,summary=AI.buildSummary(cycle(),cycleKey,L.iso(new Date()));
 if(!AI.hasData(summary))return;
 aiBusy=true;aiError='';renderAi();
 try{aiSave(cycleKey,{print:AI.fingerprint(summary),reply:await AI.requestReview(summary)});}
 catch(e){aiError=e.message||'小光暫時無法點評，請稍後再試。';}
 finally{aiBusy=false;if(currentView==='analysis')renderAi();}
}
$('#aiAsk').onclick=askAi;
function show(title,body,onSave){if(accountSwitching){toast("正在切換帳號，請稍候。");return;}editingCycle=selected;$('#editTitle').textContent=title;$('#editBody').innerHTML=body;$('#editError').textContent='';editing=onSave;$('#editor').showModal();}
function num(label,id,value,fieldClass=''){
 const legacy=value!=null&&!Number.isInteger(value);
 const cents=legacy?Math.round(value*100):0;
 const keys=[['＋','加'],['－','減'],['×','乘'],['÷','除'],['＝','計算結果']];
 return `<div class="amount-field"><label>${label}<input ${id?'id="'+id+'"':''} class="amount-input ${fieldClass}" type="text" inputmode="numeric" autocomplete="off" maxlength="80" value="${legacy?'':value??''}" ${legacy?'data-original="'+value+'"':''} placeholder="${legacy?'原有 '+Math.floor(cents/100)+' 元 '+cents%100+' 分':'未知，留空'}"></label>
 ${legacy?'<button type="button" class="clear-original">清除原金額</button>':''}
 <div class="amount-keys" role="group" aria-label="${label}運算">${keys.map(([key,name])=>`<button type="button" data-op="${key}" aria-label="${name}">${key}</button>`).join('')}</div></div>`;
}
function readAmount(input){
 if(input.value===''&&input.dataset.original!==undefined)return Number(input.dataset.original);
 try{return L.calculateAmount(input.value);}catch(error){input.focus();throw error;}
}
function read(id){return readAmount($('#'+id));}
function forgetOriginal(input){
 if(input.dataset.original===undefined)return;
 delete input.dataset.original;
 input.placeholder='未知，留空';
 input.closest('.amount-field').querySelector('.clear-original')?.remove();
}
const editBody=$('#editBody');
editBody.addEventListener('focusin',event=>{
 if(!event.target.matches('.amount-input'))return;
 editBody.querySelector('.amount-field.active')?.classList.remove('active');
 event.target.closest('.amount-field').classList.add('active');
});
const validAmountChars=text=>/^[0-9+*/-]*$/.test(L.normalizeAmount(text));
const inputHint='金額只能輸入整數，可用 ＋、－、×、÷ 計算。';
editBody.addEventListener('beforeinput',event=>{
 if(event.target.matches('.amount-input')&&event.data&&!validAmountChars(event.data)){
  event.preventDefault();$('#editError').textContent=inputHint;
 }
});
editBody.addEventListener('paste',event=>{
 const input=event.target;
 if(!input.matches('.amount-input'))return;
 const pasted=event.clipboardData?.getData('text');
 if(pasted==null)return;
 if(!validAmountChars(pasted)||input.value.length-(input.selectionEnd-input.selectionStart)+pasted.length>80){
  event.preventDefault();$('#editError').textContent=inputHint+' 算式最長 80 字。';
 }
});
editBody.addEventListener('input',event=>{
 const input=event.target;
 if(!input.matches('.amount-input'))return;
 if(!validAmountChars(input.value)){
  input.value=input.dataset.lastValue??input.defaultValue;
  $('#editError').textContent=inputHint;return;
 }
 input.dataset.lastValue=input.value;
 forgetOriginal(input);$('#editError').textContent='';
});
function applyAmountKey(input,key){
 try{
  if(key==='＝'){
   if(input.value==='')return;
   input.value=String(L.calculateAmount(input.value));
  }else{
   const start=input.selectionStart,end=input.selectionEnd;
   if(input.value.length-(end-start)>=80)throw Error('算式最長 80 字。');
   input.setRangeText(key,start,end,'end');
  }
  input.dataset.lastValue=input.value;forgetOriginal(input);$('#editError').textContent='';
 }catch(error){$('#editError').textContent=error.message;}
 input.focus();
}
editBody.addEventListener('click',event=>{
 const button=event.target.closest('[data-op],.clear-original');
 if(!button)return;
 const input=button.closest('.amount-field').querySelector('.amount-input');
 if(button.classList.contains('clear-original')){forgetOriginal(input);input.focus();return;}
 applyAmountKey(input,button.dataset.op);
});
editBody.addEventListener('keydown',event=>{
 if(event.key==='='&&event.target.matches('.amount-input')){event.preventDefault();applyAmountKey(event.target,'＝');}
});
function checkbox(id,done){return `<label class="check"><input type="checkbox" id="${id}" ${done?'checked':''}>已完成（須填實際金額；無支出可填 0）</label>`;}
function readItem(prefix){const x={budget:read(prefix+'b'),actual:read(prefix+'a'),done:$('#'+prefix+'d').checked};if(x.done&&x.actual===null)throw Error('勾選完成前，請填寫實際金額。');return x;}
function editMeal(date,index){const x=cycle().days[date]?.meals[index]||L.item();show(date+' · '+L.mealNames[index],`${num('實際金額','ma',x.actual)}<p class="hint">按儲存即記帳；填 0 表示沒有花費，留空則清除這筆金額。</p>`,c=>{const actual=read('ma');L.day(c,date).meals[index]={...x,actual,done:actual!==null};});}
const options=selected=>(L.dailyCategories.includes(selected)?L.dailyCategories:[selected,...L.dailyCategories]).map(x=>`<option ${x===selected?'selected':''}>${esc(x)}</option>`).join('');
function detailRow(x={category:'其他',note:'',...L.item()}){return `<div class="detail-row" data-budget="${x.budget??''}"><div class="row-top"><select aria-label="分類">${options(x.category)}</select><button type="button" class="remove">移除</button></div><label>說明<input class="note" maxlength="200" value="${esc(x.note)}" placeholder="例如：咖啡、回診"></label>${num('實際金額','',x.actual,'actual')}</div>`;}
function editOther(date){const c=cycle(),rows=c.days[date]?.other||[];show(date+' · 其他',`<p class="hint">只記錄每日額外花費。房租與訂閱請到「設定」，不在此重複記錄。信用卡僅記未曾入帳的消費。</p><div id="rows">${rows.map(detailRow).join('')}</div><button type="button" id="addRow">新增明細</button>`,draft=>{
 const list=[];for(const row of $('#rows').children){const actual=readAmount(row.querySelector('.actual'));const x={category:row.querySelector('select').value,note:row.querySelector('.note').value,budget:row.dataset.budget===''?null:Number(row.dataset.budget),actual,done:actual!==null};list.push(x);}L.day(draft,date).other=list;
 });
 $('#addRow').onclick=()=>$('#rows').insertAdjacentHTML('beforeend',detailRow());
 $('#rows').onclick=e=>{if(e.target.classList.contains('remove'))e.target.closest('.detail-row').remove();};
}
function editFixed(id,date){if(id==='subscription')return editSubscriptions(date);const x=cycle().fixed.find(x=>x.id===id),ds=L.dates(selected);show(x.name+' · 固定支出',`<p class="hint">整期只計算一次；實際金額為累計付款。此筆明細預算不會與「固定支出」分類預算重複相加。</p><div class="fields">${num('每期金額（預算）','fb',x.budget)}${num('實際金額（累計）','fa',x.actual)}</div><label>付款日（可留空）<input type="date" id="fdate" min="${ds[0]}" max="${ds.at(-1)}" value="${date||x.date||''}"></label>${checkbox('fd',x.done)}`,c=>{const y=c.fixed.find(y=>y.id===id);Object.assign(y,readItem('f'),{date:$('#fdate').value||null});});}
function editSettings(){const c=cycle(),s=L.stats({...c,key:selected}),b=c.budgets||{meals:s.buckets.meals.planned,other:s.buckets.other.planned,fixed:s.buckets.fixed.planned,savings:c.savingTarget};show('預算設定',`<p class="hint">${selected} 這一期，所有預算由你自行設定。留空表示未知，0 表示不配置。儲蓄與消費分開，明細金額不再重複加進分類預算。</p>${num('本期實領收入','income',c.income)}<div class="fields">${num('三餐開銷','bmeals',b.meals)}${num('其他','bother',b.other)}${num('固定支出','bfixed',b.fixed)}${num('儲蓄','bsavings',b.savings)}</div><p class="hint">配置合計＝三類支出預算＋儲蓄；超過收入仍可儲存，系統會提醒。新月份一律留空。</p>`,draft=>{draft.income=read('income');draft.budgets={meals:read('bmeals'),other:read('bother'),fixed:read('bfixed'),savings:read('bsavings')};draft.savingTarget=draft.budgets.savings;});}
function subscriptionRow(x,date){const ds=L.dates(selected);return `<div class="subscription-row" data-id="${esc(x?.id||'sub-'+Date.now()+'-'+Math.random().toString(36).slice(2))}"><div class="row-top"><label>訂閱內容<input class="sub-name" maxlength="80" value="${esc(x?.name||'')}" placeholder="例如：音樂服務"></label><button type="button" class="sub-remove">移除</button></div><div class="fields">${num('每期金額（預算）','',x?.budget,'sub-budget')}${num('實際付款（累計）','',x?.actual,'sub-actual')}</div><label>付款日期<input class="sub-date" type="date" min="${ds[0]}" max="${ds.at(-1)}" value="${x?.date||date||''}"></label><label class="check"><input class="sub-done" type="checkbox" ${x?.done?'checked':''}>本期已付清</label></div>`;}
function editSubscriptions(date){
 const sub=cycle().fixed.find(x=>x.id==='subscription');show('訂閱明細',`<p class="hint">自行新增訂閱名稱與每期金額。填「每期金額」只代表預算；付款後再填實際金額。每筆只計一次。</p><div id="subscriptions">${(sub.items||[]).map(x=>subscriptionRow(x)).join('')}</div><button type="button" id="addSubscription">新增訂閱</button>`,c=>{
  const list=[];for(const row of $('#subscriptions').children){const amount=sel=>readAmount(row.querySelector(sel));const x={id:row.dataset.id,name:row.querySelector('.sub-name').value.trim(),budget:amount('.sub-budget'),actual:amount('.sub-actual'),date:row.querySelector('.sub-date').value||null,done:row.querySelector('.sub-done').checked};if(!x.name)throw Error('請填寫每筆訂閱內容，或移除空白列。');if(x.done&&x.actual===null)throw Error('已付清訂閱必須填寫實際金額。');list.push(x);}const x=c.fixed.find(x=>x.id==='subscription');Object.assign(x,{budget:null,actual:null,done:false,date:null,items:list});
 });
 $('#addSubscription').onclick=()=>$('#subscriptions').insertAdjacentHTML('beforeend',subscriptionRow(null,date));
 $('#subscriptions').onclick=e=>{if(e.target.classList.contains('sub-remove')){const row=e.target.closest('.subscription-row');const paid=row.querySelector('.sub-actual');if((paid.value!==''||paid.dataset.original!==undefined)&&!confirm('移除後，本期統計會扣掉這筆訂閱的付款金額。確定移除？'))return;row.remove();}};
}
function saveEditor(){try{const candidate=L.clone(state);candidate.cycles[editingCycle]??=L.defaults();editing(candidate.cycles[editingCycle],candidate);commit(candidate);$('#editor').close();render();return true;}catch(e){$('#editError').textContent=e.message||'儲存失敗，請匯出備份後重試。';return false;}}
$('#editForm').onsubmit=e=>{e.preventDefault();saveEditor();};$('#close').onclick=$('#cancel').onclick=()=>$('#editor').close();
$('#calendar').onclick=e=>{const b=e.target.closest('[data-day]');if(b)openDateDetails(b.dataset.day);};
$('#fixed').onclick=e=>{const b=e.target.closest('[data-fixed]');if(b)editFixed(b.dataset.fixed);};
function move(delta){const [y,m]=selected.split('-').map(Number),d=new Date(y,m-1+delta,5),key=L.cycleKey(d);if(+key.slice(0,4)<1900||+key.slice(0,4)>2200)return;selected=key;render();}
$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);$('#today').onclick=()=>{selected=L.cycleKey();render();};$('#month').min='1900-01';$('#month').max='2200-12';$('#month').onchange=e=>{if(e.target.checkValidity()&&e.target.value){selected=e.target.value;render();}};
for(const id of ['settingsMonth','analysisMonth']){$('#'+id).min='1900-01';$('#'+id).max='2200-12';$('#'+id).onchange=e=>{if(e.target.checkValidity()&&e.target.value){selected=e.target.value;render();}};}
$('#settings').onclick=editSettings;$('#goalEdit').onclick=()=>show('更新目前存款',`${num('目前已存金額（所有週期共用）','savings',state.savings)}<p class="hint">請填入你目前已存下的金額；本工具不會將月結餘自動加入存款。期末估計＝此金額＋所選本期預計可存，請於期初更新基準，避免重複加上已存入的金額。未知時留空。</p>`,(c,s)=>{s.savings=read('savings');});
$('#export').onclick=()=>download(blocked?(raw||JSON.stringify(state)):JSON.stringify(state,null,2),`minimalist-${L.iso(new Date())}${blocked?'-recovery':''}.json`);
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const importKey=KEY,importRaw=raw;try{if(file.size>10*1024*1024)throw Error('備份上限為 10 MB。');const candidate=L.validate(JSON.parse(await file.text()));if(KEY!==importKey||raw!==importRaw)throw Error('帳號或帳目已變更，請重新選擇備份。');if(!confirm(`備份包含 ${Object.keys(candidate.cycles).length} 個週期。匯入會取代所有目前帳目；系統會先下載目前資料備份。確定匯入？`))return;
 if(raw!==null)download(raw,`minimalist-before-import-${Date.now()}.json`);
 const previousBlocked=blocked;blocked=false;try{commit(candidate);}catch(err){blocked=previousBlocked;throw err;}render();toast('備份已匯入。');}catch(err){toast(err.message||'匯入失敗，原資料保持不變。');}finally{e.target.value='';}};
window.addEventListener('storage',e=>{if(e.key===KEY){toast('另一分頁已變更資料，請重新整理後繼續。');$('#saveStatus').textContent='資料已在另一分頁變更，請重新整理';}});
function renderDaily(){
 const key=L.cycleKey(new Date(selectedDate+'T12:00:00')),c=state.cycles[key]||L.defaults(),s=D.summary(c,selectedDate),date=new Date(selectedDate+'T12:00:00');
 $('#dayTitle').textContent=`${date.getMonth()+1} 月 ${date.getDate()} 日`;
 $('#dayWeek').textContent=`${date.getFullYear()} 年 · 星期${'日一二三四五六'[date.getDay()]}`;
 const isToday=selectedDate===L.iso(new Date());
 $('#dailyCard').classList.toggle('is-other-day',!isToday);$('#dailyCard').classList.toggle('is-over-budget',s.overspent);
 $('#dayBadge').textContent=s.overspent?'當日超支':isToday?'今天':'非今日';
 $('#dayEntries').innerHTML=s.entries.map((x,i)=>`<button class="daily-entry ${x.actual!==null?'done':''}" data-kind="${x.kind}" aria-label="${selectedDate} ${x.name}"><span class="entry-symbol" aria-hidden="true">${['早','午','晚','＋'][i]}</span><span class="daily-entry-copy"><strong>${x.name}</strong><span>${x.actual!==null?'NT$ '+money(x.actual):'點選記帳'}</span></span><span class="entry-status" aria-label="編輯金額">＋</span></button>`).join('');
 $('#daySpent').textContent='NT$ '+money(s.spent);
 $('#dayBudget').textContent=s.dailyMealBudget===null?'尚未設定三餐預算':s.dailyMealBudget===0?(s.mealSpent?'三餐未配置 · 已超支':'三餐未配置'): `當日三餐額度已用 ${s.ratio.toFixed(1)}%`;
 $('#dayRemainingMeals').textContent='本期剩餘三餐預算 NT$ '+money(s.remainingMeals);
 $('#dayRemainingTotal').textContent='本期剩餘總預算 NT$ '+money(s.remainingTotal);
 $('#dayRemainingMeals').classList.toggle('negative',s.remainingMeals<0);$('#dayRemainingTotal').classList.toggle('negative',s.remainingTotal<0);
 $('#dayBudgetNote').textContent=`每日均分 ${s.days} 天 · 三餐 ${money(s.dailyMealBudget)} / 總額 ${money(s.dailyTotalBudget)}`;
 $('#dayBudget').classList.toggle('negative',s.ratio!==null&&s.ratio>100);
 $('#dayPrev').disabled=selectedDate<='1900-01-01';$('#dayNext').disabled=selectedDate>='2200-12-31';
}
function openDayEntry(date,kind){selected=L.cycleKey(new Date(date+'T12:00:00'));kind==='other'?editOther(date):editMeal(date,Number(kind));}
function changeDay(date,animate=true){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<'1900-01-01'||date>'2200-12-31')return;selectedDate=date;renderDaily();if(animate&&typeof matchMedia==='function'&&!matchMedia('(prefers-reduced-motion: reduce)').matches)$('#dailyCard').animate?.([{opacity:.35,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:180});}
const viewPanels={daily:'dailyView',overview:'overview',analysis:'analysisView',settings:'settingsView',about:'aboutView'};
function setView(view){
 if(!Object.hasOwn(viewPanels,view))return;
 if(currentView==='daily'&&['overview','analysis','settings'].includes(view))selected=L.cycleKey(new Date(selectedDate+'T12:00:00'));
 currentView=view;
 for(const [name,id] of Object.entries(viewPanels)){const active=name===view;$('#'+id).hidden=!active;$('#tab-'+name).setAttribute('aria-selected',String(active));$('#tab-'+name).tabIndex=active?0:-1;}
 render();
 if(view==='daily'&&typeof maybePromptLogin==='function')maybePromptLogin();
}
for(const name of Object.keys(viewPanels)){
 const tab=$('#tab-'+name);tab.onclick=()=>setView(name);
 tab.onkeydown=e=>{const names=Object.keys(viewPanels),index=names.indexOf(name);let next;if(e.key==='ArrowRight')next=(index+1)%names.length;else if(e.key==='ArrowLeft')next=(index+names.length-1)%names.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=names.length-1;else return;e.preventDefault();setView(names[next]);$('#tab-'+names[next]).focus();};
}
$('#dayEntries').onclick=e=>{const b=e.target.closest('[data-kind]');if(b)openDayEntry(selectedDate,b.dataset.kind);};
$('#dayPrev').onclick=()=>changeDay(D.shift(selectedDate,-1));$('#dayNext').onclick=()=>changeDay(D.shift(selectedDate,1));$('#dayToday').onclick=()=>changeDay(L.iso(new Date()));
const dayWatcher=D.watchDay(date=>{changeDay(date);if(!$('#overview').hidden){selected=L.cycleKey(new Date(date+'T12:00:00'));render();}toast('新的一天，已翻到今天的記帳卡片。');});
window.addEventListener('focus',()=>dayWatcher.check());document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)dayWatcher.check();});
render();
if(blocked)toast('無法讀取本機帳目，請到「設定」匯出原始資料或匯入有效備份。');

function currentJSON(){return JSON.stringify(state);}
function queueCloud(){
 if(googleMode){googleQueue();return;}
 syncBadge('pending');
}

// --- google-sync.js ---
'use strict';
const GOOGLE_SAVE_DELAY_MS=200;
const GOOGLE_LOGIN_ISSUES={
 state:'登入流程已逾時或瀏覽器沒有保留登入 Cookie。請在同一分頁重試，或使用一般登入。',
 consent:'Google 授權已取消。若要同步，請同意網站使用 Google Drive。',
 client:'Google 拒絕長效登入服務的用戶端憑證。請先使用一般登入。',
 code:'Google 的登入憑證已逾時或用過，請從網站重新開始登入。',
 drive:'Google Drive 權限尚未同意。請再登入一次並勾選 Drive 權限。',
 offline:'Google 沒有授予長效登入權限。你可重試授權或先使用一般登入。',
 profile:'Google 帳號驗證未完成。請重試，或先使用一般登入。',
 exchange:'長效登入服務暫時無法完成 Google 授權。請先使用一般登入。',
 session:'瀏覽器未能保留長效登入。請重試，或先使用一般登入。'
};
let promptReady=false,promptHandled=false;
const laterKey='minimalist-ledger-login-later';
function maybePromptLogin(){
 if(!promptReady||promptHandled||googleMode||currentView!=='daily'||document.querySelector('dialog[open]')?.open)return;
 try{if(sessionStorage.getItem(laterKey))return;}catch{}
 $('#loginPrompt').showModal();
}
function deferLogin(){
 promptHandled=true;
 try{sessionStorage.setItem(laterKey,'1');}catch{}
 $('#loginPrompt').close();
}
function showLoginDuration(){
 const hosted=window.LEDGER_GOOGLE_CONFIG?.keepSignedIn&&!popupLoginRequested();
 const message=hosted?'在同一個瀏覽器，從登入日起最長可保持 30 天。若 Google 授權仍在外部測試階段，通常為 7 天。清除 Cookie 或撤銷授權後，需提早重新登入。':'一般登入約 1 小時後需重新授權，關閉或重新整理網頁後也需再登入。';
 $('#loginPromptDuration').textContent=message;
 $('#googleDuration').textContent=message;
}
let googleConnection=null,googleClient=null,googleAuto=false,googleBusy=false,googleTimer=null,googleSynced=null,googleUnsubscribe=null,googleEpoch=0,googleLegacyBackup=null,googleNeedsSignIn=false;
function googleText(s,error=false,phase=''){if(error&&googleMode&&!phase)phase='pending';syncText($('#googleStatus'),s,phase);syncText($('#googleMessage'),s,phase);if(googleMode)syncBadge(phase);$('#googleMessage').classList.toggle('error',error);}
function googleControls(){
 const reconnect=googleMode&&(googleNeedsSignIn||(!googleConnection?.restore&&googleClient?.expired?.()));
 $('#googleLogin').textContent=reconnect?'重新連線 Google':'使用 Google 登入';
 $('#googleLogin').hidden=googleMode&&!reconnect;
 $('#googleLogin').disabled=!googleConnection||googleBusy;
 const popupLink=$('#googlePopupLogin');
 if(popupLink)popupLink.hidden=googleMode||!(googleConnection?.cfg?.keepSignedIn||window.LEDGER_GOOGLE_CONFIG?.keepSignedIn&&!popupLoginRequested());
 for(const id of ['googlePull','googlePush','googleMigrate','googleLogout'])$('#'+id).disabled=googleBusy||!googleMode;
 $('#googleRecover').disabled=googleBusy;
 $('#googleActions').hidden=!googleMode;
}
function googleGuard(){if(googleBusy||accountSwitching)throw Error('資料正在處理中，請稍候。');if($('#editor').open)throw Error('請先儲存或關閉編輯視窗。');}
function googleDirty(){return raw!==null&&currentJSON()!==googleSynced;}
function googleCache(){
 // A failed checkpoint leaves the saved notebook intact and can only cause another sync attempt.
 // The file pointer lets the next visit confirm the cloud version without downloading the ledger again.
 try{
  const known=googleClient.acceptedContent;
  const file=known&&known.headRevisionId&&known.text===googleSynced?{id:known.id,headRevisionId:known.headRevisionId}:null;
  ledgerStorage.setItem(KEY+'-sync',JSON.stringify({revision:googleClient.revision??null,synced:googleSynced,file}));
 }catch{}
}
function checkGoogleLocal(){
 if(ledgerStorage.getItem(KEY)!==raw)throw Error('另一個分頁已更新帳目。請重新開啟網站並登入同一帳號。');
}
function loadGoogleLedger(key){
 const saved=localStorage.getItem(key);
 let old=null,oldCheckpoint=null;
 try{old=sessionStorage.getItem(key);oldCheckpoint=sessionStorage.getItem(key+'-sync');}catch{}
 googleLegacyBackup=old!==null&&old!==saved?old:null;
 if(saved===null&&old!==null){
  L.migrate(JSON.parse(old));
  localStorage.setItem(key,old);
  if(oldCheckpoint!==null){try{localStorage.setItem(key+'-sync',oldCheckpoint);}catch{}}
  googleLegacyBackup=null;
  try{sessionStorage.removeItem(key);}catch{}
 }
 loadLedgerStorage(localStorage,key);
 let checkpoint;
 try{checkpoint=JSON.parse(localStorage.getItem(key+'-sync'));}catch{}
 if(typeof checkpoint?.revision==='string'&&raw!==null){
  const synced=typeof checkpoint.synced==='string'?checkpoint.synced:null;
  const file=checkpoint.file&&typeof checkpoint.file.id==='string'&&typeof checkpoint.file.headRevisionId==='string'?checkpoint.file:null;
  googleClient.accept(file&&synced!==null?{revision:checkpoint.revision,file,text:synced}:{revision:checkpoint.revision});
  googleSynced=synced;
 }
}
function loadLedgerStorage(storage,key){const source=storage.getItem(key),next=source===null?L.initial():L.migrate(JSON.parse(source));ledgerStorage=storage;KEY=key;BACKUP=key+'-previous';raw=source;state=next;blocked=false;render();}
function leaveGoogle(message='已登出 Google · 顯示原本的本機帳目'){
 googleEpoch++;clearTimeout(googleTimer);googleUnsubscribe?.();googleUnsubscribe=null;googleAuto=false;googleClient=null;googleSynced=null;googleMode=false;syncBadge();
 // Clear the authenticated ledger from the view, including any open edit/detail dialog.
 editing=null;for(const id of ['editor','dayDetails'])if($('#'+id).open)$('#'+id).close();$('#editBody').innerHTML='';$('#detailsBody').innerHTML='';
 try{localStorage.removeItem(ACCOUNT_KEY);}catch{}
 try{loadLedgerStorage(localStorage,LOCAL_KEY);}catch{ledgerStorage=localStorage;KEY=LOCAL_KEY;BACKUP=KEY+'-previous';raw=localStorage.getItem(KEY);state=L.initial();blocked=true;render();}
 googleLegacyBackup=null;googleNeedsSignIn=false;$('#googleRecover').hidden=true;$('#googleIdentity').textContent='';$('#googleConflictBox').hidden=true;$('#saveStatus').textContent='目前顯示未登入的本機帳目';googleBusy=false;accountSwitching=false;googleControls();googleText(message);
}
function popupLoginRequested(){const search=window.location?.search;return !!search&&new URLSearchParams(search).get('login')==='popup';}
function googleLoginReturn(){
 const hash=window.location?.hash||'';
 const error=hash.match(/^#google-login-error(?:=([a-z]+))?$/);
 const complete=hash==='#google-login-complete';
 if(error||complete)window.history.replaceState(null,'',window.location.pathname+window.location.search);
 return error?error[1]||'exchange':complete?'session':null;
}
async function prepareGoogle(){
 if(!window.LEDGER_GOOGLE_CONFIG){googleText("Google 登入尚未開放，目前可先使用本機記帳。");googleControls();return;}
 googleGuard();googleBusy=true;googleControls();syncBadge('login');googleText('正在準備 Google 登入…');
 try{
  const cfg=GoogleLedger.config({...window.LEDGER_GOOGLE_CONFIG,...(popupLoginRequested()?{keepSignedIn:false}:{})});
  const loginIssue=googleLoginReturn();
  const connection=await GoogleLedger.connect(cfg);
  googleConnection=connection;
  if(connection.restore&&KEY===LOCAL_KEY)accountSwitching=true;
  const restored=await connection.restore?.();
  if(restored){activateGoogle(restored.user,connection.store(restored.user));await resumeGoogle();return;}
  const message=loginIssue&&Object.hasOwn(GOOGLE_LOGIN_ISSUES,loginIssue)?GOOGLE_LOGIN_ISSUES[loginIssue]:'選擇 Google 帳號，即可連接你的雲端帳本。';
  googleText(message,!!loginIssue);
  if(loginIssue&&!$('#googleDialog').open){promptHandled=true;$('#googleDialog').showModal();}
 }
 catch(e){googleText(GoogleLedger.message(e),true);}finally{
  googleBusy=false;accountSwitching=false;googleControls();
  promptReady=true;
  if(!googleMode){syncBadge();maybePromptLogin();}
 }
}
function activateGoogle(user,client){
  googleNeedsSignIn=false;
  googleEpoch++;googleClient=client;googleMode=true;googleAuto=false;googleSynced=null;
  syncBadge('pending');
  const key=LOCAL_KEY+'-drive-'+client.projectId+'-'+encodeURIComponent(user.uid);
  try{localStorage.setItem(ACCOUNT_KEY,key);}catch{}
  try{loadGoogleLedger(key);}
  catch{ledgerStorage=localStorage;KEY=key;BACKUP=key+'-previous';raw=localStorage.getItem(key);state=L.initial();blocked=true;render();}
  $('#googleRecover').hidden=googleLegacyBackup===null;
  $('#googleIdentity').textContent=user.email||'Google 使用者';
  $('#saveStatus').textContent=blocked?'無法讀取本機帳目，可先匯出備份。':'Google 帳目保存在此瀏覽器';
  googleUnsubscribe=googleConnection.observe(next=>{if(next?.uid!==client.uid&&googleClient===client)leaveGoogle('Google 登入已失效 · 已關閉帳號資料，請重新登入');});
  googleBusy=false;accountSwitching=false;googleControls();
}
async function loginGoogle(){
 try{
  googleGuard();
  if(!googleConnection)throw Error('Google 登入尚未就緒，請稍候再試。');
  const reconnect=googleMode;
  syncBadge('login');
  const pending=googleConnection.signIn(reconnect?{uid:googleClient.uid}:undefined);
  googleBusy=true;accountSwitching=true;googleControls();googleText('等待 Google 授權…',false,'login');
  const result=await pending;
  if(result.redirecting)return;
  const {user}=result;
  if(reconnect){
   googleNeedsSignIn=false;googleBusy=false;accountSwitching=false;googleControls();
  }else activateGoogle(user,googleConnection.store(user));
  await resumeGoogle();
 }catch(e){googleAuthError(e);if(!googleMode)syncBadge();}finally{googleBusy=false;accountSwitching=false;googleControls();}
}
function googleAuthError(error){
 if(error.code==='sign_in_required')googleNeedsSignIn=true;
 googleText(GoogleLedger.message(error),true);
}
function googleQueue(){
 if(!googleMode||!googleDirty())return;
 clearTimeout(googleTimer);
 if(window.navigator?.onLine===false){googleText('目前離線，帳目已存本機，連線後會再同步。',false,'pending');return;}
 googleText('已存本機 · 等待同步 Google Drive',false,'pending');
 googleTimer=setTimeout(resumePendingGoogle,GOOGLE_SAVE_DELAY_MS);googleTimer?.unref?.();
}
async function resumePendingGoogle(){if(googleMode&&googleDirty())await resumeGoogle();}
async function resumeGoogle(){
 if(!googleMode||googleBusy)return;
 if(blocked){googleText('無法讀取本機帳目。請先匯出備份，或讀取雲端版本。',true);return;}
 if(window.navigator?.onLine===false){googleText('目前離線，連線後會再核對雲端帳目。',false,'pending');return;}
 if(googleDirty()&&googleClient.revision!==undefined){
  googleAuto=true;
  await flushGoogle();
 }else if(!$('#editor').open)await pullGoogle(false);
}
async function flushGoogle(){
 if(!googleMode||!googleAuto||googleBusy||blocked||window.navigator?.onLine===false)return;
 clearTimeout(googleTimer);
 const client=googleClient,epoch=googleEpoch,snapshot=currentJSON();
 googleBusy=true;googleControls();googleText('已存本機 · 正在同步 Google Drive…',false,'syncing');
 try{
  checkGoogleLocal();
  await client.save(JSON.parse(snapshot),{baseText:googleSynced});
  if(epoch!==googleEpoch||client!==googleClient)return;
  checkGoogleLocal();
  googleSynced=snapshot;googleCache();
  if(!googleDirty())googleText('已同步至 Google Drive · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}),false,'latest');
 }catch(e){if(epoch===googleEpoch){googleAuto=false;googleAuthError(e);}}
 finally{if(epoch===googleEpoch){googleBusy=false;googleControls();if(googleAuto&&googleDirty())googleQueue();}}
}
async function pullGoogle(ask=true){
 const epoch=googleEpoch;
 let startUpload=false,changedWhileReading=false;
 try{
  googleGuard();if(!googleClient)throw Error('請先使用 Google 登入。');
  checkGoogleLocal();googleAuto=false;clearTimeout(googleTimer);googleBusy=true;googleControls();
  const client=googleClient,before=raw;
  googleText('正在讀取 Google Drive 帳目…',false,'syncing');
  const remote=await client.read();
  if(epoch!==googleEpoch||client!==googleClient)return;
  checkGoogleLocal();
  if(before!==raw){changedWhileReading=true;throw Error('讀取期間已儲存本機變更，將重新核對版本。');}
  if($('#editor').open)throw Error('請先儲存或關閉編輯視窗，再同步帳目。');
  if(remote.conflicts){showDriveConflicts(remote.conflicts);googleText('Drive 有多個版本，請選擇要採用的版本。',true);return;}
  $('#googleConflictBox').hidden=true;
  if(!remote.data){
   if(client.revision)throw Error('Drive 找不到原本的帳目。本機版本仍保留，請確認 Drive 檔案後再上傳。');
   client.accept(remote);googleAuto=!blocked;googleCache();
   startUpload=googleAuto&&googleDirty();
   if(!startUpload)googleText('Google Drive 尚無帳目，儲存第一筆後會自動同步。',false,blocked?'pending':'latest');
  }else{
   const same=!blocked&&raw!==null&&currentJSON()===JSON.stringify(remote.data);
   if(!ask&&!same&&raw!==null&&remote.extendsLocal===false){googleText('Drive 回傳的版本與本機歷史不一致，已保留本機帳目。請稍後再讀取或先匯出備份。',true);return;}
   if(!same&&raw!==null&&(ask||googleDirty()||blocked)){
    if(!ask){googleText('本機有未同步帳目，已保留。請匯出備份後比較雲端版本。',true);return;}
    if(!confirm('讀取雲端會取代本機帳目，並先匯出目前版本。繼續？')){googleText('已取消讀取雲端帳目。',false,'pending');googleQueue();return;}
    download(raw, 'minimalist-before-google-'+Date.now()+'.json');
   }
   if(!same){const wasBlocked=blocked;blocked=false;try{commit(remote.data,true);}catch(e){blocked=wasBlocked;throw e;}render();}
   client.accept(remote);googleSynced=currentJSON();googleAuto=true;googleCache();
   googleText('已同步至 Google Drive · 後續儲存會自動上傳',false,'latest');
  }
 }catch(e){if(epoch===googleEpoch)googleAuthError(e);}
 finally{if(epoch===googleEpoch){
  googleBusy=false;googleControls();
  if(changedWhileReading){clearTimeout(googleTimer);googleTimer=setTimeout(resumePendingGoogle,GOOGLE_SAVE_DELAY_MS);googleTimer?.unref?.();}
 }}
 if(startUpload&&epoch===googleEpoch)await flushGoogle();
}
async function pushGoogle(migrate=false){
 const epoch=googleEpoch;
 try{googleGuard();if(!googleClient)throw Error('請先使用 Google 登入。');if(blocked)throw Error('請先匯入有效備份或讀取雲端帳目。');checkGoogleLocal();
  let data=L.clone(state);
  if(migrate){const source=localStorage.getItem(LOCAL_KEY);if(source===null)throw Error('原本的本機帳目是空的。請先登出 Google，匯入備份後再登入移轉。');data=L.migrate(JSON.parse(source));if(!confirm('將原本的本機帳目複製到此 Google 帳號？原本的本機資料會保留。'))return;}
  googleAuto=false;clearTimeout(googleTimer);googleBusy=true;accountSwitching=true;googleControls();const client=googleClient;googleText('正在確認雲端版本…',false,'syncing');const remote=await client.read();if(epoch!==googleEpoch)return;checkGoogleLocal();if(remote.conflicts){showDriveConflicts(remote.conflicts);throw Error('請先選擇衝突版本並讀取雲端，再上傳。');}
  if(remote.data&&JSON.stringify(remote.data)!==JSON.stringify(data)){if(!confirm('Google 已有不同帳目。確認以選定帳目取代？會先下載被取代的雲端備份。')){googleText('已取消上傳。',false,'pending');return;}download(JSON.stringify(remote.data,null,2),`minimalist-google-before-replace-${Date.now()}.json`);}
  if(migrate&&raw!==null&&currentJSON()!==JSON.stringify(data))download(raw,`minimalist-before-migration-${Date.now()}.json`);
  accountSwitching=false;if(migrate){commit(data,true);render();}client.accept(remote);googleSynced=remote.data?JSON.stringify(remote.data):null;googleCache();googleAuto=true;
 }catch(e){googleAuthError(e);}finally{if(epoch===googleEpoch){accountSwitching=false;googleBusy=false;googleControls();}}
 if(epoch===googleEpoch&&googleAuto)await flushGoogle();
}
async function logoutGoogle(){
 try{googleGuard();if(!googleMode)return;
  googleBusy=true;accountSwitching=true;googleControls();await googleConnection.signOut();
  leaveGoogle('已登出 Google · 帳目仍保存在此瀏覽器，登入同一帳號即可繼續同步');
 }catch(e){googleText(GoogleLedger.message(e),true);}finally{googleBusy=false;accountSwitching=false;googleControls();}
}
$('#googleOpen').onclick=()=>{
 $('#googleDialog').showModal();
 if(!googleMode&&!googleConnection&&!googleBusy)prepareGoogle().catch(e=>googleText(GoogleLedger.message(e),true));
 googleControls();
};
$('#loginLater').onclick=deferLogin;
$('#loginPrompt').addEventListener('cancel',event=>{event.preventDefault();deferLogin();});
$('#loginNow').onclick=()=>{
 promptHandled=true;$('#loginPrompt').close();
 if(googleConnection){$('#googleDialog').showModal();loginGoogle();}
 else $('#googleOpen').onclick();
};
document.addEventListener?.('close',event=>{if(event.target?.id!=='loginPrompt')maybePromptLogin();},true);
window.addEventListener('pageshow',event=>{if(event.persisted&&!googleMode)syncBadge();});
showLoginDuration();
syncBadge();
$('#googleClose').onclick=()=>$('#googleDialog').close();$('#googleLogin').onclick=loginGoogle;
$('#googlePull').onclick=()=>pullGoogle();$('#googlePush').onclick=()=>pushGoogle();$('#googleMigrate').onclick=()=>pushGoogle(true);$('#googleLogout').onclick=logoutGoogle;
$('#googleRecover').onclick=()=>{if(googleLegacyBackup!==null)download(googleLegacyBackup,'minimalist-old-tab-'+Date.now()+'.json');};
window.addEventListener('focus',resumeGoogle);
window.addEventListener('online',resumeGoogle);
window.addEventListener('offline',()=>{if(googleMode)googleText('目前離線，連線後會再核對雲端帳目。',false,'pending');});
document.addEventListener?.('visibilitychange',()=>{if(document.hidden){if(googleMode&&googleDirty())flushGoogle();}else resumeGoogle();});
googleControls();

function showDriveConflicts(files){$('#googleConflictBox').hidden=false;$('#googleConflict').innerHTML=files.map(f=>'<option value="'+esc(f.id)+'">'+esc(f.modifiedTime?new Date(f.modifiedTime).toLocaleString('zh-TW'):f.name)+'</option>').join('');}
$('#googleResolve').onclick=async()=>{if(googleBusy||!googleClient)return;if(!confirm('採用選定版本作為目前帳本？此瀏覽器若有不同資料會先備份；其他 Drive 版本會保留。'))return;googleClient.preferredId=$('#googleConflict').value;await pullGoogle(true);if(googleMode&&googleAuto)await flushGoogle();};

if(window.LEDGER_GOOGLE_CONFIG)prepareGoogle().catch(e=>googleText(GoogleLedger.message(e),true));else googleText('Google 登入尚未開放，目前可先使用本機記帳。');

// --- service worker ---
if(typeof navigator!=='undefined'&&navigator.serviceWorker&&location.protocol==='https:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js?v=1.10.0').catch(()=>{}));
