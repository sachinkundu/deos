import {sha256Hex} from './implementation-hash.ts';
import {stagingManifestDigest} from './shared-test-decision-store.ts';

export type SharedTestState = 'free' | 'preparing' | 'active' | 'quiescing' | 'cleaning' | 'blocked';

export interface StagingServiceRead {
  serviceName: string;
  sourceCommit: string;
  deployVersion: string;
  buildInputSha256: string;
  trafficPercent: number;
}

export interface StagingTrafficRead {
  revision: string;
  services: readonly StagingServiceRead[];
}

export interface StableStagingBase {
  revision: string;
  services: readonly StagingServiceRead[];
}

export interface SharedTestRequest {
  runId: string;
  nodeVisit: number;
  attemptId: string;
  taskId: string;
  candidateCommit: string;
  patchSha256: string;
}

export interface SharedTestGrant extends SharedTestRequest {
  requestId: string;
  taskKey: string;
  taskTitle: string;
  teamId: string;
  stage: string;
  repository: string;
  branch: string;
  pullRequestNumber: number | null;
  baseManifestId: string;
  baseTrafficRevision: string;
  base: StableStagingBase;
  pointerRevision: number;
}

interface EnvironmentRow {
  state: SharedTestState;
  owner_run_id: string | null;
  owner_lease_id: string | null;
  fence: number;
  heartbeat_due_at: string | null;
  revision: number;
}

interface QueueRow {
  request_id: string;
  run_id: string;
  node_visit: number;
  attempt_id: string;
  task_id: string;
  candidate_commit: string;
  patch_sha256: string;
  state: string;
  queue_number: number;
}

interface ManifestServiceRow {
  service_name: string;
  source_commit: string;
  deploy_version: string;
  build_input_sha256: string;
  app_paths_json: string;
  provider_paths_json: string;
}

export function stableStagingBase(first: StagingTrafficRead, second: StagingTrafficRead): StableStagingBase {
  if (!first.revision || first.revision !== second.revision || !first.services.length ||
      first.services.length !== second.services.length)
    throw new Error('staging_traffic_unstable');
  const canonical = (read: StagingTrafficRead) => {
    const services = [...read.services].sort((a,b) => a.serviceName.localeCompare(b.serviceName));
    if (new Set(services.map(service => service.serviceName)).size !== services.length ||
        services.some(service => !service.serviceName || !/^[a-f0-9]{40}$/.test(service.sourceCommit) ||
          !service.deployVersion || !/^[a-f0-9]{64}$/.test(service.buildInputSha256) ||
          service.trafficPercent !== 100))
      throw new Error('staging_traffic_incomplete');
    return services;
  };
  const a = canonical(first), b = canonical(second);
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('staging_traffic_changed');
  return {revision: first.revision, services: a};
}

export async function sharedTestRequestId(request: SharedTestRequest): Promise<string> {
  if (!request.runId || !Number.isSafeInteger(request.nodeVisit) || request.nodeVisit < 1 ||
      !request.attemptId || !request.taskId || !/^[a-f0-9]{40}$/.test(request.candidateCommit) ||
      !/^[a-f0-9]{64}$/.test(request.patchSha256))
    throw new Error('invalid_shared_test_request');
  return sha256Hex(JSON.stringify([request.runId,request.nodeVisit,request.taskId,request.candidateCommit]));
}

function sameRequest(row: QueueRow, value: SharedTestRequest, requestId: string): boolean {
  return row.request_id === requestId && row.run_id === value.runId &&
    row.node_visit === value.nodeVisit && row.attempt_id === value.attemptId &&
    row.task_id === value.taskId && row.candidate_commit === value.candidateCommit &&
    row.patch_sha256 === value.patchSha256;
}

