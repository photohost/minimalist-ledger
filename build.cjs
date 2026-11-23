#!/usr/bin/env node
/* 把前台腳本合併成單一檔案，減少首次載入的往返次數。改完原始檔請執行 npm run build。 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {version}=require('./package.json');
const SOURCES=['core.js','daily.js','insights.js','github-store.js','google-config.js','drive-store.js','app.js','google-sync.js'];
const OUTPUT='app.bundle.js';
function build(){
 const parts=SOURCES.map(name=>'// --- '+name+' ---\n'+fs.readFileSync(path.join(__dirname,name),'utf8').trim()+'\n');
 // 由同一版本號註冊 Service Worker，發新版時自動換快取。
 parts.push("// --- service worker ---\nif(typeof navigator!=='undefined'&&navigator.serviceWorker&&location.protocol==='https:')addEventListener('load',()=>navigator.serviceWorker.register('sw.js?v="+version+"').catch(()=>{}));\n");
 return "'use strict';\n/* 日常留白 "+version+" · 由 build.cjs 產生，請勿直接編輯。 */\n"+parts.join('\n');
}
if(require.main===module){
 fs.writeFileSync(path.join(__dirname,OUTPUT),build());
 console.log(OUTPUT+' 已更新（'+version+'，'+SOURCES.length+' 個來源檔）');
}
module.exports={build,SOURCES,OUTPUT,version};
