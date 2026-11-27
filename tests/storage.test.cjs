const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),L=require('../core.js');
function app(seed=null){const values=new Map(),elements=new Map();if(seed!==null)values.set('minimalist-ledger-v1',seed);const element=()=>({textContent:'',innerHTML:'',value:'',style:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelectorAll(){return []}});const context=vm.createContext({Ledger:L,DailyLedger:require('../daily.js'),LedgerInsights:require('../insights.js'),LedgerAI:require('../ai.js'),document:{querySelector(s){if(!elements.has(s))elements.set(s,element());return elements.get(s);}},localStorage:{getItem:k=>values.get(k)??null,setItem(k,v){values.set(k,v);}},window:{addEventListener(){}},console,Intl,Date,JSON,Error,setTimeout,clearTimeout});vm.runInContext(fs.readFileSync(require.resolve('../app.js'),'utf8'),context);return {context,values,elements,run:s=>vm.runInContext(s,context)};}
test('儲存與重新載入可完整往返，前版保留',()=>{const a=app();a.run('commit({...state,savings:123})');const first=a.values.get('minimalist-ledger-v1');a.run('commit({...state,savings:456})');assert.equal(a.values.get('minimalist-ledger-v1-previous'),first);const b=app(a.values.get('minimalist-ledger-v1'));assert.equal(b.run('state.savings'),456);});
test('容量或權限錯誤不可改記憶體狀態，不能假裝已儲存',()=>{const a=app();a.run('localStorage.setItem=()=>{throw new Error("quota exceeded")}');assert.throws(()=>a.run('commit({...state,savings:123})'));assert.equal(a.run('state.savings'),null);assert.equal(a.values.get('minimalist-ledger-v1'),undefined);});
test('損壞資料不會被預設狀態覆寫',()=>{const a=app('{broken');assert.equal(a.run('blocked'),true);assert.throws(()=>a.run('commit(Ledger.initial())'));assert.equal(a.values.get('minimalist-ledger-v1'),'{broken');});
test('另一分頁修改時拒絕用舊資料覆寫',()=>{const a=app();a.values.set('minimalist-ledger-v1',JSON.stringify({...L.initial(),savings:789}));assert.throws(()=>a.run('commit({...state,savings:123})'));assert.equal(JSON.parse(a.values.get('minimalist-ledger-v1')).savings,789);});
test('使用者文字在 HTML 內轉義',()=>{const a=app();assert.equal(a.run('esc("<img src=x onerror=alert(1)>")'),'&lt;img src=x onerror=alert(1)&gt;');});
test('午夜帳期切換不會將已開啟表單存入新帳期',()=>{const a=app();a.run('$("#editor").showModal=()=>{};$("#editor").close=()=>{};selected="2026-11";show("測試","",c=>c.income=123);selected="2026-12";saveEditor()');assert.equal(a.run('state.cycles["2026-11"].income'),123);assert.equal(a.run('state.cycles["2026-12"]'),undefined);});

test('小光點評區：無花費不開放，未登入提示登入，已登入有花費才可點評；結果快取在本機並標示過期',async()=>{
 const a=app();
 a.run('currentView="analysis";googleMode=true;renderAi()');
 assert.match(a.run("$('#aiThread').innerHTML"),/還沒有花費/);assert.equal(a.run("$('#aiAsk').disabled"),true);
 a.run('const d=L.iso(new Date());const next=JSON.parse(JSON.stringify(state));const c=next.cycles[selected]||(next.cycles[selected]=L.defaults());c.days[d]={meals:[{budget:null,actual:120,done:true},{budget:null,actual:null,done:false},{budget:null,actual:null,done:false}],other:[]};state=next;googleMode=false;renderAi()');
 assert.match(a.run("$('#aiThread').innerHTML"),/登入 Google/);assert.equal(a.run("$('#aiAsk').disabled"),true);
 a.run('googleMode=true;renderAi()');
 assert.equal(a.run("$('#aiAsk').disabled"),false);assert.match(a.run("$('#aiThread').innerHTML"),/想知道我怎麼看/);
 a.run('aiSave(selected,{print:"舊",reply:"<b>記得省</b>"});renderAi()');
 const html=a.run("$('#aiThread').innerHTML");
 assert.match(html,/&lt;b&gt;記得省&lt;\/b&gt;/);assert.match(html,/更新前的點評/);assert.match(html,/xiaoguang\.png/);
 assert.equal(a.run("$('#aiAsk').textContent"),'重新點評');
});
