/** Trusted main module around the pinned app module. The app gets no gate RPC. */
export function sharedTestEdgeWrapper(serviceName:string):string {
  const app=serviceName==='portal'?'./app/worker.js':
    serviceName==='bettaview'?'./app/index.js':null;
  if (!app) throw new Error('shared_test_edge_service_invalid');
  return `import candidate from ${JSON.stringify(app)};
${serviceName==='bettaview'?"export {GitHubSession} from './app/session.js';":''}

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

export default {
  async fetch(request,env,ctx) {
    const url=new URL(request.url);
    if(url.protocol!=='https:'||url.hostname!==env.TEST_CANONICAL_HOST)
      return new Response('wrong test host',{status:421,headers:responseHeaders});
    if(url.pathname==='/api/version'&&request.method==='GET')
      return candidate.fetch(request,env,ctx);
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
    const headers=new Headers(request.headers);
    headers.delete('CF-Access-Jwt-Assertion');
    headers.delete('CF-Access-Client-Id');
    headers.delete('CF-Access-Client-Secret');
    headers.delete('X-Deos-Test-Gate');
    const others=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim())
      .filter(x=>x&&!x.startsWith('__Host-deos_test='));
    if(others.length)headers.set('Cookie',others.join('; '));
    else headers.delete('Cookie');
    headers.set('X-Deos-Test-Gate','verified');
    return candidate.fetch(new Request(request,{headers}),env,ctx);
  },
};
`;
}
