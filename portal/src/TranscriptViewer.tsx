import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code,
  Copy,
  DownloadSimple,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import {
  activityForRecord,
  formatTranscriptBytes,
  type TranscriptDto,
} from "./transcript-view.ts";

interface TranscriptViewerProps {
  attemptId: string;
  loadTranscript: (path: string, signal?: AbortSignal) => Promise<TranscriptDto>;
  onClose: () => void;
}

const displayTimestamp = (value: string | null): string => {
  if (value === null) return "Recorded event";
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? value : new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(time);
};

export function TranscriptViewer({ attemptId, loadTranscript, onClose }: TranscriptViewerProps) {
  const [transcript, setTranscript] = useState<TranscriptDto | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"activity" | "raw">("activity");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setTranscript(null);
    setError("");
    void loadTranscript(`/api/attempts/${attemptId}/transcript`, controller.signal)
      .then(setTranscript)
      .catch((reason: unknown) => {
        if (!(reason instanceof DOMException && reason.name === "AbortError")) {
          setError(reason instanceof Error ? reason.message : "The transcript could not be loaded.");
        }
      });
    return () => controller.abort();
  }, [attemptId, loadTranscript]);

  const activity = useMemo(() => transcript?.records.map(activityForRecord) ?? [], [transcript]);
  const rawJsonl = transcript === null ? "" : `${transcript.records.map((record) => record.raw).join("\n")}\n`;
  const copyAll = async () => {
    await navigator.clipboard.writeText(rawJsonl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  };

  return <div className="transcript-backdrop" role="presentation">
    <section className="transcript-viewer" role="dialog" aria-modal="true" aria-labelledby="transcript-title">
      <header className="transcript-header">
        <div><span className="eyebrow">Agent transcript</span><h2 id="transcript-title">Recorded activity</h2></div>
        <button className="icon-button" type="button" onClick={onClose} aria-label="Close transcript"><X /></button>
      </header>
      {transcript !== null && <div className="transcript-meta">
        <span>{transcript.issueKey} · run {transcript.runSequence}</span>
        <span>{transcript.eventCount} events · {formatTranscriptBytes(transcript.byteSize)}</span>
        <span title={transcript.sha256}>SHA-256 {transcript.sha256.slice(0, 12)}…</span>
      </div>}
      {error && <div className="transcript-error" role="alert">{error}<button type="button" onClick={onClose}>Close</button></div>}
      {transcript === null && !error && <div className="transcript-loading"><SpinnerGap className="spin" /><p>Loading the verified durable transcript…</p></div>}
      {transcript !== null && <>
        <div className="transcript-toolbar">
          <div className="transcript-tabs" role="tablist" aria-label="Transcript view">
            <button type="button" role="tab" aria-selected={tab === "activity"} className={tab === "activity" ? "selected" : ""} onClick={() => setTab("activity")}>Activity</button>
            <button type="button" role="tab" aria-selected={tab === "raw"} className={tab === "raw" ? "selected" : ""} onClick={() => setTab("raw")}><Code />Raw JSONL</button>
          </div>
          <button className="transcript-action" type="button" onClick={() => void copyAll()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy all"}</button>
          <a className="transcript-action" href={`/api/attempts/${attemptId}/transcript.jsonl`} download={`${transcript.issueKey}-${attemptId}-transcript.jsonl`}><DownloadSimple />Download</a>
        </div>
        <div className="transcript-body">
          {tab === "activity" ? <ol className="activity-list">
            {activity.map((event) => <li key={event.number}>
              <span className="activity-marker">{event.number}</span>
              <div className="activity-copy"><div><strong>{event.title}</strong><time>{displayTimestamp(event.timestamp)}</time></div>{event.detail && <p>{event.detail}</p>}<details><summary>Record details</summary><pre>{JSON.stringify(transcript.records[event.number - 1]?.value, null, 2)}</pre></details></div>
            </li>)}
          </ol> : <ol className="raw-list">
            {transcript.records.map((record) => <li key={record.number}><span>{record.number}</span><details><summary><code>{record.raw}</code></summary><pre>{JSON.stringify(record.value, null, 2)}</pre></details></li>)}
          </ol>}
        </div>
      </>}
    </section>
  </div>;
}
