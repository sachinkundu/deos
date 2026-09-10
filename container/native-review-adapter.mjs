import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

// Existing review runners remain responsible for prompts, schemas and adapters.
// A native pass yields at the model call. The live author invokes Codex's child
// tool; replay supplies that child's result to the same existing validator.
export class NativeReviewPending extends Error {
  constructor(request) {
    super("native reviewer input is ready");
    this.request = request;
  }
}

let ordinal = 0;
export const nativeReviewJudgment = async ({ prompt, schema, model, reasoning, sessionId = null }) => {
  const root = process.env.DEOS_NATIVE_REVIEW_ROOT;
  if (!root) throw new Error("native review root is missing");
  const index = ordinal++;
  const schemaText = typeof schema === "string" ? await readFile(schema, "utf8") : JSON.stringify(schema);
  const canonical = JSON.stringify({ index, prompt, schema: JSON.parse(schemaText), model, reasoning, sessionId });
  const inputSha256 = createHash("sha256").update(canonical).digest("hex");
  const saved = JSON.parse(await readFile(`${root}/judgments.json`, "utf8"));
  if (!Array.isArray(saved)) throw new Error("native judgments are invalid");
  const judgment = saved[index];
  if (judgment === undefined) {
    throw new NativeReviewPending({ index, prompt, schema: JSON.parse(schemaText), model, reasoning, sessionId, inputSha256 });
  }
  if (judgment.inputSha256 !== inputSha256 || typeof judgment.subagentId !== "string" ||
      (sessionId !== null && sessionId !== judgment.subagentId)) {
    throw new Error("native judgment replay changed its checked input or child identity");
  }
  return { result: judgment.result, sessionId: judgment.subagentId };
};

export const saveNativeReviewRequest = async (error) => {
  if (!(error instanceof NativeReviewPending)) return false;
  if (!process.env.DEOS_NATIVE_REVIEW_ROOT) throw error;
  await writeFile(`${process.env.DEOS_NATIVE_REVIEW_ROOT}/next.json`, JSON.stringify(error.request));
  return true;
};
