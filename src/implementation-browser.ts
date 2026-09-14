import puppeteer, { type Browser } from "@cloudflare/puppeteer";
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
  create(host: string): Promise<{ id: string; disconnect(): Promise<void> }>;
  close(id: string): Promise<void>;
}
export class CloudflareBrowserProvider implements BrowserProvider {
  readonly binding: Parameters<typeof puppeteer.sessions>[0];
  constructor(binding: Parameters<typeof puppeteer.sessions>[0]) {
    this.binding = binding;
  }
  async inventory() {
    return (await puppeteer.sessions(this.binding)).map((s) => s.sessionId);
  }
  async capacity() {
    const limits = await puppeteer.limits(this.binding);
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
  async create(host: string) {
    const browser = await puppeteer.launch(this.binding, {
      keep_alive: 60_000,
      guardrails: { allowedDomains: [host] },
    });
    return { id: browser.sessionId(), disconnect: () => browser.disconnect() };
  }
  async close(id: string) {
    const browser = await puppeteer.connect(this.binding, id);
    await browser.close();
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
  async acquire(
    runId: string,
    attemptId: string,
    origin: string,
  ): Promise<ImplementationResource> {
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
          JSON.stringify({ before, origin }),
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
        browser = await this.provider.create(new URL(origin).hostname);
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
            JSON.stringify({ before, origin }),
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
}
export async function browserCommand(
  binding: Parameters<typeof puppeteer.sessions>[0],
  sessionId: string,
  origin: string,
  input: {
    operation: "navigate" | "state" | "click" | "fill" | "screenshot";
    url?: string;
    selector?: string;
    text?: string;
  },
) {
  if (input.url && new URL(input.url, origin).origin !== origin)
    throw new ImplementationError(
      "browser_origin",
      "Browser navigation escaped the assigned preview",
    );
  const messages: { kind: string; text: string }[] = [];
  const browser: Browser = await puppeteer.connect(binding, sessionId);
  try {
    const pages = await browser.pages();
    const page = pages[0] ?? (await browser.newPage());
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
    if (input.operation === "navigate")
      await page.goto(new URL(input.url ?? "/", origin).href, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });
    else if (input.operation === "click") {
      if (!input.selector) throw new Error("Click selector missing");
      await page.click(input.selector);
    } else if (input.operation === "fill") {
      if (!input.selector || typeof input.text !== "string")
        throw new Error("Fill input missing");
      await page.type(input.selector, input.text);
    }
    if (page.url() !== "about:blank" && new URL(page.url()).origin !== origin)
      throw new ImplementationError(
        "browser_origin",
        "Browser left its preview origin",
      );
    if (input.operation === "screenshot") {
      if(page.url()==='about:blank')throw new ImplementationError('preview_not_open','Navigate to the assigned preview before capturing proof');
      await page.addStyleTag({
        content:
          "[data-sensitive], input[type=password] { visibility: hidden !important; }",
      });
      return {
        image: new Uint8Array(
          await page.screenshot({ type: "png", fullPage: true }),
        ),
        url: page.url(),
        console: messages,
      };
    }
    return {
      url: page.url(),
      title: await page.title(),
      content: await page.content(),
      console: messages,
    };
  } finally {
    await browser.disconnect();
  }
}
