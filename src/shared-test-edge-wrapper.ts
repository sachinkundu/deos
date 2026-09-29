/** Trusted main module around the pinned app module. The app gets no gate RPC. */
export function sharedTestEdgeWrapper(serviceName:string):string {
  const app=serviceName==='portal'?'./app/worker.js':
    serviceName==='bettaview'?'./app/index.js':null;
  if (!app) throw new Error('shared_test_edge_service_invalid');
  return `import ${serviceName==='bettaview'?'{createBettaViewHandler}':'candidate'} from ${JSON.stringify(app)};
${serviceName==='bettaview'?"export {GitHubSession} from './app/index.js';":''}
${serviceName==='bettaview'?`// The lease gate has already checked Access and the one-use app session.
// Older pinned candidates still call their production Access verifier; use
// their exported auth seam only inside this lease Worker.
const candidate=createBettaViewHandler(async()=>({email:'reviewer@deos-test.invalid'}));`:''}

const responseHeaders={
  'Cache-Control':'no-store',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
};

function cookie(request) {
  const matches=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
    .filter(x=>x.startsWith('__Host-deos_test='));
  if(matches.length!==1)return null;
  return matches[0].slice('__Host-deos_test='.length);
}
${serviceName==='bettaview'?`
function githubCookie(request) {
  const matches=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
    .filter(x=>x.startsWith('__Host-deos_github='));
  if(matches.length!==1)return null;
  return matches[0].slice('__Host-deos_github='.length);
}
`:''}

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.protocol!=='https:'||url.hostname!==env.TEST_CANONICAL_HOST)
      return new Response('wrong test host',{status:421,headers:responseHeaders});
    if(url.pathname==='/api/version'&&request.method==='GET') {
      return Response.json({canonicalHost:env.TEST_CANONICAL_HOST,
        sourceSha:env.${serviceName==='portal'?'PORTAL':'BETTAVIEW'}_SOURCE_SHA,
        baseVersionId:env.TEST_BASE_VERSION_ID,
        buildInputSha256:env.${serviceName==='portal'?'PORTAL':'BETTAVIEW'}_BUILD_INPUT_SHA256,
        versionId:env.CF_VERSION_METADATA?.id??null},
        {headers:responseHeaders});
    }
    if(!env.TEST_APP_GATE)throw new Error('test_app_gate_binding_missing');
    const accessJwt=request.headers.get('CF-Access-Jwt-Assertion');
    if(!accessJwt)return new Response('access required',{status:401,headers:responseHeaders});
    const origin=request.headers.get('Origin');
    if(origin&&origin!==url.origin)
      return new Response('wrong origin',{status:403,headers:responseHeaders});
    if(url.pathname==='/__deos/launch') {
      if(request.method!=='POST')
        return new Response('method not allowed',{status:405,headers:responseHeaders});
      const raw=await request.text();
      if(raw.length>512)return new Response('invalid launch',{status:400,headers:responseHeaders});
      let value;
      try {value=JSON.parse(raw);} catch(error) {
        if(error instanceof SyntaxError)
          return new Response('invalid launch',{status:400,headers:responseHeaders});
        throw error;
      }
      if(!value||typeof value!=='object'||Object.keys(value).length!==1||
          typeof value.code!=='string')
        return new Response('invalid launch',{status:400,headers:responseHeaders});
      const result=await env.TEST_APP_GATE.redeem(value.code,url.origin,accessJwt);
      return new Response(null,{status:204,headers:{...responseHeaders,
        'Set-Cookie':result.cookie}});
    }
    const session=cookie(request);
    if(!session)return new Response('session required',{status:401,headers:responseHeaders});
    const allowed=await env.TEST_APP_GATE.authorize({session,
      origin:url.origin,accessJwt});
    if(!allowed)return new Response('session denied',{status:403,headers:responseHeaders});
${serviceName==='bettaview'?`
    if(!env.TEST_GITHUB_BROKER)
      throw new Error('test_github_broker_binding_missing');
    const githubSession=githubCookie(request)||'';
    if(url.pathname==='/auth/github') {
      if(request.method!=='GET')
        return new Response('method not allowed',{status:405,headers:responseHeaders});
      const destination=await env.TEST_GITHUB_BROKER.start(session,url.origin,
        url.searchParams.get('returnTo')||'/');
      return new Response(null,{status:302,headers:{...responseHeaders,
        Location:destination}});
    }
    if(url.pathname==='/__deos/github-complete') {
      if(request.method!=='GET')
        return new Response('method not allowed',{status:405,headers:responseHeaders});
      const result=await env.TEST_GITHUB_BROKER.redeem(session,url.origin,
        url.searchParams.get('handoff')||'');
      return new Response(null,{status:303,headers:{...responseHeaders,
        Location:result.returnTo,'Set-Cookie':result.cookie}});
    }
    if(url.pathname==='/auth/logout') {
      if(request.method!=='GET'&&request.method!=='POST')
        return new Response('method not allowed',{status:405,headers:responseHeaders});
      await env.TEST_GITHUB_BROKER.logout(session,githubSession,url.origin);
      return new Response(null,{status:302,headers:{...responseHeaders,
        Location:'/','Set-Cookie':'__Host-deos_github=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0'}});
    }
`:''}
    const headers=new Headers(request.headers);
    headers.delete('CF-Access-Jwt-Assertion');
    headers.delete('CF-Access-Client-Id');
    headers.delete('CF-Access-Client-Secret');
    headers.delete('X-Deos-Test-Gate');
    const others=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
      .filter(x=>x&&!x.startsWith('__Host-deos_test=')
        ${serviceName==='bettaview'?"&&!x.startsWith('__Host-deos_github=')":''});
    if(others.length)headers.set('Cookie',others.join('; '));
    else headers.delete('Cookie');
    headers.set('X-Deos-Test-Gate','verified');
${serviceName==='bettaview'?`
    const candidateEnv={...env,TEST_APP_GATE:undefined,TEST_GITHUB_BROKER:undefined,
      GITHUB_SESSIONS:undefined,GITHUB_CLIENT_SECRET:undefined,
      DEOS_REVIEW_CONTINUATION:undefined,REVIEW_CONTINUATION_SECRET:undefined,
      TEST_REVIEW_CONTINUATION_CALL:async()=>{
        throw new Error('test_review_continuation_unavailable');
      },
      GITHUB_TEST_SESSION:async()=>githubSession&&
        await env.TEST_GITHUB_BROKER.authorized(session,githubSession,url.origin)
          ?'lease-session':null,
      GITHUB_REQUEST:async(target,options={})=>{
        const result=await env.TEST_GITHUB_BROKER.request({appSession:session,
          githubSession,origin:url.origin,target:String(target),
          method:options.method||'GET',
          body:typeof options.body==='string'?options.body:null});
        return new Response([204,205,304].includes(result.status)?null:result.body,
          {status:result.status,
          headers:{'content-type':result.contentType}});
      }};
    return candidate.fetch(new Request(request,{headers}),candidateEnv,ctx);
`:'    return candidate.fetch(new Request(request,{headers}),env,ctx);'}
  },
};
`;
}
