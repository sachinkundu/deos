import { useEffect, useState } from "react";
export interface ImplementationView {
  status: string;
  branch: string;
  prUrl: string | null;
  approvedDesignSha: string;
  testedBaseSha: string;
  treeSha: string | null;
  mergeSha: string | null;
  candidateKind: "tasks" | "build" | null;
  tasks: string | null;
  checks: {
    command: string;
    exitCode: number;
    stdout: string;
    stderr: string;
  }[];
  assumptions: string[];
  attempts: {
    attempt_id: string;
    try_sequence: number;
    kind: string;
    status: string;
    tested_base_sha: string;
  }[];
  proof: {
    proof_id: string;
    kind: string;
    caption: string;
    tree_sha: string;
    tested_base_sha: string;
  }[];
  gates: {
    expected_event_kind: string;
    state: string;
    head_sha: string | null;
    base_sha: string | null;
  }[];
  question: { question: string; reason: string; status: string } | null;
  documentation: {
    url: string;
    title: string;
    claim: string;
    artifact_locator: string;
  }[];
  errors: { error_id: string; operation: string; created_at: string }[];
}
export function useImplementation(runId: string, freshness: string, enabled: boolean,
  load: <T>(path: string, signal?: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<ImplementationView | null>(null),
    [error, setError] = useState("");
  useEffect(() => { setData(null); }, [runId]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError("");
    void load<ImplementationView | null>(`/api/implementation/${encodeURIComponent(runId)}`, controller.signal)
      .then((value) => { if (!controller.signal.aborted) setData(value); })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, [runId, freshness, enabled, load]);
  return {data: enabled ? data : null, error};
}

export function Implementation({runId, data, error, focus, stepStatus}: {
  runId: string; data: ImplementationView | null; error: string; focus?: string; stepStatus?: string;
}) {
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p className="phase-note">Saved work will appear when implementation begins.</p>;
  const show = (step: string) => focus === undefined || focus === `implementation_${step}`;
  const proofUrl = (id: string) =>
    `/api/implementation/${encodeURIComponent(runId)}/proof/${encodeURIComponent(id)}`;
  return (
    <div className="implementation-evidence">
      {(show("publish") || focus === "implementation_merge") && <><p>
        {data.mergeSha
          ? "Code merged. Live release has not begun."
          : data.status === "stale"
            ? "The base changed. Checks and proof must be renewed."
            : data.gates[0]?.state === "open"
              ? data.gates[0].expected_event_kind === "comment"
                ? "Waiting for your answer in Linear."
                : "Ready for human review in Linear."
              : "Implementation is in progress."}
      </p>
      <p>
        <code>{data.branch}</code>
        {data.prUrl && (
          <>
            {" "}
            ·{" "}
            <a href={data.prUrl} target="_blank" rel="noreferrer">
              Implementation PR
            </a>
          </>
        )}
      </p>
      </>}
      {show("build") && data.question && data.question.status !== "closed" && (
        <aside className="guard-note">
          <strong>{data.question.question}</strong>
          <p>{data.question.reason}</p>
          <p>
            {data.question.status === "answered"
              ? "Answer received. A fresh try uses the reply."
              : "Reply to the question in Linear to continue."}
          </p>
        </aside>
      )}
      {show("merge") && <details open={focus === "implementation_merge"}>
        <summary>Approved and tested revisions</summary>
        <dl>
          <dt>Approved design</dt>
          <dd>
            <code>{data.approvedDesignSha}</code>
          </dd>
          <dt>Tested base</dt>
          <dd>
            <code>{data.testedBaseSha}</code>
          </dd>
          <dt>Checked tree</dt>
          <dd>
            <code>{data.treeSha}</code>
          </dd>
        </dl>
      </details>}
      {show("tasks") && data.tasks && (
        <details open={focus === "implementation_tasks"}>
          <summary>Task checklist</summary>
          <div className="implementation-tasks">{data.tasks.split("\n").map((line, index) => {
            const task = line.match(/^\s*- \[([ xX])\]\s+(.+)$/);
            if (task) return <div className="implementation-task" key={index}><span aria-label={task[1] === " " ? "Not completed" : "Completed"}>{task[1] === " " ? "☐" : "☑"}</span><span>{task[2]}</span></div>;
            const heading = line.match(/^#{1,6}\s+(.+)$/);
            return heading ? <h4 key={index}>{heading[1]}</h4> : line.trim() ? <p key={index}>{line}</p> : null;
          })}</div>
        </details>
      )}
      {focus === "implementation_build" && data.candidateKind !== "build" && <p>{["Failed", "Blocked", "Canceled"].includes(stepStatus ?? "") ? "This attempt did not produce accepted build checks." : "Build checks will appear when this attempt finishes."} Task checks are available under saved work and evidence.</p>}
      {show("build") && (focus !== "implementation_build" || data.candidateKind === "build") && <details open={focus === "implementation_build"}><summary>Saved checks ({data.checks.length})</summary>
      {data.checks.map((check, index) => (
        <details key={index}>
          <summary>
            {check.exitCode === 0 ? "Passed" : "Failed"}: {check.command}
          </summary>
          <pre>
            {check.stdout}
            {check.stderr}
          </pre>
        </details>
      ))}
      </details>}
      {show("proof_check") && <details open={focus === "implementation_proof_check"}><summary>Behavior proof ({data.proof.length})</summary>
      {data.proof.length === 0 && <p>No behavior proof has been collected yet.</p>}
      <div className="implementation-gallery">
        {data.proof.map((proof) => (
          <figure key={proof.proof_id}>
            {proof.kind === "browser_image" ? (
              <a
                href={proofUrl(proof.proof_id)}
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={proofUrl(proof.proof_id)}
                  alt={proof.caption}
                  loading="lazy"
                />
              </a>
            ) : (
              <a
                href={proofUrl(proof.proof_id)}
                target="_blank"
                rel="noreferrer"
              >
                {proof.kind.replaceAll("_", " ")}
              </a>
            )}
            <figcaption>
              {proof.caption}
              {(proof.tree_sha !== data.treeSha ||
                proof.tested_base_sha !== data.testedBaseSha) && (
                <strong> · Earlier revision</strong>
              )}
            </figcaption>
          </figure>
        ))}
      </div>
      </details>}
      {show("build") && <details>
        <summary>Attempts ({data.attempts.length})</summary>
        <ul>
          {data.attempts.map((attempt) => (
            <li key={attempt.attempt_id}>
              Try {attempt.try_sequence}: {attempt.kind} ·{" "}
              {attempt.status.replaceAll("_", " ")} · base{" "}
              {attempt.tested_base_sha.slice(0, 8)}
            </li>
          ))}
        </ul>
      </details>}
      {show("build") && data.assumptions.length > 0 && (
        <details>
          <summary>Assumptions</summary>
          <ul>
            {data.assumptions.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </details>
      )}
      {!focus && data.documentation.length > 0 && (
        <details>
          <summary>Documentation ({data.documentation.length})</summary>
          <ul>
            {data.documentation.map((source, i) => (
              <li key={i}>
                <a href={source.url} target="_blank" rel="noreferrer">
                  {source.title}
                </a>
                : {source.claim} · {source.artifact_locator}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!focus && data.errors.length > 0 && (
        <details>
          <summary>Preserved errors ({data.errors.length})</summary>
          <ul>
            {data.errors.map((error) => (
              <li key={error.error_id}>
                <a
                  href={`/api/implementation/${encodeURIComponent(runId)}/error/${encodeURIComponent(error.error_id)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {error.operation}
                </a>{" "}
                · {error.created_at}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
