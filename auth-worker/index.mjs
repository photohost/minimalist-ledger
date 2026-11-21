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

async function exchange(env,params) {
  const response=await fetch(TOKEN_URL,{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,...params})
  });
  const data=await response.json();
  if(!response.ok){const error=Error('Google token request failed');error.invalidGrant=data.error==='invalid_grant';throw error;}
  if(typeof data.access_token!=='string'||!data.access_token||!Number.isFinite(Number(data.expires_in))||Number(data.expires_in)<=0)throw Error('Google returned an invalid token');
  if(data.scope&&!data.scope.split(/\s+/).includes(DRIVE_SCOPE))throw Error('Google Drive authorization is missing');
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
  const home=origin+'/minimalist-ledger/';
  const clearFlow=cookie(FLOW_COOKIE,'',0);
  const flow=await unseal(request,FLOW_COOKIE,key);
  const code=url.searchParams.get('code');
  if(!flow||url.searchParams.get('state')!==flow.state||!code)return redirect(home+'#google-login-error',[clearFlow]);
  try{
    const tokens=await exchange(env,{grant_type:'authorization_code',code,code_verifier:flow.verifier,redirect_uri:origin+PATH+'/callback'});
    if(typeof tokens.refresh_token!=='string'||!tokens.refresh_token||!tokens.scope?.split(/\s+/).includes(DRIVE_SCOPE))throw Error('Google did not grant offline Drive access');
    const response=await fetch(PROFILE_URL,{headers:{Authorization:'Bearer '+tokens.access_token},redirect:'error',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw Error('Google profile request failed');
    const profile=await response.json();
    if(typeof profile.sub!=='string'||!profile.sub||typeof profile.email!=='string'||!profile.email||profile.email_verified!==true)throw Error('Google identity could not be verified');
    const seconds=Number(tokens.refresh_token_expires_in);
    const ttl=seconds>0?Math.min(SESSION_SECONDS,Math.floor(seconds)):SESSION_SECONDS;
    const session={user:{uid:profile.sub,email:profile.email},refreshToken:tokens.refresh_token,...accessDetails(tokens),expiresAt:Date.now()+ttl*1000};
    return redirect(home,[clearFlow,cookie(SESSION_COOKIE,await seal(SESSION_COOKIE,session,key),ttl)]);
  }catch{return redirect(home+'#google-login-error',[clearFlow]);}
}

async function session(request,key,env,force) {
  const active=await unseal(request,SESSION_COOKIE,key);
  if(!active)return json({error:'sign_in_required'},401);
  const cookies=[];
  if(force||active.accessExpiresAt<=Date.now()+60000){
    try{
      const tokens=await exchange(env,{grant_type:'refresh_token',refresh_token:active.refreshToken});
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

export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    const origin=env.SITE_ORIGIN;
    if(url.origin!==origin)return json({error:'not_found'},404);
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
