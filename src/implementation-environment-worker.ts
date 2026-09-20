// Trusted wrapper: app code is imported only for app requests. The management
// credential grants access to this environment alone and is never sent to authors.
export function environmentWorker(config: { d1: string[]; r2: string[] }, digest: string, retiring = false) {
  return `const config=${JSON.stringify(config)}, digest=${JSON.stringify(digest)};
export default {async fetch(request,env,ctx) {
  const url=new URL(request.url);
  if(url.pathname.startsWith('/__deos/')) {
    if(request.headers.get('Authorization')!=='Bearer '+env.__DEOS_CONTROL)
      return new Response('Not found',{status:404});
    const db=config.d1.length?env[config.d1[0]]:null;
    const bucket=config.r2.length?env[config.r2[0]]:null;
    if(url.pathname==='/__deos/health') return Response.json({digest,retiring:${retiring},d1:!!db,r2:!!bucket});
    if(request.method!=='POST') return new Response('Method not allowed',{status:405});
    const q=await request.json();
    if(url.pathname==='/__deos/migrate' && db) {
      await db.prepare('CREATE TABLE IF NOT EXISTS __deos_migrations (id TEXT PRIMARY KEY, digest TEXT NOT NULL)').run();
      const old=await db.prepare('SELECT digest FROM __deos_migrations WHERE id=?').bind(q.id).first();
      if(old) {
        if(old.digest!==q.digest) return new Response('Migration id has different SQL',{status:409});
        return Response.json({id:q.id,digest:q.digest,reused:true});
      }
      await db.batch([...q.statements.map(sql=>db.prepare(sql)),db.prepare('INSERT INTO __deos_migrations VALUES (?,?)').bind(q.id,q.digest)]);
      return Response.json({id:q.id,digest:q.digest,reused:false});
    }
    if(url.pathname==='/__deos/query' && db) return Response.json(await db.prepare(q.sql).bind(...q.params).all());
    if(url.pathname==='/__deos/objects' && bucket) {
      const page=await bucket.list({limit:100,cursor:q.cursor});
      return Response.json({objects:page.objects.map(o=>({key:o.key,size:o.size,etag:o.etag})),truncated:page.truncated,cursor:page.truncated?page.cursor:null});
    }
    if(url.pathname==='/__deos/object' && bucket) {
      const object=await bucket.get(q.key);
      if(!object)return Response.json({key:q.key,absent:true});
      if(object.size>65536)return new Response('Inspection is limited to 64 KiB objects',{status:413});
      const bytes=new Uint8Array(await object.arrayBuffer());
      const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
      return Response.json({key:q.key,size:bytes.length,sha256,contentBase64:btoa(String.fromCharCode(...bytes))});
    }
    if(url.pathname==='/__deos/purge' && ${retiring} && bucket) {
      const page=await bucket.list({limit:100});
      if(page.objects.length)await bucket.delete(page.objects.map(o=>o.key));
      const remaining=await bucket.list({limit:1});
      return Response.json({deleted:page.objects.length,empty:remaining.objects.length===0});
    }
    return new Response('Unsupported operation',{status:400});
  }
  if(${retiring})return new Response('Temporary environment retired',{status:410});
  const {default:app}=await import('./app.mjs');
  const bindings=Object.fromEntries([...config.d1,...config.r2].map(name=>[name,env[name]]));
  bindings.ASSETS={fetch:async(input)=>{
    const assetUrl=new URL(typeof input==='string'?input:input.url);
    const {default:assets}=await import('./assets.mjs');
    const path=decodeURIComponent(assetUrl.pathname).replace(/^\\//,'')||'index.html';
    const file=assets[path];
    if(!file)return new Response('Not found',{status:404});
    return new Response(Uint8Array.from(atob(file.contentBase64),c=>c.charCodeAt(0)),{headers:{'Content-Type':file.contentType}});
  }};
  return app.fetch(request,bindings,ctx);
}};`;
}
