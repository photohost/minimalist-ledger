const {test}=require('node:test'),assert=require('node:assert/strict'),L=require('../core.js'),{GitHubStore,encode,decode}=require('../github-store.js');
const reply=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
test('瀏覽器 fetch 必須維持全域呼叫環境',async()=>{
 const browserFetch=async function(){'use strict';if(this!==globalThis)throw new TypeError('Illegal invocation');return reply(200,{private:true,default_branch:'main'});};
 const client=new GitHubStore({owner:'test',repo:'data',token:'test-token',fetchImpl:browserFetch});
 await client.ensurePrivate();assert.equal(client.branch,'main');
});
function mock({data=null,sha=null,privateRepo=true}={}){
 const calls=[],remote={data,sha,privateRepo},client=new GitHubStore({owner:'tester',repo:'private-ledger',token:'test-token',fetchImpl:async(url,opt)=>{
  calls.push({url,opt});if(!url.includes('/contents/'))return reply(200,{private:remote.privateRepo,default_branch:'main'});
  if(opt.method==='PUT'){const body=JSON.parse(opt.body);if((body.sha??null)!==remote.sha)return reply(409,{});remote.data=JSON.parse(decode(body.content));remote.sha='new-sha';return reply(200,{content:{sha:remote.sha}});}
  return remote.sha===null?reply(404,{}):reply(200,{type:'file',sha:remote.sha,encoding:'base64',size:100,content:encode(JSON.stringify(remote.data))});
 }});return {client,calls,remote,puts:()=>calls.filter(c=>c.opt.method==='PUT')};
}
test('中文與 emoji 以 UTF-8 往返，不損壞說明',()=>assert.equal(decode(encode('早餐 🍵 記帳')),'早餐 🍵 記帳'));
test('拒絕公開倉庫，不傳送帳目',async()=>{const m=mock({privateRepo:false});await assert.rejects(m.client.read(),/私人/);assert.equal(m.puts().length,0);});
test('第一次上傳建立 ledger.json，權杖只在 API header',async()=>{const m=mock(),data=L.initial();m.client.accept(await m.client.read());await m.client.save(data);assert.deepEqual(m.remote.data,data);assert.equal(m.client.sha,'new-sha');const p=m.puts()[0];assert.ok(p.url.startsWith('https://api.github.com/'));assert.equal(p.opt.headers.Authorization,'Bearer test-token');assert.ok(!p.opt.body.includes('test-token'));assert.equal(JSON.parse(p.opt.body).sha,undefined);});
test('更新攜帶已知 SHA，其他裝置變更時拒絕覆寫',async()=>{const m=mock({data:L.initial(),sha:'old'});m.client.accept(await m.client.read());m.remote.sha='other-device';await assert.rejects(m.client.save({...L.initial(),savings:12}),/其他裝置/);assert.equal(m.puts().length,0);assert.equal(m.client.sha,'old');});
test('正常更新帶入 SHA 與正確分支',async()=>{const m=mock({data:L.initial(),sha:'old'});m.client.accept(await m.client.read());await m.client.save({...L.initial(),savings:12});const body=JSON.parse(m.puts()[0].opt.body);assert.equal(body.sha,'old');assert.equal(body.branch,'main');});
test('上傳成功但回應遺失後重試，相同資料不重複提交',async()=>{const data={...L.initial(),savings:12},m=mock({data,sha:'new'});m.client.accept({sha:'old'});await m.client.save(data);assert.equal(m.client.sha,'new');assert.equal(m.puts().length,0);});
test('倉庫變公開即停止上傳',async()=>{const m=mock();m.client.accept(await m.client.read());m.remote.privateRepo=false;await assert.rejects(m.client.save(L.initial()),/私人/);assert.equal(m.puts().length,0);});
test('損壞遠端帳目不可用新帳目覆蓋',async()=>{const m=mock({data:{bad:true},sha:'broken'});await assert.rejects(m.client.read(),/格式錯誤/);assert.equal(m.puts().length,0);});
test('401、403、409 與網路錯誤保留原 SHA 且不洩漏權杖',async()=>{for(const status of [401,403,409]){const c=new GitHubStore({owner:'test',repo:'data',token:'secret',fetchImpl:async()=>reply(status,{})});c.accept({sha:'old'});await assert.rejects(c.save(L.initial()),e=>!e.message.includes('secret'));assert.equal(c.sha,'old');assert.equal(c.busy,false);}const m=mock();m.client.fetchImpl=async()=>{throw Error('secret');};await assert.rejects(m.client.read(),e=>!e.message.includes('secret'));});
test('未選定版本、超過大小上限或無效金額不發起上傳',async()=>{const m=mock();await assert.rejects(m.client.save(L.initial()),/先選擇/);m.client.accept({sha:null});await assert.rejects(m.client.save({...L.initial(),savings:-1}));const big={...L.initial(),ignored:'a'.repeat(900001)};await assert.rejects(m.client.save(big),/900 KB/);assert.equal(m.calls.length,0);});
test('同時上傳會被拒絕，中斷連線清除權杖',async()=>{const m=mock();m.client.busy=true;m.client.accept({sha:null});await assert.rejects(m.client.save(L.initial()),/尚未完成/);m.client.disconnect();assert.equal(m.client.token,'');assert.equal(m.client.sha,undefined);});
