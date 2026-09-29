import {SharedTestCoordinator,sharedTestStagingTraffic} from './shared-test-coordinator.ts';
import {SharedTestFailureStore} from './shared-test-failures.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';
import {SharedTestStagingPointer} from './shared-test-staging-pointer.ts';
import {SharedTestRecovery} from './shared-test-recovery.ts';
import {SharedTestLeaseDriver,type SharedTestDriverEnv} from './shared-test-lease-driver.ts';
import {SharedTestCandidateBuildDispatch} from './shared-test-candidate-build-dispatch.ts';
import {maintainSharedTestBrowser} from './shared-test-browser-maintenance.ts';
import {SharedTestReportDriver} from './shared-test-report-driver.ts';
import {SharedTestFirstProofDriver} from './shared-test-first-proof-driver.ts';
import {SharedTestStructuredProofDriver} from './shared-test-structured-proof-driver.ts';
import {SharedTestShowboatRawDriver} from './shared-test-showboat-raw.ts';
import {SharedTestShowboatProjection} from './shared-test-showboat-projection.ts';
import {SharedTestRepairStore} from './shared-test-repair.ts';
import {SharedTestFailedSetupProof} from './shared-test-failed-setup-proof.ts';
import {retryFailedSharedTestDemo,retryRepairedSharedTestDemo} from './shared-test-demo-retry.ts';
import {SharedTestQuiesceDriver} from './shared-test-quiesce-driver.ts';

type ScanEnv=SharedTestDriverEnv & Pick<Env,'SHARED_TEST_GRANTS_ENABLED'|
  'LINEAR_API_URL'|'LINEAR_APP_ACCESS_TOKEN'> & {TEST_MARKER_KEY_V1?:string};

/** One scheduled scan. An expired owner always waits for cleanup and a later scan. */
export async function scanSharedTest(env:ScanEnv,
  grantHead:()=>Promise<unknown>=async()=>{
    const traffic=sharedTestStagingTraffic(env as Env);
    await new SharedTestStagingPointer(env.DB).sync(traffic);
    return new SharedTestCoordinator(env as Env,traffic).grantHead();
  }):Promise<void> {
  const lease=new SharedTestLeaseStore(env.DB);
  let operation='shared_test.expire_head';
  try {
    const expiredHead=await lease.expireTerminalHead();
    operation='shared_test.fence_expired';
    const fencedOwner=await lease.fenceExpired();
    operation='shared_test.recover';
    await new SharedTestRecovery(env).resume();
    operation='shared_test.preserve_showboat';
    await new SharedTestShowboatRawDriver(env.DB,env.ARTIFACTS).resume();
    operation='shared_test.project_showboat';
    await new SharedTestShowboatProjection(env.DB,env.ARTIFACTS).resume();
    operation='shared_test.publish_structured_proof';
    await new SharedTestStructuredProofDriver(env as Env).resume();
    operation='shared_test.publish_first_proof';
    await new SharedTestFirstProofDriver(env as Env).resume();
    operation='shared_test.quiesce_after_proof';
    await new SharedTestQuiesceDriver(env.DB).resume();
    operation='shared_test.publish_failed_setup';
    await new SharedTestFailedSetupProof(env as Env).resume();
    operation='shared_test.retry_failed_demo';
    const retryOwner=await env.DB.prepare(`SELECT e.owner_run_id,e.owner_lease_id,
      e.fence,l.attempt_id FROM test_environment e JOIN test_leases l
      ON l.lease_id=e.owner_lease_id WHERE e.site_id=1 AND e.state='active'
        AND e.owner_run_id=l.run_id AND l.state='active'`)
      .first<{owner_run_id:string;owner_lease_id:string;fence:number;
        attempt_id:string}>();
    if(retryOwner) {
      const initial=await retryFailedSharedTestDemo(env as Env,
        retryOwner.owner_run_id,retryOwner.owner_lease_id,
        retryOwner.attempt_id,retryOwner.fence);
      if(!initial)await retryRepairedSharedTestDemo(env as Env,
        retryOwner.owner_run_id,retryOwner.owner_lease_id,
        retryOwner.attempt_id,retryOwner.fence);
    }
    operation='shared_test.prepare_activate';
    await new SharedTestLeaseDriver(env).resume();
    operation='shared_test.candidate_build';
    await new SharedTestCandidateBuildDispatch(env as Env).resume();
    operation='shared_test.browser_keepalive';
    await maintainSharedTestBrowser(env as Env);
    // A dead waiter or expired owner never hands the site to the next run
    // in the same scan. Cleanup and a later independent scan must prove it free.
    if (!expiredHead && !fencedOwner && String(env.SHARED_TEST_GRANTS_ENABLED)==='true') {
      operation='shared_test.grant_head';
      await grantHead();
    }
    // A pending report from a closed lease must not reserve the free site.
    operation='shared_test.publish_report';
    await new SharedTestReportDriver(env as Env).resume();
  } catch (error) {
    try {
      const owner=await lease.environment();
      const head=owner.owner_run_id ? null : await env.DB.prepare(`SELECT run_id
        FROM test_lease_requests WHERE state IN ('waiting','validating')
        ORDER BY queue_number LIMIT 1`).first<{run_id:string}>();
      const pending=operation==='shared_test.publish_report'
        ? await env.DB.prepare(`SELECT run_id,lease_id FROM test_lease_closures
          WHERE report_state='pending' ORDER BY committed_at,lease_id LIMIT 1`)
          .first<{run_id:string;lease_id:string}>():null;
      const runId=pending?.run_id??owner.owner_run_id??head?.run_id;
      if (runId) {
        const faultId=await new SharedTestFailureStore(env.DB,env.ARTIFACTS).record({
          runId,leaseId:pending?.lease_id??owner.owner_lease_id??undefined,
          fence:pending ? undefined : owner.owner_lease_id ? owner.fence : undefined,
          phase:pending ? 'report' : owner.state,operation,
          safeCode:'shared_test_scan_failed',
        },error);
        const resourceId=operation==='shared_test.recover' &&
          owner.state==='cleaning' && error instanceof Error ?
          error.message.match(/^shared_test_cleanup_(?:resource_identity_changed|worker_identity_changed|remote_id_changed|store_identity_changed):(.+)$/)?.[1]:null;
        if(resourceId && owner.owner_lease_id)
          await new SharedTestRepairStore(env.DB).block({runId,
            leaseId:owner.owner_lease_id,resourceId,faultId});
      }
    } catch (diagnosticError) {
      throw new AggregateError([error,diagnosticError],
        `Shared test scan and diagnostic storage failed: ${operation}`,{cause:error});
    }
    throw error;
  }
}
