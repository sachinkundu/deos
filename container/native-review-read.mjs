import { pathToFileURL } from "node:url";
import { readFile, lstat } from "node:fs/promises";
import { createHash } from "node:crypto";

// Parse a single read command. Shell syntax, redirection, expansion, pipelines,
// process creation and arbitrary flags never reach a shell from reviewer input.
export const readCommand = (command) => {
  if (typeof command !== "string" || /[\n\r\0`$;|&<>]/.test(command)) throw new Error("unsupported review command");
  const tokens = command.match(/"[^"\\]*"|'[^']*'|[^\s'"\\]+/g) ?? [];
  if (tokens.join("").replace(/\s/g, "") !== command.replace(/\s/g, "")) throw new Error("invalid review command quoting");
  const args = tokens.map((token) => /^["']/.test(token) ? token.slice(1, -1) : token);
  const op = args.shift();
  if (!["cat", "ls", "pwd", "head", "tail", "sed", "rg", "wc"].includes(op)) throw new Error("review command is not read-only");
  return { op, args };
};

export const readSnapshot = async ({ op, args }, state) => {
  const context = JSON.parse(state.reviewJob.materializedContext);
  const root = `openspec/changes/${state.change}/`;
  const allowed = state.phase === "design" ? context.designReview.sources.map((source) => source.path) :
    state.before.filter((file) => file.path.startsWith(root) &&
      (file.path === `${root}proposal.md` || file.path === `${root}.openspec.yaml` || file.path.startsWith(`${root}specs/`))).map((file) => file.path);
  const normalize = (input) => {
    let name = input.replace(/^\/deos\/workspace\/repository\//, "").replace(/^\.\//, "");
    if (name.startsWith("/") || name.split("/").includes("..")) throw new Error("review path is outside the checked input");
    if (allowed.includes(name)) return name;
    if (allowed.includes(root + name)) return root + name;
    throw new Error("review path is not in the checked input");
  };
  const read = async (name) => {
    name = normalize(name);
    const file = `/deos/workspace/repository/${name}`;
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("review source is not a regular file");
    const bytes = await readFile(file);
    const before = state.before.find((item) => item.path === name);
    if (!before || createHash("sha256").update(bytes).digest("hex") !== before.sha256) throw new Error("review source changed");
    return bytes.toString("utf8");
  };
  if (op === "pwd" && args.length === 0) return "/deos/workspace/repository\n";
  if (op === "ls" && args.length === 0) return allowed.join("\n") + "\n";
  if (op === "cat" && args.length > 0 && !args.some((arg) => arg.startsWith("-"))) {
    return (await Promise.all(args.map(read))).join("");
  }
  if (["head", "tail"].includes(op)) {
    const count = args[0] === "-n" ? Number(args.splice(0, 2)[1]) : 10;
    if (!Number.isInteger(count) || count < 1 || count > 10000 || args.length !== 1) throw new Error("invalid review line range");
    const lines = (await read(args[0])).split("\n");
    return (op === "head" ? lines.slice(0, count) : lines.slice(-count)).join("\n");
  }
  if (op === "sed" && args.length === 3 && args[0] === "-n") {
    const range = args[1].match(/^(\d+)(?:,(\d+))?p$/);
    if (!range) throw new Error("invalid review line range");
    return (await read(args[2])).split("\n").slice(Number(range[1]) - 1, Number(range[2] ?? range[1])).join("\n");
  }
  if (op === "wc" && args.length === 2 && args[0] === "-l") return String((await read(args[1])).split("\n").length - 1) + "\n";
  if (op === "rg") {
    const flags = [];
    while (args[0]?.startsWith("-")) {
      const flag = args.shift();
      if (!["-n", "-i", "-F", "--"].includes(flag)) throw new Error("unsupported review search flag");
      flags.push(flag);
      if (flag === "--") break;
    }
    const pattern = args.shift();
    if (typeof pattern !== "string" || pattern.length > 256) throw new Error("invalid review search pattern");
    const matcher = flags.includes("-F") ? null : new RegExp(pattern, flags.includes("-i") ? "i" : "");
    const found = [];
    for (const name of args.length ? args : allowed) {
      const lines = (await read(name)).split("\n");
      lines.forEach((line, index) => {
        const match = matcher ? matcher.test(line) : (flags.includes("-i") ? line.toLowerCase().includes(pattern.toLowerCase()) : line.includes(pattern));
        if (match) found.push(`${name}:${index + 1}:${line}`);
      });
    }
    return found.join("\n") + "\n";
  }
  throw new Error("unsupported read-only review arguments");
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const state = JSON.parse(await readFile("/deos/native-review/state.json", "utf8"));
  if (state.stage !== "active") throw new Error("review session is not active");
  process.stdout.write(await readSnapshot(JSON.parse(Buffer.from(process.argv[2], "base64url").toString("utf8")), state));
}
