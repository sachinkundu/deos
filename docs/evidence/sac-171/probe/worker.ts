import { Sandbox, getSandbox } from '@cloudflare/sandbox';
export class BasicProbe extends Sandbox {}
export class Standard2Probe extends Sandbox {}
export default {
  async fetch(request: Request, env: any): Promise<Response> {
    if (request.headers.get('Authorization') !== `Bearer ${env.PROBE_SECRET}`) return new Response('forbidden', {status:403});
    const tier = new URL(request.url).pathname.slice(1);
    if (tier !== 'basic' && tier !== 'standard-2') return new Response('invalid tier', {status:400});
    const sandbox = getSandbox(tier === 'basic' ? env.BasicProbe : env.Standard2Probe, 'sac171-contract-proof', {sleepAfter:'1m'});
    try {
    const process = await sandbox.exec(['node', '-e', 'const os=require("os"); console.log(JSON.stringify({memoryBytes:os.totalmem(),cpus:os.cpus().length,runtime:process.version}))']);
    const output = await process.output({encoding:'utf8'});
    await sandbox.destroy();
    return Response.json({tier,...output});
    } catch(error) {
      console.error(error);
      return Response.json({tier,error:String(error),stack:error instanceof Error ? error.stack : null}, {status:500});
    }
  }
};
