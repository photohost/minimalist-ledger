/* 日常留白 — GitHub private-repository sync; no external dependencies. */
'use strict';
const L=Ledger, $=s=>document.querySelector(s), LOCAL_KEY='minimalist-ledger-v1';
let KEY=LOCAL_KEY,BACKUP=KEY+'-previous',ledgerStorage=localStorage,googleMode=false,accountSwitching=false;
let state=L.initial(), raw=null, blocked=false, selected=L.cycleKey(), editing=null;
let selectedDate=L.iso(new Date()),editingCycle=selected;
let currentView='daily';
const D=DailyLedger;
const I=LedgerInsights;
let cloudClient=null,cloudAuto=false,cloudBusy=false,cloudTimer=null,cloudSynced=null;
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
 if(!phase)phase=googleMode||cloudClient?'pending':'guest';
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
function render(){
 renderDaily();
 const c=cycle(),ds=L.dates(selected),s=L.stats({...c,key:selected});$('#month').value=selected;
 $('#periodTitle').textContent=`${selected.slice(0,4)} 年 ${Number(selected.slice(5))} 月`;
 $('#periodRange').textContent=ds[0].replaceAll('-','.')+' — '+ds.at(-1).replaceAll('-','.');
 $('#settingsPeriod').textContent=`${selected.slice(0,4)} 年 ${Number(selected.slice(5))} 月 · ${ds[0].slice(5).replace('-','/')} 至 ${ds.at(-1).slice(5).replace('-','/')}`;
 const reserve=D.budgetStatus(c,selected);
 const cards=[['支出預算',c.budgets&&['meals','other','fixed'].every(k=>c.budgets[k]===null)?null:s.budget,'三餐＋其他＋固定支出'],['已花費',s.spent,'依實際金額累計，含固定付款'],['剩餘總預算',reserve.remainingTotal,'已預留固定支出 NT$'+money(reserve.fixedReserve)+' 與儲蓄；未知費用未預留'],['本期預計可存',s.projected,s.unknown?'預算未完整，估計可能偏高':'收入 − 預估支出'],['儲蓄預算',s.savingTarget,'獨立預留，不計入消費']];
 $('#metrics').innerHTML=cards.map(([label,n,note])=>`<div class="metric"><p class="muted">${label}</p><strong class="${n<0?'negative':''}">${money(n)}</strong><small>${note}</small></div>`).join('');
 $('#goalProgress').value=state.savings??0;$('#goalProgress').setAttribute('aria-label','目前已存金額，目標二十萬元');
 $('#goalText').textContent=state.savings===null?'目前存款待設定 · 尚無實際進度':`已存 NT$${money(state.savings)} · ${(state.savings/200000*100).toFixed(1)}%`;
 $('#goalNote').textContent=state.savings===null||s.projected===null?'設定目前存款與本期收入後，可查看預計期末總額。':`預計期末存款 NT$${money(state.savings+s.projected)}（目前存款＋本期預計可存）`;
 const monthDays=I.monthDates(selected);let html='';for(let n=0;n<new Date(monthDays[0]+'T12:00:00').getDay();n++)html+='<span class="calendar-empty" aria-hidden="true"></span>';
 for(const date of monthDays){const key=L.cycleKey(new Date(date+'T12:00:00')),dc=state.cycles[key]||L.defaults(),rows=L.breakdown(dc,date),spent=rows.reduce((n,x)=>n+x.actual,0);const amount=spent>=10000?new Intl.NumberFormat('zh-TW',{notation:'compact',maximumFractionDigits:1}).format(spent):money(spent);html+=`<button class="calendar-day ${date===L.iso(new Date())?'today':''} ${key!==selected?'previous-cycle':''}" data-day="${date}" aria-label="${date}，${rows.length?'花費 '+money(spent)+' 元':'尚無紀錄'}"><span>${Number(date.slice(8))}</span><small>${rows.length?esc(amount):'—'}</small></button>`;}$('#calendar').innerHTML=html;
 $('#fixed').innerHTML=c.fixed.map(x=>{const t=L.fixedTotal(x);return `<button class="fixed-card" data-fixed="${esc(x.id)}"><strong>${x.name}</strong><span>${x.id==='subscription'?t.count+' 筆訂閱 · ':''}每期金額 ${t.budget===null?'未設定':'NT$'+money(t.budget)}　實際 ${t.actual===null?'未填':'NT$'+money(t.actual)}</span></button>`;}).join('');
 $('#budgetSummary').textContent=c.budgets?`支出預算 NT$${money(s.budget)} · 儲蓄 NT$${money(s.savingTarget)} · ${s.unknown?'尚有預算未設定':'配置合計 NT$'+money(s.allocation)}`:'目前沿用舊明細預算，請設定四類預算。';
 $('#settingsMonth').value=selected;$('#analysisMonth').value=selected;renderAnalysis(c);
 $('#legacyRecords').innerHTML=c.undatedOther?.length?`<details><summary>舊支出（未指定日期）</summary><p class="muted">以下保留於「其他」統計，不自行指定日期或畫入每日趨勢。</p><ul class="expense-list">${c.undatedOther.map(x=>`<li><div>${esc(x.note)}<small>預算 ${money(x.budget)}</small></div><span>實際 ${money(x.actual)}</span></li>`).join('')}</ul></details>`:'';
}
function openDateDetails(date){
 const key=L.cycleKey(new Date(date+'T12:00:00')),c=state.cycles[key]||L.defaults(),rows=L.breakdown(c,date),sum=rows.reduce((n,x)=>n+x.actual,0);
 $('#detailsTitle').textContent=date.replaceAll('-',' / ');$('#detailsBody').innerHTML=rows.length?`<ul class="expense-list">${rows.map(x=>`<li><div><strong>${esc(x.name)}</strong><small>${esc(x.category)}</small></div><span>NT$ ${money(x.actual)}</span></li>`).join('')}</ul>`:'<p class="empty-state">這一天尚無實際支出紀錄。</p>';
 $('#detailsTotal').textContent='當日總花費 NT$ '+money(sum);$('#detailsEdit').onclick=()=>{$('#dayDetails').close();selectedDate=date;setView('daily');};$('#dayDetails').showModal();
}
$('#detailsClose').onclick=()=>$('#dayDetails').close();
function renderAnalysis(c){
 const a=I.analyze(c,selected),s=a.stats,colors=['#a15e4b','#81917b','#676f7d'],names=['三餐開銷','其他','固定支出'],keys=['meals','other','fixed'],circ=2*Math.PI*52;let offset=0;
 const rings=keys.map((key,i)=>{const value=s.buckets[key].spent,length=s.spent?value/s.spent*circ:0;const html=`<circle cx="80" cy="80" r="52" fill="none" stroke="${colors[i]}" stroke-width="18" stroke-dasharray="${length} ${circ-length}" stroke-dashoffset="${-offset}" transform="rotate(-90 80 80)"><title>${names[i]}：${money(value)} 元</title></circle>`;offset+=length;return html;}).join('');
 $('#spendingChart').innerHTML=`<svg viewBox="0 0 160 160" role="img" aria-label="本期支出分布：${keys.map((k,i)=>names[i]+money(s.buckets[k].spent)+'元').join('、')}"><circle cx="80" cy="80" r="52" fill="none" stroke="#e5ded2" stroke-width="18"/>${rings}<text x="80" y="75" text-anchor="middle" font-size="12">${s.spent?'本期支出':'尚無支出'}</text><text x="80" y="99" text-anchor="middle" font-size="18">${money(s.spent)}</text></svg><ul class="chart-legend">${keys.map((k,i)=>`<li><span class="color-key" style="background:${colors[i]}"></span><span>${names[i]}</span><strong>NT$ ${money(s.buckets[k].spent)}</strong><small>${s.spent?(s.buckets[k].spent/s.spent*100).toFixed(1):'0'}%</small></li>`).join('')}</ul>`;
 $('#budgetChart').innerHTML=keys.map((k,i)=>{const b=s.buckets[k],ratio=b.budget>0?b.spent/b.budget*100:null;return `<div class="budget-bar-row"><div><span>${names[i]}</span><small>${money(b.spent)} / ${money(b.budget)}</small></div><div class="budget-track"><span style="width:${ratio===null?0:Math.min(100,ratio)}%;background:${ratio>100?'#ad493d':colors[i]}"></span></div><p class="${ratio>100?'negative':'muted'}">${b.budget===null?'預算未設定':b.budget===0?(b.spent?'無配置，已有花費':'未配置'):ratio.toFixed(1)+'%'+(ratio>100?' · 已超支':'')}</p></div>`;}).join('')+`<div class="saving-plan"><span>儲蓄預算 NT$ ${money(s.savingTarget)}</span><p class="muted">本期預計可存 NT$ ${money(s.projected)}；為估計值，不代表已實際存入。</p></div>`;
 const max=Math.max(...a.daily.map(x=>x.cumulative),1),points=a.daily.map((x,i)=>`${20+i*280/(a.daily.length-1)},${124-x.cumulative/max*100}`).join(' ');
 $('#trendChart').innerHTML=`<svg viewBox="0 0 320 160" role="img" aria-label="已指定日期的累計支出趨勢，合計 ${money(a.daily.at(-1).cumulative)} 元"><path d="M20 24V124H300" fill="none" stroke="#b9ad9d"/><polyline points="${points}" fill="none" stroke="#a15e4b" stroke-width="2.5"/><text x="20" y="148" font-size="12">${a.daily[0].date.slice(5).replace('-','/')}</text><text x="300" y="148" text-anchor="end" font-size="12">${a.daily.at(-1).date.slice(5).replace('-','/')}</text><text x="20" y="16" font-size="12">NT$ ${money(a.daily.at(-1).cumulative)}</text></svg><p class="muted">僅計三餐與其他；固定支出另列，不畫入每日趨勢。未記錄日暫按 0 加總；未指定日期的舊支出不畫入。</p>`;
 $('#categoryTable').innerHTML=a.categories.length?`<table><caption>其他支出分類</caption><thead><tr><th>分類</th><th>實際金額</th></tr></thead><tbody>${a.categories.map(x=>`<tr><td>${esc(x.name)}</td><td>NT$ ${money(x.spent)}</td></tr>`).join('')}</tbody></table>`:'<p class="empty-state">尚無「其他」分類消費，記帳後即時更新。</p>';
 $('#analysisNote').textContent=`${selected} · ${s.unknown?'預算尚未設定完整；':''}僅統計實際輸入的消費，不含儲蓄。`;
 $('#budgetSummary').classList.toggle('negative',c.income!==null&&s.allocation>c.income);
 if(c.income!==null&&s.allocation>c.income)$('#budgetSummary').textContent+=' · 配置超過收入 NT$'+money(s.allocation-c.income);
}
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
const options=(selected)=>L.categories.map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('');
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
window.addEventListener('storage',e=>{if(e.key===KEY){cloudAuto=false;clearTimeout(cloudTimer);if(cloudClient)cloudText('另一分頁已變更帳目 · 自動上傳已暫停，請重新整理',true);toast('另一分頁已變更資料，請重新整理後繼續。');$('#saveStatus').textContent='資料已在另一分頁變更，請重新整理';}});
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

