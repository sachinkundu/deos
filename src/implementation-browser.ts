import puppeteer, { type Browser, type KeyInput } from "@cloudflare/puppeteer";
import {
  ImplementationStore,
  type ImplementationResource,
} from "./implementation-store.ts";
import { ImplementationError } from "./implementation-contract.ts";
import { recordCaughtError } from "./error-context.ts";
import { keyTraceScript, browserMeasurementScript } from './implementation-browser-evidence.ts';

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
    operation: "reset" | "navigate" | "state" | "click" | "fill" | "press" | "wait" | "viewport" | "trace" | "measure" | "screenshot";
    url?: string;
    selector?: string;
    text?: string;
    key?: string;
    width?: number;
    height?: number;
    documentStatus?: number;
    viewport?: {width:number;height:number};
    traceEnabled?: boolean;
    enabled?: boolean;
    modifiers?: string[];
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
  let commandError: unknown;
  try {
    const pages = await browser.pages();
    let page = pages[0];
    if (input.operation === 'reset') {
      // Replace the context, not just the URL: cookies, storage, DOM, input
      // focus and held keys from a previous scenario must not survive.
      const priorContexts = browser.browserContexts();
      const context = await browser.createBrowserContext();
      page = await context.newPage();
      for (const prior of priorContexts) {
        if (prior === browser.defaultBrowserContext()) {
          for (const oldPage of await prior.pages()) await oldPage.close();
        } else await prior.close();
      }
    }
    page ??= await browser.newPage();
    let documentStatus = ['navigate', 'reset'].includes(input.operation) ? undefined : input.documentStatus;
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
    if (pages.length > 1 && input.operation !== 'reset')
      throw new ImplementationError(
        "browser_tabs",
        "Unexpected additional browser page",
      );
    if (!['navigate', 'reset'].includes(input.operation) && page.url() !== 'about:blank' && new URL(page.url()).origin !== origin)
      throw new ImplementationError('browser_origin', 'Navigate to the selected preview before interacting with it');
    // Cloudflare's connect() initializes a new Puppeteer Page wrapper with an
    // 800x600 default. Restore the trusted persisted viewport on every command.
    const viewport = ['viewport', 'reset'].includes(input.operation) ? {width:input.width!,height:input.height!} : input.viewport;
    if (viewport) {
      if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height) ||
          viewport.width < 200 || viewport.width > 3840 || viewport.height < 200 || viewport.height > 3840)
        throw new ImplementationError('browser_viewport', 'Viewport width and height must be integers from 200 to 3840 CSS pixels');
      await page.setViewport({...viewport,deviceScaleFactor:1});
    }
    if (input.operation === 'trace' && typeof input.enabled !== 'boolean')
      throw new ImplementationError('browser_trace', 'Trace enabled must be a boolean');
    const traceEnabled = input.operation === 'reset' ? false : input.operation === 'trace' ? input.enabled : input.traceEnabled;
    const applyTrace = async () => {
      if (traceEnabled !== undefined && page.url() !== 'about:blank')
        await page.evaluate(`${keyTraceScript}(${traceEnabled})`);
    };
    await applyTrace();
    if (input.operation === "navigate" || input.operation === "reset") {
      const response = await page.goto(new URL(input.url ?? "/", origin).href, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });
      if (response) documentStatus = response.status();
      await applyTrace();
    }
    else if (input.operation === "wait") {
      if (!input.selector) throw new Error("Wait selector missing");
      await page.waitForSelector(input.selector, { visible: true, timeout: 30_000 });
    } else if (input.operation === "click") {
      if (!input.selector) throw new Error("Click selector missing");
      await page.click(input.selector);
    } else if (input.operation === "fill") {
      if (!input.selector || typeof input.text !== "string")
        throw new Error("Fill input missing");
      if (input.text === "") {
        // This pinned Puppeteer version clears via a DOM assignment for an
        // empty fill, without notifying controlled inputs. Select the content
        // and delete it with a real key event instead.
        await page.focus(input.selector);
        await page.$eval(input.selector, element => {
          if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") element.select();
          else if (element.isContentEditable) {
            const range = element.ownerDocument.createRange();
            range.selectNodeContents(element);
            const selection = element.ownerDocument.getSelection();
            if (!selection) throw new Error("Editable field selection is unavailable");
            selection.removeAllRanges();selection.addRange(range);
          } else throw new Error("Clearing requires a text input, textarea or editable element");
        });
        await page.keyboard.press("Backspace");
      } else await page.locator(input.selector).fill(input.text);
    } else if (input.operation === "press") {
      if (!input.key || input.key.length > 64)
        throw new ImplementationError("browser_key", "A single browser key name is required");
      const modifiers = input.modifiers ?? [];
      if (!Array.isArray(modifiers) || modifiers.length > 4 || new Set(modifiers).size !== modifiers.length ||
          modifiers.some(key => !['Alt','Control','Meta','Shift'].includes(key)))
        throw new ImplementationError('browser_key', 'Invalid keyboard modifiers');
      const pressed: KeyInput[] = [];
      let primaryError: unknown;
      try {
        for (const modifier of modifiers) { await page.keyboard.down(modifier as KeyInput); pressed.push(modifier as KeyInput); }
        await page.keyboard.press(input.key as KeyInput);
      } catch (error) { primaryError = error; throw error; }
      finally {
        const failures: unknown[] = [];
        for (const modifier of pressed.reverse()) {
          try { await page.keyboard.up(modifier); } catch (error) { failures.push(error); }
        }
        if (failures.length) throw new AggregateError(primaryError ? [primaryError,...failures] : failures,
          'Could not release browser keyboard modifiers', {cause:primaryError ?? failures[0]});
      }
    }
    if (page.url() !== "about:blank" && new URL(page.url()).origin !== origin)
      throw new ImplementationError(
        "browser_origin",
        "Browser left its preview origin",
      );
    if (input.operation === "screenshot") {
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
        viewport,
        traceEnabled,
        console: messages,
      };
    }
    let measurements: Record<string, unknown> | undefined;
    if (input.operation === 'measure') {
      const encoded = await page.evaluate(browserMeasurementScript);
      if (typeof encoded !== 'string') throw new ImplementationError('browser_measurement', 'Browser measurements were not returned as JSON');
      measurements = JSON.parse(encoded);
    }
    return {
      url: page.url(),
      documentStatus,
      title: await page.title(),
      content: await page.content(),
      console: messages,
      viewport,
      traceEnabled,
      ...(measurements ? { measurements } : {}),
    };
  } catch (error) { commandError = error; throw error; }
  finally {
    try { await browser.disconnect(); }
    catch (error) {
      if (commandError) throw new AggregateError([commandError,error], 'Browser command and disconnect failed', {cause:commandError});
      throw error;
    }
  }
}
