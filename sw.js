/* 日常留白 — 離線外殼。版本號由註冊網址帶入，發新版即換一組快取。 */
'use strict';
const VERSION=new URL(self.location.href).searchParams.get('v')||'dev';
const CACHE='ledger-'+VERSION;
const AUTH_PATH='/minimalist-ledger-auth/';
const SHELL=['./','./app.bundle.js?v='+VERSION,'./style.css?v='+VERSION,'./paper.css?v='+VERSION,'./ledger.webmanifest','./ledger-icon-b.svg','./ledger-b-180.png'];
const CACHEABLE=/\.(?:css|js|png|svg|webmanifest)$/;

self.addEventListener('install',event=>{event.waitUntil((async()=>{
 const cache=await caches.open(CACHE);
 // 單一資源失敗不應讓整個安裝失敗，否則離線功能會默默消失。
 await Promise.allSettled(SHELL.map(url=>cache.add(new Request(url,{cache:'reload'}))));
 await self.skipWaiting();
})());});

self.addEventListener('activate',event=>{event.waitUntil((async()=>{
 const names=await caches.keys();
 await Promise.all(names.filter(name=>name.startsWith('ledger-')&&name!==CACHE).map(name=>caches.delete(name)));
 await self.clients.claim();
})());});

async function shell(request){
 // 網頁本身走網路優先，確保部署新版後立刻生效；離線時才用快取。
 const cache=await caches.open(CACHE);
 try{
  const response=await fetch(request);
  if(response.ok)await cache.put('./',response.clone()).catch(()=>{});
  return response;
 }catch(error){
  const cached=await cache.match('./');
  if(cached)return cached;
  throw error;
 }
}

async function asset(request){
 const cache=await caches.open(CACHE);
 const cached=await cache.match(request);
 if(cached)return cached;
 const response=await fetch(request);
 if(response.ok&&response.type==='basic')cache.put(request,response.clone()).catch(()=>{});
 return response;
}

self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET')return;
 let url;
 try{url=new URL(request.url);}catch{return;}
 // 登入服務、跨網域資源與 sw.js 一律交給瀏覽器處理。
 if(url.origin!==self.location.origin||url.pathname.startsWith(AUTH_PATH)||url.pathname.endsWith('/sw.js'))return;
 if(request.mode==='navigate'){event.respondWith(shell(request));return;}
 if(CACHEABLE.test(url.pathname))event.respondWith(asset(request));
});
