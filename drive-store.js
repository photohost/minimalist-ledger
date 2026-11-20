(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 const SCOPE='https://www.googleapis.com/auth/drive.file',API='https://www.googleapis.com/drive/v3/',MAX_BYTES=800000;
 function config(value){let x=value;if(typeof x==='string'){x=x.trim();if(x.startsWith('{'))x=JSON.parse(x);else x={clientId:x};}if(!x||Object.keys(x).some(k=>k!=='clientId')||!/^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(x.clientId||''))throw Error('請填寫網頁應用程式的 Google OAuth 用戶端 ID（結尾為 .apps.googleusercontent.com），不是 Firebase 設定或用戶端密碼。');return {clientId:x.clientId};}
 function payload(data){const text=JSON.stringify(L.migrate(data));if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('帳目上限為 800 KB，請先匯出備份。');return text;}
 function message(e){return e?.message||'Google Drive 操作未完成，請稍後重試。';}
 class DriveStore{
  constructor({token,user,clientId,expiresAt=0,fetchImpl=root.fetch,now=Date.now}){this.token=token;this.user=user;this.uid=user.uid;this.projectId=clientId;this.expiresAt=expiresAt;this.now=now;this.fetchImpl=fetchImpl.bind(root);this.revision=undefined;this.busy=false;this.folderId=null;this.pending=null;this.preferredId=null;}
  check(){if(!this.token||(this.expiresAt&&this.now()>=this.expiresAt))throw Error('Google 授權已到期。請重新登入同一帳號繼續同步；目前帳目仍留在此瀏覽器。');}
  disconnect(){this.token='';}
  async request(path,{method='GET',body,headers={},text=false}={}){
   this.check();let r;try{r=await this.fetchImpl(path.startsWith('https://')?path:API+path,{method,body,headers:{Authorization:'Bearer '+this.token,...headers},credentials:'omit',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(30000)});}catch{throw Error('無法連線 Google Drive。資料仍留在此瀏覽器，請稍後重試。');}
   this.check();if(!r.ok){
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
    if(r.status===401)info='Google 授權已到期或撤銷。請重新登入同一帳號繼續同步。';
    if(r.status===404)info='Drive 帳目檔案已移除或無存取權，請重新讀取雲端。';
    if(r.status===429&&!info)info='Google Drive 請求過於頻繁，請稍後重試。';
    const code=reasons[0]||'HTTP_'+r.status;
    const failure=Error((info||'Google Drive 拒絕此操作，請將以下代碼提供給網站管理者。')+'（'+r.status+' / '+code+'）目前帳目仍留在此瀏覽器。');failure.code=code;failure.status=r.status;throw failure;
   }
   return text?await r.text():await r.json();
  }
  async list(query){let files=[],pageToken='';do{const p=new URLSearchParams({q:query,spaces:'drive',pageSize:'1000',fields:'nextPageToken,files(id,name,modifiedTime,appProperties)',...(pageToken?{pageToken}:{})});const r=await this.request('files?'+p);if(!Array.isArray(r.files))throw Error('Drive 檔案清單格式錯誤。');files.push(...r.files);pageToken=r.nextPageToken||'';if(files.length>20000)throw Error('帳目版本過多，請先匯出備份並整理 Drive 資料夾。');}while(pageToken);return files;}
  async read(){
   const files=await this.list("trashed = false and appProperties has { key='ledger' and value='minimalist-v1' }");
   const parentsById=new Map(files.map(file=>[file.id,Object.entries(file.appProperties||{}).filter(([key])=>/^p\d+$/.test(key)).map(([,id])=>id)]));
   const parentIds=new Set([...parentsById.values()].flat());
   const heads=files.filter(file=>!parentIds.has(file.id)).sort((a,b)=>a.id.localeCompare(b.id));
   const revision=heads.map(file=>file.id).join(',');
   if(!heads.length){if(files.length)throw Error('Drive 帳目版本關係異常，請先保留本機帳目。');return {revision:'',data:null};}
   const chosen=heads.length===1?heads[0]:heads.find(file=>file.id===this.preferredId);
   if(!chosen)return {revision,data:null,conflicts:heads};
   const reachable=new Set(),remaining=heads.map(file=>file.id);
   while(remaining.length){const id=remaining.pop();if(reachable.has(id))continue;reachable.add(id);remaining.push(...(parentsById.get(id)||[]));}
   const extendsLocal=!this.revision||this.revision.split(',').every(id=>reachable.has(id));
   const text=await this.request('files/'+encodeURIComponent(chosen.id)+'?alt=media',{text:true});
   if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Drive 帳目超過大小上限，未覆寫資料。');
   let data;try{data=L.migrate(JSON.parse(text));}catch{throw Error('Drive 帳目格式錯誤，未覆寫目前帳目。');}
   return {revision,data,heads:heads.map(file=>file.id),extendsLocal};
  }
  accept(remote){if(remote.conflicts)throw Error('請先選擇衝突版本。');this.revision=remote.revision;this.pending=null;}
  async folder(){if(this.folderId)return this.folderId;const folders=await this.list("trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='ledgerFolder' and value='minimalist-v1' }");if(folders.length)this.folderId=folders[0].id;else{const f=await this.request('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'日常留白記帳',mimeType:'application/vnd.google-apps.folder',appProperties:{ledgerFolder:'minimalist-v1'}})});this.folderId=f.id;}return this.folderId;}
  async save(data){
   this.check();if(this.busy)throw Error('上一筆 Drive 儲存尚未完成。');if(this.revision===undefined)throw Error('請先選擇要使用的帳目版本。');const text=payload(data);this.busy=true;
   try{const remote=await this.read();if(remote.conflicts)throw Error('Drive 有多個同時編輯的版本，請先讀取雲端並選擇版本。');if(remote.data&&payload(remote.data)===text&&remote.extendsLocal&&!remote.revision.includes(',')){this.revision=remote.revision;this.pending=null;return;}if(remote.revision!==this.revision)throw Error('另一裝置已更新帳目。請匯出此瀏覽器備份，再讀取雲端或確認取代。');const parents=remote.revision?remote.revision.split(','):[];if(parents.length>24)throw Error('衝突版本過多，請先備份並整理 Drive。');
    const folderId=await this.folder();if(!this.pending||this.pending.text!==text||this.pending.base!==this.revision){const ids=await this.request('files/generateIds?count=1&space=drive');if(!ids.ids?.[0])throw Error('Drive 無法建立檔案 ID。');this.pending={id:ids.ids[0],text,base:this.revision};}
    const id=this.pending.id,metadata={id,name:'日常留白-'+new Date(this.now()).toISOString().replace(/[:.]/g,'-')+'.json',mimeType:'application/json',parents:[folderId],appProperties:{ledger:'minimalist-v1',...Object.fromEntries(parents.map((p,i)=>['p'+i,p]))}},boundary='ledger_upload_boundary',body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+text+'\r\n--'+boundary+'--';
    // Append an immutable version: concurrent writers cannot destroy one another's data.
    await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    this.preferredId=null;const latest=await this.read();if(latest.conflicts||latest.revision!==id)throw Error('Drive 已保留上傳版本，但偵測到其他裝置同時更新。請讀取雲端並選擇版本。');this.revision=id;this.pending=null;
   }finally{this.busy=false;}
  }
 }
 let sdkPromise;
 function loadSDK(){if(root.google?.accounts?.oauth2)return Promise.resolve(root.google);if(!sdkPromise)sdkPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;const timer=setTimeout(()=>{script.remove();sdkPromise=null;reject(Error('Google 登入元件載入逾時，請確認網路再重試。'));},20000);script.onload=()=>{clearTimeout(timer);resolve(root.google)};script.onerror=()=>{clearTimeout(timer);sdkPromise=null;reject(Error('Google 登入元件無法載入，請確認網路與內容封鎖設定。'));};document.head.append(script);});return sdkPromise;}
 async function connect(value,{load=loadSDK,fetchImpl=root.fetch,now=Date.now}={}){
  const cfg=config(value),g=await load(),listeners=new Set();let store=null,pending=null;
  const oauth=g.accounts.oauth2.initTokenClient({client_id:cfg.clientId,scope:'openid email '+SCOPE,include_granted_scopes:false,callback:async result=>{const request=pending;if(!request)return;pending=null;try{if(result.error)throw Error('Google 授權未完成（'+result.error+'）。');if(!result.access_token||!g.accounts.oauth2.hasGrantedAllScopes(result,SCOPE))throw Error('請同意網站儲存帳目至 Drive 的檔案權限。');const r=await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+result.access_token},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('無法確認 Google 帳號，請重新登入。');const profile=await r.json();if(!profile.sub||!profile.email||profile.email_verified!==true)throw Error('Google 帳號資料無效，請重新登入。');const user={uid:profile.sub,email:profile.email};store=new DriveStore({token:result.access_token,user,clientId:cfg.clientId,expiresAt:now()+Number(result.expires_in||3600)*1000,fetchImpl,now});request.resolve({user});}catch(e){request.reject(e);}},error_callback:error=>{if(pending){pending.reject(Error(error.type==='popup_closed'?'已取消 Google 登入。':'Google 登入視窗無法開啟，請使用 Safari／Chrome 並允許彈出視窗。'));pending=null;}}});
  return {cfg,signIn:()=>new Promise((resolve,reject)=>{if(pending){reject(Error('請先完成目前的登入。'));return;}pending={resolve,reject};try{oauth.requestAccessToken({prompt:'select_account'});}catch(e){pending=null;reject(e);}}),store:user=>{if(!store||store.uid!==user.uid)throw Error('Google 帳號不一致，請重新登入。');return store;},observe:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},signOut:async()=>{store?.disconnect();store=null;g.accounts.id?.disableAutoSelect();listeners.forEach(fn=>fn(null));}};
 }
 const api={DriveStore,config,connect,payload,message,SCOPE};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoogleLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
