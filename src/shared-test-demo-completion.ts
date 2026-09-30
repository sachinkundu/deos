/** Admission/marker proof is provisional. Only the lease's own successfully
 * completed demo may enter successful cleanup or satisfy a release check. */
export function sharedTestCompletedDemoSql(leaseId:string,runId:string):string {
  if(![leaseId,runId].every(value=>/^[a-z_]+\.[a-z_]+$/.test(value)))
    throw new Error('test_demo_completion_query_invalid');
  return `EXISTS (SELECT 1 FROM test_leases passed_lease
    JOIN agent_attempts passed_attempt ON passed_attempt.attempt_id=passed_lease.attempt_id
      AND passed_attempt.run_id=passed_lease.run_id
    WHERE passed_lease.lease_id=${leaseId} AND passed_lease.run_id=${runId}
      AND passed_attempt.node_id='shared_test_demo' AND passed_attempt.state='completed'
      AND passed_attempt.cleanup_state='destroyed' AND passed_attempt.ended_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM test_lease_aborts aborted
      WHERE aborted.lease_id=${leaseId} AND aborted.run_id=${runId})`;
}
