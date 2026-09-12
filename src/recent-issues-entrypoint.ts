import { errorDetails } from "./error-details.ts";
import { WorkerEntrypoint } from "cloudflare:workers";
import { RecentIssuesRepository, type RecentIssue } from "./recent-issues.ts";
import { recentIssuesPersonKey } from "./recent-issues-identity.ts";

export class RecentIssues extends WorkerEntrypoint<Env> {
  private personKey(assertion: string | null): Promise<string> {
    return recentIssuesPersonKey(assertion, {
      teamDomain: this.env.PORTAL_ACCESS_TEAM_DOMAIN,
      audience: this.env.PORTAL_ACCESS_AUD,
      allowedEmail: this.env.ROUTE_ADMIN_ALLOWED_EMAIL,
    });
  }
  private async operation<T>(name: string, action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
      console.error(JSON.stringify({ operation: `recent_issues.${name}`, error: errorDetails(error) }));
      throw error;
    }
  }
  async list(assertion: string | null) {
    return this.operation("list", async () => new RecentIssuesRepository(this.env.DB).list(await this.personKey(assertion)));
  }
  async record(assertion: string | null, issue: RecentIssue) {
    return this.operation("record", async () => new RecentIssuesRepository(this.env.DB).record(await this.personKey(assertion), issue));
  }
}
