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
