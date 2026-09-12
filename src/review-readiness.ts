/** Only a verified, currently served portal version can select the new review schema. */
export async function boundedReviewReady(database: D1Database, portal?: Pick<Fetcher, 'fetch'>): Promise<boolean> {
    const row = await database.prepare(`SELECT transcript_schema, portal_version_id FROM review_portal_readiness
    WHERE schema_version = 'deos-bounded-review-v1'`).first<{
        transcript_schema: string;
        portal_version_id: string;
    }>();
    if (!row)
        return false;
    if (row.transcript_schema !== 'deos-transcript-v1' || !portal)
        return false;
    const response = await portal.fetch('https://review-portal.internal/api/review-compatibility');
    if (!response.ok)
        throw new Error(`portal review readiness readback failed: HTTP ${response.status}`);
    const current = await response.json<{
        versionId?: string;
        reviewSchemas?: string[];
        transcriptSchemas?: string[];
    }>();
    return current.versionId === row.portal_version_id && current.reviewSchemas?.includes('deos-bounded-review-v1') === true &&
        current.transcriptSchemas?.includes('deos-transcript-v1') === true;
}
