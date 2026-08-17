export interface LinearNoteRequest {
  issueId: string;
  body: string;
}

export interface LinearNoteReceipt {
  commentId: string;
  reconciled: boolean;
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

  private async findComment(issueId: string, marker: string): Promise<string | null> {
    const payload = await this.graphql(
      `query DeosIssueComments($id: String!) {
         issue(id: $id) { comments { nodes { id body } } }
       }`,
      { id: issueId },
    ) as { data?: { issue?: { comments?: { nodes?: Array<{ id?: string; body?: string }> } } } };
    const match = payload.data?.issue?.comments?.nodes?.find((comment) => comment.body?.includes(marker));
    return typeof match?.id === "string" ? match.id : null;
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
