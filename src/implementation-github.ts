import { responseError } from "./error-details.ts";
import { GitHubAppTokenProvider } from "./github-capability.ts";
import {
  BaseChangedError,
  ImplementationError,
  requireSha,
  type ImplementationCandidate,
  type TreeFile,
} from "./implementation-contract.ts";
import {
  ImplementationStore,
  type ImplementationRun,
} from "./implementation-store.ts";
import type { OrchestrationRunRecord } from "./orchestration-store.ts";

export interface ImplementationPull {
  id: number;
  number: number;
  html_url: string;
  body: string | null;
  state: string;
  merged: boolean;
  merge_commit_sha: string | null;
  head: { sha: string; ref: string };
  base: { ref: string; repo: { full_name: string } };
}
interface Commit {
  sha: string;
  tree: { sha: string };
  parents: { sha: string }[];
}
interface BranchPublication {
  branch_sequence: number;
  commit_sha: string | null;
  prior_ref_sha: string | null;
  status: string;
}
export class ImplementationGitHub {
  private tokenValue: string | null = null;
  readonly apiUrl: string;
  readonly repository: string;
  readonly tokens: { token(): Promise<string> };
  readonly request: typeof fetch;
  constructor(
    apiUrl: string,
    repository: string,
    tokens: { token(): Promise<string> },
    request: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.apiUrl = apiUrl;
    this.repository = repository;
    this.tokens = tokens;
    this.request = request;
  }
  async json<T>(path: string, init?: RequestInit, missing = false): Promise<T> {
    this.tokenValue ??= await this.tokens.token();
    const response = await this.request(
      `${this.apiUrl}/repos/${this.repository}${path}`,
      {
        ...init,
        redirect: "manual",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.tokenValue}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "deos-implementation",
          "Content-Type": "application/json",
          ...init?.headers,
        },
      },
    );
    if (missing && response.status === 404) return null as T;
    if (!response.ok)
      throw await responseError(
        `GitHub implementation ${init?.method ?? "GET"} ${path}`,
        response,
      );
    return response.status === 204 ? null as T : (await response.json()) as T;
  }
  async ref(branch: string, missing = false): Promise<string | null> {
    const row = await this.json<{ object: { sha: string } } | null>(
      `/git/ref/heads/${branch.split("/").map(encodeURIComponent).join("/")}`,
      undefined,
      missing,
    );
    return row === null ? null : requireSha(row.object.sha);
  }
  async file(path: string, ref: string) {
    const row = await this.json<{ encoding: string; content: string }>(
      `/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(ref)}`,
    );
    if (row.encoding !== "base64")
      throw new ImplementationError(
        "github_file_encoding",
        `Unsupported GitHub file encoding: ${path}`,
      );
    return new TextDecoder().decode(
      Uint8Array.from(atob(row.content.replace(/\s/g, "")), (c) =>
        c.charCodeAt(0),
      ),
    );
  }
  async reachable(ancestor: string, head: string) {
    const result = await this.json<{ status: string }>(
      `/compare/${requireSha(ancestor)}...${requireSha(head)}`,
    );
    if (!["ahead", "identical"].includes(result.status))
      throw new ImplementationError(
        "approved_design_unreachable",
        "Approved design commit is not reachable from the tested base",
      );
  }
  async feedback(number: number) {
    const all = async (path: string) => {
      const result: unknown[] = [];
      for (let page = 1; ; page++) {
        const rows = await this.json<unknown[]>(
          `${path}?per_page=100&page=${page}`,
        );
        result.push(...rows);
        if (rows.length < 100) return result;
      }
    };
    return {
      trust: "untrusted provider data",
      reviews: await all(`/pulls/${number}/reviews`),
      comments: await all(`/pulls/${number}/comments`),
      discussionComments: await all(`/issues/${number}/comments`),
    };
  }
  async current(run: ImplementationRun) {
    const base = await this.ref("main");
    if (base !== run.tested_base_sha) throw new BaseChangedError(base!);
    await this.reachable(run.approved_design_sha, base);
    const { sha256Hex } = await import("./implementation-hash.ts");
    for (const file of JSON.parse(run.approved_files_json) as {
      path: string;
      sha256: string;
    }[]) {
      if ((await sha256Hex(await this.file(file.path, base))) !== file.sha256)
        throw new ImplementationError(
          "approved_file_changed",
          `Approved file changed on base: ${file.path}`,
        );
    }
  }
  commit(sha: string) {
    return this.json<Commit>(`/git/commits/${requireSha(sha)}`);
  }
  async matches(sha: string | null, base: string, tree: string) {
    if (!sha) return false;
    const commit = await this.commit(sha);
    return (
      commit.tree.sha === tree &&
      commit.parents.length === 1 &&
      commit.parents[0].sha === base
    );
  }
  async compareAndSwapRef(
    branch: string,
    expected: string | null,
    next: string,
  ) {
    requireSha(next);
    if (expected) requireSha(expected);
    if (
      !/^deos\/agent\/[A-Z][A-Z0-9]*-[1-9][0-9]*\/run-[1-9][0-9]*$/.test(branch)
    )
      throw new ImplementationError(
        "branch_scope",
        "Only the reserved implementation ref may be written",
      );
    this.tokenValue ??= await this.tokens.token();
    const encoder = new TextEncoder();
    // receive-pack compares the old object ID atomically on the Git server.
    // All new objects already exist after the verified GitHub object API writes.
    const command = encoder.encode(
      `${expected ?? "0".repeat(40)} ${next} refs/heads/${branch}\0report-status\n`,
    );
    const prefix = encoder.encode(
      (command.byteLength + 4).toString(16).padStart(4, "0"),
    );
    const pack = new Uint8Array([80, 65, 67, 75, 0, 0, 0, 2, 0, 0, 0, 0]);
    const checksum = new Uint8Array(await crypto.subtle.digest("SHA-1", pack));
    const body = new Uint8Array(
      prefix.length + command.length + 4 + pack.length + checksum.length,
    );
    let offset = 0;
    for (const part of [
      prefix,
      command,
      encoder.encode("0000"),
      pack,
      checksum,
    ]) {
      body.set(part, offset);
      offset += part.length;
    }
    const host =
      new URL(this.apiUrl).hostname === "api.github.com"
        ? "github.com"
        : new URL(this.apiUrl).hostname;
    const response = await this.request(
      `https://${host}/${this.repository}.git/git-receive-pack`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          Authorization: `Basic ${btoa(`x-access-token:${this.tokenValue}`)}`,
          "User-Agent": "deos-implementation",
          "Content-Type": "application/x-git-receive-pack-request",
          Accept: "application/x-git-receive-pack-result",
        },
        body,
      },
    );
    if (!response.ok)
      throw await responseError(
        "GitHub atomic implementation ref update",
        response,
      );
    const result = await response.text();
    if (
      !result.includes("unpack ok") ||
      !result.includes(`ok refs/heads/${branch}\n`) ||
      result.includes(`ng refs/heads/${branch}`)
    )
      throw new ImplementationError(
        "branch_cas_rejected",
        `Git server rejected implementation ref update: ${result}`,
      );
  }
  async writeBranch(
    store: ImplementationStore,
    run: ImplementationRun,
    candidate: ImplementationCandidate,
  ) {
    await this.current(run);
    const now = new Date().toISOString();
    await store.db
      .prepare(
        `INSERT OR IGNORE INTO implementation_branch_publications
      (run_id,branch_sequence,tested_base_sha,tree_sha,operation_key,prior_ref_sha,status,created_at)
      SELECT ?,COALESCE(MAX(branch_sequence),0)+1,?,?,?,?, 'pending',? FROM implementation_branch_publications WHERE run_id=?`,
      )
      .bind(
        run.run_id,
        run.tested_base_sha,
        candidate.treeSha,
        `${run.run_id}:${run.tested_base_sha}:${candidate.treeSha}`,
        run.pr_head_sha,
        now,
        run.run_id,
      )
      .run();
    const publication = await store.db
      .prepare(
        "SELECT * FROM implementation_branch_publications WHERE run_id=? AND tested_base_sha=? AND tree_sha=?",
      )
      .bind(run.run_id, run.tested_base_sha, candidate.treeSha)
      .first<BranchPublication>();
    if (!publication)
      throw new ImplementationError(
        "branch_operation_missing",
        "Branch publication allocation failed",
      );
    let head = await this.ref(run.branch, true);
    if (await this.matches(head, run.tested_base_sha, candidate.treeSha)) {
      await this.saveBranch(store, run, publication.branch_sequence, head!);
      return head!;
    }
    if (head !== publication.prior_ref_sha)
      throw new ImplementationError(
        "branch_conflict",
        `Run branch has unrelated head ${head}`,
      );
    const base = await this.commit(run.tested_base_sha);
    const entries = [];
    for (const file of candidate.files) {
      if (file.contentBase64 === null) {
        entries.push({
          path: file.path,
          mode: file.mode,
          type: "blob",
          sha: null,
        });
        continue;
      }
      const blob = await this.json<{ sha: string }>("/git/blobs", {
        method: "POST",
        body: JSON.stringify({
          content: file.contentBase64,
          encoding: "base64",
        }),
      });
      if (blob.sha !== file.sha)
        throw new ImplementationError(
          "blob_hash",
          "GitHub blob differs from the accepted bytes",
        );
      entries.push({
        path: file.path,
        mode: file.mode,
        type: "blob",
        sha: blob.sha,
      });
    }
    const tree = await this.json<{ sha: string }>("/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: base.tree.sha, tree: entries }),
    });
    if (tree.sha !== candidate.treeSha)
      throw new ImplementationError(
        "tree_hash",
        `GitHub tree ${tree.sha} differs from checked tree ${candidate.treeSha}`,
      );
    let commit = publication.commit_sha;
    if (!commit) {
      // Fixed author time makes a retry create the same content-addressed commit.
      const row = await this.json<{ sha: string }>("/git/commits", {
        method: "POST",
        body: JSON.stringify({
          message: `${run.linear_identifier}: implementation`,
          tree: tree.sha,
          parents: [run.tested_base_sha],
          author: {
            name: "DEOS Workflow",
            email: "deos-workflow@users.noreply.github.com",
            date: run.created_at,
          },
          committer: {
            name: "DEOS Workflow",
            email: "deos-workflow@users.noreply.github.com",
            date: run.created_at,
          },
        }),
      });
      commit = requireSha(row.sha);
      await store.db
        .prepare(
          "UPDATE implementation_branch_publications SET commit_sha=? WHERE run_id=? AND branch_sequence=? AND commit_sha IS NULL",
        )
        .bind(commit, run.run_id, publication.branch_sequence)
        .run();
    }
    await this.current(run);
    head = await this.ref(run.branch, true);
    if (head !== commit) {
      if (head !== publication.prior_ref_sha)
        throw new ImplementationError(
          "branch_conflict",
          "Branch changed before the guarded write",
        );
      try {
        await this.compareAndSwapRef(run.branch, head, commit);
      } catch (error) {
        if ((await this.ref(run.branch, true)) !== commit) throw error;
      }
    }
    if (
      (await this.ref(run.branch)) !== commit ||
      !(await this.matches(commit, run.tested_base_sha, candidate.treeSha))
    )
      throw new ImplementationError(
        "branch_readback",
        "Branch publication read-back differs",
      );
    await this.saveBranch(store, run, publication.branch_sequence, commit);
    return commit;
  }
  private async saveBranch(
    store: ImplementationStore,
    run: ImplementationRun,
    sequence: number,
    head: string,
  ) {
    await store.db.batch([
      store.db
        .prepare(
          "UPDATE implementation_branch_publications SET commit_sha=?,status='accepted',provider_receipt=? WHERE run_id=? AND branch_sequence=?",
        )
        .bind(
          head,
          JSON.stringify({
            head,
            base: run.tested_base_sha,
            tree: run.tree_sha,
          }),
          run.run_id,
          sequence,
        ),
      store.db
        .prepare(
          "UPDATE implementation_runs SET pr_head_sha=?,updated_at=? WHERE run_id=? AND tested_base_sha=? AND tree_sha=?",
        )
        .bind(
          head,
          new Date().toISOString(),
          run.run_id,
          run.tested_base_sha,
          run.tree_sha,
        ),
    ]);
  }
  async publish(
    store: ImplementationStore,
    run: ImplementationRun,
    body: string,
    proofSha: string,
  ) {
    await this.current(run);
    if (
      !run.pr_head_sha ||
      (await this.ref(run.branch)) !== run.pr_head_sha ||
      !(await this.matches(run.pr_head_sha, run.tested_base_sha, run.tree_sha!))
    )
      throw new ImplementationError(
        "publication_subject",
        "Saved implementation branch no longer matches proof",
      );
    const { implementationDigest } = await import(
      "./implementation-contract.ts"
    );
    const digest = await implementationDigest({
      base: run.tested_base_sha,
      tree: run.tree_sha,
      body,
      proofSha,
    });
    await store.db
      .prepare(
        `INSERT OR IGNORE INTO implementation_publications
      (run_id,publication_sequence,publication_digest,tested_base_sha,tree_sha,proof_manifest_sha,body,status,created_at)
      SELECT ?,COALESCE(MAX(publication_sequence),0)+1,?,?,?,?,?,'pending',? FROM implementation_publications WHERE run_id=?`,
      )
      .bind(
        run.run_id,
        digest,
        run.tested_base_sha,
        run.tree_sha,
        proofSha,
        body,
        new Date().toISOString(),
        run.run_id,
      )
      .run();
    const owner = this.repository.split("/")[0];
    const find = () =>
      this.json<ImplementationPull[]>(
        `/pulls?state=all&head=${encodeURIComponent(`${owner}:${run.branch}`)}&base=main&per_page=100`,
      );
    let matches = await find();
    if (matches.length > 1)
      throw new ImplementationError(
        "pr_identity_conflict",
        "Multiple PRs exist for the reserved run branch",
      );
    let pull = matches[0];
    if (!pull) {
      try {
        pull = await this.json<ImplementationPull>("/pulls", {
          method: "POST",
          body: JSON.stringify({
            title: `${run.linear_identifier}: implementation`,
            head: run.branch,
            base: "main",
            body,
            draft: false,
          }),
        });
      } catch (error) {
        matches = await find();
        if (matches.length !== 1) throw error;
        pull = matches[0];
      }
    }
    if (run.pr_number !== null && pull.number !== run.pr_number)
      throw new ImplementationError(
        "pr_identity_conflict",
        "PR identity changed",
      );
    if (pull.state !== "open")
      throw new ImplementationError(
        "pr_closed",
        "Implementation PR was closed outside this gate",
      );
    if (
      pull.head.sha !== run.pr_head_sha ||
      pull.head.ref !== run.branch ||
      pull.base.ref !== "main" ||
      pull.base.repo.full_name !== this.repository
    )
      throw new ImplementationError(
        "pr_subject_changed",
        "Implementation PR changed before publication",
      );
    await this.current(run);
    if (pull.body !== body) {
      try {
        await this.json(`/pulls/${pull.number}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        });
      } catch (error) {
        if (
          (await this.json<ImplementationPull>(`/pulls/${pull.number}`))
            .body !== body
        )
          throw error;
      }
    }
    pull = await this.json<ImplementationPull>(`/pulls/${pull.number}`);
    if (
      pull.head.sha !== run.pr_head_sha ||
      pull.head.ref !== run.branch ||
      pull.base.ref !== "main" ||
      pull.base.repo.full_name !== this.repository ||
      pull.body !== body
    )
      throw new ImplementationError(
        "pr_readback",
        "Implementation PR head, base or body differs from publication",
      );
    await this.current(run);
    await store.db.batch([
      store.db
        .prepare(
          "UPDATE implementation_publications SET status='accepted',provider_receipt=? WHERE run_id=? AND publication_digest=?",
        )
        .bind(
          JSON.stringify({
            number: pull.number,
            head: pull.head.sha,
            url: pull.html_url,
          }),
          run.run_id,
          digest,
        ),
      store.db
        .prepare(
          "UPDATE implementation_runs SET pr_number=?,pr_url=?,status='review',updated_at=? WHERE run_id=?",
        )
        .bind(pull.number, pull.html_url, new Date().toISOString(), run.run_id),
    ]);
    return pull;
  }
}
export function implementationGitHub(env: Env, run: OrchestrationRunRecord) {
  if (!run.route_repository || !run.route_github_installation_id)
    throw new ImplementationError(
      "route_missing",
      "Frozen GitHub route missing",
    );
  return new ImplementationGitHub(
    env.GITHUB_API_URL,
    run.route_repository,
    new GitHubAppTokenProvider({
      apiUrl: env.GITHUB_API_URL,
      appId: env.GITHUB_APP_ID,
      privateKey: env.GITHUB_APP_PRIVATE_KEY,
      installationId: run.route_github_installation_id,
    }),
  );
}
