#!/usr/bin/env node
/* 部署後自動檢查正式網站：node verify-deploy.cjs [網址]，預設 https://spending.harunoji.one
 * 檢查檔案是否存在、快取標頭、安全標頭，以及舊 Firebase 檔案是否已下架。
 * Service Worker 是否註冊成功無法在這裡驗證，請依最後印出的提示用瀏覽器確認。 */
'use strict';
const {version}=require('./package.json');
const base=(process.argv[2]||'https://spending.harunoji.one').replace(/\/$/,'');
const results=[];
const check=(ok,name,detail='')=>{results.push(ok);console.log((ok?'✓ ':'✗ ')+name+(detail?'  '+detail:''));};
async function get(path){const r=await fetch(base+path,{redirect:'manual',cache:'no-store'});return {r,text:r.headers.get('content-type')?.match(/text|javascript|json/)?await r.text():''};}
(async()=>{
 console.log('檢查 '+base+'（預期版本 '+version+'）\n');
 const home=await get('/');
 check(home.r.status===200,'首頁可開啟','HTTP '+home.r.status);
 check(home.text.includes('app.bundle.js?v='+version),'首頁載入 app.bundle.js?v='+version);
 check(!/<script(?![^>]*\bsrc=)/.test(home.text),'首頁沒有行內腳本');
 check(/no-cache|max-age=0/.test(home.r.headers.get('cache-control')||''),'首頁需重新驗證，改版立即生效',home.r.headers.get('cache-control')||'（無）');
 const csp=home.r.headers.get('content-security-policy'),ro=home.r.headers.get('content-security-policy-report-only');
 check(!!(csp||ro),'首頁有 Content-Security-Policy',csp?'enforce':ro?'report-only（確認無誤後改 enforce）':'');
 check(home.r.headers.get('x-frame-options')==='DENY','X-Frame-Options: DENY');
 const bundle=await get('/app.bundle.js?v='+version);
 check(bundle.r.status===200&&bundle.text.length>50000,'app.bundle.js 可下載',bundle.text.length+' 字元');
 check(/immutable/.test(bundle.r.headers.get('cache-control')||''),'app.bundle.js 一年期 immutable 快取',bundle.r.headers.get('cache-control')||'（無）');
 const sw=await get('/sw.js?v='+version);
 check(sw.r.status===200&&sw.text.includes('self.addEventListener'),'sw.js 可下載','HTTP '+sw.r.status);
 check(/no-cache/.test(sw.r.headers.get('cache-control')||''),'sw.js 需重新驗證，才能偵測新版',sw.r.headers.get('cache-control')||'（無）');
 for(const f of ['/style.css?v='+version,'/paper.css?v='+version,'/ledger.webmanifest']){const x=await get(f);check(x.r.status===200,f.split('?')[0]+' 可下載','HTTP '+x.r.status);}
 for(const f of ['/firebase-legacy.html','/firebase-store.js'])check((await get(f)).r.status===404,f+' 已下架（404）');
 const bad=results.filter(x=>!x).length;
 console.log('\n'+(bad?bad+' 項未通過，請先處理再繼續。':'全部通過。'));
 console.log('\n仍需用瀏覽器確認：');
 console.log('1. 開發人員工具 → Application → Service Workers：sw.js 為 activated');
 console.log('2. 重新整理後，Network 面板的 app.bundle.js 來源為 ServiceWorker 或 disk cache');
 console.log('3. Console 沒有 Content-Security-Policy 違規訊息；實際登入 Google、記一筆帳並確認同步成功');
 process.exit(bad?1:0);
})().catch(e=>{console.error('檢查失敗：'+e.message);process.exit(2);});