function cloudText(message,error=false,phase=''){if(error&&!phase)phase='pending';syncText($('#cloudStatus'),message,phase);syncText($('#cloudMessage'),message,phase);if(!googleMode)syncBadge(phase);$('#cloudStatus').classList.toggle('error',error);if(error)toast(message);}
function cloudControls(){for(const id of ['cloudConnect','cloudPull','cloudPush','cloudDisconnect'])$('#'+id).disabled=cloudBusy;$('#cloudForm').hidden=!!cloudClient;$('#cloudActions').hidden=!cloudClient;}
function currentJSON(){return JSON.stringify(state);}
function queueCloud(){
 if(googleMode){googleQueue();return;}
 if(!cloudClient||!cloudAuto){if(cloudClient)cloudText('已存本機，尚未啟用自動上傳。',false,'pending');else syncBadge('pending');return;}
 clearTimeout(cloudTimer);cloudText('已存本機 · 等待上傳 GitHub',false,'pending');
 cloudTimer=setTimeout(flushCloud,1200);
}
async function flushCloud(){
 if(!cloudClient||!cloudAuto||cloudBusy)return;
 const snapshot=currentJSON();cloudBusy=true;cloudControls();cloudText('已存本機 · 正在上傳 GitHub…',false,'syncing');
 try{if(ledgerStorage.getItem(KEY)!==raw)throw Error('另一分頁已變更帳目，請重新整理。');await cloudClient.save(JSON.parse(snapshot));cloudSynced=snapshot;$('#cloudRetry').hidden=true;if(cloudAuto&&snapshot===currentJSON())cloudText('已同步至 GitHub · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}),false,'latest');}
 catch(e){cloudAuto=false;$('#cloudRetry').hidden=false;cloudText('僅存本機 · '+e.message,true);}
 finally{cloudBusy=false;cloudControls();if(cloudAuto&&currentJSON()!==cloudSynced)queueCloud();}
}
function guardCloud(){if(googleMode||accountSwitching)throw Error('請先登出 Google，再使用 GitHub。');if(cloudBusy)throw Error('GitHub 正在處理上一個操作，請稍候。');if(!cloudClient)throw Error('請先連線 GitHub。');if($('#editor').open)throw Error('請先儲存或關閉目前的編輯視窗。');}
$('#cloudOpen').onclick=()=>{$('#cloud').showModal();cloudControls();};
$('#cloudClose').onclick=()=>{$('#cloudToken').value='';$('#cloud').close();};
$('#cloud').addEventListener('close',()=>{$('#cloudToken').value='';});
$('#cloudForm').onsubmit=async e=>{
 e.preventDefault();if(googleMode||accountSwitching){cloudText('請先登出 Google，再使用 GitHub。',true);return;}if(cloudBusy)return;cloudBusy=true;cloudControls();cloudText('正在檢查私人資料倉庫…');
 let client;
 try{
  if(location.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(location.hostname))throw Error('請使用 HTTPS 正式網站連線 GitHub。');
  client=new GitHubLedger.GitHubStore({owner:$('#cloudOwner').value.trim(),repo:$('#cloudRepo').value.trim(),token:$('#cloudToken').value.trim()});
  $('#cloudToken').value='';const remote=await client.read();cloudClient=client;
  if(!blocked&&remote.data&&JSON.stringify(remote.data)===currentJSON()){client.accept(remote);cloudAuto=true;cloudSynced=currentJSON();cloudText('已同步至 GitHub · 帳目版本一致',false,'latest');}
  else cloudText(remote.data?'已連線 · 請選擇下載 GitHub 帳目，或上傳此裝置帳目。':'已連線 · 倉庫尚無帳目，請按「上傳此裝置帳目」開始自動儲存。');
 }catch(err){client?.disconnect();cloudText(err.message,true);}finally{$('#cloudToken').value='';cloudBusy=false;cloudControls();}
};
async function pullCloud(){
 try{
  guardCloud();cloudAuto=false;clearTimeout(cloudTimer);cloudBusy=true;cloudControls();cloudText('正在讀取 GitHub 帳目…',false,'syncing');const before=raw,remote=await cloudClient.read();
  if(!remote.data)throw Error('GitHub 尚無 ledger.json，請先上傳此裝置帳目。');
  if(raw!==before)throw Error('本機帳目剛有變更，請重新下載以確認版本。');
  if(!confirm('下載會取代此裝置目前帳目，並先匯出本機備份。確定使用 GitHub 版本？')){cloudText('已取消下載 · 自動上傳暫停，請重新選擇帳目版本');return;}
  if(raw!==null)download(raw,`minimalist-before-github-${Date.now()}.json`);
  const wasBlocked=blocked;blocked=false;try{commit(remote.data,true);}catch(err){blocked=wasBlocked;throw err;}
  cloudClient.accept(remote);cloudSynced=currentJSON();cloudAuto=true;$('#cloudRetry').hidden=true;render();cloudText('已下載 GitHub 帳目 · 後續儲存將自動上傳',false,'latest');
 }catch(e){cloudText('下載未完成 · '+e.message,true);}finally{cloudBusy=false;cloudControls();}
}
async function uploadCloud(){
 try{
  guardCloud();if(blocked)throw Error('本機資料無法讀取，請先匯入有效備份或下載 GitHub 帳目。');
  cloudAuto=false;clearTimeout(cloudTimer);cloudBusy=true;cloudControls();cloudText('正在核對 GitHub 帳目…',false,'syncing');const before=raw,remote=await cloudClient.read();
  if(raw!==before)throw Error('本機帳目剛有變更，請重新上傳以確認版本。');
  if(remote.data&&JSON.stringify(remote.data)!==currentJSON()){
   if(!confirm('GitHub 上有不同版本。上傳將取代該版本，並先下載 GitHub 舊版本備份。確定使用此裝置帳目？')){cloudText('已取消上傳 · 自動上傳暫停，請重新選擇帳目版本');return;}
   download(JSON.stringify(remote.data,null,2),`minimalist-github-before-replace-${Date.now()}.json`);
  }
  cloudClient.accept(remote);cloudAuto=true;cloudText('準備上傳 GitHub…');
 }catch(e){cloudText('上傳未完成 · '+e.message,true);}finally{cloudBusy=false;cloudControls();}
 if(cloudAuto)await flushCloud();
}
$('#cloudPull').onclick=pullCloud;$('#cloudPush').onclick=uploadCloud;$('#cloudRetry').onclick=uploadCloud;
$('#cloudDisconnect').onclick=()=>{
 if(cloudBusy)return;
 if(cloudAuto&&cloudSynced!==currentJSON()&&!confirm('尚有帳目未上傳，資料會留在本機。確定中斷連線？'))return;
 clearTimeout(cloudTimer);cloudAuto=false;cloudClient?.disconnect();cloudClient=null;cloudSynced=null;$('#cloudRetry').hidden=true;cloudControls();cloudText('GitHub 已中斷 · 帳目目前僅存於本機');
};
window.addEventListener('beforeunload',e=>{if(cloudClient&&cloudSynced!==currentJSON()){e.preventDefault();e.returnValue='';}});
