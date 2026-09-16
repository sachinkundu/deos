import puppeteer, { type Browser, type KeyInput } from "@cloudflare/puppeteer";
import {
  ImplementationStore,
  type ImplementationResource,
} from "./implementation-store.ts";
import { ImplementationError } from "./implementation-contract.ts";
import { recordCaughtError } from "./error-context.ts";

export class BrowserCapacityWait extends ImplementationError {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super(
      "browser_capacity",
      "Service browser capacity is temporarily unavailable",
    );
    this.retryAfterMs = retryAfterMs;
  }
}
export interface BrowserProvider {
  inventory(): Promise<string[]>;
  capacity(): Promise<{ available: boolean; retryAfterMs: number }>;
  create(host: string, additionalHosts?: string[]): Promise<{ id: string; disconnect(): Promise<void> }>;
  close(id: string): Promise<void>;
  keepAlive(id: string): Promise<void>;
}
export class CloudflareBrowserProvider implements BrowserProvider {
  readonly binding: Parameters<typeof puppeteer.sessions>[0];
  readonly api: typeof puppeteer;
  constructor(binding: Parameters<typeof puppeteer.sessions>[0], api = puppeteer) {
    this.binding = binding;
    this.api = api;
  }
  async inventory() {
    return (await this.api.sessions(this.binding)).map((s) => s.sessionId);
  }
  async capacity() {
    const limits = await this.api.limits(this.binding);
    return {
      available:
        limits.activeSessions.length < limits.maxConcurrentSessions &&
        limits.allowedBrowserAcquisitions > 0,
      retryAfterMs: Math.max(
        1000,
        limits.timeUntilNextAllowedBrowserAcquisition,
      ),
    };
  }
  async create(host: string, additionalHosts: string[] = []) {
    const browser = await this.api.launch(this.binding, {
      // Workflow reconciliation runs every five minutes while the author works.
      // Keep the session available between those commands and refresh it there.
      keep_alive: 600_000,
      guardrails: { allowedDomains: [host, ...additionalHosts] },
    });
    return { id: browser.sessionId(), disconnect: () => browser.disconnect() };
  }
  async close(id: string) {
    const browser = await this.api.connect(this.binding, id);
    await browser.close();
  }
  async keepAlive(id: string) {
    const session = (await this.api.sessions(this.binding)).find(session => session.sessionId === id);
    if (!session) throw new ImplementationError("browser_retired", "The assigned browser session has ended; a fresh try is required");
    // A tool already using this session is keeping it active. Do not compete
    // for its connection or replay the page action during maintenance.
    if (session.connectionId) return;
    const browser = await this.api.connect(this.binding, id);
    let primaryError: unknown;
    try { await browser.version(); }
    catch (error) { primaryError = error; throw error; }
    finally {
      try { await browser.disconnect(); }
      catch (error) {
        if (primaryError) throw new AggregateError([primaryError, error], "Browser keep-alive and disconnect failed", {cause:primaryError});
        throw error;
      }
    }
  }
}
export class ImplementationBrowserAllocator {
  readonly store: ImplementationStore;
  readonly provider: BrowserProvider;
  readonly account: string;
  readonly now: () => Date;
  constructor(
    store: ImplementationStore,
    provider: BrowserProvider,
    account: string = "service-browser",
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.provider = provider;
    this.account = account;
    this.now = now;
  }
  async keepAlive(runId: string, attemptId: string) {
    const row = await this.store.db.prepare(`SELECT r.* FROM implementation_resources r
      JOIN agent_attempts a ON a.attempt_id=r.attempt_id AND a.run_id=r.run_id
      JOIN implementation_tries t ON t.attempt_id=a.attempt_id AND t.run_id=a.run_id
      WHERE r.run_id=? AND r.attempt_id=? AND r.kind='browser' AND r.status='ready'
        AND a.state='running' AND t.status='running'`)
      .bind(runId, attemptId).first<ImplementationResource>();
    if (!row?.provider_resource_id || this.now().getTime() - Date.parse(row.updated_at) < 60_000) return;
    await this.provider.keepAlive(row.provider_resource_id);
    await this.store.db.prepare("UPDATE implementation_resources SET updated_at=? WHERE resource_id=? AND status='ready' AND provider_resource_id=?")
      .bind(this.now().toISOString(), row.resource_id, row.provider_resource_id).run();
  }
  async acquire(
    runId: string,
    attemptId: string,
    origin: string,
    additionalOrigins: string[] = [],
  ): Promise<ImplementationResource> {
    const origins = [...new Set([origin, ...additionalOrigins])].sort();
    let row = await this.store.allocateResource(
      runId,
      attemptId,
      "browser",
      "cloudflare",
    );
    if (row.status === "ready") {
      if (JSON.parse(row.metadata_json).origin !== origin)
        throw new ImplementationError(
          "browser_origin",
          "Browser is bound to another preview origin",
        );
      const savedOrigins = JSON.parse(row.metadata_json).origins ?? [origin];
      if (JSON.stringify([...savedOrigins].sort()) !== JSON.stringify(origins))
        throw new ImplementationError('browser_origin', 'Browser allowed origins cannot change within a try');
      return row;
    }
    if (row.status === "destroyed")
      throw new ImplementationError(
        "browser_retired",
        "The browser for this try has ended; use a fresh try",
      );
    if (row.create_window || row.status === "quarantined") {
      await this.reconcile(row);
      throw new ImplementationError(
        "browser_quarantined",
        "Browser creation is awaiting absence or manual reconciliation",
      );
    }
    const capacity = await this.provider.capacity();
    if (!capacity.available)
      throw new BrowserCapacityWait(capacity.retryAfterMs);
    const now = this.now();
    const expires = new Date(now.getTime() + 30_000).toISOString();
    const lease = await this.store.db
      .prepare(
        `INSERT INTO implementation_browser_leases VALUES (?,?,?)
      ON CONFLICT(account_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at
      WHERE implementation_browser_leases.expires_at<=?`,
      )
      .bind(this.account, row.allocation_op, expires, now.toISOString())
      .run();
    if (lease.meta.changes !== 1) throw new BrowserCapacityWait(1000);
    let before: string[] = [];
    try {
      before = await this.provider.inventory();
      const update = await this.store.db
        .prepare(
          `UPDATE implementation_resources SET create_window=?,quarantine_until=?,metadata_json=?
        WHERE resource_id=? AND create_window IS NULL AND status='allocating'`,
        )
        .bind(
          now.toISOString(),
          new Date(now.getTime() + 90_000).toISOString(),
          JSON.stringify({ before, origin, origins }),
          row.resource_id,
        )
        .run();
      if (update.meta.changes !== 1)
        throw new ImplementationError(
          "browser_allocation_in_flight",
          "Browser allocation already started",
        );
      let browser;
      try {
        browser = await this.provider.create(new URL(origin).hostname,
          origins.filter(value => value !== origin).map(value => new URL(value).hostname));
      } catch (error) {
        const after = await this.provider.inventory().catch((secondary) => {
          recordCaughtError(secondary, "browser.inventory.after_create");
          return null;
        });
        await this.store.db
          .prepare(
            "UPDATE implementation_resources SET status='quarantined',metadata_json=? WHERE resource_id=?",
          )
          .bind(
            JSON.stringify({
              before,
              origin,
              origins,
              candidates: after?.filter((id) => !before.includes(id)) ?? null,
            }),
            row.resource_id,
          )
          .run();
        await this.store.error(runId, attemptId, "browser.create", error);
        throw error;
      }
      try {
        await this.store.db
          .prepare(
            "UPDATE implementation_resources SET provider_resource_id=?,status='ready',metadata_json=?,updated_at=? WHERE resource_id=? AND status='allocating'",
          )
          .bind(
            browser.id,
            JSON.stringify({ before, origin, origins }),
            this.now().toISOString(),
            row.resource_id,
          )
          .run();
      } finally {
        await browser.disconnect();
      }
      row = (await this.store.resource(attemptId, "browser"))!;
      if (row.status !== "ready" || row.provider_resource_id !== browser.id)
        throw new ImplementationError(
          "browser_identity",
          "Browser allocation read-back differs",
        );
      return row;
    } finally {
      await this.store.db
        .prepare(
          "DELETE FROM implementation_browser_leases WHERE account_id=? AND operation_id=?",
        )
        .bind(this.account, row.allocation_op)
        .run();
    }
  }
  async reconcile(row: ImplementationResource) {
    if (
      !row.quarantine_until ||
      this.now().getTime() < Date.parse(row.quarantine_until)
    )
      return;
    const metadata = JSON.parse(row.metadata_json) as {
      candidates?: string[] | null;
      before?: string[];
    };
    const live = await this.provider.inventory();
    const candidates = metadata.candidates;
    if (candidates && candidates.every((id) => !live.includes(id))) {
      await this.store.db
        .prepare(
          "UPDATE implementation_resources SET status='destroyed',cleanup_receipt=?,updated_at=? WHERE resource_id=?",
        )
        .bind(
          JSON.stringify({
            absent: candidates,
            checkedAt: this.now().toISOString(),
          }),
          this.now().toISOString(),
          row.resource_id,
        )
        .run();
      await this.store.db
        .prepare(
          "UPDATE implementation_tries SET status='retry_required',updated_at=? WHERE attempt_id=?",
        )
        .bind(this.now().toISOString(), row.attempt_id)
        .run();
      return;
    }
    await this.store.db
      .prepare(
        "UPDATE implementation_tries SET status='manual_reconciliation_required',updated_at=? WHERE attempt_id=?",
      )
      .bind(this.now().toISOString(), row.attempt_id)
      .run();
  }
  async cleanup(row: ImplementationResource) {
    if (row.status === "destroyed") return;
    if (!row.provider_resource_id) {
      await this.reconcile(row);
      return;
    }
    const inventory = await this.provider.inventory();
    if (inventory.includes(row.provider_resource_id))
      await this.provider.close(row.provider_resource_id);
    if ((await this.provider.inventory()).includes(row.provider_resource_id))
      throw new ImplementationError(
        "browser_cleanup_unconfirmed",
        "Browser close is not yet confirmed",
      );
    await this.store.db
      .prepare(
        "UPDATE implementation_resources SET status='destroyed',cleanup_receipt=?,updated_at=? WHERE resource_id=?",
      )
      .bind(
        JSON.stringify({ absent: row.provider_resource_id }),
        this.now().toISOString(),
        row.resource_id,
      )
      .run();
  }

