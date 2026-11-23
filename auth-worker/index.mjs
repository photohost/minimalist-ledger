import {isDocument,documentHeaders} from './security.mjs';

const PATH = '/minimalist-ledger-auth';
const SESSION_COOKIE = '__Secure-ledger-session';
const FLOW_COOKIE = '__Secure-ledger-flow';
const DAY = 24 * 60 * 60;
const SESSION_SECONDS = 30 * DAY;
const FLOW_SECONDS = 600;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PROFILE_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
}

function random(size = 32) {
  return crypto.getRandomValues(new Uint8Array(size));
}

function cookie(name, value, maxAge) {
  return `${name}=${value}; Max-Age=${maxAge}; Path=${PATH}/; Secure; HttpOnly; SameSite=Lax`;
}

function cookieValue(request, name) {
  return request.headers.get('Cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1);
}

async function seal(name, obj, key) {
  const iv = random(12);
  const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(name)},key,encoder.encode(JSON.stringify(obj)));
  const value = encode(iv) + '.' + encode(new Uint8Array(encrypted));
  if(value.length>3700)throw Error('Session exceeds cookie capacity');
  return value;
}

async function unseal(request, name, key) {
  const value = cookieValue(request,name);
  if(!value||value.length>3700)return null;
  try{
    const [iv,data] = value.split('.');
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:encoder.encode(name)},key,decode(data));
    const result = JSON.parse(decoder.decode(plain));
    return result.expiresAt>Date.now()?result:null;
  }catch{return null;}
}

function headers(cookies=[]) {
  const h = new Headers({'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'});
  for(const c of cookies)h.append('Set-Cookie',c);
  return h;
}

function json(value,status=200,cookies=[]) {
  return Response.json(value,{status,headers:headers(cookies)});
}

function redirect(target,cookies=[]) {
  const h=headers(cookies);
  h.set('Location',target);
  return new Response(null,{status:303,headers:h});
}

async function fetchGoogle(url,options) {
  const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(response.status>=300&&response.status<400)throw Error('Unexpected redirect from Google');
  return response;
}

async function exchange(env,params) {
  const response=await fetchGoogle(TOKEN_URL,{
    method:'POST',
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...params})
  });
  const data=await response.json();
  if(!response.ok){
    const error=Error('Google token request failed');
    error.invalidGrant=data.error==='invalid_grant';
    if(data.error==='invalid_client'||data.error==='unauthorized_client')error.stage='client';
    else if(error.invalidGrant)error.stage='code';
    throw error;
  }
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw Error('Google returned an invalid token');
  return data;
}

function accessDetails(tokens) {
  return {accessToken:tokens.access_token,accessExpiresAt:Date.now()+Number(tokens.expires_in)*1000};
}

async function begin(key,env,origin) {
  const state=encode(random()),verifier=encode(random());
  const challenge=encode(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(verifier))));
  const destination=new URL(AUTH_URL);
  destination.search=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:origin+PATH+'/callback',response_type:'code',scope:'openid email '+DRIVE_SCOPE,access_type:'offline',prompt:'consent select_account',state,code_challenge:challenge,code_challenge_method:'S256'});
  const flow=await seal(FLOW_COOKIE,{state,verifier,expiresAt:Date.now()+FLOW_SECONDS*1000},key);
  return json({url:destination.href},200,[cookie(FLOW_COOKIE,flow,FLOW_SECONDS)]);
}

async function callback(request,url,key,env,origin) {
  const home=origin+(origin===SPENDING_ORIGIN?'/':'/minimalist-ledger/');
  const clearFlow=cookie(FLOW_COOKIE,'',0);
  const fail=stage=>redirect(home+'#google-login-error='+stage,[clearFlow]);
  const flow=await unseal(request,FLOW_COOKIE,key);
  if(!flow||url.searchParams.get('state')!==flow.state)return fail('state');
  if(url.searchParams.get('error')==='access_denied')return fail('consent');
  const code=url.searchParams.get('code');
  if(!code)return fail('code');
  let tokens;
  try{
    tokens=await exchange(env,{grant_type:'authorization_code',code,code_verifier:flow.verifier,redirect_uri:origin+PATH+'/callback'});
  }catch(error){return fail(error.stage||'exchange');}
  if(!tokens.scope?.split(/\s+/).includes(DRIVE_SCOPE))return fail('drive');
  if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token)return fail('offline');
  let profile;
  try{
    const response=await fetchGoogle(PROFILE_URL,{headers:{Authorization:'Bearer '+tokens.access_token}});
    if(!response.ok)return fail('profile');
    profile=await response.json();
    if(typeof profile.sub!=='string'||!profile.sub||typeof profile.email!=='string'||!profile.email||profile.email_verified!==true)return fail('profile');
  }catch{return fail('profile');}
  const seconds=Number(tokens.refresh_token_expires_in);
  const ttl=seconds>0?Math.min(SESSION_SECONDS,Math.floor(seconds)):SESSION_SECONDS;
  const session={user:{uid:profile.sub,email:profile.email},refreshToken:tokens.refresh_token,...accessDetails(tokens),expiresAt:Date.now()+ttl*1000};
  try{
    return redirect(home+'#google-login-complete',[clearFlow,cookie(SESSION_COOKIE,await seal(SESSION_COOKIE,session,key),ttl)]);
  }catch{return fail('session');}
}

