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

  async upsertNote(input: LinearNoteRequest, operationId: string): Promise<LinearNoteReceipt> {
    const marker = `<!-- deos-operation:${operationId} -->`;
    const existing = await this.findComment(input.issueId, marker);
    if (existing !== null) return { commentId: existing, reconciled: true };
    try {
      const payload = await this.graphql(
        `mutation DeosCreateComment($issueId: String!, $body: String!) {
           commentCreate(input: { issueId: $issueId, body: $body }) {
             success
             comment { id }
           }
         }`,
        { issueId: input.issueId, body: `${input.body}\n\n${marker}` },
      ) as { data?: { commentCreate?: { success?: boolean; comment?: { id?: string } } } };
      const id = payload.data?.commentCreate?.comment?.id;
      if (payload.data?.commentCreate?.success !== true || typeof id !== "string") {
        throw new Error("Linear comment response is invalid");
      }
      return { commentId: id, reconciled: false };
    } catch {
      const reconciled = await this.findComment(input.issueId, marker);
      if (reconciled === null) throw new Error("Linear comment creation is ambiguous");
      return { commentId: reconciled, reconciled: true };
    }
  }

  async upsertStatus(input: LinearStatusRequest): Promise<LinearNoteReceipt> {
    if (!/^[a-z0-9][a-z0-9:._-]{7,299}$/i.test(input.markerId)) {
      throw new Error("Linear status marker is invalid");
    }
    const marker = `<!-- deos-status:${input.markerId} -->`;
    const desired = `${input.body}\n\n${marker}`;
    const existing = await this.findCommentRecord(input.issueId, marker);
    if (existing?.body === desired) return { commentId: existing.id, reconciled: true };
    if (existing === null) {
      try {
        const payload = await this.graphql(
          `mutation DeosCreateStatusComment($issueId: String!, $body: String!) {
             commentCreate(input: { issueId: $issueId, body: $body }) {
               success
               comment { id }
             }
           }`,
          { issueId: input.issueId, body: desired },
        ) as { data?: { commentCreate?: { success?: boolean; comment?: { id?: string } } } };
        const id = payload.data?.commentCreate?.comment?.id;
        if (payload.data?.commentCreate?.success !== true || typeof id !== "string") {
          throw new Error("Linear status comment response is invalid");
        }
        return { commentId: id, reconciled: false };
      } catch {
        const recovered = await this.findCommentRecord(input.issueId, marker);
        if (recovered?.body !== desired) throw new Error("Linear status comment creation is ambiguous");
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
    } catch {
      const recovered = await this.findCommentRecord(input.issueId, marker);
      if (recovered?.id !== existing.id || recovered.body !== desired) {
        throw new Error("Linear status comment update is ambiguous");
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
    const match = payload.data?.issue?.comments?.nodes?.find((comment) => comment.body?.includes(marker));
    return typeof match?.id === "string" && typeof match.body === "string"
      ? { id: match.id, body: match.body }
      : null;
  }

  private async graphql(query: string, variables: Record<string, string>): Promise<unknown> {
    const response = await this.request(this.apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new Error("Linear capability request failed");
    const payload = await response.json() as { errors?: unknown[] };
    if (payload.errors?.length) throw new Error("Linear capability GraphQL request failed");
    return payload;
  }
}
