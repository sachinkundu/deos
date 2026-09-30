import {sha256Hex} from './implementation-hash.ts';

interface Owner {
  state:string;revision:number;owner_run_id:string;owner_lease_id:string;
}
interface Repair {
  repair_id:string;run_id:string;lease_id:string;resource_id:string;
  saved_phase:string;allowed_action:string;expected_revision:number;
  choice:string|null;first_fault_id:string|null;
}

/** A repair only retries one named item after the owner revision is checked. */
export class SharedTestRepairStore {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async block(input:{runId:string;leaseId:string;resourceId:string;
    faultId:string},at=new Date()):Promise<{repairId:string;revision:number}> {
    const owner=await this.db.prepare(`SELECT state,revision,owner_run_id,
      owner_lease_id FROM test_environment WHERE site_id=1`)
      .first<Owner>();
    if(!owner || !['quiescing','cleaning'].includes(owner.state) ||
        owner.owner_run_id!==input.runId ||
        owner.owner_lease_id!==input.leaseId)
      throw new Error('test_repair_block_owner_changed');
    const fault=await this.db.prepare(`SELECT 1 AS found FROM test_failures
      WHERE fault_id=? AND run_id=? AND lease_id=?`)
      .bind(input.faultId,input.runId,input.leaseId)
      .first<{found:number}>();
    if(!fault)throw new Error('test_repair_fault_missing');
    const repairId=crypto.randomUUID(),revision=owner.revision+1;
    const inserted=await this.db.prepare(`INSERT INTO test_manual_reconciliations
      (repair_id,run_id,lease_id,resource_id,saved_phase,allowed_action,
       expected_revision,operator_sha256,first_fault_id,created_at)
      VALUES (?,?,?,? ,?,'retry',?,'',?,?)`)
      .bind(repairId,input.runId,input.leaseId,input.resourceId,owner.state,
        revision,input.faultId,at.toISOString()).run();
    if(inserted.meta.changes!==1)throw new Error('test_repair_block_write_incomplete');
    return {repairId,revision};
  }

  async pending(repairId:string):Promise<Repair|null> {
    return this.db.prepare(`SELECT repair_id,run_id,lease_id,resource_id,
      saved_phase,allowed_action,expected_revision,choice,first_fault_id
      FROM test_manual_reconciliations WHERE repair_id=?`)
      .bind(repairId).first<Repair>();
  }

  async retry(input:{repairId:string;expectedRevision:number;
    operatorEmail:string},at=new Date()):Promise<void> {
    if(!/^[a-f0-9-]{36}$/i.test(input.repairId) ||
        !Number.isSafeInteger(input.expectedRevision) ||
        input.expectedRevision<1 ||
        !input.operatorEmail.includes('@'))
      throw new Error('test_repair_retry_request_invalid');
    const operatorSha=await sha256Hex(input.operatorEmail.trim().toLowerCase());
    const updated=await this.db.prepare(`UPDATE test_manual_reconciliations
      SET choice='retry',operator_sha256=?,completed_at=?
      WHERE repair_id=? AND expected_revision=? AND choice IS NULL
        AND allowed_action='retry'`)
      .bind(operatorSha,at.toISOString(),input.repairId,
        input.expectedRevision).run();
    if(updated.meta.changes!==1)
      throw new Error('test_repair_retry_stale_or_missing');
  }
}