async function session(request,key,env,force) {
  const active=await unseal(request,SESSION_COOKIE,key);
  if(!active)return json({error:'sign_in_required'},401);
  const cookies=[];
  if(force||active.accessExpiresAt<=Date.now()+60000){
    try{
      const tokens=await exchange(env,{grant_type:'refresh_token',refresh_token:active.refreshToken});
      if(tokens.scope&&!tokens.scope.split(/\s+/).includes(DRIVE_SCOPE))return json({error:'sign_in_required'},401,[cookie(SESSION_COOKIE,'',0)]);
      Object.assign(active,accessDetails(tokens));
      if(tokens.refresh_token)active.refreshToken=tokens.refresh_token;
      const remaining=Math.floor((active.expiresAt-Date.now())/1000);
      if(remaining<=0)return json({error:'sign_in_required'},401,[cookie(SESSION_COOKIE,'',0)]);
      cookies.push(cookie(SESSION_COOKIE,await seal(SESSION_COOKIE,active,key),remaining));
    }catch(error){
      if(error.invalidGrant)return json({error:'sign_in_required'},401,[cookie(SESSION_COOKIE,'',0)]);
      return json({error:'temporarily_unavailable'},503);
    }
  }
  return json({user:active.user,accessToken:active.accessToken,expiresAt:Math.min(active.accessExpiresAt,active.expiresAt)},200,cookies);
}

const SPENDING_ORIGIN='https://spending.harunoji.one';
const publicFiles=new Set(['','index.html','privacy.html','sw.js','app.bundle.js','style.css','paper.css','core.js','daily.js','insights.js','github-store.js','google-config.js','drive-store.js','app.js','google-sync.js','ledger-icon-b.svg','ledger-b-32.png','ledger-b-180.png','ledger-b-192.png','ledger-b-512.png','ledger.webmanifest']);

async function serveLedger(request,url,env){
  const file=url.pathname.slice(1);
  if(!publicFiles.has(file))return new Response('Not found',{status:404});
  if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
  const upstream=new URL('https://blog.harunoji.one/minimalist-ledger/'+file);
  const version=url.searchParams.get('v');
  if(version&&/^[\w.-]{1,64}$/.test(version))upstream.searchParams.set('v',version);
  // Only public assets are requested upstream. Cookies and request headers stay on this origin.
  const response=await fetch(upstream.href,{method:request.method,redirect:'manual'});
  const headers=new Headers(response.headers);
  // Pages are the only documents that run script; they get the policy. Everything else keeps its own headers.
  if(isDocument(file)){
    for(const [name,value] of Object.entries(documentHeaders(file,env.CSP_MODE)))headers.set(name,value);
  }
  // The page and the worker script must revalidate so a new release is picked up at once;
  // everything addressed with ?v= never changes under that address.
  if(file===''||file.endsWith('.html')||file==='sw.js'||file==='ledger.webmanifest')headers.set('Cache-Control','no-cache');
  else if(version&&response.ok)headers.set('Cache-Control','public, max-age=31536000, immutable');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const origin=url.origin;
    if(origin!==env.SITE_ORIGIN&&origin!==SPENDING_ORIGIN)return json({error:'not_found'},404);
    if(origin===SPENDING_ORIGIN&&!url.pathname.startsWith(PATH+'/'))return serveLedger(request,url,env);
    const action=url.pathname.slice(PATH.length);
    if(!url.pathname.startsWith(PATH+'/')||!['/callback','/start','/session','/refresh','/logout'].includes(action))return json({error:'not_found'},404);
    if(action==='/callback'?request.method!=='GET':request.method!=='POST')return json({error:'method_not_allowed'},405);
    if(action!=='/callback'&&request.headers.get('Origin')!==origin)return json({error:'forbidden'},403);
    if(action==='/logout')return json({},200,[cookie(SESSION_COOKIE,'',0),cookie(FLOW_COOKIE,'',0)]);
    try{
      if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.SESSION_KEY)return json({error:'temporarily_unavailable'},503);
      const bytes=decode(env.SESSION_KEY);
      if(bytes.length!==32)return json({error:'temporarily_unavailable'},503);
      const key=await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);
      if(action==='/start')return await begin(key,env,origin);
      if(action==='/callback')return await callback(request,url,key,env,origin);
      return await session(request,key,env,action==='/refresh');
    }catch{return json({error:'temporarily_unavailable'},503);}
  }
};
