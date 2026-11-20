(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 const MAX_BYTES=800000,SDK_VERSION='13.4.0';
 function config(value){
  let x=value;
  if(typeof value==='string'){let text=value.trim();const snippet=text.match(/\b(?:const|let|var)\s+firebaseConfig\s*=\s*(\{[\s\S]*?\})\s*;?/);if(snippet)text=snippet[1];text=text.replace(/([{,]\s*)([A-Za-z][A-Za-z0-9_]*)\s*:/g,'$1"$2":').replace(/,\s*}/g,'}');x=JSON.parse(text);}
  if(!x||typeof x!=='object'||Array.isArray(x))throw Error('請貼上 Firebase 網頁應用程式的 JSON 設定。');
  if(Object.keys(x).some(k=>!['apiKey','authDomain','projectId','appId','storageBucket','messagingSenderId','measurementId','databaseURL'].includes(k)))throw Error('只接受 Firebase 網頁設定；請勿貼入服務帳戶、私鑰或 OAuth 密鑰。');
  for(const k of ['apiKey','authDomain','projectId','appId'])if(typeof x[k]!=='string'||!x[k].trim())throw Error('Firebase 設定缺少 '+k+'。');
  if(!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(x.projectId)||x.authDomain!==x.projectId+'.firebaseapp.com')throw Error('請使用專案原始的 projectId 與 projectId.firebaseapp.com 登入網域。');
  return Object.fromEntries(Object.entries(x).map(([k,v])=>{if(typeof v!=='string'||v.length>500)throw Error('Firebase 設定值不正確。');return [k,v];}));
 }
 function payload(data){const value=JSON.stringify(L.migrate(data));if(new TextEncoder().encode(value).length>MAX_BYTES)throw Error('Google 帳目上限為 800 KB，請先匯出備份。');return value;}
 function decode(snap){if(!snap.exists())return {revision:0,data:null};const x=snap.data();if(x.schema!==1||!Number.isSafeInteger(x.revision)||x.revision<1||typeof x.payload!=='string'||new TextEncoder().encode(x.payload).length>MAX_BYTES)throw Error('雲端帳目格式錯誤，未覆寫資料。');return {revision:x.revision,data:L.migrate(JSON.parse(x.payload))};}
 function message(e){const c=e?.code||'';return ({'auth/popup-blocked':'登入視窗被封鎖，請允許彈出視窗後重試。','auth/popup-closed-by-user':'已取消 Google 登入。','auth/unauthorized-domain':'尚未授權此網站網域，請在 Firebase Authentication 加入 blog.harunoji.one。','auth/operation-not-allowed':'請先在 Firebase 啟用 Google 登入。','permission-denied':'帳目存取被拒絕，請檢查 Firestore 規則與允許的使用者 UID。','unavailable':'目前無法連線 Google，資料仍保留於此分頁。','auth/network-request-failed':'Google 連線失敗，請確認網路後重試。'})[c]||e?.message||'Google 操作未完成，請稍後重試。';}
 class FirebaseStore{
  constructor({sdk,auth,db,projectId,user}){this.sdk=sdk;this.auth=auth;this.db=db;this.projectId=projectId;this.uid=user.uid;this.user=user;this.revision=undefined;this.busy=false;this.ref=sdk.doc(db,'users',this.uid,'ledger','main');}
  check(){if(this.auth.currentUser?.uid!==this.uid)throw Error('Google 登入狀態已變更，請重新登入。');}
  async read(){this.check();const remote=decode(await this.sdk.getDocFromServer(this.ref));this.check();return remote;}
  accept(remote){this.revision=remote.revision;}
  async save(data){
   this.check();if(this.busy)throw Error('上一筆 Google 儲存尚未完成。');if(this.revision===undefined)throw Error('請先選擇雲端或本機帳目。');const text=payload(data),expected=this.revision;this.busy=true;
   try{const revision=await this.sdk.runTransaction(this.db,async tx=>{this.check();const snap=await tx.get(this.ref),remote=decode(snap);if(remote.data&&payload(remote.data)===text)return remote.revision;if(remote.revision!==expected)throw Error('另一裝置已更新帳目。請先匯出此分頁備份，再讀取雲端版本或確認取代。');const next=remote.revision+1;tx.set(this.ref,{schema:1,revision:next,payload:text,updatedAt:this.sdk.serverTimestamp()});return next;});this.check();this.revision=revision;}finally{this.busy=false;}
  }
 }
 async function connect(value,load=url=>import(url)){
  const cfg=config(value),base='https://www.gstatic.com/firebasejs/'+SDK_VERSION+'/';
  const [appSDK,authSDK,dbSDK]=await Promise.all(['firebase-app.js','firebase-auth.js','firebase-firestore.js'].map(x=>load(base+x)));
  const name='ledger-'+cfg.projectId,app=appSDK.getApps().find(a=>a.name===name)||appSDK.initializeApp(cfg,name),auth=authSDK.getAuth(app);
  await authSDK.setPersistence(auth,authSDK.browserSessionPersistence);
  const db=dbSDK.getFirestore(app),provider=new authSDK.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
  return {cfg,auth,signIn:()=>authSDK.signInWithPopup(auth,provider),signOut:()=>authSDK.signOut(auth),observe:fn=>authSDK.onAuthStateChanged(auth,fn),store:user=>new FirebaseStore({sdk:dbSDK,auth,db,projectId:cfg.projectId,user})};
 }
 const api={FirebaseStore,connect,config,payload,decode,message,SDK_VERSION};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GoogleLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