  async reconcileCompletedAttempts() {
    const resources = await this.store.db.prepare(`SELECT r.* FROM implementation_resources r
      JOIN agent_attempts a ON a.attempt_id=r.attempt_id AND a.run_id=r.run_id
      WHERE r.kind='browser' AND r.status='ready' AND r.provider_resource_id IS NOT NULL
        AND a.state IN ('completed','blocked','failed','interrupted','absolute_timeout','canceled')
        AND (a.cleanup_hold_until IS NULL OR a.cleanup_hold_until<=?)`)
      .bind(this.now().toISOString())
      .all<ImplementationResource>();
    for (const resource of resources.results) {
      try { await this.cleanup(resource); }
      catch (error) {
        await this.store.error(resource.run_id, resource.attempt_id, "cleanup.browser.reconciliation", error);
      }
    }
  }
}
export async function browserCommand(
  binding: Parameters<typeof puppeteer.sessions>[0],
  sessionId: string,
  origin: string,
  input: {
    operation: "navigate" | "state" | "click" | "fill" | "press" | "viewport" | "screenshot";
    url?: string;
    selector?: string;
    text?: string;
    key?: string;
    width?: number;
    height?: number;
    documentStatus?: number;
  },
  api = puppeteer,
) {
  if (input.url && new URL(input.url, origin).origin !== origin)
    throw new ImplementationError(
      "browser_origin",
      "Browser navigation escaped the assigned preview",
    );
  const messages: { kind: string; text: string }[] = [];
  const browser: Browser = await api.connect(binding, sessionId);
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
    let documentStatus = input.operation === 'navigate' ? undefined : input.documentStatus;
    page.on("response", response => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame())
        documentStatus = response.status();
    });
    page.on("console", (message) =>
      messages.push({ kind: message.type(), text: message.text() }),
    );
    page.on("pageerror", (error) =>
      messages.push({ kind: "pageerror", text: String(error) }),
    );
    if (pages.length > 1)
      throw new ImplementationError(
        "browser_tabs",
        "Unexpected additional browser page",
      );
    if (input.operation !== 'navigate' && page.url() !== 'about:blank' && new URL(page.url()).origin !== origin)
      throw new ImplementationError('browser_origin', 'Navigate to the selected preview before interacting with it');
    if (input.operation === "navigate") {
      const response = await page.goto(new URL(input.url ?? "/", origin).href, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });
      if (response) documentStatus = response.status();
    }
    else if (input.operation === "click") {
      if (!input.selector) throw new Error("Click selector missing");
      await page.click(input.selector);
    } else if (input.operation === "fill") {
      if (!input.selector || typeof input.text !== "string")
        throw new Error("Fill input missing");
      await page.type(input.selector, input.text);
    } else if (input.operation === "press") {
      if (!input.key || input.key.length > 64)
        throw new ImplementationError("browser_key", "A single browser key name is required");
      await page.keyboard.press(input.key as KeyInput);
    } else if (input.operation === "viewport") {
      if (!Number.isInteger(input.width) || !Number.isInteger(input.height) ||
          input.width! < 200 || input.width! > 3840 || input.height! < 200 || input.height! > 3840)
        throw new ImplementationError("browser_viewport", "Viewport width and height must be integers from 200 to 3840 CSS pixels");
      await page.setViewport({width:input.width!,height:input.height!,deviceScaleFactor:1});
    }
    if (page.url() !== "about:blank" && new URL(page.url()).origin !== origin)
      throw new ImplementationError(
        "browser_origin",
        "Browser left its preview origin",
      );
    if (input.operation === "screenshot") {
      if(page.url()==='about:blank')throw new ImplementationError('preview_not_open','Navigate to the assigned preview before capturing proof');
      if (documentStatus === undefined || documentStatus < 200 || documentStatus >= 400)
        throw new ImplementationError("preview_document_failed", `The preview document returned ${documentStatus === undefined ? "an unknown HTTP status" : `HTTP ${documentStatus}`}. Navigate to a working application page before capturing visual proof. Error responses remain diagnostic evidence, not proof of a working screen.`);
      await page.addStyleTag({
        content:
          "[data-sensitive], input[type=password] { visibility: hidden !important; }",
      });
      return {
        image: new Uint8Array(
          await page.screenshot({ type: "png", fullPage: true }),
        ),
        url: page.url(),
        documentStatus,
        console: messages,
      };
    }
    return {
      url: page.url(),
      documentStatus,
      title: await page.title(),
      content: await page.content(),
      console: messages,
    };
  } finally {
    await browser.disconnect();
  }
}
