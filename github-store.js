(function(root){
 'use strict';
 const L=typeof module!=='undefined'&&module.exports?require('./core.js'):root.Ledger;
 const encode=text=>{const bytes=new TextEncoder().encode(text);let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);};
 const decode=base64=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(base64.replace(/\s/g,'')),c=>c.charCodeAt(0)));
 class GitHubStore{
  constructor({owner,repo,token,fetchImpl=fetch}){
   if(!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(owner)||!/^[\w.-]{1,100}$/.test(repo))throw Error('請填寫有效的 GitHub 帳號與倉庫名稱。');
   if(!token||/\s/.test(token))throw Error('請填寫有效的 GitHub 存取權杖。');
   this.owner=owner;this.repo=repo;this.token=token;this.fetchImpl=fetchImpl;this.branch=null;this.sha=undefined;this.busy=false;
  }
  async request(suffix='',options={}){
   let r;try{r=await this.fetchImpl(`https://api.github.com/repos/${this.owner}/${this.repo}${suffix}`,{...options,cache:'no-store',credentials:'omit',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${this.token}`,'X-GitHub-Api-Version':'2022-11-28',...(options.body?{'Content-Type':'application/json'}:{})}});}catch{throw Error('無法連線 GitHub。帳目仍保留於本機，請稍後重試。');}
   if(r.status===404&&options.allowMissing)return null;
   if(!r.ok){const messages={401:'GitHub 權杖無效或已過期，請重新連線。',403:'GitHub 權限不足或請求過多，請檢查倉庫權限並稍後重試。',404:'找不到倉庫或沒有存取權限。',409:'GitHub 帳目已更新，請先下載最新版本再決定如何處理。',422:'GitHub 拒絕寫入，請確認 Contents 讀寫權限及分支規則。'};throw Error(messages[r.status]||`GitHub 儲存失敗（${r.status}）。`);}
   return r.json();
  }
  async ensurePrivate(){const repo=await this.request();if(repo.private!==true)throw Error('請使用私人資料倉庫；本工具不會將帳目上傳到公開倉庫。');if(repo.archived)throw Error('資料倉庫已封存，無法儲存。');if(this.branch&&repo.default_branch!==this.branch)throw Error('倉庫預設分支已改變，請重新連線。');this.branch=repo.default_branch;}
  async read(){
   await this.ensurePrivate();
   const file=await this.request('/contents/ledger.json?ref='+encodeURIComponent(this.branch),{allowMissing:true});
   if(file===null)return {sha:null,data:null};
   if(file.type!=='file'||file.encoding!=='base64'||typeof file.content!=='string'||file.size>900000)throw Error('GitHub 帳目格式不支援或超過 900 KB，未變更目前資料。');
   try{return {sha:file.sha,data:L.validate(JSON.parse(decode(file.content)))};}catch{throw Error('GitHub 帳目格式錯誤，未變更目前資料。');}
  }
  accept(remote){this.sha=remote.sha;}
  async save(data){
   if(this.busy)throw Error('上一筆 GitHub 儲存尚未完成。');
   if(this.sha===undefined)throw Error('請先選擇要使用的帳目版本。');
   const text=JSON.stringify(L.validate(data),null,2);if(new TextEncoder().encode(text).length>900000)throw Error('GitHub 帳目上限為 900 KB，請先匯出備份。');
   this.busy=true;
   try{
    const latest=await this.read();
    // Recover an acknowledged-but-lost PUT response without repeating the write.
    if(latest.data&&JSON.stringify(latest.data)===JSON.stringify(data)){this.accept(latest);return;}
    if(latest.sha!==this.sha)throw Error('其他裝置已更新 GitHub 帳目。自動上傳已暫停，請先匯出本機備份，再下載 GitHub 最新帳目。');
    const body={message:'Save ledger',content:encode(text),branch:this.branch};if(this.sha!==null)body.sha=this.sha;
    const result=await this.request('/contents/ledger.json',{method:'PUT',body:JSON.stringify(body)});
    if(!result.content?.sha)throw Error('GitHub 未確認儲存結果，請重試以核對版本。');this.sha=result.content.sha;
   }finally{this.busy=false;}
  }
  disconnect(){this.token='';this.sha=undefined;}
 }
 const api={GitHubStore,encode,decode};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GitHubLedger=api;
})(typeof globalThis!=='undefined'?globalThis:this);
