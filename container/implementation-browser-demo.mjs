import { randomUUID } from "node:crypto";
import { originalErrorText } from "./original-errors.mjs";

export function implementationToolQueue() {
  let pending = Promise.resolve();
  return {
    run: (work, onError) => pending = pending.then(work).catch(onError),
    drain: () => pending,
  };
}

export function implementationRequestQueue() {
  const commands = implementationToolQueue();
  const tools = implementationToolQueue();
  return {
    // A shell check may await browser requests from its child process. Holding
    // the browser queue until that process exits would deadlock both requests.
    // All browser calls, including whole demo collections, still share one queue.
    run: (action, work, onError) => (action === "check" ? commands : tools).run(work, onError),
    drain: async () => {
      await commands.drain();
      await tools.drain();
    },
  };
}

// This entire request runs inside the runtime's tool queue. It must never
// enqueue its individual steps on that queue or launch them in parallel.
export async function collectBrowserDemo(request, { browser, record }) {
  const plan = structuredClone(request);
  if (!Array.isArray(plan.scenarios) || !plan.scenarios.length)
    throw new Error("Demo needs an ordered scenarios list");
  const ids = new Set();
  for (const scenario of plan.scenarios) {
    if (typeof scenario.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(scenario.id) || ids.has(scenario.id))
      throw new Error("Demo scenario IDs must be distinct short names");
    ids.add(scenario.id);
    if (!Array.isArray(scenario.steps) || !scenario.steps.length)
      throw new Error(`Demo scenario ${scenario.id} needs steps`);
    if (scenario.target !== undefined && !["local", "hosted", "remote"].includes(scenario.target))
      throw new Error(`Invalid browser target for ${scenario.id}`);
    if (scenario.url !== undefined && typeof scenario.url !== "string")
      throw new Error(`Invalid start URL for ${scenario.id}`);
    if (scenario.viewport !== undefined &&
        (!Number.isInteger(scenario.viewport?.width) || !Number.isInteger(scenario.viewport?.height) ||
         scenario.viewport.width < 200 || scenario.viewport.width > 3840 ||
         scenario.viewport.height < 200 || scenario.viewport.height > 3840))
      throw new Error(`Invalid viewport for ${scenario.id}`);
    for (const step of scenario.steps) {
      // Harness settings, targets, arbitrary scripts and resets cannot change
      // during a scenario. A retry is a new complete demo request.
      const fields = {
        click: ["selector"], fill: ["selector", "text"], press: ["key", "modifiers"],
        wait: ["selector"], navigate: ["url"], screenshot: ["caption"],
      }[step.operation];
      if (!fields || Object.keys(step).some(key => key !== "operation" && !fields.includes(key)))
        throw new Error(`Unsupported demo step in ${scenario.id}: ${step.operation}`);
      if (step.operation === "screenshot" && (typeof step.caption !== "string" || !step.caption.trim()))
        throw new Error(`Screenshot caption missing in ${scenario.id}`);
    }
  }
  const collectionId = randomUUID();
  const captures = [];
  let scenarioId;
  let stepIndex = -1;
  try {
    await record({ event: "demo_started", collectionId, plan });
    for (const scenario of plan.scenarios) {
      scenarioId = scenario.id;
      stepIndex = -1;
      const viewport = scenario.viewport ?? { width: 1280, height: 900 };
      await record({ event: "scenario_started", collectionId, scenarioId });
      await browser({ action: "browser", operation: "reset", target: scenario.target ?? "local",
        url: scenario.url ?? "/", width: viewport.width, height: viewport.height });
      for (const [index, step] of scenario.steps.entries()) {
        stepIndex = index;
        await record({ event: "step_started", collectionId, scenarioId, stepIndex, step });
        const result = await browser({ ...step, action: "browser", target: scenario.target ?? "local",
          ...(step.operation === "screenshot" ? { captureId: `${collectionId}:${scenarioId}:${index}` } : {}) });
        await record({ event: "step_completed", collectionId, scenarioId, stepIndex, result });
        if (step.operation === "screenshot")
          captures.push({ scenarioId, stepIndex, ...result });
      }
      await record({ event: "scenario_completed", collectionId, scenarioId });
    }
    await record({ event: "demo_completed", collectionId, captures: captures.map(c => c.proof.id) });
    return { collectionId, captures };
  } catch (cause) {
    const error = new Error(`Demo ${scenarioId ?? "collection"} stopped at ${stepIndex < 0 ? "reset" : `step ${stepIndex + 1}`}: ${cause.message}`, { cause });
    error.result = { collectionId, scenarioId, stepIndex, captures };
    try {
      await record({ event: "demo_failed", ...error.result, error: originalErrorText(error) });
    } catch (storageError) {
      throw new AggregateError([error, storageError], "Demo failed and its diagnostic could not be saved", { cause: error });
    }
    throw error;
  }
}

// Corrections add completed collections. A new or failed collection must not
// remove earlier work. Partial captures stay in the diagnostic journal.
export function beginBrowserDemo(state) {
  state.demoCollection = true;
}

export function finishBrowserDemo(state, result) {
  state.proof.push(...result.captures.map(capture => capture.proof));
  state.proofLocations = { ...state.proofLocations, ...Object.fromEntries(result.captures.map(c => [c.proof.id,
    {collectionId:result.collectionId,scenarioId:c.scenarioId,stepIndex:c.stepIndex}])) };
  if (state.reviewProofIds) state.reviewProofIds = [...new Set([
    ...state.reviewProofIds, ...result.captures.map(capture => capture.proof.id),
  ])];
}
