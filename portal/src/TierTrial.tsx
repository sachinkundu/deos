import { useState } from "react";

interface Report {
  groups: Array<{
    tier: string;
    stage: string;
    completedAttemptCount: number;
    medianElapsedMs: number | null;
    firstPassSuccessCount: number;
    failedAttemptCount: number;
    retryCount: number;
  }>;
  exclusions: Array<{
    pairId: string;
    reason: string;
    members: Array<{ planned_tier: string; actual_tier: string | null }>;
  }>;
  pairedElapsedDifferences: Array<{
    pairId: string;
    standard2MinusBasicMs: number;
  }>;
}
export function TierTrial() {
  const [comparison, setComparison] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function load() {
    try {
      const response = await fetch(
        `/api/settings/sandbox-tier-trial?comparison=${encodeURIComponent(comparison)}`,
      );
      if (!response.ok) throw new Error(await response.text());
      setReport(await response.json());
      setError("");
    } catch (error) {
      setError(String(error));
    }
  }
  return (
    <section className="settings-page tier-trial">
      <a href="/settings">Back to settings</a>
      <h1>Sandbox speed comparison</h1>
      <p>
        Plan pairs before starting their issues. Results include failures and
        retries. This report does not choose a default tier.
      </p>
      <div className="settings-card">
        <h2>Save a planned comparison</h2>
        <p>
          Upload the prepared comparison manifest. Saved pairs cannot be edited.
        </p>
        <input
          aria-label="Comparison manifest"
          type="file"
          accept="application/json"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              const body = await file.text();
              const response = await fetch("/api/settings/sandbox-tier-trial", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
              });
              if (!response.ok) throw new Error(await response.text());
              setMessage(
                "Comparison saved. Start the planned issues in their saved order.",
              );
              setError("");
            } catch (error) {
              setError(String(error));
            }
          }}
        />
      </div>
      <div className="settings-card">
        <label>
          Comparison name{" "}
          <input
            value={comparison}
            onChange={(event) => setComparison(event.target.value)}
          />
        </label>
        <div className="settings-actions">
          <button disabled={!comparison.trim()} onClick={() => void load()}>
            View results
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {report && (
        <>
          <div className="tier-trial-results">
            <table>
              <thead>
                <tr>
                  {[
                    "Tier",
                    "Stage",
                    "Attempts",
                    "Median time",
                    "First-pass successes",
                    "Failures",
                    "Retries",
                  ].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.groups.map((group) => (
                  <tr key={group.tier + group.stage}>
                    <td>{group.tier === "basic" ? "Basic" : "Standard-2"}</td>
                    <td>{group.stage.replaceAll("_", " ")}</td>
                    <td>{group.completedAttemptCount}</td>
                    <td>
                      {group.medianElapsedMs === null
                        ? "No median"
                        : `${(group.medianElapsedMs / 1000).toFixed(1)} s`}
                    </td>
                    <td>{group.firstPassSuccessCount}</td>
                    <td>{group.failedAttemptCount}</td>
                    <td>{group.retryCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.groups.length === 0 && <p>No complete pairs yet.</p>}
          <h2>Paired time differences</h2>
          {report.pairedElapsedDifferences.map((pair) => (
            <p key={pair.pairId}>
              {pair.pairId}: Standard-2 minus Basic ={" "}
              {(pair.standard2MinusBasicMs / 1000).toFixed(1)} seconds.
            </p>
          ))}
          <h2>Excluded pairs</h2>
          {report.exclusions.map((pair) => (
            <p key={pair.pairId}>
              {pair.pairId}: {pair.reason.replaceAll("_", " ")}.{" "}
              {pair.members
                .map(
                  (member) =>
                    `Planned ${member.planned_tier}, actual ${member.actual_tier ?? "not started"}`,
                )
                .join("; ")}
              .
            </p>
          ))}
        </>
      )}
    </section>
  );
}
