const { test }=require('node:test');
const assert=require('node:assert/strict');
const { randomBytes,createHash }=require('node:crypto');
const origin='https://blog.harunoji.one';
const base=origin+'/minimalist-ledger-auth';
const scope='openid email https://www.googleapis.com/auth/drive.file';
const env={ SITE_ORIGIN:origin, GOOGLE_CLIENT_ID:'test-client', GOOGLE_CLIENT_SECRET:'server-only', SESSION_KEY:randomBytes(32).toString('base64url') };
const cookies=(response,name)=>response.headers.getSetCookie().find(x=>x.startsWith(name+'='))?.split(';')[0];

test('Google redirect binds state and PKCE, restores and refreshes a sealed session, then logs out',async t=>{
  const worker=(await import('../auth-worker/index.mjs')).default;
  const send=(path,options={})=>worker.fetch(new Request(base+path,{method:'POST',...options,headers:{Origin:origin,...options.headers}}),env);
  const calls=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/userinfo'))return Response.json({sub:'123',email:'test@example.com',email_verified:true});
    assert.equal(url,'https://oauth2.googleapis.com/token');
    if(options.body.get('grant_type')==='refresh_token'){
      assert.equal(options.body.get('refresh_token'),'private-refresh');
      return Response.json({access_token:'renewed-access',expires_in:3600,scope});
    }
    return Response.json({access_token:'first-access',refresh_token:'private-refresh',expires_in:3600,scope});
  });
  assert.equal((await send('/start',{headers:{Origin:'https://other.example'}})).status,403);
  const start=await send('/start');
  const url=new URL((await start.json()).url);
  assert.equal(url.origin,'https://accounts.google.com');
  assert.equal(url.searchParams.get('access_type'),'offline');
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  const cookie=cookies(start,'__Secure-ledger-flow');
  const callbackOptions={method:'GET',headers:{Cookie:cookie}};
  const wrong=await send('/callback?state=wrong&code=test',callbackOptions);
  assert.match(wrong.headers.get('Location'),/#google-login-error=state$/);
  assert.equal(calls.length,0);
  const callback=await send('/callback?state='+url.searchParams.get('state')+'&code=test',callbackOptions);
  assert.equal(callback.headers.get('Location'),origin+'/minimalist-ledger/#google-login-complete');
  const exchange=calls[0].options.body;
  assert.equal(exchange.get('client_secret'),'server-only');
  assert.equal(createHash('sha256').update(exchange.get('code_verifier')).digest('base64url'),url.searchParams.get('code_challenge'));
  const session=cookies(callback,'__Secure-ledger-session');
  assert.ok(session);
  assert.doesNotMatch(session,/private-refresh|first-access/);
  assert.match(callback.headers.getSetCookie().join(' '),/HttpOnly; SameSite=Lax/);
  assert.equal((await send('/session',{headers:{Cookie:session+'tampered'}})).status,401);
  const restore=await send('/session',{headers:{Cookie:session}});
  assert.equal(restore.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(Object.keys(await restore.clone().json()).sort(),['accessToken','expiresAt','user']);
  assert.equal((await restore.json()).accessToken,'first-access');
  assert.equal(calls.length,2);
  const renewed=await send('/refresh',{headers:{Cookie:session}});
  assert.equal((await renewed.json()).accessToken,'renewed-access');
  assert.ok(cookies(renewed,'__Secure-ledger-session'));
  assert.equal(calls.length,3);
  const logout=await send('/logout',{headers:{Cookie:session}});
  assert.match(logout.headers.getSetCookie().join(' '),/__Secure-ledger-session=; Max-Age=0/);
  assert.equal((await send('/session')).status,401);
});

test('OAuth callback reports a safe status for token failures without leaking Google details',async t=>{
  const worker=(await import('../auth-worker/index.mjs')).default;
  let googleError='invalid_client';
  t.mock.method(globalThis,'fetch',async()=>Response.json({error:googleError,error_description:'do not expose this detail'},{status:400}));
  for(const [reason,expected] of [['invalid_client','client'],['invalid_grant','code'],['server_error','exchange']]){
    googleError=reason;
    const start=await worker.fetch(new Request(base+'/start',{method:'POST',headers:{Origin:origin}}),env);
    const params=new URL((await start.json()).url).searchParams;
    const response=await worker.fetch(new Request(base+'/callback?code=test&state='+params.get('state'),{headers:{Cookie:cookies(start,'__Secure-ledger-flow')}}),env);
    assert.equal(response.headers.get('Location'),origin+'/minimalist-ledger/#google-login-error='+expected);
    assert.equal(cookies(response,'__Secure-ledger-session'),undefined);
  }
});
