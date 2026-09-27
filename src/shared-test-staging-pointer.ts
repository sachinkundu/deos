import {stableStagingBase,type StagingTrafficRead,type StableStagingBase} from './shared-test-lease.ts';
import {stagingManifestDigest} from './shared-test-decision-store.ts';
import {sha256Hex} from './implementation-hash.ts';

export interface StagingServiceScope {
  serviceName:string;
  appPaths:readonly string[];
  providerPaths:readonly string[];
}

export const SHARED_TEST_STAGING_SCOPES:readonly StagingServiceScope[]=[
  {serviceName:'bettaview',appPaths:['portal/bettaview/'],providerPaths:[]},
  {serviceName:'portal',
    appPaths:['portal/','web/','app/','pages/','components/','src/components/','src/App.','public/'],
    providerPaths:['src/deos/','src/entry.py','src/linear-','src/github-','src/capability-']},
];

interface PointerRow {
  state:'uninitialized'|'stable'|'updating'|'blocked';
  manifest_id:string|null;
  manifest_revision:number|null;
  traffic_revision:string|null;
  work_id:string|null;
  planned_manifest_id:string|null;
  revision:number;
}

function canonicalScopes(scopes:readonly StagingServiceScope[]):StagingServiceScope[] {
  const sorted=[...scopes].sort((a,b)=>a.serviceName.localeCompare(b.serviceName));
  if (!sorted.length || new Set(sorted.map(s=>s.serviceName)).size!==sorted.length ||
      sorted.some(s=>!s.serviceName || s.appPaths.length+s.providerPaths.length===0))
    throw new Error('invalid_staging_release_scope');
  return sorted;
}

export class SharedTestStagingPointer {
  readonly db:D1Database;
  constructor(db:D1Database) {this.db=db;}

  async pointer():Promise<PointerRow> {
    const row=await this.db.prepare('SELECT * FROM staging_release_pointer WHERE site_id=1')
      .first<PointerRow>();
    if (!row) throw new Error('staging_release_pointer_missing');
    return row;
  }

  /** Refresh the manifest from live version endpoints using this Worker's D1 binding. */
  async sync(readVersions:()=>Promise<StagingTrafficRead>,at=new Date()):Promise<PointerRow> {
    const base=stableStagingBase(await readVersions(),await readVersions());
    const before=await this.pointer();
    if (before.state==='stable' && before.traffic_revision===base.revision) return before;
    if (before.state==='blocked') throw new Error('staging_release_busy');
    if (before.state==='updating') {
      if (!before.work_id || !before.planned_manifest_id)
        throw new Error('staging_release_busy');
      await this.finish(before.work_id,before.planned_manifest_id,
        SHARED_TEST_STAGING_SCOPES,readVersions,at);
      return this.pointer();
    }
    const workId=`version-sync:${before.revision}:${base.revision}`;
    const manifestId=`manifest:${await sha256Hex(JSON.stringify([workId]))}`;
    await this.begin(workId,manifestId,'shared-test-coordinator',at);
    await this.finish(workId,manifestId,SHARED_TEST_STAGING_SCOPES,
      readVersions,at,base.revision);
    return this.pointer();
  }

  async begin(workId:string,plannedManifestId:string,owner:string,at=new Date()):Promise<PointerRow> {
    if (!workId || !plannedManifestId || !owner) throw new Error('invalid_staging_release_plan');
    const before=await this.pointer();
    if (before.state==='updating' && before.work_id===workId &&
        before.planned_manifest_id===plannedManifestId) return before;
    if (!['stable','uninitialized'].includes(before.state)) throw new Error('staging_release_busy');
    const updated=await this.db.prepare(`UPDATE staging_release_pointer
      SET state='updating',work_id=?,owner=?,planned_manifest_id=?,heartbeat_due_at=?,
        revision=revision+1,updated_at=?
      WHERE site_id=1 AND revision=? AND state IN ('stable','uninitialized')`)
      .bind(workId,owner,plannedManifestId,new Date(at.getTime()+120_000).toISOString(),
        at.toISOString(),before.revision).run();
    if (updated.meta.changes!==1) throw new Error('staging_release_plan_race');
    return this.pointer();
  }

  async heartbeat(workId:string,at=new Date()):Promise<void> {
    const result=await this.db.prepare(`UPDATE staging_release_pointer SET heartbeat_due_at=?,
      updated_at=?,revision=revision+1 WHERE site_id=1 AND state='updating' AND work_id=?`)
      .bind(new Date(at.getTime()+120_000).toISOString(),at.toISOString(),workId).run();
    if (result.meta.changes!==1) throw new Error('staging_release_heartbeat_fenced');
  }

