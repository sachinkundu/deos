import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BoundedReview } from '../../portal/src/BoundedReview.tsx';
import { TranscriptViewer } from '../../portal/src/TranscriptViewer.tsx';
import '../../portal/src/styles.css';

async function load<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`);
  return response.json();
}
function Replay() {
  const [transcript, setTranscript] = useState<string | null>(null);
  return <main style={{ maxWidth: 960, margin: '32px auto', padding: 24 }}>
    <h1>Captured native review</h1>
    <p>Local replay of the offline Codex runtime probe. Real D1/R2 queries and portal components. No production run or live model judgment.</p>
    <p>Open either transcript to inspect the saved reviewer messages and raw events.</p>
    <BoundedReview runId="probe-run" phase="design" load={load} onTranscript={setTranscript} />
    {transcript && <TranscriptViewer attemptId={transcript} loadTranscript={load} onClose={() => setTranscript(null)} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Replay />);
