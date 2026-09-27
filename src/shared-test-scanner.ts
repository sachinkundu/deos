import {SharedTestCoordinator,sharedTestStagingTraffic} from './shared-test-coordinator.ts';
import {SharedTestFailureStore} from './shared-test-failures.ts';
import {SharedTestLeaseStore} from './shared-test-lease.ts';
import {SharedTestStagingPointer} from './shared-test-staging-pointer.ts';
import {SharedTestRecovery} from './shared-test-recovery.ts';
import {SharedTestLeaseDriver,type SharedTestDriverEnv} from './shared-test-lease-driver.ts';
import {SharedTestCandidateBuildDispatch} from './shared-test-candidate-build-dispatch.ts';
import {SharedTestReportDriver} from './shared-test-report-driver.ts';

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
    operation='shared_test.prepare_activate';
    await new SharedTestLeaseDriver(env).resume();
    operation='shared_test.candidate_build';
    await new SharedTestCandidateBuildDispatch(env as Env).resume();
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
      if (runId) await new SharedTestFailureStore(env.DB,env.ARTIFACTS).record({
        runId,leaseId:pending?.lease_id??owner.owner_lease_id??undefined,
        fence:pending ? undefined : owner.owner_lease_id ? owner.fence : undefined,
        phase:pending ? 'report' : owner.state,operation,
        safeCode:'shared_test_scan_failed',
      },error);
    } catch (diagnosticError) {
      throw new AggregateError([error,diagnosticError],
        `Shared test scan and diagnostic storage failed: ${operation}`,{cause:error});
    }
    throw error;
  }
}
