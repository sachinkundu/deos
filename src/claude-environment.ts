import { ClaudeRunner } from "./claude-runner.ts";
import { ClaudeReviewStore } from "./claude-review-store.ts";
import { CloudflareSandboxFactory } from "./sandbox-platform.ts";

// Optional until trusted enrollment; frozen OpenRouter runs need neither secret.
type ClaudeEnvironment = Env & { CLAUDE_SETUP_TOKEN?: string; CLAUDE_SETUP_TOKEN_VERSION?: string; CLAUDE_ENROLLMENT_KEY?: string };
export const claudeRunner = (env: ClaudeEnvironment): ClaudeRunner => new ClaudeRunner({
  db: env.DB, store: new ClaudeReviewStore(env.DB, env.ARTIFACTS),
  sandboxes: new CloudflareSandboxFactory(env.Sandbox, env.Standard2Sandbox), token: env.CLAUDE_SETUP_TOKEN,
  secretVersion: env.CLAUDE_SETUP_TOKEN_VERSION, signingKey: env.CLAUDE_ENROLLMENT_KEY ?? "",
});
