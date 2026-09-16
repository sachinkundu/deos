import { getSandbox } from "@cloudflare/sandbox";
import {
  ImplementationStore,
  type ImplementationInput,
} from "./implementation-store.ts";
import {
  ImplementationError,
  type ProofSubject,
  type ImplementationProof,
} from "./implementation-contract.ts";
import {
  ImplementationBrowserAllocator,
  CloudflareBrowserProvider,
  BrowserCapacityWait,
  browserCommand,
} from "./implementation-browser.ts";
import type { CapabilityClaims } from "./capability-auth.ts";
import { readResponseText, responseError } from "./error-details.ts";
import { recordCaughtError } from "./error-context.ts";
import { ImplementationProviderTest } from "./implementation-provider-test.ts";
import { previewRelayHost, previewRelayProgram, previewRelaySandboxId, waitForPreviewRelay } from "./implementation-preview.ts";
import { reconcileImplementationPreview } from "./implementation-preview-reconciliation.ts";
import { ImplementationHostedPreview, hostedPreviewOrigin, type HostedPreviewEnv } from "./implementation-hosted-preview.ts";
import { sha256Hex } from "./implementation-hash.ts";

export class ImplementationBroker {
  readonly store: ImplementationStore;
  readonly env: Env;
  constructor(env: Env) {
    this.env = env;
    this.store = new ImplementationStore(env.DB, env.ARTIFACTS);
  }
  async handle(claims: CapabilityClaims, value: unknown): Promise<Response> {
    if (!claims.actions.includes("implementation.tools"))
      return Response.json({ error: "implementation_denied" }, { status: 403 });
    if (typeof value !== "object" || !value || Array.isArray(value))
      return Response.json({ error: "invalid_request" }, { status: 400 });
    const request = value as Record<string, unknown>;
    try {
      const work = await this.store.requireRun(claims.runId);
      const attempt = await this.env.DB.prepare(
        `SELECT t.*,a.sandbox_tier,a.state AS agent_state FROM implementation_tries t
        JOIN agent_attempts a ON a.attempt_id=t.attempt_id WHERE t.attempt_id=? AND t.run_id=?`,
      )
        .bind(claims.attemptId, claims.runId)
        .first<{
          sandbox_id: string;
          sandbox_tier: "basic" | "standard-2";
          status: string;
          agent_state: string;
        }>();
      if (
        !attempt ||
        attempt.status !== "running" ||
        attempt.agent_state !== "running"
      )
        throw new ImplementationError(
          "attempt_inactive",
          "Implementation capability has expired",
        );
      const input = await this.store.read<ImplementationInput>(
        work.input_key,
        work.input_sha,
      );
      const subject = request.subject as ProofSubject;
      if (
        request.action !== "preview" &&
        (!subject ||
          subject.change !== work.change_id ||
          subject.approvedDesignSha !== work.approved_design_sha ||
          subject.testedBaseSha !== work.tested_base_sha ||
          !/^[a-f0-9]{40}$/.test(subject.treeSha))
      )
        throw new ImplementationError(
          "subject_invalid",
          "Tool subject differs from the checked run",
        );
      if (request.action === "verify") {
        // Compatibility for an older supervisor finishing during rollout.
        // The workflow acknowledges completion; it does not review the work.
        return Response.json({ ready: true, subject });
      }
      if (request.action === "safe_test") {
        const result = await new ImplementationProviderTest(this.env).call(claims.runId, claims.attemptId, input.policy.safeAdapters, request);
        if ("providerDeliveryId" in result && "evidence" in result) {
          const proof = await this.proof(claims, subject, "provider_originated",
            this.sanitize(JSON.stringify(result.evidence)), "application/json",
            "Real GitHub review and signed Linear event on this try's isolated resources", result.providerDeliveryId);
          return Response.json({ ...result, proof });
        }
        return Response.json(result);
      }
      if (request.action === "preview") {
        if (request.port !== 8787)
          throw new ImplementationError(
            "preview_port",
            "Only the assigned test port may be exposed",
          );
        const row = await this.store.allocateResource(
          claims.runId,
          claims.attemptId,
          "preview",
          "sandbox-tunnel",
        );
        if (row.status === "ready")
          return Response.json({ origin: row.preview_origin });
        if (row.status === "quarantined" || (row.status === "allocating" && row.create_window)) {
          return Response.json(await reconcileImplementationPreview(this.store, row, {
            listTunnels: relayId => getSandbox(this.env.Sandbox, relayId, {normalizeId:true,keepAlive:true}).tunnels.list(),
            fetch: globalThis.fetch.bind(globalThis), now: () => new Date(),
          }));
        }
        if (row.status !== "allocating")
          throw new ImplementationError(
            "preview_quarantined",
            "Preview allocation needs reconciliation",
          );
        const relaySandboxId = await previewRelaySandboxId(claims.attemptId);
        const claimed = await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=?,create_window=? WHERE resource_id=? AND status='allocating' AND create_window IS NULL")
          .bind(JSON.stringify({relaySandboxId}), new Date().toISOString(), row.resource_id).run();
        if (claimed.meta.changes !== 1)
          throw new ImplementationError("preview_allocation_in_flight", "Preview allocation already started");
        try {
          const relay = getSandbox(this.env.Sandbox, relaySandboxId, {normalizeId:true,keepAlive:true});
          await relay.setOutboundByHost(previewRelayHost, "implementationPreview", {runId:claims.runId,attemptId:claims.attemptId});
          await relay.writeFile("/tmp/implementation-preview.mjs", previewRelayProgram);
          const process = await relay.exec(["node", "/tmp/implementation-preview.mjs"]);
          await process.waitForPort(8787, {timeout:30_000});
          const tunnel = await relay.tunnels.get(8787);
          const origin = new URL(tunnel.url).origin;
          if (!new URL(origin).hostname.endsWith(".trycloudflare.com"))
            throw new ImplementationError(
              "preview_origin",
              "Expected a fresh isolated quick tunnel",
            );
          const recorded = await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=? WHERE resource_id=? AND status='allocating'")
            .bind(JSON.stringify({relaySandboxId, tunnel}), row.resource_id).run();
          if (recorded.meta.changes !== 1)
            throw new ImplementationError("preview_reconciliation_changed", "Preview allocation changed before readiness was checked");
          const readiness = await this.store.put(claims.runId, "preview-readiness.json",
            this.sanitize(JSON.stringify({origin, observations: await waitForPreviewRelay(origin)})));
          await this.env.DB.prepare(
            "UPDATE implementation_resources SET status='ready',provider_resource_id=?,preview_origin=?,metadata_json=?,updated_at=? WHERE resource_id=? AND status='allocating'",
          )
            .bind(origin, origin, JSON.stringify({relaySandboxId, tunnel, readiness}), new Date().toISOString(), row.resource_id)
            .run();
          return Response.json({ origin });
        } catch (error) {
          try {
            await this.env.DB.prepare("UPDATE implementation_resources SET status='quarantined' WHERE resource_id=? AND status='allocating'")
              .bind(row.resource_id).run();
          } catch (secondary) { recordCaughtError(secondary, "preview.quarantine"); }
          throw error;
        }
      }
      if (request.action === "document" || request.action === "search") {
        const search = request.action === "search";
        let url = search
          ? new URL(`https://${String(request.host)}/llms.txt`)
          : new URL(String(request.url));
        const allowed = (target: URL) =>
          target.protocol === "https:" &&
          !target.username &&
          !target.password &&
          !target.port &&
          input.policy.documentationHosts.includes(target.hostname) &&
          (target.hostname !== "linear.app" ||
            target.pathname.startsWith("/developers/"));
        let response: Response | undefined;
        for (let redirects = 0; redirects <= 5; redirects++) {
          if (!allowed(url))
            throw new ImplementationError(
              "documentation_denied",
              "Document is outside the saved first-party policy",
            );
          response = await fetch(url, {
            redirect: "manual",
            headers: { Accept: "text/markdown,text/plain,text/html" },
          });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get("location");
          if (!location || redirects === 5)
            throw new ImplementationError(
              "documentation_redirect",
              "Document redirect cannot be followed safely",
            );
          url = new URL(location, url);
        }
        if (!response?.ok)
          throw await responseError("First-party document fetch", response!);
        const content = await readResponseText(response);
        const title =
          /<title[^>]*>([^<]+)<\/title>/i.exec(content)?.[1] ?? url.pathname;
        const object = await this.store.put(
          claims.runId,
          "document.txt",
          content,
          "text/plain",
        );
        const accessId = crypto.randomUUID();
        await this.env.DB.prepare(
          "INSERT INTO implementation_doc_access VALUES (?,?,?,?,?,?,?,?,?)",
        )
          .bind(
            accessId,
            claims.runId,
            claims.attemptId,
            url.href,
            title,
            search ? 0 : 1,
            object.key,
            object.sha256,
            new Date().toISOString(),
          )
          .run();
        if (search) {
          const terms = String(request.query ?? "")
            .toLowerCase()
            .split(/\s+/)
            .filter(Boolean);
          return Response.json({
            results: content
              .split("\n")
              .filter((line) =>
                terms.some((term) => line.toLowerCase().includes(term)),
              ),
          });
        }
        return Response.json({ url: url.href, title, content, accessId });
      }
      if (request.action === "showboat") {
        const command = request.command as {
          command: string;
          exitCode: number;
          stdout: string;
          stderr: string;
        };
        if (
          !command ||
          typeof command.exitCode !== "number" ||
          typeof command.stdout !== "string" ||
          typeof command.stderr !== "string"
        )
          throw new ImplementationError(
            "showboat_failed",
            "Command result must include its exit code, stdout and stderr",
          );
        if (
          typeof request.document !== "string" ||
          !request.document.includes("```output") ||
          !request.document.includes("```bash")
        )
          throw new ImplementationError(
            "showboat_document",
            "Trusted Showboat output is missing",
          );
        const text = this.sanitize(request.document);
        return Response.json(
          await this.proof(
            claims,
            subject,
            "showboat",
            text,
            "text/markdown",
            this.sanitize(command.command),
          ),
        );
      }
      if (request.action === "browser") {
        if (request.target !== undefined && request.target !== 'local' && request.target !== 'hosted')
          throw new ImplementationError('browser_target', 'Browser target must be local or hosted');
        const hosted = await new ImplementationHostedPreview(this.env).latest(work);
        const hostedOrigin = request.target === 'hosted' ? hostedPreviewOrigin(hosted, subject) : null;
        const preview = await this.store.resource(claims.attemptId, "preview");
        if (!preview?.preview_origin)
          throw new ImplementationError(
            "preview_missing",
            "Start the safe preview before opening a browser",
          );
        await this.store.assertResource(
          claims.runId,
          claims.attemptId,
          preview.resource_id,
        );
        const allocator = new ImplementationBrowserAllocator(
          this.store,
          new CloudflareBrowserProvider(this.env.IMPLEMENTATION_BROWSER),
        );
        const browser = await allocator.acquire(
          claims.runId,
          claims.attemptId,
          preview.preview_origin,
          hosted ? [hosted.origin] : [],
        );
        await this.store.assertResource(
          claims.runId,
          claims.attemptId,
          browser.resource_id,
          browser.provider_resource_id!,
        );
        if (
          !["reset", "navigate", "state", "click", "fill", "press", "wait", "viewport", "trace", "measure", "screenshot"].includes(
            String(request.operation),
          )
        )
          throw new ImplementationError(
            "browser_operation",
            "Browser operation is unsupported",
          );
        const origin = hostedOrigin ?? preview.preview_origin;
        const metadata = JSON.parse(browser.metadata_json);
        // A failed navigation must not leave a previous page's successful status
        // available to a later screenshot, including when switching targets.
        if (request.operation === 'navigate' || request.operation === 'reset') {
          await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=json_remove(metadata_json,'$.documentStatus','$.documentOrigin') WHERE resource_id=? AND status='ready'")
            .bind(browser.resource_id).run();
        }
        const result = await browserCommand(
          this.env.IMPLEMENTATION_BROWSER,
          browser.provider_resource_id!,
          origin,
          {
            operation: request.operation as
              | "reset"
              | "navigate"
              | "state"
              | "click"
              | "fill"
              | "press"
              | "wait"
              | "viewport"
              | "trace"
              | "measure"
              | "screenshot",
            url: typeof request.url === "string" ? request.url : undefined,
            selector:
              typeof request.selector === "string"
                ? request.selector
                : undefined,
            text: typeof request.text === "string" ? request.text : undefined,
            key: typeof request.key === "string" ? request.key : undefined,
            width: typeof request.width === "number" ? request.width : undefined,
            height: typeof request.height === "number" ? request.height : undefined,
            viewport: metadata.viewport,
            traceEnabled: metadata.traceEnabled,
            enabled: typeof request.enabled === 'boolean' ? request.enabled : undefined,
            modifiers: request.modifiers as string[] | undefined,
            documentStatus: metadata.documentOrigin === origin || (!metadata.documentOrigin && !hostedOrigin)
              ? metadata.documentStatus : undefined,
          },
        );
        if (result.viewport) {
          await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=json_set(metadata_json,'$.viewport',json(?)) WHERE resource_id=? AND status='ready' AND provider_resource_id=?")
            .bind(JSON.stringify(result.viewport),browser.resource_id,browser.provider_resource_id).run();
        }
        if (result.traceEnabled !== undefined) {
          await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=json_set(metadata_json,'$.traceEnabled',json(?)) WHERE resource_id=? AND status='ready' AND provider_resource_id=?")
            .bind(JSON.stringify(result.traceEnabled),browser.resource_id,browser.provider_resource_id).run();
        }
        if (result.documentStatus !== undefined) {
          await this.env.DB.prepare("UPDATE implementation_resources SET metadata_json=json_set(metadata_json,'$.documentStatus',?,'$.documentOrigin',?),updated_at=? WHERE resource_id=? AND status='ready' AND provider_resource_id=?")
            .bind(result.documentStatus, origin, new Date().toISOString(), browser.resource_id, browser.provider_resource_id).run();
        }
        if ("image" in result && result.image) {
          const proof = await this.proof(
            claims,
            subject,
            "browser_image",
            result.image,
            "image/png",
            this.sanitize(`${String(request.caption ?? 'Changed state in the isolated preview')}\nCaptured from ${result.url}${hostedOrigin ? `; checked maintainer deployment ${hosted!.registrationId}` : ''}`),
            undefined,
            await sha256Hex(JSON.stringify([origin, hostedOrigin ? hosted!.registrationId : 'local',
              request.captureId ?? null, request.caption ?? null])),
          );
          return Response.json({
            url: result.url,
            documentStatus: result.documentStatus,
            viewport: result.viewport,
            traceEnabled: result.traceEnabled,
            console: result.console,
            proof,
            imageBase64: Buffer.from(result.image).toString("base64"),
          });
        }
        if ('measurements' in result && result.measurements) {
          const proof = await this.proof(claims,subject,'showboat',
            `# Live browser measurements\n\nCaptured from ${result.url}\n\n\`\`\`json\n${JSON.stringify(result.measurements,null,2)}\n\`\`\`\n`,
            'text/markdown',this.sanitize(`Live browser layout and displayed text from ${result.url}`));
          return Response.json({...result,proof});
        }
        return Response.json(result);
      }
      throw new ImplementationError(
        "operation_denied",
        "This implementation capability cannot access provider writes, approvals or release",
      );
    } catch (error) {
      if (error instanceof BrowserCapacityWait)
        return Response.json(
          { error: error.code, retryAfterMs: error.retryAfterMs },
          {
            status: 429,
            headers: {
              "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)),
            },
          },
        );
      if (request.action === "browser") {
        const resource = await this.store.resource(claims.attemptId, "browser");
        if (
          resource?.status === "quarantined" &&
          resource.quarantine_until &&
          Date.parse(resource.quarantine_until) > Date.now()
        ) {
          return Response.json(
            {
              error: "browser_quarantined",
              retryAfterMs: Date.parse(resource.quarantine_until) - Date.now(),
            },
            { status: 409 },
          );
        }
      }
      await this.store.error(
        claims.runId,
        claims.attemptId,
        `tool.${String(request.action)}`,
        error,
      );
      return Response.json(
        {
          error:
            error instanceof ImplementationError
              ? error.code
              : "implementation_tool_failed",
          message: this.sanitize(
            error instanceof Error ? error.message : String(error),
          ),
        },
        { status: 400 },
      );
    }
  }
  sanitize(text: string): string {
    const secrets = [
      this.env.LINEAR_APP_ACCESS_TOKEN,
      this.env.GITHUB_APP_PRIVATE_KEY,
      this.env.CODEX_AUTH_ENCRYPTION_KEY,
      this.env.CAPABILITY_SIGNING_SECRET,
      this.env.OPENROUTER_API_KEY,
      (this.env as HostedPreviewEnv).IMPLEMENTATION_PAGES_READ_TOKEN,
    ];
    for (const secret of secrets)
      if (secret && secret.length > 8)
        text = text.replaceAll(secret, "[redacted]");
    return text
      .replace(
        /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{16,}|lin_api_[A-Za-z0-9]+)\b/g,
        "[redacted]",
      )
      .replace(/(Bearer\s+)[A-Za-z0-9._~-]{16,}/gi, "$1[redacted]");
  }
  async proof(
    claims: CapabilityClaims,
    subject: ProofSubject,
    kind: "showboat" | "browser_image" | "provider_originated",
    content: string | Uint8Array,
    mediaType: string,
    caption: string,
    providerDeliveryId?: string,
    captureScope?: string,
  ): Promise<ImplementationProof> {
    const filename = kind === "browser_image" ? "browser.png" : kind === "provider_originated" ? "provider-proof.json" : "showboat.md";
    // Identical bytes can be captured again for another attempt or tree. The
    // database owns one receipt per capture identity, including its object key.
    const object = await this.store.put(
      claims.runId,
      `proof/${encodeURIComponent(claims.attemptId)}/${subject.treeSha}/${captureScope ? `${captureScope}/` : ''}${filename}`,
      content,
      mediaType,
    );
    const id = `${claims.attemptId}:${subject.treeSha}:${kind}:${captureScope ? `${captureScope}:` : ''}${object.sha256}`;
    await this.env.DB.prepare(
      `INSERT INTO implementation_proof
      (proof_id,run_id,attempt_id,kind,approved_design_sha,tested_base_sha,tree_sha,r2_key,sha256,byte_size,media_type,caption,sanitized,created_at,provider_delivery_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(proof_id) DO NOTHING`,
    )
      .bind(
        id,
        claims.runId,
        claims.attemptId,
        kind,
        subject.approvedDesignSha,
        subject.testedBaseSha,
        subject.treeSha,
        object.key,
        object.sha256,
        object.byteSize,
        mediaType,
        caption,
        new Date().toISOString(),
        providerDeliveryId ?? null,
      )
      .run();
    const saved = await this.env.DB.prepare(
      `SELECT r2_key,caption FROM implementation_proof WHERE proof_id=? AND run_id=? AND attempt_id=?
       AND tree_sha=? AND sha256=? AND approved_design_sha=? AND tested_base_sha=? AND sanitized=1`,
    ).bind(id, claims.runId, claims.attemptId, subject.treeSha, object.sha256,
      subject.approvedDesignSha, subject.testedBaseSha).first<{r2_key:string;caption:string}>();
    if (!saved)
      throw new ImplementationError("proof_persistence", `Captured proof receipt could not be read back: ${id}`);
    return {
      ...subject,
      id,
      kind,
      path: saved.r2_key,
      caption: saved.caption,
      sha256: object.sha256,
      sanitized: true,
      ...(providerDeliveryId ? { providerDeliveryId } : {}),
    };
  }
  async cleanup(attemptId: string) {
    const rows = await this.store.resources(attemptId);
    if (!rows.results.length) return;
    const attempt = await this.env.DB.prepare(
      "SELECT sandbox_id,sandbox_tier FROM agent_attempts WHERE attempt_id=?",
    )
      .bind(attemptId)
      .first<{ sandbox_id: string; sandbox_tier: "basic" | "standard-2" }>();
    if (!attempt)
      throw new ImplementationError(
        "cleanup_attempt_missing",
        "Implementation cleanup attempt missing",
      );
    const sandbox = getSandbox(
      attempt.sandbox_tier === "standard-2"
        ? this.env.ImplementationStandard2Sandbox
        : this.env.ImplementationSandbox,
      attempt.sandbox_id,
      { normalizeId: true },
    );
    const errors = [];
    for (const row of rows.results) {
      if (row.status === "destroyed") continue;
      try {
        if (row.kind === "browser")
          await new ImplementationBrowserAllocator(
            this.store,
            new CloudflareBrowserProvider(this.env.IMPLEMENTATION_BROWSER),
          ).cleanup(row);
        else if (row.kind === "preview") {
          const relayId = JSON.parse(row.metadata_json).relaySandboxId;
          if (relayId && relayId !== await previewRelaySandboxId(attemptId))
            throw new Error("Preview relay identity differs from this attempt");
          const previewSandbox = relayId ? getSandbox(this.env.Sandbox, relayId, {normalizeId:true}) : sandbox;
          await previewSandbox.tunnels.destroy(8787);
          if (
            (await previewSandbox.tunnels.list()).some(
              (tunnel) => new URL(tunnel.url).origin === row.preview_origin,
            )
          )
            throw new Error("Preview remains after cleanup");
          if (relayId) {
            await previewSandbox.destroy();
            if ((await previewSandbox.getState()).status !== "stopped") throw new Error("Preview relay remains after cleanup");
          }
          await this.env.DB.prepare(
            "UPDATE implementation_resources SET status='destroyed',cleanup_receipt=? WHERE resource_id=?",
          )
            .bind(
              JSON.stringify({ absent: row.preview_origin, ...(relayId ? {relaySandboxDestroyed:relayId} : {}) }),
              row.resource_id,
            )
            .run();
        } else if (row.kind === "safe_test") await new ImplementationProviderTest(this.env).cleanup(row);
      } catch (error) {
        errors.push(error);
        await this.store.error(
          row.run_id,
          attemptId,
          `cleanup.${row.kind}`,
          error,
        );
      }
    }
    if (errors.length)
      throw new AggregateError(
        errors,
        "Implementation resource cleanup failed",
        { cause: errors[0] },
      );
  }
}
