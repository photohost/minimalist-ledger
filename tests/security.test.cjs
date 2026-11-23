const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('../auth-worker/security.mjs');

test('主站政策不允許 eval、行內腳本與任意來源的腳本',async()=>{
 const s=await load(),p=s.policyFor('index.html');
 const script=p.split(';').map(x=>x.trim()).find(x=>x.startsWith('script-src'));
 assert.equal(script,"script-src 'self' https://accounts.google.com https://static.cloudflareinsights.com");
 assert.ok(!p.includes("'unsafe-eval'"));
 assert.ok(!/script-src[^;]*'unsafe-inline'/.test(p));
});

test('主站政策涵蓋 Google 登入、Drive、GitHub 與字型所需的來源',async()=>{
 const s=await load(),p=s.policyFor('index.html');
 for(const origin of ['https://accounts.google.com','https://www.googleapis.com','https://openidconnect.googleapis.com','https://api.github.com','https://fonts.gstatic.com','https://fonts.googleapis.com'])
  assert.ok(p.includes(origin),origin);
 assert.ok(p.includes("frame-ancestors 'none'"));
 assert.ok(p.includes("object-src 'none'"));
});

test('Firebase 已移除，主站政策不放行 gstatic 或 Firebase 網域',async()=>{
 const s=await load(),p=s.policyFor('index.html');
 assert.ok(!p.includes('https://www.gstatic.com'));
 assert.ok(!p.includes('firebaseapp.com'));
 assert.equal(s.isDocument('firebase-legacy.html'),false);
});

test('預設為 report-only，只有 enforce 才真正擋',async()=>{
 const s=await load();
 assert.ok(s.documentHeaders('index.html')['Content-Security-Policy-Report-Only']);
 assert.equal(s.documentHeaders('index.html')['Content-Security-Policy'],undefined);
 assert.ok(s.documentHeaders('index.html','enforce')['Content-Security-Policy']);
 assert.equal(s.documentHeaders('index.html','enforce')['Content-Security-Policy-Report-Only'],undefined);
});

test('文件標頭包含防點擊劫持與 MIME 嗅探防護',async()=>{
 const h=(await load()).documentHeaders('index.html','enforce');
 assert.equal(h['X-Frame-Options'],'DENY');
 assert.equal(h['X-Content-Type-Options'],'nosniff');
 assert.equal(h['Referrer-Policy'],'strict-origin-when-cross-origin');
});

test('頁面不含行內事件處理器，所有腳本以外部檔案載入',()=>{
 for(const file of ['index.html','privacy.html']){
  const html=fs.readFileSync(require.resolve('../'+file),'utf8');
  assert.equal(/<script(?![^>]*\bsrc=)/.test(html),false,file+' 含行內 script');
  assert.equal(/\son[a-z]+="/i.test(html),false,file+' 含行內事件');
  assert.equal(/href="javascript:/i.test(html),false,file);
 }
});

test('打包的程式碼不使用 eval 或動態函式建立',()=>{
 const bundle=fs.readFileSync(require.resolve('../app.bundle.js'),'utf8');
 assert.equal(/\beval\(|new Function\(|setTimeout\(\s*['"`]/.test(bundle),false);
});
