export async function withSharedTestBrowserLock<T>(db:D1Database,
  leaseId:string,serviceName:string,action:()=>Promise<T>,busy?:()=>T):Promise<T> {
  const id=crypto.randomUUID(),now=new Date().toISOString();
  const saved=await db.prepare(`INSERT INTO test_browser_command_locks
    (lease_id,service_name,operation_id,expires_at) VALUES (?,?,?,?)
    ON CONFLICT(lease_id,service_name) DO UPDATE SET
      operation_id=excluded.operation_id,expires_at=excluded.expires_at
    WHERE test_browser_command_locks.expires_at<=?`)
    .bind(leaseId,serviceName,id,new Date(Date.now()+10*60_000).toISOString(),now).run();
  if(saved.meta.changes!==1) {
    if(busy)return busy();
    throw new Error('test_browser_command_busy');
  }
  let primary:unknown;
  try {return await action();}
  catch(error){primary=error;throw error;}
  finally {
    try {await db.prepare(`DELETE FROM test_browser_command_locks
      WHERE lease_id=? AND service_name=? AND operation_id=?`)
      .bind(leaseId,serviceName,id).run();}
    catch(error) {
      if(primary)throw new AggregateError([primary,error],
        'Browser action and command lock release failed',{cause:primary});
      throw error;
    }
  }
}
