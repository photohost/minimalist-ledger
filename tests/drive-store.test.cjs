const {test}=require('node:test'),assert=require('node:assert/strict'),L=require('../core.js'),G=require('../drive-store.js');
const CID='123456789-test.apps.googleusercontent.com';
function drive({reportRevisions=true}={}){let sequence=0,fail=false,failAfter=false,hook=null;const files=new Map(),calls=[];const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data,text:async()=>typeof data==='string'?data:JSON.stringify(data)});const fetchImpl=async(url,opt={})=>{calls.push({url,...opt});if(fail)throw Error('offline');const u=new URL(url),id=decodeURIComponent(u.pathname.split('/').at(-1));if(id==='generateIds')return response({ids:Array.from({length:Number(u.searchParams.get('count'))},()=> 'file'+(++sequence))});if(u.searchParams.has('q')){const folder=u.searchParams.get('q').includes('ledgerFolder');return response({files:[...files.values()].filter(f=>folder?f.appProperties?.ledgerFolder:f.appProperties?.ledger).map(({text,...meta})=>meta)});}if(opt.method==='POST'&&url.includes('/upload/')){if(hook){const fn=hook;hook=null;await fn();}const parts=opt.body.split('--ledger_upload_boundary'),meta=JSON.parse(parts[1].split('\r\n\r\n')[1].trim()),text=parts[2].split('\r\n\r\n').slice(1).join('\r\n\r\n').trim();if(files.has(meta.id))return response({},409);const version=reportRevisions?{headRevisionId:'rev-'+meta.id}:{};files.set(meta.id,{...meta,text,...version,modifiedTime:'2026-11-20T00:00:00Z'});if(failAfter){failAfter=false;throw Error('lost response');}return response({id:meta.id,...version});}if(opt.method==='POST'){const x=JSON.parse(opt.body),id='folder'+(++sequence);files.set(id,{...x,id});return response({id});}if(u.searchParams.get('alt')==='media')return files.has(id)?response(files.get(id).text):response({},404);throw Error('unexpected '+url);};const client=()=>new G.DriveStore({token:'secret-token',user:{uid:'A',email:'a@example.test'},clientId:CID,fetchImpl});return {files,calls,client,offline:x=>fail=x,lose:()=>failAfter=true,hook:fn=>hook=fn};}
test('只接受 OAuth Client ID，不接受 Firebase 設定或用戶端密碼',()=>{assert.deepEqual(G.config(CID),{clientId:CID});assert.throws(()=>G.config({apiKey:'secret'}));assert.throws(()=>G.config({clientId:CID,client_secret:'secret'}));});
test('建立 Drive 資料夾與 JSON，後續只新增版本不覆寫',async()=>{const d=drive(),c=d.client();c.accept(await c.read());await c.save({...L.initial(),savings:10});const first=c.revision;await c.save({...L.initial(),savings:20});const snapshots=[...d.files.values()].filter(x=>x.text);assert.equal(snapshots.length,2);assert.equal(JSON.parse(snapshots[0].text).savings,10);assert.equal(snapshots[1].appProperties.p0,first);assert.equal((await c.read()).data.savings,20);assert.ok(d.calls.every(x=>!['PATCH','PUT','DELETE'].includes(x.method)));assert.ok(d.calls.every(x=>x.headers.Authorization==='Bearer secret-token'));});
test('多裝置舊基準被拒絕，不破壞其他裝置帳目',async()=>{const d=drive(),a=d.client(),b=d.client();a.accept(await a.read());await a.save(L.initial());b.accept(await b.read());await a.save({...L.initial(),savings:20});await assert.rejects(b.save({...L.initial(),savings:30}),/另一裝置/);assert.equal((await a.read()).data.savings,20);});
test('同時寫入保留兩邊，選版後新版本整合分支',async()=>{const d=drive(),a=d.client(),b=d.client();a.accept(await a.read());await a.save(L.initial());b.accept(await b.read());d.hook(()=>b.save({...L.initial(),savings:20}));await assert.rejects(a.save({...L.initial(),savings:30}),/同時更新/);const conflict=await a.read();assert.equal(conflict.conflicts.length,2);assert.equal([...d.files.values()].filter(x=>x.text).length,3);a.preferredId=conflict.conflicts[0].id;const chosen=await a.read();a.accept(chosen);await a.save(chosen.data);const resolved=await a.read();assert.ok(!resolved.conflicts);assert.equal(resolved.data.savings,chosen.data.savings);assert.equal([...d.files.values()].filter(x=>x.text).length,4);});
test('上傳成功但回應遺失，重試不重複建立',async()=>{const d=drive(),c=d.client(),data={...L.initial(),savings:10};c.accept(await c.read());d.lose();await assert.rejects(c.save(data));await c.save(data);assert.equal([...d.files.values()].filter(x=>x.text).length,1);});
test('離線、撤銷與損壞檔案不偽造成功',async()=>{const d=drive(),c=d.client();c.accept(await c.read());d.offline(true);await assert.rejects(c.save(L.initial()));assert.equal(c.revision,'');assert.equal(c.busy,false);d.offline(false);await c.save(L.initial());d.files.get(c.revision).text='invalid';await assert.rejects(c.read(),/格式錯誤/);c.disconnect();await assert.rejects(c.read(),/授權已到期/);});
test('過期權杖在網路操作前被拒絕，備份不包含憑證',async()=>{let sent=false;const c=new G.DriveStore({token:'secret',user:{uid:'A'},clientId:CID,now:()=>2000,expiresAt:1000,fetchImpl:async()=>{sent=true}});await assert.rejects(c.read(),/到期/);assert.equal(sent,false);assert.ok(!G.payload(L.initial()).includes('secret'));});
test('Google 官方授權取得身分與限定 Drive 權限，登出清除權杖',async()=>{let options,requested;const g={accounts:{oauth2:{initTokenClient:x=>{options=x;return {requestAccessToken:x=>requested=x}},hasGrantedAllScopes:(_r,scope)=>scope===G.SCOPE}}};const connection=await G.connect(CID,{load:async()=>g,fetchImpl:async(url)=>{assert.equal(url,'https://openidconnect.googleapis.com/v1/userinfo');return {ok:true,json:async()=>({sub:'google-id',email:'a@example.test',email_verified:true})}}});const login=connection.signIn();assert.equal(requested.prompt,'select_account');assert.equal(options.scope,'openid email '+G.SCOPE);assert.equal(options.include_granted_scopes,false);await options.callback({access_token:'secret',expires_in:3600});const {user}=await login;assert.equal(user.uid,'google-id');const store=connection.store(user);assert.equal(store.token,'secret');await connection.signOut();assert.equal(store.token,'');});
test('主頁只載入 Drive，Firebase 僅留於獨立匯出頁',()=>{const fs=require('node:fs'),html=fs.readFileSync(require.resolve('../index.html'),'utf8'),legacy=fs.readFileSync(require.resolve('../firebase-legacy.html'),'utf8');assert.ok(html.includes('src="drive-store.js'));assert.ok(!/src="firebase-(?:store|config)\.js/.test(html));assert.ok(legacy.includes('src="firebase-store.js'));assert.ok(legacy.includes('src="firebase-sync-legacy.js'));});
test('彈出視窗取消或未同意 Drive 權限時不建立帳本',async()=>{let options;const g={accounts:{oauth2:{initTokenClient:x=>{options=x;return {requestAccessToken(){}}},hasGrantedAllScopes:()=>false}}};const c=await G.connect(CID,{load:async()=>g,fetchImpl:async()=>{throw Error('should not fetch')}});const p=c.signIn();options.error_callback({type:'popup_closed'});await assert.rejects(p,/取消/);const p2=c.signIn();await options.callback({access_token:'secret'});await assert.rejects(p2,/檔案權限/);assert.throws(()=>c.store({uid:'A'}));});
test('Drive 拒絕時區分 API 未啟用、授權不足、配額與空間',async()=>{const cases=[['accessNotConfigured','尚未啟用'],['SERVICE_DISABLED','尚未啟用'],['ACCESS_TOKEN_SCOPE_INSUFFICIENT','未包含 Drive'],['storageQuotaExceeded','空間已滿'],['rateLimitExceeded','用量限制'],['domainPolicy','機構管理政策'],['insufficientFilePermissions','檔案的存取權']];for(const [reason,expected]of cases){const c=new G.DriveStore({token:'secret',user:{uid:'A'},clientId:CID,fetchImpl:async()=>({ok:false,status:403,json:async()=>({error:{errors:[{reason}],details:[{reason}],message:'secret-token'}})})});await assert.rejects(c.read(),e=>e.message.includes(expected)&&e.code===reason&&!e.message.includes('secret-token'));}});
test('未知或損壞錯誤回應仍保留狀態碼，不顯示敏感回應內容',async()=>{for(const result of [async()=>{throw Error('broken')},async()=>({error:{message:'sensitive',errors:[{reason:'<script>secret</script>'}]}})]){const c=new G.DriveStore({token:'secret',user:{uid:'A'},clientId:CID,fetchImpl:async()=>({ok:false,status:403,json:result})});await assert.rejects(c.read(),e=>e.code==='HTTP_403'&&!e.message.includes('sensitive')&&!e.message.includes('script'));}});
test('Drive 歷史檢查可區分新版本與暫時只看到的舊版本',async()=>{const d=drive(),c=d.client();c.accept(await c.read());await c.save({...L.initial(),savings:10});const first=c.revision;await c.save({...L.initial(),savings:20});const second=c.revision;const reader=d.client();reader.accept({revision:first});assert.equal((await reader.read()).extendsLocal,true);d.files.delete(second);assert.equal((await c.read()).extendsLocal,false);});

test('已知版本且有預留 ID 時，只需查版本、上傳、確認三次請求',async()=>{
 const d=drive(),c=d.client();
 c.accept(await c.read());
 await c.save({...L.initial(),savings:10});
 d.calls.length=0;
 await c.save({...L.initial(),savings:20});
 assert.deepEqual(d.calls.map(({method,url})=>[method,new URL(url).pathname]),[
  ['GET','/drive/v3/files'],['POST','/upload/drive/v3/files'],['GET','/drive/v3/files']
 ]);
 assert.equal((await c.read()).data.savings,20);
});

test('Drive 缺少版本資訊時，仍下載內容驗證上傳及原帳目',async()=>{
 const d=drive({reportRevisions:false}),c=d.client();
 c.accept(await c.read());
 await c.save({...L.initial(),savings:10});
 d.calls.length=0;
 await c.save({...L.initial(),savings:20});
 assert.equal(d.calls.filter(({url})=>new URL(url).searchParams.get('alt')==='media').length,2);
});

test('同一 Drive 檔案的內容版本改變時，拒絕自動上傳覆蓋',async()=>{
 const d=drive(),c=d.client();
 c.accept(await c.read());
 const base={...L.initial(),savings:10};
 await c.save(base);
 const file=d.files.get(c.revision);
 file.headRevisionId='updated-content';
 file.text=G.payload({...L.initial(),savings:90});
 const next={...L.initial(),savings:20};
 await assert.rejects(c.save(next),/另一裝置已更新/);
 const reopened=d.client();
 reopened.accept({revision:c.revision});
 await assert.rejects(reopened.save(next,{baseText:G.payload(base)}),/另一裝置已更新/);
 assert.equal((await reopened.read()).data.savings,90);
});
