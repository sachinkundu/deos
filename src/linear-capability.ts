export interface LinearNoteRequest {
  issueId: string;
  body: string;
}

export interface LinearNoteReceipt {
  commentId: string;
  reconciled: boolean;
}

export interface LinearIssueLabelObservation {
  issueId: string;
  labels: readonly string[];
  observedUpdatedAt: string;
  providerDigest: string;
}

export interface LinearPublicationContext {
  issueId: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
}

const sha256Hex = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

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

  async readIssueLabels(issueId: string): Promise<LinearIssueLabelObservation> {
    const payload = await this.graphql(
      `query DeosIssueLabels($id: String!) {
         issue(id: $id) {
           id
           updatedAt
           labels { nodes { id name } }
         }
       }`,
      { id: issueId },
    ) as {
      data?: {
        issue?: {
          id?: string;
          updatedAt?: string;
          labels?: { nodes?: Array<{ id?: string; name?: string }> };
        } | null;
      };
    };
    const issue = payload.data?.issue;
    if (issue === null || issue === undefined || issue.id !== issueId) {
      throw new Error("Linear issue label read is unavailable");
    }
    if (typeof issue.updatedAt !== "string" || !Array.isArray(issue.labels?.nodes)) {
      throw new Error("Linear issue label response is invalid");
    }
    const labels = issue.labels.nodes.map((label) => {
      if (typeof label.id !== "string" || typeof label.name !== "string" || label.name.length === 0) {
        throw new Error("Linear issue label response is invalid");
      }
      return { id: label.id, name: label.name };
    }).sort((left, right) => left.id.localeCompare(right.id));
    const names = labels.map((label) => label.name);
    if (new Set(names).size !== names.length) {
      throw new Error("Linear issue label response is ambiguous");
    }
    return Object.freeze({
      issueId,
      labels: Object.freeze([...names].sort()),
      observedUpdatedAt: issue.updatedAt,
      providerDigest: await sha256Hex(JSON.stringify({ issueId, updatedAt: issue.updatedAt, labels })),
    });
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
