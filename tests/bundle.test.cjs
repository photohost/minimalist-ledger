const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const build=require('../build.cjs');

test('app.bundle.js 與原始檔一致（改完請執行 npm run build）',()=>{
 const current=fs.readFileSync(require.resolve('../'+build.OUTPUT),'utf8');
 assert.equal(current,build.build(),'app.bundle.js 已過期，請執行 npm run build');
});

test('網頁、Service Worker 與 package.json 使用同一版本號',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.ok(html.includes('app.bundle.js?v='+build.version));
 assert.ok(html.includes('style.css?v='+build.version));
 assert.ok(html.includes('paper.css?v='+build.version));
 assert.equal(/\?v=(?!1\.9\.0\b)[\d.]+/.test(html),false);
 assert.ok(build.build().includes("register('sw.js?v="+build.version+"')"));
});

test('Service Worker 不攔截登入服務、跨網域與自身腳本',()=>{
 const sw=fs.readFileSync(require.resolve('../sw.js'),'utf8');
 assert.ok(sw.includes("url.pathname.startsWith(AUTH_PATH)"));
 assert.ok(sw.includes("url.origin!==self.location.origin"));
 assert.ok(sw.includes("url.pathname.endsWith('/sw.js')"));
 assert.ok(sw.includes("request.method!=='GET'"));
});

test('登入服務與網頁都在 Worker 的公開檔案清單內',()=>{
 const worker=fs.readFileSync(require.resolve('../auth-worker/index.mjs'),'utf8');
 for(const file of ['app.bundle.js','sw.js','style.css','paper.css','index.html'])assert.ok(worker.includes("'"+file+"'"),file);
 assert.ok(worker.includes('max-age=31536000, immutable'));
});

test('合併後的 app.bundle.js 能直接啟動、繪製月曆並記帳',()=>{
 const vm=require('node:vm');
 const local=new Map(),elements=new Map();
 const storage=map=>({getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,String(value)),removeItem:key=>map.delete(key)});
 const element=()=>({open:false,textContent:'',innerHTML:'',value:'',dataset:{},classList:{toggle(){},add(){},remove(){}},setAttribute(){},addEventListener(){},querySelector:()=>null,querySelectorAll:()=>[],showModal(){this.open=true;},close(){this.open=false;}});
 const context=vm.createContext({
  document:{querySelector(key){if(!elements.has(key))elements.set(key,element());return elements.get(key);},addEventListener(){}},
  window:{navigator:{onLine:true},addEventListener(){},location:{search:'',hash:'',pathname:'/'}},
  localStorage:storage(local),sessionStorage:storage(new Map()),
  Intl,Date,JSON,Error,URL,Math,Number,String,Array,Object,Boolean,TextEncoder,TextDecoder,Promise,
  setTimeout,clearTimeout,console
 });
 vm.runInContext(fs.readFileSync(require.resolve('../'+build.OUTPUT),'utf8'),context,{filename:build.OUTPUT});
 assert.ok(vm.runInContext('typeof Ledger==="object"&&typeof DailyLedger==="object"&&typeof GitHubLedger==="object"&&typeof GoogleLedger==="object"',context));
 vm.runInContext("currentView='overview';render()",context);
 assert.ok(elements.get('#calendar').innerHTML.includes('data-day='));
 assert.equal(vm.runInContext('KEY',context),'minimalist-ledger-v1');
 vm.runInContext('commit({...state,savings:5})',context);
 assert.equal(JSON.parse(local.get('minimalist-ledger-v1')).savings,5);
 // 合併後仍以嚴格模式執行：原本每個檔案各自有 'use strict'，串接後只有開頭那一行算指示詞
 assert.ok(fs.readFileSync(require.resolve('../'+build.OUTPUT),'utf8').startsWith("'use strict';"));
});

test('Worker 公開清單不含已移除的 Firebase 檔案',()=>{
 const worker=fs.readFileSync(require.resolve('../auth-worker/index.mjs'),'utf8');
 assert.equal(/firebase/i.test(worker.slice(worker.indexOf('publicFiles'),worker.indexOf('publicFiles')+600)),false);
});
