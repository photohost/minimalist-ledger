/* 日常留白 — GitHub private-repository sync; no external dependencies. */
'use strict';
const L=Ledger, $=s=>document.querySelector(s), KEY='minimalist-ledger-v1', BACKUP=KEY+'-previous';
let state=L.initial(), raw=null, blocked=false, selected=L.cycleKey(), editing=null;
let cloudClient=null,cloudAuto=false,cloudBusy=false,cloudTimer=null,cloudSynced=null;
const money=n=>n===null?'—':new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(n);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(s){$('#notice').textContent=s;$('#notice').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#notice').hidden=true,6000);}
try{raw=localStorage.getItem(KEY);if(raw!==null)state=L.validate(JSON.parse(raw));}catch(e){blocked=true;$('#saveStatus').textContent='無法讀取資料：請先匯出原始資料，或匯入有效備份';}
function cycle(){return state.cycles[selected]||L.defaults();}
function commit(candidate,fromCloud=false){
 if(blocked)throw Error('目前儲存不可用，請先匯出原始資料並匯入有效備份。');
 L.validate(candidate);
 if(localStorage.getItem(KEY)!==raw)throw Error('另一個分頁已更新資料。請先重新整理，再輸入本次變更。');
 const next=JSON.stringify(candidate);
 if(raw!==null)localStorage.setItem(BACKUP,raw);
 localStorage.setItem(KEY,next);raw=next;state=candidate;
 $('#saveStatus').textContent='已儲存於此瀏覽器 · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'});
 if(!fromCloud)queueCloud();
}
function download(data,name){const u=URL.createObjectURL(new Blob([data],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function render(){
 const c=cycle(),ds=L.dates(selected),s=L.stats({...c,key:selected});$('#month').value=selected;
 $('#periodTitle').textContent=`${selected.slice(0,4)} 年 ${Number(selected.slice(5))} 月`;
 $('#periodRange').textContent=ds[0].replaceAll('-','.')+' — '+ds.at(-1).replaceAll('-','.');
 const cards=[['本期預算',s.budget,'收入 NT$'+money(c.income)],['已花費',s.spent,'依實際金額累計'],['可用餘額',s.available,'收入 − 已花費（未扣預留）'],['本期預計可存',s.projected,'目標 NT$'+money(c.savingTarget)],['儲蓄目標差額',s.projected-c.savingTarget,s.unknown?'預算尚未填齊，估計可能偏高':'預計可存 − 月儲蓄目標']];
 $('#metrics').innerHTML=cards.map(([label,n,note])=>`<div class="metric"><p class="muted">${label}</p><strong class="${n<0?'negative':''}">${money(n)}</strong><small>${note}</small></div>`).join('');
 $('#goalProgress').value=state.savings??0;$('#goalProgress').setAttribute('aria-label','目前已存金額，目標二十萬元');
 $('#goalText').textContent=state.savings===null?'目前存款待設定 · 尚無實際進度':`已存 NT$${money(state.savings)} · ${(state.savings/200000*100).toFixed(1)}%`;
 $('#goalNote').textContent=state.savings===null?'設定目前存款後，即可查看預計期末總額。':`預計期末存款 NT$${money(state.savings+s.projected)}（目前存款＋本期預計可存）`;
 let html='';const offset=new Date(ds[0]+'T12:00:00').getDay();for(let i=0;i<offset;i++)html+='<div class="day blank" aria-hidden="true"></div>';
 for(const date of ds){const d=c.days[date]||{meals:[L.item(),L.item(),L.item()],other:[]},f=c.fixed.filter(x=>x.date===date);const entries=d.meals.map((x,i)=>({name:L.mealNames[i],kind:String(i),actual:x.actual,done:x.done,budget:x.budget}));
 const others=[...d.other,...f];entries.push({name:'其他',kind:'other',actual:others.some(x=>x.actual!==null)?others.reduce((a,x)=>a+(x.actual??0),0):null,done:others.length>0&&others.every(x=>x.done),budget:others.some(x=>x.budget!==null)?others.reduce((a,x)=>a+(x.budget??0),0):null});
 html+=`<article class="day ${date===L.iso(new Date())?'today':''}"><div class="day-head"><strong><span class="mobile-date">${Number(date.slice(5,7))} 月 </span>${Number(date.slice(8))}<span class="mobile-date"> 日 · ${'日一二三四五六'[new Date(date+'T12:00:00').getDay()]}</span></strong><small>${date===L.iso(new Date())?'今天':date.endsWith('-05')?'本期開始':date===ds.at(-1)?'本期結束':''}</small></div><div class="day-entries">${entries.map(x=>`<button class="entry ${x.done?'done':''}" data-date="${date}" data-kind="${x.kind}" aria-label="${date} ${x.name}，實際 ${x.actual===null?'未填':money(x.actual)}"><span>${x.done?'✓':'○'} ${x.name}</span><span class="amount">${x.actual!==null?money(x.actual):x.budget!==null?'預 '+money(x.budget):'＋'}</span></button>`).join('')}</div></article>`;
 }$('#calendar').innerHTML=html;
 $('#fixed').innerHTML=c.fixed.map(x=>`<button class="fixed-card" data-fixed="${esc(x.id)}"><strong>${x.done?'✓':'○'} ${esc(x.name)}</strong><span>預算 NT$${money(x.budget)}　實際 ${x.actual===null?'未填':'NT$'+money(x.actual)}</span><span>${x.date?'付款日 '+x.date:'尚未指定付款日'}</span></button>`).join('');
}
function show(title,body,onSave){$('#editTitle').textContent=title;$('#editBody').innerHTML=body;$('#editError').textContent='';editing=onSave;$('#editor').showModal();}
function num(label,id,value,required=false){return `<label>${label}<input type="number" inputmode="decimal" min="0" max="1000000000" step="0.01" id="${id}" value="${value??''}" ${required?'required':''} placeholder="未知，留空"></label>`;}
function read(id,required=false){const v=$('#'+id).value;if(v===''&&!required)return null;const n=Number(v);if(v===''||!L.validMoney(n,false))throw Error('請輸入 0 至 10 億、最多兩位小數的金額。');return n;}
function checkbox(id,done){return `<label class="check"><input type="checkbox" id="${id}" ${done?'checked':''}>已完成（須填實際金額；無支出可填 0）</label>`;}
function readItem(prefix){const x={budget:read(prefix+'b'),actual:read(prefix+'a'),done:$('#'+prefix+'d').checked};if(x.done&&x.actual===null)throw Error('勾選完成前，請填寫實際金額。');return x;}
function editMeal(date,index){const x=cycle().days[date]?.meals[index]||L.item();show(date+' · '+L.mealNames[index],`<div class="fields">${num('預算','mb',x.budget)}${num('實際金額','ma',x.actual)}</div>${checkbox('md',x.done)}<p class="hint">空白代表未知；填 0 代表確認沒有支出。</p>`,c=>{L.day(c,date).meals[index]=readItem('m');});}
const options=(selected)=>L.categories.map(x=>`<option ${x===selected?'selected':''}>${x}</option>`).join('');
function detailRow(x={category:'其他',note:'',...L.item()}){return `<div class="detail-row"><div class="row-top"><select aria-label="分類">${options(x.category)}</select><button type="button" class="remove">移除</button></div><label>說明<input class="note" maxlength="200" value="${esc(x.note)}" placeholder="例如：咖啡、回診"></label><div class="fields"><label>預算<input class="budget" type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" value="${x.budget??''}" placeholder="未知，留空"></label><label>實際金額<input class="actual" type="number" min="0" max="1000000000" step="0.01" inputmode="decimal" value="${x.actual??''}" placeholder="未知，留空"></label></div><label class="check"><input class="done" type="checkbox" ${x.done?'checked':''}>已完成</label></div>`;}
function editOther(date){const c=cycle(),rows=c.days[date]?.other||[];show(date+' · 其他',`<p class="hint">已列入固定支出的項目，請從下方固定支出入口記錄，不要再新增明細。信用卡僅記未曾入帳的消費。</p><div id="rows">${rows.map(detailRow).join('')}</div><button type="button" id="addRow">＋ 新增明細</button><h3>記錄固定支出付款</h3><p class="hint">先儲存目前明細，再點選固定支出。固定支出整期僅一筆，改日期會移動既有付款。</p><div class="tools">${c.fixed.map(x=>`<button type="button" data-link="${esc(x.id)}">${esc(x.name)}</button>`).join('')}</div>`,draft=>{
 const list=[];for(const row of $('#rows').children){const val=sel=>{const v=row.querySelector(sel).value;const n=v===''?null:Number(v);if(!L.validMoney(n))throw Error('明細金額不正確。');return n;};const x={category:row.querySelector('select').value,note:row.querySelector('.note').value,budget:val('.budget'),actual:val('.actual'),done:row.querySelector('.done').checked};if(x.done&&x.actual===null)throw Error('已完成明細必須填寫實際金額。');list.push(x);}L.day(draft,date).other=list;
 });
 $('#addRow').onclick=()=>$('#rows').insertAdjacentHTML('beforeend',detailRow());
 $('#rows').onclick=e=>{if(e.target.classList.contains('remove'))e.target.closest('.detail-row').remove();};
 $('#editBody').querySelectorAll('[data-link]').forEach(b=>b.onclick=()=>{if(saveEditor()){editFixed(b.dataset.link,date);}});
}
function editFixed(id,date){const x=cycle().fixed.find(x=>x.id===id),ds=L.dates(selected);show(x.name+' · 固定支出',`<p class="hint">這筆支出整期只計算一次。可先填部分實際金額，付清後勾選完成。</p><div class="fields">${num('預算','fb',x.budget)}${num('實際金額（累計）','fa',x.actual)}</div><label>付款日（可留空）<input type="date" id="fdate" min="${ds[0]}" max="${ds.at(-1)}" value="${date||x.date||''}"></label>${checkbox('fd',x.done)}`,c=>{const y=c.fixed.find(y=>y.id===id);Object.assign(y,readItem('f'),{date:$('#fdate').value||null});});}
function editSettings(){const c=cycle();show('本期設定',`<p class="hint">只變更 ${selected} 這一期；其他週期保留各自設定。新週期使用已知預設值，餐費與未知費用留空。</p><div class="fields">${num('實領收入','income',c.income,true)}${num('月儲蓄目標','target',c.savingTarget,true)}</div><p class="hint">房租、訂閱、加油的預算與實際金額，請到下方固定支出編輯。水電等未知支出可於每日「其他」新增。</p>`,draft=>{draft.income=read('income',true);draft.savingTarget=read('target',true);});}
function saveEditor(){try{const candidate=L.clone(state);candidate.cycles[selected]??=L.defaults();editing(candidate.cycles[selected],candidate);commit(candidate);$('#editor').close();render();return true;}catch(e){$('#editError').textContent=e.message||'儲存失敗，請匯出備份後重試。';return false;}}
$('#editForm').onsubmit=e=>{e.preventDefault();saveEditor();};$('#close').onclick=$('#cancel').onclick=()=>$('#editor').close();
$('#calendar').onclick=e=>{const b=e.target.closest('[data-date]');if(b){b.dataset.kind==='other'?editOther(b.dataset.date):editMeal(b.dataset.date,Number(b.dataset.kind));}};
$('#fixed').onclick=e=>{const b=e.target.closest('[data-fixed]');if(b)editFixed(b.dataset.fixed);};
function move(delta){const [y,m]=selected.split('-').map(Number),d=new Date(y,m-1+delta,5),key=L.cycleKey(d);if(+key.slice(0,4)<1900||+key.slice(0,4)>2200)return;selected=key;render();}
$('#prev').onclick=()=>move(-1);$('#next').onclick=()=>move(1);$('#today').onclick=()=>{selected=L.cycleKey();render();};$('#month').min='1900-01';$('#month').max='2200-12';$('#month').onchange=e=>{if(e.target.checkValidity()&&e.target.value){selected=e.target.value;render();}};
$('#settings').onclick=editSettings;$('#goalEdit').onclick=()=>show('更新目前存款',`${num('目前已存金額（所有週期共用）','savings',state.savings)}<p class="hint">請填入你目前已存下的金額；本工具不會將月結餘自動加入存款。期末估計＝此金額＋所選本期預計可存，請於期初更新基準，避免重複加上已存入的金額。未知時留空。</p>`,(c,s)=>{s.savings=read('savings');});
$('#export').onclick=()=>download(blocked?(raw||JSON.stringify(state)):JSON.stringify(state,null,2),`minimalist-${L.iso(new Date())}${blocked?'-recovery':''}.json`);
$('#import').onclick=()=>$('#file').click();$('#file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>10*1024*1024)throw Error('備份上限為 10 MB。');const candidate=L.validate(JSON.parse(await file.text()));if(!confirm(`備份包含 ${Object.keys(candidate.cycles).length} 個週期。匯入會取代所有目前帳目；系統會先下載目前資料備份。確定匯入？`))return;
 if(raw!==null)download(raw,`minimalist-before-import-${Date.now()}.json`);
 const previousBlocked=blocked;blocked=false;try{commit(candidate);}catch(err){blocked=previousBlocked;throw err;}render();toast('備份已匯入。');}catch(err){toast(err.message||'匯入失敗，原資料保持不變。');}finally{e.target.value='';}};
window.addEventListener('storage',e=>{if(e.key===KEY){cloudAuto=false;clearTimeout(cloudTimer);if(cloudClient)cloudText('另一分頁已變更帳目 · 自動上傳已暫停，請重新整理',true);toast('另一分頁已變更資料，請重新整理後繼續。');$('#saveStatus').textContent='資料已在另一分頁變更，請重新整理';}});
render();

function cloudText(message,error=false){$('#cloudStatus').textContent=message;$('#cloudMessage').textContent=message;$('#cloudStatus').classList.toggle('error',error);}
function cloudControls(){for(const id of ['cloudConnect','cloudPull','cloudPush','cloudDisconnect'])$('#'+id).disabled=cloudBusy;$('#cloudForm').hidden=!!cloudClient;$('#cloudActions').hidden=!cloudClient;}
function currentJSON(){return JSON.stringify(state);}
function queueCloud(){
 if(!cloudClient||!cloudAuto)return;
 clearTimeout(cloudTimer);cloudText('已存本機 · 等待上傳 GitHub');
 cloudTimer=setTimeout(flushCloud,1200);
}
async function flushCloud(){
 if(!cloudClient||!cloudAuto||cloudBusy)return;
 const snapshot=currentJSON();cloudBusy=true;cloudControls();cloudText('已存本機 · 正在上傳 GitHub…');
 try{if(localStorage.getItem(KEY)!==raw)throw Error('另一分頁已變更帳目，請重新整理。');await cloudClient.save(JSON.parse(snapshot));cloudSynced=snapshot;$('#cloudRetry').hidden=true;if(cloudAuto)cloudText('已同步至 GitHub · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));}
 catch(e){cloudAuto=false;$('#cloudRetry').hidden=false;cloudText('僅存本機 · '+e.message,true);}
 finally{cloudBusy=false;cloudControls();if(cloudAuto&&currentJSON()!==cloudSynced)queueCloud();}
}
function guardCloud(){if(cloudBusy)throw Error('GitHub 正在處理上一個操作，請稍候。');if(!cloudClient)throw Error('請先連線 GitHub。');if($('#editor').open)throw Error('請先儲存或關閉目前的編輯視窗。');}
$('#cloudOpen').onclick=()=>{$('#cloud').showModal();cloudControls();};
$('#cloudClose').onclick=()=>{$('#cloudToken').value='';$('#cloud').close();};
$('#cloud').addEventListener('close',()=>{$('#cloudToken').value='';});
$('#cloudForm').onsubmit=async e=>{
 e.preventDefault();if(cloudBusy)return;cloudBusy=true;cloudControls();cloudText('正在檢查私人資料倉庫…');
 let client;
 try{
  if(location.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(location.hostname))throw Error('請使用 HTTPS 正式網站連線 GitHub。');
  client=new GitHubLedger.GitHubStore({owner:$('#cloudOwner').value.trim(),repo:$('#cloudRepo').value.trim(),token:$('#cloudToken').value.trim()});
  $('#cloudToken').value='';const remote=await client.read();cloudClient=client;
  if(!blocked&&remote.data&&JSON.stringify(remote.data)===currentJSON()){client.accept(remote);cloudAuto=true;cloudSynced=currentJSON();cloudText('已同步至 GitHub · 帳目版本一致');}
  else cloudText(remote.data?'已連線 · 請選擇下載 GitHub 帳目，或上傳此裝置帳目。':'已連線 · 倉庫尚無帳目，請按「上傳此裝置帳目」開始自動儲存。');
 }catch(err){client?.disconnect();cloudText(err.message,true);}finally{$('#cloudToken').value='';cloudBusy=false;cloudControls();}
};
async function pullCloud(){
 try{
  guardCloud();cloudAuto=false;clearTimeout(cloudTimer);cloudBusy=true;cloudControls();cloudText('正在讀取 GitHub 帳目…');const before=raw,remote=await cloudClient.read();
  if(!remote.data)throw Error('GitHub 尚無 ledger.json，請先上傳此裝置帳目。');
  if(raw!==before)throw Error('本機帳目剛有變更，請重新下載以確認版本。');
  if(!confirm('下載會取代此裝置目前帳目，並先匯出本機備份。確定使用 GitHub 版本？')){cloudText('已取消下載 · 自動上傳暫停，請重新選擇帳目版本');return;}
  if(raw!==null)download(raw,`minimalist-before-github-${Date.now()}.json`);
  const wasBlocked=blocked;blocked=false;try{commit(remote.data,true);}catch(err){blocked=wasBlocked;throw err;}
  cloudClient.accept(remote);cloudSynced=currentJSON();cloudAuto=true;$('#cloudRetry').hidden=true;render();cloudText('已下載 GitHub 帳目 · 後續儲存將自動上傳');
 }catch(e){cloudText('下載未完成 · '+e.message,true);}finally{cloudBusy=false;cloudControls();}
}
async function uploadCloud(){
 try{
  guardCloud();if(blocked)throw Error('本機資料無法讀取，請先匯入有效備份或下載 GitHub 帳目。');
  cloudAuto=false;clearTimeout(cloudTimer);cloudBusy=true;cloudControls();cloudText('正在核對 GitHub 帳目…');const before=raw,remote=await cloudClient.read();
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
