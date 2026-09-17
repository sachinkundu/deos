// Run with Wrangler on loopback and a remote Browser binding. This diagnostic
// creates only its own browser sessions; it never starts a workflow or agent.
import {CloudflareBrowserProvider, browserCommand} from '../../../src/implementation-browser.ts';
import {errorDetails} from '../../../src/error-details.ts';
const owned = new Set<string>();
export default {async fetch(request: Request, env: any) {
  try {
    const input = await request.json() as {action:string; id?:string; host?:string};
    const provider = new CloudflareBrowserProvider(env.BROWSER);
    if(input.action==='create') {
      const browser=await provider.create('example.com');owned.add(browser.id);await browser.disconnect();
      return Response.json({id:browser.id});
    }
    if(input.action==='inventory') return Response.json((await provider.inventory()).filter(id=>owned.has(id)));
    if(!input.id || !owned.has(input.id))return new Response('Session is not owned by this diagnostic',{status:403});
    if(input.action==='history')return Response.json(await provider.history(input.id));
    if(input.action==='close') {await provider.close(input.id);return Response.json({closed:true});}
    if(input.action==='reset') {
      const result=await browserCommand(env.BROWSER,input.id,'https://example.com',
        {operation:'reset',url:'/',width:1280,height:900});
      return Response.json({url:result.url,title:'title' in result ? result.title : null,documentStatus:result.documentStatus});
    }
    throw new Error('Unknown probe operation');
  } catch(error) {return Response.json({error:errorDetails(error)},{status:500});}
}};