  async finish(workId:string,plannedManifestId:string,scopes:readonly StagingServiceScope[],
    readTraffic:()=>Promise<StagingTrafficRead>,at=new Date(),expectedRevision?:string):Promise<{manifestId:string;revision:number;base:StableStagingBase}> {
    const scopeRows=canonicalScopes(scopes);
    const base=stableStagingBase(await readTraffic(),await readTraffic());
    if (expectedRevision && base.revision!==expectedRevision)
      throw new Error('staging_version_changed_during_sync');
    if (JSON.stringify(scopeRows.map(s=>s.serviceName))!==
        JSON.stringify(base.services.map(s=>s.serviceName)))
      throw new Error('staging_release_service_set_changed');
    const pointer=await this.pointer();
    if (pointer.state==='stable' && pointer.manifest_id===plannedManifestId &&
        pointer.traffic_revision===base.revision && pointer.manifest_revision) {
      const saved=(await this.db.prepare(`SELECT service_name,source_commit,deploy_version,
        build_input_sha256 FROM staging_release_services WHERE manifest_id=? ORDER BY service_name`)
        .bind(plannedManifestId).all<{service_name:string;source_commit:string;
          deploy_version:string;build_input_sha256:string}>()).results;
      if (JSON.stringify(saved.map(s=>[s.service_name,s.source_commit,s.deploy_version,
        s.build_input_sha256]))!==JSON.stringify(base.services.map(s=>[s.serviceName,
        s.sourceCommit,s.deployVersion,s.buildInputSha256])))
        throw new Error('staging_release_readback_drift');
      return {manifestId:plannedManifestId,revision:pointer.manifest_revision,base};
    }
    if (pointer.state!=='updating' || pointer.work_id!==workId ||
        pointer.planned_manifest_id!==plannedManifestId)
      throw new Error('staging_release_plan_mismatch');
    const revision=pointer.revision+1;
    const rows=base.services.map((service,index)=>({
      service_name:service.serviceName,source_commit:service.sourceCommit,
      deploy_version:service.deployVersion,build_input_sha256:service.buildInputSha256,
      app_paths_json:JSON.stringify([...scopeRows[index].appPaths]),
      provider_paths_json:JSON.stringify([...scopeRows[index].providerPaths]),
    }));
    const digest=await stagingManifestDigest(rows);
    const results=await this.db.batch([
      this.db.prepare(`INSERT INTO staging_release_manifests
        (manifest_id,revision,traffic_revision,service_count,digest_sha256,recorded_at)
        SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
          WHERE site_id=1 AND state='updating' AND work_id=? AND planned_manifest_id=? AND revision=?)`)
        .bind(plannedManifestId,revision,base.revision,rows.length,digest,at.toISOString(),
          workId,plannedManifestId,pointer.revision),
      ...rows.map(row=>this.db.prepare(`INSERT INTO staging_release_services
        (manifest_id,service_name,source_commit,deploy_version,build_input_sha256,
         app_paths_json,provider_paths_json,read_at)
        SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM staging_release_pointer
          WHERE site_id=1 AND state='updating' AND work_id=? AND revision=?)`)
        .bind(plannedManifestId,row.service_name,row.source_commit,row.deploy_version,
          row.build_input_sha256,row.app_paths_json,row.provider_paths_json,at.toISOString(),
          workId,pointer.revision)),
      this.db.prepare(`UPDATE staging_release_pointer SET state='stable',manifest_id=?,
        manifest_revision=?,traffic_revision=?,work_id=NULL,owner=NULL,
        planned_manifest_id=NULL,heartbeat_due_at=NULL,revision=revision+1,updated_at=?
        WHERE site_id=1 AND state='updating' AND work_id=? AND planned_manifest_id=?
          AND revision=? AND EXISTS (SELECT 1 FROM staging_release_manifests
            WHERE manifest_id=? AND revision=? AND digest_sha256=?)`)
        .bind(plannedManifestId,revision,base.revision,at.toISOString(),workId,
          plannedManifestId,pointer.revision,plannedManifestId,revision,digest),
    ]);
    if (results.some(result=>result.meta.changes!==1))
      throw new Error('staging_release_commit_incomplete');
    return {manifestId:plannedManifestId,revision,base};
  }

  async blockInterrupted(workId:string,at=new Date()):Promise<void> {
    const result=await this.db.prepare(`UPDATE staging_release_pointer SET state='blocked',
      revision=revision+1,updated_at=? WHERE site_id=1 AND state='updating'
      AND work_id=? AND heartbeat_due_at<=?`)
      .bind(at.toISOString(),workId,at.toISOString()).run();
    if (result.meta.changes!==1) throw new Error('staging_release_block_race');
  }
}
