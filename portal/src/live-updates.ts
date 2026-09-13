export const LIVE_UPDATES_KEY = "deos-live-updates";
export type ClientNotice = "preference_fallback" | "preference_not_saved" | "render_failed";
export const noticeText: Record<ClientNotice, string> = {
  preference_fallback: "Live updates are off because the saved choice could not be loaded. You can turn them on in Settings.",
  preference_not_saved: "This choice is active only for this page. It could not be saved in this browser.",
  render_failed: "This workflow view could not be displayed. Reload the page to try again.",
};
export function reportClientError(error: unknown, context: Record<string, unknown>): void {
  console.error("Portal client error", context, error);
}
export interface PreferenceSnapshot { enabled: boolean; notice: ClientNotice | null }
interface PreferenceHost {
  readonly localStorage: Pick<Storage, "getItem" | "setItem">;
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}
export function createLiveUpdatePreference(host: PreferenceHost) {
  const listeners = new Set<() => void>();
  const read = (): PreferenceSnapshot => {
    try {
      const raw = host.localStorage.getItem(LIVE_UPDATES_KEY);
      if (raw === null) return { enabled: false, notice: null };
      const value: unknown = JSON.parse(raw);
      if (typeof value !== "object" || value === null || Array.isArray(value) ||
          !("version" in value) || value.version !== 1 || !("enabled" in value) || typeof value.enabled !== "boolean" ||
          Object.keys(value).some(key => key !== "version" && key !== "enabled")) {
        throw new Error("Invalid Live updates preference schema");
      }
      return { enabled: value.enabled, notice: null };
    } catch (error) {
      reportClientError(error, { operation: "load_live_updates" });
      return { enabled: false, notice: "preference_fallback" };
    }
  };
  let snapshot = read();
  const publish = (next: PreferenceSnapshot) => {
    snapshot = next;
    listeners.forEach(listener => listener());
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== LIVE_UPDATES_KEY) return;
    // The event is only an invalidation signal; delayed event values may be stale.
    publish(read());
  };
  host.addEventListener("storage", onStorage);
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setEnabled: (enabled: boolean) => {
      let notice: ClientNotice | null = null;
      try { host.localStorage.setItem(LIVE_UPDATES_KEY, JSON.stringify({ version: 1, enabled })); }
      catch (error) {
        reportClientError(error, { operation: "save_live_updates" });
        notice = "preference_not_saved";
      }
      publish({ enabled, notice });
    },
    dispose: () => { host.removeEventListener("storage", onStorage); listeners.clear(); },
  };
}
