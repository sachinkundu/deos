import type {SandboxView} from './sandbox-controller.ts';

const path='/deos/run/shared-test-capability.json';
const intervalMs=5*60_000;

/** The trusted controller renews the existing lease grant independently of
 * model activity. Expired bearer tokens still fail every public endpoint. */
export async function refreshSharedTestCapability(sandbox:SandboxView,
  attemptId:string,grant:()=>Promise<{token:string}>,now=new Date()):Promise<void> {
  if((await sandbox.exists(path)).exists) {
    const saved=JSON.parse((await sandbox.readFile(path,{encoding:'utf8'})).content);
    if(saved.attempt!==attemptId)throw new Error('shared_test_capability_attempt_changed');
    const refreshedAt=Date.parse(saved.refreshedAt);
    if(Number.isFinite(refreshedAt) && refreshedAt<=now.getTime() &&
        now.getTime()-refreshedAt<intervalMs)return;
  }
  // The grant callback checks the current run, attempt deadline, lease and fence.
  const {token}=await grant();
  const temporary=`${path}.${crypto.randomUUID()}.tmp`;
  await sandbox.writeFile(temporary,JSON.stringify({attempt:attemptId,token,
    refreshedAt:now.toISOString()}),{encoding:'utf8'});
  for(const command of [['chmod','600',temporary],['mv','--',temporary,path]]) {
    const process=await sandbox.exec(command as [string,...string[]],{timeout:10_000});
    const exit=await process.waitForExit({timeout:10_000});
    if(exit.code!==0 || exit.timedOut) {
      const output=await process.output({encoding:'utf8',timeout:10_000,maxBytes:4096});
      throw new Error(`shared_test_capability_publish_failed:${command[0]}`,{
        cause:{exit,output},
      });
    }
  }
}
