'use strict';
const GOOGLE_CONFIG_KEY='minimalist-firebase-config';
let googleConnection=null,googleClient=null,googleAuto=false,googleBusy=false,googleTimer=null,googleSynced=null,googleUnsubscribe=null,googleEpoch=0;
function googleText(s,error=false){$('#googleStatus').textContent=s;$('#googleMessage').textContent=s;$('#googleMessage').classList.toggle('error',error);}
function googleControls(){
 $('#googleLogin').disabled=!googleConnection||googleBusy||googleMode;
 $('#googleSetup').disabled=googleBusy||googleMode;$('#googleConfig').disabled=googleBusy||googleMode;
 for(const id of ['googlePull','googlePush','googleMigrate','googleLogout'])$('#'+id).disabled=googleBusy||!googleMode;
 $('#googleActions').hidden=!googleMode;$('#cloudOpen').disabled=googleMode||googleBusy;
}
function googleGuard(){if(googleBusy||cloudBusy||accountSwitching)throw Error('資料正在處理中，請稍候。');if($('#editor').open)throw Error('請先儲存或關閉編輯視窗。');}
function googleCache(){if(!googleMode||!googleClient)return;ledgerStorage.setItem(KEY+'-sync',JSON.stringify({revision:googleClient.revision??null,synced:googleSynced}));}
function loadLedgerStorage(storage,key){const source=storage.getItem(key),next=source===null?L.initial():L.migrate(JSON.parse(source));ledgerStorage=storage;KEY=key;BACKUP=key+'-previous';raw=source;state=next;blocked=false;render();}
function leaveGoogle(message='已登出 Google · 顯示原本的本機帳目'){
 googleEpoch++;clearTimeout(googleTimer);googleUnsubscribe?.();googleUnsubscribe=null;googleAuto=false;googleClient=null;googleSynced=null;googleMode=false;
 // Clear the authenticated ledger from the view, including any open edit/detail dialog.
 editing=null;for(const id of ['editor','dayDetails'])if($('#'+id).open)$('#'+id).close();$('#editBody').innerHTML='';$('#detailsBody').innerHTML='';
 try{loadLedgerStorage(localStorage,LOCAL_KEY);}catch{ledgerStorage=localStorage;KEY=LOCAL_KEY;BACKUP=KEY+'-previous';raw=localStorage.getItem(KEY);state=L.initial();blocked=true;render();}
 $('#googleIdentity').textContent='';$('#saveStatus').textContent='目前顯示未登入的本機帳目';googleBusy=false;accountSwitching=false;googleControls();googleText(message);
}
async function prepareGoogle(){
 googleGuard();googleBusy=true;googleControls();googleText('正在準備 Google 登入…');
 try{const cfg=GoogleLedger.config($('#googleConfig').value);const connection=await GoogleLedger.connect(cfg);localStorage.setItem(GOOGLE_CONFIG_KEY,JSON.stringify(cfg));googleConnection=connection;googleText('連線設定已就緒，請按「使用 Google 登入」。');}
 catch(e){googleText(GoogleLedger.message(e),true);}finally{googleBusy=false;googleControls();}
}
async function loginGoogle(){
 try{googleGuard();if(!googleConnection)throw Error('請先儲存連線設定。');if(googleMode)throw Error('請先登出目前帳號。');
  // Call popup before any await so mobile browsers retain the user's gesture.
  const pending=googleConnection.signIn();googleBusy=true;accountSwitching=true;googleControls();googleText('等待 Google 登入…');const result=await pending,user=result.user,client=googleConnection.store(user);
  clearTimeout(cloudTimer);cloudAuto=false;cloudClient?.disconnect();cloudClient=null;cloudSynced=null;cloudControls();cloudText('已切換至 Google · GitHub 自動上傳已停止');
  googleEpoch++;googleClient=client;googleMode=true;googleAuto=false;googleSynced=null;
  const key=LOCAL_KEY+'-google-'+client.projectId+'-'+encodeURIComponent(user.uid);
  try{loadLedgerStorage(sessionStorage,key);const meta=JSON.parse(sessionStorage.getItem(key+'-sync')||'null');if(meta&&Number.isSafeInteger(meta.revision)){client.accept(meta);googleSynced=meta.synced;}}
  catch{ledgerStorage=sessionStorage;KEY=key;BACKUP=key+'-previous';raw=sessionStorage.getItem(key);state=L.initial();blocked=true;render();}
  $('#googleIdentity').textContent=(user.email||'Google 使用者')+' · UID：'+user.uid;
  $('#saveStatus').textContent='Google 帳目暫存於此分頁';
  googleUnsubscribe=googleConnection.observe(next=>{if(next?.uid!==client.uid&&googleClient===client)leaveGoogle('Google 登入已失效 · 已關閉帳號資料，請重新登入');});
  googleBusy=false;accountSwitching=false;googleControls();
  const dirty=raw!==null&&currentJSON()!==googleSynced;
  if(dirty)googleText('此分頁有未同步帳目，請先匯出備份，再選擇讀取雲端或上傳此分頁。');else await pullGoogle(false);
 }catch(e){googleText(GoogleLedger.message(e),true);}finally{googleBusy=false;accountSwitching=false;googleControls();}
}
function googleQueue(){
 if(!googleMode)return;googleCache();if(!googleAuto)return;clearTimeout(googleTimer);googleText('已存此分頁 · 等待同步 Google');googleTimer=setTimeout(flushGoogle,1200);googleTimer?.unref?.();
}
async function flushGoogle(){
 if(!googleMode||!googleAuto||googleBusy)return;const client=googleClient,epoch=googleEpoch,snapshot=currentJSON();googleBusy=true;googleControls();googleText('已存此分頁 · 正在同步 Google…');
 try{await client.save(JSON.parse(snapshot));if(epoch!==googleEpoch||client!==googleClient)return;googleSynced=snapshot;googleCache();googleText('已同步至 Google · '+new Date().toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'}));}
 catch(e){if(epoch===googleEpoch){googleAuto=false;googleText('尚未同步 · '+GoogleLedger.message(e),true);}}
 finally{if(epoch===googleEpoch){googleBusy=false;googleControls();if(googleAuto&&currentJSON()!==googleSynced)googleQueue();}}
}
async function pullGoogle(ask=true){
 let epoch=googleEpoch;
 try{googleGuard();if(!googleClient)throw Error('請先使用 Google 登入。');googleAuto=false;clearTimeout(googleTimer);googleBusy=true;googleControls();const client=googleClient,before=raw;googleText('正在讀取 Google 帳目…');const remote=await client.read();
  if(epoch!==googleEpoch||client!==googleClient)return;if(before!==raw)throw Error('此分頁帳目已變更，請重新讀取。');if($('#editor').open)throw Error('編輯視窗已開啟，請先儲存或關閉，再讀取雲端。');
  if(!remote.data){client.accept(remote);googleCache();googleText('Google 尚無帳目。可匯入原本的本機／GitHub 帳目，或上傳目前的新帳本。');return;}
  if(ask&&raw!==null&&currentJSON()!==JSON.stringify(remote.data)){
   if(!confirm('讀取雲端會取代此分頁帳目，取代前先下載此分頁備份。繼續？'))return;download(raw,`minimalist-before-google-${Date.now()}.json`);
  }
  const wasBlocked=blocked;blocked=false;try{commit(remote.data,true);}catch(e){blocked=wasBlocked;throw e;}
  client.accept(remote);googleSynced=currentJSON();googleAuto=true;googleCache();render();googleText('已同步至 Google · 後續記帳會自動上傳');
 }catch(e){if(epoch===googleEpoch)googleText(GoogleLedger.message(e),true);}finally{if(epoch===googleEpoch){googleBusy=false;googleControls();}}
}
async function pushGoogle(migrate=false){
 const epoch=googleEpoch;
 try{googleGuard();if(!googleClient)throw Error('請先使用 Google 登入。');if(blocked)throw Error('請先匯入有效備份或讀取雲端帳目。');
  let data=L.clone(state);
  if(migrate){const source=localStorage.getItem(LOCAL_KEY);if(source===null)throw Error('原本的本機帳目是空的。請先登出 Google，下載 GitHub 帳目或匯入備份，再登入移轉。');data=L.migrate(JSON.parse(source));if(!confirm('將原本的本機帳目複製到此 Google 帳號？原本的本機與 GitHub 資料會保留。'))return;}
  googleAuto=false;clearTimeout(googleTimer);googleBusy=true;accountSwitching=true;googleControls();const client=googleClient;googleText('正在確認雲端版本…');const remote=await client.read();if(epoch!==googleEpoch)return;
  if(remote.data&&JSON.stringify(remote.data)!==JSON.stringify(data)){if(!confirm('Google 已有不同帳目。確認以選定帳目取代？會先下載被取代的雲端備份。'))return;download(JSON.stringify(remote.data,null,2),`minimalist-google-before-replace-${Date.now()}.json`);}
  if(migrate&&raw!==null&&currentJSON()!==JSON.stringify(data))download(raw,`minimalist-before-migration-${Date.now()}.json`);
  accountSwitching=false;if(migrate)commit(data,true);client.accept(remote);googleCache();googleAuto=true;
 }catch(e){googleText(GoogleLedger.message(e),true);}finally{if(epoch===googleEpoch){accountSwitching=false;googleBusy=false;googleControls();}}
 if(epoch===googleEpoch&&googleAuto)await flushGoogle();
}
async function logoutGoogle(){
 try{googleGuard();if(!googleMode)return;const pending=raw!==null&&currentJSON()!==googleSynced;
  if(pending){if(!confirm('此分頁還有未同步帳目。登出會先下載備份，並清除此帳號在本分頁的暫存。確定登出？'))return;download(raw,`minimalist-google-unsynced-${Date.now()}.json`);}
  googleBusy=true;accountSwitching=true;googleControls();const key=KEY;await googleConnection.signOut();sessionStorage.removeItem(key);sessionStorage.removeItem(key+'-previous');sessionStorage.removeItem(key+'-sync');leaveGoogle();
 }catch(e){googleText(GoogleLedger.message(e),true);}finally{googleBusy=false;accountSwitching=false;googleControls();}
}
$('#googleOpen').onclick=()=>{
 $('#googleDialog').showModal();
 if(!googleMode&&!googleConnection){try{const cfg=window.LEDGER_FIREBASE_CONFIG||JSON.parse(localStorage.getItem(GOOGLE_CONFIG_KEY)||'null');if(cfg){$('#googleConfig').value=JSON.stringify(cfg,null,2);prepareGoogle().catch(e=>googleText(GoogleLedger.message(e),true));}}catch{googleText('連線設定無法讀取，請重新貼上 Firebase 網頁設定。',true);}}
 googleControls();
};
$('#googleClose').onclick=()=>$('#googleDialog').close();$('#googleSetup').onclick=()=>prepareGoogle().catch(e=>googleText(GoogleLedger.message(e),true));$('#googleLogin').onclick=loginGoogle;
$('#googlePull').onclick=()=>pullGoogle();$('#googlePush').onclick=()=>pushGoogle();$('#googleMigrate').onclick=()=>pushGoogle(true);$('#googleLogout').onclick=logoutGoogle;
window.addEventListener('beforeunload',e=>{if(googleMode&&raw!==null&&currentJSON()!==googleSynced){e.preventDefault();e.returnValue='';}});
window.addEventListener('focus',()=>{if(googleMode&&googleAuto&&!googleBusy&&!$('#editor').open&&currentJSON()===googleSynced)pullGoogle(false);});
googleControls();
