export interface RecentIssue { issueId: string; identifier: string; title: string }
export interface RecentIssuesSnapshot { snapshotVersion: number; items: RecentIssue[] }
export type RecentIssuesUpdate = ({ state: "updated" } & RecentIssuesSnapshot)
  | { state: "unchanged" } | { state: "error"; code: "recent_history_unavailable" };
export interface RecentIssuesBinding {
  list(assertion: string | null): Promise<RecentIssuesSnapshot>;
  record(assertion: string | null, issue: RecentIssue): Promise<RecentIssuesSnapshot>;
}

interface Row { recency_id: number; issue_id: string; issue_identifier: string; issue_title: string }
const select = `SELECT recency_id, issue_id, issue_identifier, issue_title
  FROM portal_recent_issues WHERE person_key = ? ORDER BY recency_id DESC LIMIT 10`;
const snapshot = (rows: Row[]): RecentIssuesSnapshot => ({
  snapshotVersion: rows[0]?.recency_id ?? 0,
  items: rows.map(row => ({ issueId: row.issue_id, identifier: row.issue_identifier, title: row.issue_title })),
});

export class RecentIssuesRepository {
  private readonly db: D1Database;
  constructor(db: D1Database) { this.db = db; }
  async list(personKey: string): Promise<RecentIssuesSnapshot> {
    return snapshot((await this.db.prepare(select).bind(personKey).all<Row>()).results);
  }
  async record(personKey: string, issue: RecentIssue): Promise<RecentIssuesSnapshot> {
    if (!/^access:[a-f0-9]{64}$/.test(personKey)
      || typeof issue.issueId !== "string" || !/^[A-Za-z0-9-]{1,128}$/.test(issue.issueId)
      || typeof issue.identifier !== "string" || !/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/.test(issue.identifier)
      || issue.identifier.length > 64 || typeof issue.title !== "string" || issue.title.includes("\0")) {
      throw new Error("Invalid recent issue values");
    }
    const results = await this.db.batch<Row>([
      this.db.prepare("DELETE FROM portal_recent_issues WHERE person_key = ? AND issue_id = ?").bind(personKey, issue.issueId),
      this.db.prepare(`INSERT INTO portal_recent_issues (person_key, issue_id, issue_identifier, issue_title)
        VALUES (?, ?, ?, ?)`).bind(personKey, issue.issueId, issue.identifier, [...issue.title].slice(0, 512).join("")),
      this.db.prepare(`DELETE FROM portal_recent_issues WHERE person_key = ? AND recency_id NOT IN
        (SELECT recency_id FROM portal_recent_issues WHERE person_key = ? ORDER BY recency_id DESC LIMIT 10)`).bind(personKey, personKey),
      this.db.prepare(select).bind(personKey),
    ]);
    return snapshot(results[3].results);
  }
}

export const applyRecentSnapshot = (
  current: RecentIssuesSnapshot, incoming: RecentIssuesSnapshot,
): RecentIssuesSnapshot => incoming.snapshotVersion >= current.snapshotVersion ? incoming : current;
