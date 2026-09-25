import {sha256Hex} from './implementation-hash.ts';
import {decideTestPath, releaseHasTestProof, type TestPathDecision, type TestServiceManifest} from './shared-test-path-rule.ts';

interface ManifestRow {
  manifest_id: string;
  revision: number;
  service_count: number;
  digest_sha256: string;
}

interface ServiceRow {
  service_name: string;
  source_commit: string;
  deploy_version: string;
  build_input_sha256: string;
  app_paths_json: string;
  provider_paths_json: string;
}

interface DecisionRow {
  run_id: string;
  candidate_commit: string;
  patch_sha256: string;
  manifest_id: string;
  manifest_revision: number;
  changed_paths_sha256: string;
  choice: 'test_required' | 'test_not_required';
  matched_paths_json: string;
}

function stringList(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item => typeof item !== 'string'))
    throw new Error('invalid_staging_service_paths');
  return parsed;
}

export function stagingManifestDigest(services: readonly ServiceRow[]): Promise<string> {
  const canonical = [...services].sort((a,b) => a.service_name.localeCompare(b.service_name))
    .map(row => ({serviceName:row.service_name,sourceCommit:row.source_commit,
      deployVersion:row.deploy_version,buildInputSha256:row.build_input_sha256,
      appPaths:stringList(row.app_paths_json),providerPaths:stringList(row.provider_paths_json)}));
  return sha256Hex(JSON.stringify(canonical));
}

export class SharedTestDecisionStore {
  readonly db: D1Database;
  constructor(db: D1Database) {this.db=db;}

  async manifest(id: string, revision: number): Promise<TestServiceManifest> {
    const row = await this.db.prepare('SELECT * FROM staging_release_manifests WHERE manifest_id=? AND revision=?')
      .bind(id,revision).first<ManifestRow>();
    if (!row) throw new Error('staging_manifest_missing');
    const services = (await this.db.prepare('SELECT * FROM staging_release_services WHERE manifest_id=? ORDER BY service_name')
      .bind(id).all<ServiceRow>()).results;
    if (!services.length || services.length !== row.service_count ||
        await stagingManifestDigest(services) !== row.digest_sha256)
      throw new Error('staging_manifest_integrity');
    return {id,revision,uiPaths:[...new Set(services.flatMap(service => stringList(service.app_paths_json)))],
      providerPaths:[...new Set(services.flatMap(service => stringList(service.provider_paths_json)))]};
  }

  async record(input: {runId:string;candidateCommit:string;patchSha256:string;changedPaths:readonly string[]},
    at = new Date()): Promise<TestPathDecision> {
    const pointer = await this.db.prepare(`SELECT manifest_id,manifest_revision FROM staging_release_pointer
      WHERE site_id=1 AND state='stable'`).first<{manifest_id:string;manifest_revision:number}>();
    if (!pointer?.manifest_id) throw new Error('stable_staging_pointer_missing');
    const manifest = await this.manifest(pointer.manifest_id,pointer.manifest_revision);
    const decision = await decideTestPath({...input,manifest});
    await this.db.prepare(`INSERT OR IGNORE INTO test_task_decisions
      (run_id,candidate_commit,patch_sha256,manifest_id,manifest_revision,changed_paths_sha256,
       choice,matched_paths_json,created_at)
      SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
        WHERE site_id=1 AND state='stable' AND manifest_id=? AND manifest_revision=?)`)
      .bind(decision.runId,decision.candidateCommit,decision.patchSha256,decision.manifestId,
        decision.manifestRevision,decision.changedPathsSha256,decision.choice,
        JSON.stringify(decision.matchedPaths),at.toISOString(),decision.manifestId,
        decision.manifestRevision).run();
    const saved = await this.db.prepare(`SELECT * FROM test_task_decisions
      WHERE run_id=? AND candidate_commit=? AND patch_sha256=? AND manifest_revision=?`)
      .bind(decision.runId,decision.candidateCommit,decision.patchSha256,
        decision.manifestRevision).first<DecisionRow>();
    if (!saved || saved.manifest_id !== decision.manifestId ||
        saved.changed_paths_sha256 !== decision.changedPathsSha256 ||
        saved.choice !== decision.choice ||
        saved.matched_paths_json !== JSON.stringify(decision.matchedPaths))
      throw new Error('test_path_decision_conflict');
    return decision;
  }

  async releaseCheck(input: {runId:string;candidateCommit:string;patchSha256:string;
    manifestId:string;manifestRevision:number;changedPaths:readonly string[]}): Promise<{allowed:boolean;choice:string|null}> {
    const row = await this.db.prepare(`SELECT * FROM test_task_decisions
      WHERE run_id=? AND candidate_commit=? AND patch_sha256=? AND manifest_id=? AND manifest_revision=?`)
      .bind(input.runId,input.candidateCommit,input.patchSha256,input.manifestId,
        input.manifestRevision).first<DecisionRow>();
    if (!row) return {allowed:false,choice:null};
    const manifest = await this.manifest(input.manifestId,input.manifestRevision);
    const actual = await decideTestPath({...input,manifest});
    if (row.choice !== actual.choice || row.changed_paths_sha256 !== actual.changedPathsSha256 ||
        row.matched_paths_json !== JSON.stringify(actual.matchedPaths))
      return {allowed:false,choice:row.choice};
    const attestation = await this.db.prepare(`SELECT a.run_id,a.candidate_commit,a.patch_sha256,
      a.manifest_id,a.manifest_revision,a.state
      FROM test_attestations a JOIN test_lease_closures c ON c.attestation_id=a.attestation_id
      WHERE a.run_id=? AND a.candidate_commit=? AND a.patch_sha256=?
        AND a.manifest_id=? AND a.manifest_revision=? AND a.state='complete'
        AND c.report_state='complete'`)
      .bind(input.runId,input.candidateCommit,input.patchSha256,input.manifestId,
        input.manifestRevision).first<{run_id:string;candidate_commit:string;patch_sha256:string;
          manifest_id:string;manifest_revision:number;state:'complete'}>();
    const allowed = releaseHasTestProof({decision:actual,...input,
      attestation:attestation ? {runId:attestation.run_id,candidateCommit:attestation.candidate_commit,
        patchSha256:attestation.patch_sha256,manifestId:attestation.manifest_id,
        manifestRevision:attestation.manifest_revision,state:attestation.state} : null});
    return {allowed,choice:row.choice};
  }
}
