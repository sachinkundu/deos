import { responseError } from "./error-details.ts";
import { recordCaughtError } from "./error-context.ts";
const commentIdentity = async (issueId: string, key: string): Promise<string> => {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([issueId, key]))));
  bytes[6] = (bytes[6] & 15) | 0x40;
  bytes[8] = (bytes[8] & 63) | 0x80;
  const hex = [...bytes.slice(0, 16)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
export interface LinearNoteRequest {
  issueId: string;
  body: string;
}

export interface LinearNoteReceipt {
  commentId: string;
  reconciled: boolean;
}

export interface LinearStatusRequest extends LinearNoteRequest {
  markerId: string;
}

export interface LinearPublicationContext {
  issueId: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
}

export interface LinearProjectChoice {
  projectId: string;
  name: string;
  url: string;
  teams: Array<{
    id: string;
    name: string;
    key: string;
  }>;
}

interface LinearCapabilityDependencies {
  fetch: typeof fetch;
}

export class LinearCapabilityAdapter {
  private readonly apiUrl: string;
  private readonly accessToken: string;
  private readonly request: typeof fetch;

  constructor(
    apiUrl: string,
    accessToken: string,
    dependencies: Partial<LinearCapabilityDependencies> = {},
  ) {
    this.apiUrl = apiUrl;
    this.accessToken = accessToken;
    this.request = dependencies.fetch ?? ((input, init) => fetch(input, init));
  }

  async implementationContext(id: string): Promise<Record<string,unknown>> {
    let after: string|null=null;const comments:unknown[]=[];let issue:Record<string,unknown>|null=null;
    for(;;) {
      const payload=await this.graphql(`query ImplementationIssue($id: String!, $after:String) {
        issue(id:$id) { id identifier title description url state {id name} project {id name}
          comments(first:100,after:$after) {nodes {id body createdAt updatedAt editedAt archivedAt user {id name}}
            pageInfo {hasNextPage endCursor} } }
      }`,{id,after}) as {data:{issue:Record<string,unknown>&{comments:{nodes:unknown[];pageInfo:{hasNextPage:boolean;endCursor:string|null}}}}};
      const found=payload.data?.issue;if(!found||found.id!==id)throw new Error('Implementation issue read-back differs');
      const {comments:page,...rest}=found;issue=rest;comments.push(...page.nodes);
      if(!page.pageInfo.hasNextPage)return {...issue,comments};
      if(!page.pageInfo.endCursor||page.pageInfo.endCursor===after)throw new Error('Linear comment pagination did not advance');
      after=page.pageInfo.endCursor;
    }
  }

  async readImplementationComment(id: string): Promise<{
    id: string; body: string; createdAt: string; updatedAt: string; editedAt: string | null; archivedAt: string | null;
    issue: { id: string } | null; user: { id: string } | null;
  }> {
    const payload = await this.graphql(`query ImplementationReply($id: String!) {
      comment(id: $id) { id body createdAt updatedAt editedAt archivedAt issue { id } user { id } }
    }`, { id }) as { data: { comment: Awaited<ReturnType<LinearCapabilityAdapter['readImplementationComment']>> } };
    if (!payload.data?.comment || payload.data.comment.id !== id) throw new Error('Linear comment read-back missing');
    return payload.data.comment;
  }

  async implementationUsers(): Promise<Array<{ id: string; name: string; email: string; active: boolean; isMe: boolean }>> {
    const result = []; let after: string | null = null;
    for (;;) {
      const payload = await this.graphql(`query ImplementationUsers($after: String) { users(first: 100, after: $after) {
        nodes { id name email active isMe } pageInfo { hasNextPage endCursor }
      } }`, { after }) as { data: { users: { nodes: Array<{ id: string; name: string; email: string; active: boolean; isMe: boolean }>; pageInfo: { hasNextPage: boolean; endCursor: string } } } };
      result.push(...payload.data.users.nodes);
      if (!payload.data.users.pageInfo.hasNextPage) return result;
      after = payload.data.users.pageInfo.endCursor;
    }
  }

  async implementationUser(id: string): Promise<{ id: string; email: string; active: boolean; isMe: boolean }> {
    const payload = await this.graphql(`query ImplementationUser($id: String!) { user(id: $id) { id email active isMe } }`, { id }) as {
      data: { user: { id: string; email: string; active: boolean; isMe: boolean } }
    };
    if (payload.data?.user?.id !== id) throw new Error('Linear human user read-back differs');
    return payload.data.user;
  }

  async upsertNote(input: LinearNoteRequest, operationId: string): Promise<LinearNoteReceipt> {
    const marker = await commentIdentity(input.issueId, `note:${operationId}`);
    const existing = await this.findComment(input.issueId, marker);
    if (existing !== null) return { commentId: existing, reconciled: true };
    try {
      const payload = await this.graphql(
        `mutation DeosCreateComment($issueId: String!, $body: String!, $commentId: String!) {
           commentCreate(input: { id: $commentId, issueId: $issueId, body: $body }) {
             success
             comment { id }
           }
         }`,
        { issueId: input.issueId, body: input.body, commentId: marker },
      ) as { data?: { commentCreate?: { success?: boolean; comment?: { id?: string } } } };
      const id = payload.data?.commentCreate?.comment?.id;
      if (payload.data?.commentCreate?.success !== true || typeof id !== "string") {
        throw new Error("Linear comment response is invalid");
      }
      return { commentId: id, reconciled: false };
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/linear-capability.ts:72");
      const reconciled = await this.findComment(input.issueId, marker);
      if (reconciled === null) throw new Error("Linear comment creation is ambiguous", { cause: caughtError });
      return { commentId: reconciled, reconciled: true };
    }
  }

  async upsertStatus(input: LinearStatusRequest): Promise<LinearNoteReceipt> {
    if (!/^[a-z0-9][a-z0-9:._-]{7,299}$/i.test(input.markerId)) {
      throw new Error("Linear status marker is invalid");
    }
    const marker = await commentIdentity(input.issueId, `status:${input.markerId}`);
    const desired = input.body;
    const existing = await this.findCommentRecord(input.issueId, marker);
    if (existing?.body === desired) return { commentId: existing.id, reconciled: true };
    if (existing === null) {
      try {
        const payload = await this.graphql(
          `mutation DeosCreateStatusComment($issueId: String!, $body: String!, $commentId: String!) {
             commentCreate(input: { id: $commentId, issueId: $issueId, body: $body }) {
               success
               comment { id }
             }
           }`,
          { issueId: input.issueId, body: desired, commentId: marker },
        ) as { data?: { commentCreate?: { success?: boolean; comment?: { id?: string } } } };
        const id = payload.data?.commentCreate?.comment?.id;
        if (payload.data?.commentCreate?.success !== true || typeof id !== "string") {
          throw new Error("Linear status comment response is invalid");
        }
        return { commentId: id, reconciled: false };
      } catch (caughtError) {
        recordCaughtError(caughtError, "src/linear-capability.ts:103");
        const recovered = await this.findCommentRecord(input.issueId, marker);
        if (recovered?.body !== desired) throw new Error("Linear status comment creation is ambiguous", { cause: caughtError });
        return { commentId: recovered.id, reconciled: true };
      }
    }
    try {
      const payload = await this.graphql(
        `mutation DeosUpdateStatusComment($id: String!, $body: String!) {
           commentUpdate(id: $id, input: { body: $body }) {
             success
             comment { id }
           }
         }`,
        { id: existing.id, body: desired },
      ) as { data?: { commentUpdate?: { success?: boolean; comment?: { id?: string } } } };
      if (payload.data?.commentUpdate?.success !== true || payload.data.commentUpdate.comment?.id !== existing.id) {
        throw new Error("Linear status comment update response is invalid");
      }
      return { commentId: existing.id, reconciled: false };
    } catch (caughtError) {
      recordCaughtError(caughtError, "src/linear-capability.ts:123");
      const recovered = await this.findCommentRecord(input.issueId, marker);
      if (recovered?.id !== existing.id || recovered.body !== desired) {
        throw new Error("Linear status comment update is ambiguous", { cause: caughtError });
      }
      return { commentId: existing.id, reconciled: true };
    }
  }

  async readPublicationContext(issueId: string): Promise<LinearPublicationContext> {
    const payload = await this.graphql(
      `query DeosPublicationIssue($id: String!) {
         issue(id: $id) { id identifier title description url }
       }`,
      { id: issueId },
    ) as {
      data?: {
        issue?: {
          id?: string;
          identifier?: string;
          title?: string;
          description?: string | null;
          url?: string;
        } | null;
      };
    };
    const issue = payload.data?.issue;
    if (
      issue === null || issue === undefined || issue.id !== issueId ||
      typeof issue.identifier !== "string" || typeof issue.title !== "string" ||
      !(issue.description === null || typeof issue.description === "string") ||
      typeof issue.url !== "string"
    ) throw new Error("Linear publication context response is invalid");
    return {
      issueId,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description,
      url: issue.url,
    };
  }

  async listProjects(): Promise<LinearProjectChoice[]> {
    const projects: LinearProjectChoice[] = [];
    let after: string | null = null;
    for (let page = 1; page <= 100; page += 1) {
      const payload = await this.graphql(
         `query DeosRouteProjects($first: Int!, $after: String) {
           projects(first: $first, after: $after) {
             nodes { id name url teams { nodes { id name key } } }
             pageInfo { hasNextPage endCursor }
           }
         }`,
        { first: 100, after },
      ) as {
        data?: {
          projects?: {
            nodes?: unknown;
            pageInfo?: { hasNextPage?: unknown; endCursor?: unknown };
          };
        };
      };
      const connection = payload.data?.projects;
      if (!Array.isArray(connection?.nodes) || typeof connection.pageInfo?.hasNextPage !== "boolean") {
        throw new Error("Linear project catalog response is invalid");
      }
      for (const raw of connection.nodes) {
        const project = raw as {
          id?: unknown;
          name?: unknown;
          url?: unknown;
          teams?: { nodes?: unknown };
        };
        const teams = Array.isArray(project.teams?.nodes) ? project.teams.nodes : null;
        if (
          typeof project.id !== "string" || project.id.length === 0 ||
          typeof project.name !== "string" || project.name.trim().length === 0 ||
          typeof project.url !== "string" || !project.url.startsWith("https://linear.app/") ||
          teams === null || teams.length === 0
        ) throw new Error("Linear project catalog response is invalid");
        const validatedTeams = teams.map((rawTeam) => {
          const team = rawTeam as { id?: unknown; name?: unknown; key?: unknown };
          if (
            typeof team.id !== "string" || team.id.length === 0 ||
            typeof team.name !== "string" || team.name.trim().length === 0 ||
            typeof team.key !== "string" || team.key.length === 0
          ) throw new Error("Linear project catalog response is invalid");
          return { id: team.id, name: team.name.trim(), key: team.key };
        }).sort((left, right) => left.key.localeCompare(right.key) || left.id.localeCompare(right.id));
        projects.push({
          projectId: project.id,
          name: project.name.trim(),
          url: project.url,
          teams: validatedTeams,
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      if (
        typeof connection.pageInfo.endCursor !== "string" ||
        connection.pageInfo.endCursor.length === 0 ||
        connection.pageInfo.endCursor === after || page === 100
      ) throw new Error("Linear project catalog paging is invalid");
      after = connection.pageInfo.endCursor;
    }
    const ids = projects.map((project) => project.projectId);
    if (new Set(ids).size !== ids.length) throw new Error("Linear project catalog has duplicates");
    return projects.sort((left, right) => left.name.localeCompare(right.name) ||
      left.projectId.localeCompare(right.projectId));
  }

  private async findComment(issueId: string, marker: string): Promise<string | null> {
    return (await this.findCommentRecord(issueId, marker))?.id ?? null;
  }

  private async findCommentRecord(
    issueId: string,
    marker: string,
  ): Promise<{ id: string; body: string } | null> {
    const payload = await this.graphql(
      `query DeosIssueComments($id: String!) {
         issue(id: $id) { comments { nodes { id body } } }
       }`,
      { id: issueId },
    ) as { data?: { issue?: { comments?: { nodes?: Array<{ id?: string; body?: string }> } } } };
    const match = payload.data?.issue?.comments?.nodes?.find((comment) => comment.id === marker);
    return typeof match?.id === "string" && typeof match.body === "string"
      ? { id: match.id, body: match.body }
      : null;
  }

  private async graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const response = await this.request(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw await responseError("Linear capability request failed", response);
    const payload = await response.json() as { errors?: unknown[] };
    if (payload.errors?.length) throw new Error(`Linear capability GraphQL request failed: ${JSON.stringify(payload.errors)}`, { cause: payload });
    return payload;
  }
}
