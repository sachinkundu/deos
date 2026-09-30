import {WorkerEntrypoint} from 'cloudflare:workers';
import {testIssueMarker} from './shared-test-marker.ts';
import {sha256Hex} from './implementation-hash.ts';

interface MarkerRow {
  expectation_id:string;run_id:string;lease_id:string;task_id:string;
  fence:number;key_version:number;marker_sha256:string;
}

/** Resolve a public issue marker without sending its signing key to ingress. */
export class SharedTestMarkerResolver extends WorkerEntrypoint<Env> {
  async resolve(expectationId:string):Promise<string> {
    if(!/^[a-zA-Z0-9._:-]{8,120}$/.test(expectationId) ||
        !this.env.TEST_MARKER_KEY_V1)
      throw new Error('test_marker_resolver_unconfigured');
    const row=await this.env.DB.prepare(`SELECT x.expectation_id,x.run_id,
      x.lease_id,x.task_id,x.fence,x.key_version,x.marker_sha256
      FROM test_expected_events x JOIN test_environment e
        ON e.owner_lease_id=x.lease_id AND e.owner_run_id=x.run_id
      WHERE x.expectation_id=? AND x.state='live' AND x.key_version=1
        AND e.site_id=1 AND e.state='active' AND e.fence=x.fence`)
      .bind(expectationId).first<MarkerRow>();
    if(!row)throw new Error('test_marker_resolver_expectation_unavailable');
    const marker=await testIssueMarker({expectationId:row.expectation_id,
      runId:row.run_id,leaseId:row.lease_id,taskId:row.task_id,
      fence:row.fence},this.env.TEST_MARKER_KEY_V1);
    if(await sha256Hex(marker)!==row.marker_sha256)
      throw new Error('test_marker_resolver_hash_mismatch');
    return marker;
  }
}
