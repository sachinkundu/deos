import {sharedTestServicePlans} from './shared-test-service-plan.ts';
import type {StableStagingBase} from './shared-test-lease.ts';

interface Lease {
  lease_id:string;
  run_id:string;
  fence:number;
  candidate_commit:string;
  patch_sha256:string;
  base_manifest_id:string;
  base_traffic_revision:string;
  base_json:string;
}

interface ServiceRoots {
  service_name:string;
  app_paths_json:string;
  provider_paths_json:string;
}

function roots(raw:string):string[] {
  const value:unknown=JSON.parse(raw);
  if(!Array.isArray(value) || value.some(item=>typeof item!=='string' ||
      !item || item.startsWith('/') || item.includes('\\') ||
      item.split('/').includes('..')))
    throw new Error('shared_test_candidate_roots_invalid');
  return value;
}

/** The demo cannot begin until changed services run the exact candidate. */
export async function sharedTestCandidateReady(db:D1Database,lease:Lease):Promise<boolean> {
  const decision=await db.prepare(`SELECT d.choice,d.matched_paths_json,d.manifest_id,
    d.manifest_revision FROM test_task_decisions d WHERE d.run_id=?
      AND d.candidate_commit=? AND d.patch_sha256=? ORDER BY d.created_at LIMIT 1`)
    .bind(lease.run_id,lease.candidate_commit,lease.patch_sha256)
    .first<{choice:string;matched_paths_json:string;manifest_id:string;
      manifest_revision:number}>();
  if(!decision || decision.choice!=='test_required')
    throw new Error('shared_test_candidate_decision_missing');
  const matched:unknown=JSON.parse(decision.matched_paths_json);
  if(!Array.isArray(matched) || !matched.length ||
      matched.some(path=>typeof path!=='string'))
    throw new Error('shared_test_candidate_paths_invalid');
  const base=JSON.parse(lease.base_json) as StableStagingBase;
  if(lease.base_manifest_id!==decision.manifest_id ||
      base.revision!==lease.base_traffic_revision)
    throw new Error('shared_test_candidate_manifest_changed');
  const manifest=await db.prepare(`SELECT revision FROM staging_release_manifests
    WHERE manifest_id=?`).bind(lease.base_manifest_id)
    .first<{revision:number}>();
  if(manifest?.revision!==decision.manifest_revision)
    throw new Error('shared_test_candidate_manifest_changed');
  const plans=sharedTestServicePlans(lease.lease_id,base);
  const services=(await db.prepare(`SELECT service_name,app_paths_json,provider_paths_json
    FROM staging_release_services WHERE manifest_id=? ORDER BY service_name`)
    .bind(decision.manifest_id).all<ServiceRoots>()).results;
  if(services.length!==plans.length || plans.some(plan=>
      !services.some(service=>service.service_name===plan.serviceName)))
    throw new Error('shared_test_candidate_services_changed');
  const serviceRoots=services.map(service=>({service,
    prefixes:[...roots(service.app_paths_json),...roots(service.provider_paths_json)]}));
  // A broad portal/ root also contains portal/bettaview/. The more specific
  // service owns that path; equal-specificity roots deliberately select both.
  const affectedNames=new Set<string>();
  for(const path of matched as string[]) {
    const matches=serviceRoots.map(entry=>({name:entry.service.service_name,
      length:Math.max(0,...entry.prefixes.filter(root=>path.startsWith(root))
        .map(root=>root.length))}));
    const longest=Math.max(...matches.map(entry=>entry.length));
    if(longest===0)throw new Error('shared_test_candidate_service_unmatched');
    for(const entry of matches)if(entry.length===longest)affectedNames.add(entry.name);
  }
  const affected=services.filter(service=>affectedNames.has(service.service_name));
  if(!affected.length)throw new Error('shared_test_candidate_service_unmatched');
  const rows=(await db.prepare(`SELECT service_name,resource_id,candidate_commit,
    build_input_sha256,running_version_id,fence,first_read_at,second_read_at
    FROM test_candidate_service_readbacks WHERE lease_id=?`)
    .bind(lease.lease_id).all<{service_name:string;resource_id:string;
      candidate_commit:string;build_input_sha256:string;running_version_id:string;
      fence:number;first_read_at:string;second_read_at:string}>()).results;
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return affected.every(service=>{
    const plan=plans.find(value=>value.serviceName===service.service_name)!;
    const row=rows.find(value=>value.service_name===service.service_name);
    return !!row && row.resource_id===plan.resourceId &&
      row.candidate_commit===lease.candidate_commit && row.fence===lease.fence &&
      /^[a-f0-9]{64}$/.test(row.build_input_sha256) &&
      uuid.test(row.running_version_id) &&
      row.first_read_at<=row.second_read_at;
  });
}