export class SharedTestLeaseStore {
  readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }

  async environment(): Promise<EnvironmentRow> {
    const row = await this.db.prepare('SELECT state,owner_run_id,owner_lease_id,fence,heartbeat_due_at,revision FROM test_environment WHERE site_id=1')
      .first<EnvironmentRow>();
    if (!row) throw new Error('shared_test_environment_missing');
    return row;
  }

  async request(value: SharedTestRequest, at = new Date()): Promise<QueueRow> {
    const requestId = await sharedTestRequestId(value);
    const now = at.toISOString();
    await this.db.prepare(`INSERT OR IGNORE INTO test_lease_requests
      (request_id,run_id,node_visit,attempt_id,task_id,candidate_commit,patch_sha256,state,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'waiting',?,?)`)
      .bind(requestId,value.runId,value.nodeVisit,value.attemptId,value.taskId,
        value.candidateCommit,value.patchSha256,now,now).run();
    const row = await this.db.prepare('SELECT * FROM test_lease_requests WHERE request_id=?')
      .bind(requestId).first<QueueRow>();
    if (!row || !sameRequest(row,value,requestId) || !['waiting','validating','granted'].includes(row.state))
      throw new Error('shared_test_request_identity_conflict');
    return row;
  }

  private async assertSavedBase(value: SharedTestGrant): Promise<void> {
    const manifest = await this.db.prepare(`SELECT revision,traffic_revision,service_count,digest_sha256
      FROM staging_release_manifests WHERE manifest_id=?`)
      .bind(value.baseManifestId).first<{revision:number;traffic_revision:string;
        service_count:number;digest_sha256:string}>();
    const services = (await this.db.prepare(`SELECT * FROM staging_release_services
      WHERE manifest_id=? ORDER BY service_name`).bind(value.baseManifestId)
      .all<ManifestServiceRow>()).results;
    if (!manifest || manifest.traffic_revision !== value.baseTrafficRevision ||
        manifest.service_count !== value.base.services.length || services.length !== manifest.service_count ||
        await stagingManifestDigest(services) !== manifest.digest_sha256)
      throw new Error('shared_test_base_manifest_invalid');
    const saved = services.map(row => ({serviceName:row.service_name,sourceCommit:row.source_commit,
      deployVersion:row.deploy_version,buildInputSha256:row.build_input_sha256,trafficPercent:100}));
    if (JSON.stringify(saved) !== JSON.stringify([...value.base.services].sort((a,b) =>
      a.serviceName.localeCompare(b.serviceName))))
      throw new Error('shared_test_base_drift');
  }

  async grantChecked(value: Omit<SharedTestGrant,'base'>,
    readTraffic: () => Promise<StagingTrafficRead>, at = new Date()) {
    const base = stableStagingBase(await readTraffic(),await readTraffic());
    if (base.revision !== value.baseTrafficRevision) throw new Error('shared_test_base_drift');
    return this.grant({...value,base},at);
  }

  async grant(value: SharedTestGrant, at = new Date()): Promise<{state: 'granted'|'waiting'; leaseId?: string; fence?: number}> {
    const expectedId = await sharedTestRequestId(value);
    if (value.requestId !== expectedId || value.base.revision !== value.baseTrafficRevision ||
        value.base.services.length === 0 || !Number.isSafeInteger(value.pointerRevision) ||
        value.pointerRevision < 0 || !value.taskKey || !value.taskTitle || !value.teamId ||
        !value.repository || !value.branch ||
        (value.pullRequestNumber !== null && (!Number.isSafeInteger(value.pullRequestNumber) || value.pullRequestNumber < 1)))
      throw new Error('invalid_shared_test_grant');
    await this.assertSavedBase(value);
    const now = at.toISOString();
    const deadline = new Date(at.getTime()+120_000).toISOString();
    const leaseId = expectedId;
    const results = await this.db.batch([
      this.db.prepare(`UPDATE test_environment SET state='preparing',saved_phase='preparing',
          owner_run_id=?,owner_lease_id=?,fence=fence+1,heartbeat_due_at=?,revision=revision+1,updated_at=?
        WHERE site_id=1 AND state='free' AND owner_run_id IS NULL AND owner_lease_id IS NULL
          AND EXISTS (SELECT 1 FROM test_lease_requests r WHERE r.request_id=? AND r.state IN ('waiting','validating')
            AND r.run_id=? AND r.node_visit=? AND r.attempt_id=? AND r.task_id=?
            AND r.candidate_commit=? AND r.patch_sha256=?
            AND r.queue_number=(SELECT MIN(queue_number) FROM test_lease_requests WHERE state IN ('waiting','validating')))
          AND EXISTS (SELECT 1 FROM staging_release_pointer p WHERE p.site_id=1 AND p.state='stable'
            AND p.manifest_id=? AND p.traffic_revision=? AND p.revision=?)`)
        .bind(value.runId,leaseId,deadline,now,value.requestId,value.runId,value.nodeVisit,
          value.attemptId,value.taskId,value.candidateCommit,value.patchSha256,
          value.baseManifestId,value.baseTrafficRevision,value.pointerRevision),
      this.db.prepare(`INSERT OR IGNORE INTO test_leases
        (lease_id,request_id,run_id,attempt_id,task_id,task_key,task_title,team_id,stage,state,fence,
         base_manifest_id,base_traffic_revision,base_json,repository,branch,pull_request_number,
         candidate_commit,patch_sha256,created_at)
        SELECT ?,?,?,?,?,?,?,?,?,'preparing',e.fence,?,?,?,?,?,?,?,?,? FROM test_environment e
        WHERE e.site_id=1 AND e.state='preparing' AND e.owner_lease_id=? AND e.owner_run_id=?`)
        .bind(leaseId,value.requestId,value.runId,value.attemptId,value.taskId,value.taskKey,
          value.taskTitle,value.teamId,value.stage,value.baseManifestId,value.baseTrafficRevision,
          JSON.stringify(value.base),value.repository,value.branch,value.pullRequestNumber,
          value.candidateCommit,value.patchSha256,now,leaseId,value.runId),
      this.db.prepare(`INSERT OR IGNORE INTO test_lease_fence_epochs
        (lease_id,fence,run_id,reason,transition_revision,created_at)
        SELECT ?,e.fence,?,'grant',e.revision,? FROM test_environment e
        WHERE e.site_id=1 AND e.owner_lease_id=? AND e.owner_run_id=?`)
        .bind(leaseId,value.runId,now,leaseId,value.runId),
      this.db.prepare(`UPDATE test_lease_requests SET state='granted',updated_at=?
        WHERE request_id=? AND EXISTS (SELECT 1 FROM test_environment e
          WHERE e.site_id=1 AND e.owner_lease_id=? AND e.owner_run_id=?)`)
        .bind(now,value.requestId,leaseId,value.runId),
    ]);
    if (results[0].meta.changes !== 1) {
      const env = await this.environment();
      if (env.owner_lease_id === leaseId && env.owner_run_id === value.runId &&
          ['preparing','active'].includes(env.state))
        return {state:'granted',leaseId,fence:env.fence};
      return {state:'waiting'};
    }
    const env = await this.environment();
    if (env.owner_lease_id !== leaseId || env.owner_run_id !== value.runId || env.state !== 'preparing' ||
        results[1].meta.changes !== 1 || results[2].meta.changes !== 1 || results[3].meta.changes !== 1)
      throw new Error('shared_test_grant_write_incomplete');
    return {state:'granted',leaseId,fence:env.fence};
  }

  async heartbeat(runId: string, attemptId: string, leaseId: string, fence: number, at = new Date()): Promise<void> {
    const update = await this.db.prepare(`UPDATE test_environment SET heartbeat_due_at=?,revision=revision+1,updated_at=?
      WHERE site_id=1 AND state IN ('preparing','active') AND owner_run_id=? AND owner_lease_id=? AND fence=?
        AND EXISTS (SELECT 1 FROM test_leases WHERE lease_id=? AND run_id=? AND attempt_id=? AND state IN ('preparing','active'))`)
      .bind(new Date(at.getTime()+120_000).toISOString(),at.toISOString(),runId,leaseId,fence,
        leaseId,runId,attemptId).run();
    if (update.meta.changes !== 1) throw new Error('shared_test_heartbeat_fenced');
  }

  async assertWrite(runId: string, attemptId: string, leaseId: string, fence: number): Promise<void> {
    const row = await this.db.prepare(`SELECT 1 AS allowed FROM test_environment e JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active' AND l.state='active'
      AND e.owner_run_id=? AND e.owner_lease_id=? AND e.fence=?
      AND l.run_id=? AND l.attempt_id=? AND l.fence=?`)
      .bind(runId,leaseId,fence,runId,attemptId,fence).first<{allowed:number}>();
    if (row?.allowed !== 1) throw new Error('shared_test_write_fenced');
  }

  async fenceExpired(at = new Date()): Promise<{leaseId:string; fence:number}|null> {
    const now = at.toISOString();
    const env = await this.environment();
    if (!['preparing','active'].includes(env.state) || !env.heartbeat_due_at || env.heartbeat_due_at > now ||
        !env.owner_lease_id || !env.owner_run_id) return null;
    const result = await this.db.batch([
      this.db.prepare(`UPDATE test_environment SET saved_phase=state,state='quiescing',fence=fence+1,
        cleanup_driver='scheduled',heartbeat_due_at=NULL,revision=revision+1,updated_at=?
        WHERE site_id=1 AND state IN ('preparing','active') AND owner_lease_id=? AND owner_run_id=?
          AND fence=? AND heartbeat_due_at<=?`)
        .bind(now,env.owner_lease_id,env.owner_run_id,env.fence,now),
      this.db.prepare(`UPDATE test_leases SET state='quiescing' WHERE lease_id=? AND run_id=?
        AND EXISTS (SELECT 1 FROM test_environment e WHERE e.site_id=1 AND e.state='quiescing'
          AND e.owner_lease_id=? AND e.fence=?)`)
        .bind(env.owner_lease_id,env.owner_run_id,env.owner_lease_id,env.fence+1),
      this.db.prepare(`INSERT OR IGNORE INTO test_lease_fence_epochs
        (lease_id,fence,run_id,reason,transition_revision,created_at)
        SELECT ?,e.fence,?,'heartbeat_expired',e.revision,? FROM test_environment e
        WHERE e.site_id=1 AND e.state='quiescing' AND e.owner_lease_id=? AND e.fence=?`)
        .bind(env.owner_lease_id,env.owner_run_id,now,env.owner_lease_id,env.fence+1),
      this.db.prepare(`UPDATE test_expected_events SET state='disabled'
        WHERE lease_id=? AND run_id=? AND state IN ('planned','live','claimed')`)
        .bind(env.owner_lease_id,env.owner_run_id),
      this.db.prepare(`UPDATE test_app_sessions SET revoked_at=?
        WHERE lease_id=? AND run_id=? AND revoked_at IS NULL`)
        .bind(now,env.owner_lease_id,env.owner_run_id),
    ]);
    if (result[0].meta.changes !== 1) return null;
    if (result[1].meta.changes !== 1 || result[2].meta.changes !== 1)
      throw new Error('shared_test_fence_write_incomplete');
    return {leaseId:env.owner_lease_id,fence:env.fence+1};
  }

  async expireTerminalHead(at = new Date()): Promise<{requestId:string;state:'canceled'|'superseded'}|null> {
    const head = await this.db.prepare(`SELECT r.request_id,r.run_id,r.node_visit,r.attempt_id,
      a.cleanup_state,a.state AS attempt_state,o.status AS run_status,o.current_node,
      o.current_visit_sequence,o.issue_id
      FROM test_lease_requests r LEFT JOIN agent_attempts a ON a.attempt_id=r.attempt_id
      LEFT JOIN orchestration_runs o ON o.run_id=r.run_id
      WHERE r.state IN ('waiting','validating') ORDER BY r.queue_number LIMIT 1`)
      .first<{request_id:string;run_id:string;node_visit:number;attempt_id:string;
        cleanup_state:string|null;attempt_state:string|null;run_status:string|null;
        current_node:string|null;current_visit_sequence:number|null;issue_id:string|null}>();
    if (!head) return null;
    const terminal = ['succeeded','failed','canceled'].includes(head.run_status ?? '') ||
      head.current_node !== 'shared_test_demo' || head.current_visit_sequence !== head.node_visit;
    if (!terminal || head.cleanup_state !== 'destroyed' ||
        !head.attempt_state || ['pending','starting','running','collecting'].includes(head.attempt_state))
      return null;
    const state = head.run_status === 'canceled' ? 'canceled' : 'superseded';
    const proof = JSON.stringify({runStatus:head.run_status,node:head.current_node,
      visit:head.current_visit_sequence,attemptState:head.attempt_state,
      sandboxCleanup:head.cleanup_state,taskId:head.issue_id});
    const result = await this.db.prepare(`UPDATE test_lease_requests SET state=?,terminal_proof_json=?,
      updated_at=? WHERE request_id=? AND state IN ('waiting','validating')
      AND EXISTS (SELECT 1 FROM agent_attempts a WHERE a.attempt_id=?
        AND a.cleanup_state='destroyed' AND a.state NOT IN ('pending','starting','running','collecting'))
      AND EXISTS (SELECT 1 FROM orchestration_runs o WHERE o.run_id=?
        AND (o.status IN ('succeeded','failed','canceled') OR o.current_node<>'shared_test_demo'
          OR o.current_visit_sequence<>?))`)
      .bind(state,proof,at.toISOString(),head.request_id,head.attempt_id,head.run_id,
        head.node_visit).run();
    return result.meta.changes === 1 ? {requestId:head.request_id,state} : null;
  }
}
