import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import lzutf8 from "lzutf8";

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawIssue {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  labels: { name: string }[];
  body: string;
  createdAt: string;
  comments: { body: string }[];
}

export interface TriageIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  labels: string[];
  category: "bug" | "feature-request" | "docs-bug" | "unknown";
  reproStatus: "has-repro" | "missing" | "generated" | "unable-to-repro";
  reproSource: "code-block" | "playground-link" | "generated" | null;
  reproCode: string | null;
  emitter: string | null;
  compilerOptions: { emit?: string[] } | null;
  verification: "still-reproduces" | "fixed" | "compile-error" | "not-verified";
  compilerOutput: string | null;
  suggestedAction: string | null;
  playgroundLink: string | null;
  reproDescription: string | null;
}

interface TriageResult {
  generatedAt: string;
  compilerVersion: string;
  summary: {
    totalIssues: number;
    bugs: number;
    featureRequests: number;
    docsBugs: number;
    unknown: number;
    withRepro: number;
    withoutRepro: number;
    generatedRepro: number;
    stillReproduces: number;
    fixed: number;
    compileError: number;
    notVerified: number;
  };
  issues: TriageIssue[];
}

interface CLIOptions {
  output: string;
  limit: number | null;
  verbose: boolean;
  repo: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dirname, "..");
const VERIFY_SCRIPT = join(PROJECT_ROOT, "src", "helpers", "verify-repro.ts");
const DECODE_SCRIPT = join(PROJECT_ROOT, "src", "helpers", "decode-playground.ts");
const INSTRUCTIONS_FILE = join(PROJECT_ROOT, "triage-instructions.md");

const EXCLUDED_LABELS = [
  "emitter:client:python",
  "emitter:client:csharp",
  "emitter:client:java",
  "emitter:client:js",
  "feature",
  "emitter-framework",
];

const KNOWN_EMITTERS = [
  "@typespec/openapi3",
  "@typespec/openapi",
  "@typespec/json-schema",
  "@typespec/protobuf",
  "@typespec/xml",
  "@typespec/http-server-csharp",
  "@typespec/http-server-js",
  "@typespec/http-client-csharp",
  "@typespec/http-client-java",
  "@typespec/http-client-js",
  "@typespec/http-client-python",
];

// ── CLI Parsing ────────────────────────────────────────────────────────────────

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    output: join(PROJECT_ROOT, "triage-results.json"),
    limit: null,
    verbose: false,
    repo: "microsoft/typespec",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--output":
        opts.output = args[++i];
        break;
      case "--limit":
        opts.limit = parseInt(args[++i], 10);
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--repo":
        opts.repo = args[++i];
        break;
    }
  }
  return opts;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(opts: CLIOptions, ...msg: unknown[]) {
  if (opts.verbose) console.log("[triage]", ...msg);
}

function gh(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

function buildPlaygroundLink(code: string, emitters: string[]): string {
  const compressed = lzutf8.compress(code, { outputEncoding: "Base64" }) as string;
  const params = new URLSearchParams();
  params.set("c", compressed);
  if (emitters.length > 0) {
    params.set("e", emitters.join(","));
  }
  return `https://typespec.io/playground?${params.toString()}`;
}

// ── Fetch Issues ───────────────────────────────────────────────────────────────

function fetchIssues(opts: CLIOptions): RawIssue[] {
  console.log("Fetching issues...");
  const limit = opts.limit ?? 500;

  const bugJson = gh(
    `issue list --repo ${opts.repo} --state open --label "bug" --json number,title,url,author,labels,body,createdAt,comments --limit ${limit}`,
  );
  const bugIssues: RawIssue[] = JSON.parse(bugJson);

  const allJson = gh(
    `issue list --repo ${opts.repo} --state open --json number,title,url,author,labels,body,createdAt,comments --limit ${limit}`,
  );
  const allIssues: RawIssue[] = JSON.parse(allJson);

  // Find unlabeled issues (no "bug" and no "feature-request" and no "feature" label)
  const bugNumbers = new Set(bugIssues.map((i) => i.number));
  const unlabeled = allIssues.filter((issue) => {
    if (bugNumbers.has(issue.number)) return false;
    const labelNames = issue.labels.map((l) => l.name);
    return !labelNames.includes("bug") && !labelNames.includes("feature-request") && !labelNames.includes("feature");
  });

  const merged = [...bugIssues, ...unlabeled];

  // Exclude emitter-specific issues
  const filtered = merged.filter((issue) => {
    const labelNames = issue.labels.map((l) => l.name);
    return !EXCLUDED_LABELS.some((exc) => labelNames.includes(exc));
  });

  const limited = opts.limit ? filtered.slice(0, opts.limit) : filtered;

  console.log(
    `  Found ${bugIssues.length} bug issues, ${unlabeled.length} unlabeled. After filtering: ${filtered.length}. Processing: ${limited.length}`,
  );

  return limited;
}

// ── Build Agent Prompt ─────────────────────────────────────────────────────────

function buildAgentPrompt(issue: RawIssue): string {
  const labelNames = issue.labels.map((l) => l.name);
  const commentsText = issue.comments
    .map((c, i) => `--- Comment ${i + 1} ---\n${c.body}`)
    .join("\n\n");

  // Read shared instructions template
  const instructionsTemplate = readFileSync(INSTRUCTIONS_FILE, "utf-8");
  
  // Replace placeholders in the instructions
  const resultsDir = join(PROJECT_ROOT, "temp", "results");
  const instructions = instructionsTemplate
    .replace(/\{\{ISSUE_NUMBER\}\}/g, issue.number.toString())
    .replace(/\{\{ISSUE_TITLE\}\}/g, issue.title.replace(/"/g, '\\"'))
    .replace(/\{\{ISSUE_URL\}\}/g, issue.url)
    .replace(/\{\{ISSUE_AUTHOR\}\}/g, issue.author.login)
    .replace(/\{\{ISSUE_CREATED_AT\}\}/g, issue.createdAt)
    .replace(/\{\{ISSUE_LABELS\}\}/g, JSON.stringify(labelNames))
    .replace(/\{\{VERIFY_SCRIPT\}\}/g, VERIFY_SCRIPT)
    .replace(/\{\{DECODE_SCRIPT\}\}/g, DECODE_SCRIPT)
    .replace(/\{\{RESULTS_DIR\}\}/g, resultsDir)
    .replace(/\{\{KNOWN_EMITTERS\}\}/g, KNOWN_EMITTERS.join(", "));

  return `## Issue Details
- **Number**: #${issue.number}
- **Title**: ${issue.title}
- **URL**: ${issue.url}
- **Author**: ${issue.author.login}
- **Created**: ${issue.createdAt}
- **Labels**: ${labelNames.join(", ") || "(none)"}

## Issue Body
${issue.body ?? "(empty)"}

## Comments
${commentsText || "(no comments)"}

---

# Instructions

Please read the shared triage instructions at: ${INSTRUCTIONS_FILE}

The instructions have been customized for this issue below:

${instructions}
`;
}

// ── Main Pipeline ──────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();
  console.log("TypeSpec Issue Triage (Agent-based)");
  console.log("===================================");
  log(opts, "Options:", opts);

  const compilerVersion = "latest";
  console.log(`\n`);

  // Create output directories under temp/
  // Clear prompts (always regenerated), preserve results from agents
  const tempDir = join(PROJECT_ROOT, "temp");
  const promptsDir = join(tempDir, "prompts");
  const resultsDir = join(tempDir, "results");
  if (existsSync(promptsDir)) {
    rmSync(promptsDir, { recursive: true });
  }
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  // Step 1: Fetch issues
  const rawIssues = fetchIssues(opts);

  // Step 2: Write agent prompts
  console.log("\nWriting agent prompts...");
  for (const issue of rawIssues) {
    const prompt = buildAgentPrompt(issue);
    writeFileSync(join(promptsDir, `issue-${issue.number}.md`), prompt);
    log(opts, `  Written prompt for #${issue.number}`);
  }
  console.log(`  ${rawIssues.length} prompts written to ${promptsDir}/`);

  // Step 3: The caller (copilot agent) will now spawn sub-agents for each issue.
  // Each sub-agent reads the prompt, does the triage, and writes result JSON to temp/results/
  // After all agents complete, run this script again to aggregate.

  // Check if we should aggregate existing results
  console.log("\nChecking for existing agent results...");
  const triageIssues: TriageIssue[] = [];
  let found = 0;

  for (const issue of rawIssues) {
    const resultFile = join(resultsDir, `issue-${issue.number}.json`);
    if (existsSync(resultFile)) {
      try {
        const result = JSON.parse(readFileSync(resultFile, "utf-8")) as TriageIssue;
        // Compute playground link if repro code exists
        if (result.reproCode && !result.playgroundLink) {
          const emitters = result.compilerOptions?.emit ?? (result.emitter ? [result.emitter] : []);
          result.playgroundLink = buildPlaygroundLink(result.reproCode, emitters);
        }
        triageIssues.push(result);
        found++;
      } catch {
        console.warn(`  Warning: Failed to parse result for #${issue.number}`);
      }
    }
  }

  if (found === 0) {
    console.log("  No results yet. Run agents to triage each issue.");
    console.log(`\n  Agent prompts are in: ${promptsDir}/`);
    console.log(`  Agents should write results to: ${resultsDir}/`);
    return;
  }

  console.log(`  Found ${found}/${rawIssues.length} results.`);

  // Aggregate
  const summary = {
    totalIssues: triageIssues.length,
    bugs: triageIssues.filter((i) => i.category === "bug").length,
    featureRequests: triageIssues.filter((i) => i.category === "feature-request").length,
    docsBugs: triageIssues.filter((i) => i.category === "docs-bug").length,
    unknown: triageIssues.filter((i) => i.category === "unknown").length,
    withRepro: triageIssues.filter((i) => i.reproStatus === "has-repro").length,
    withoutRepro: triageIssues.filter((i) => i.reproStatus === "missing").length,
    generatedRepro: triageIssues.filter((i) => i.reproStatus === "generated").length,
    stillReproduces: triageIssues.filter((i) => i.verification === "still-reproduces").length,
    fixed: triageIssues.filter((i) => i.verification === "fixed").length,
    compileError: triageIssues.filter((i) => i.verification === "compile-error").length,
    notVerified: triageIssues.filter((i) => i.verification === "not-verified").length,
  };

  const result: TriageResult = {
    generatedAt: new Date().toISOString(),
    compilerVersion,
    summary,
    issues: triageIssues,
  };

  writeFileSync(opts.output, JSON.stringify(result, null, 2));

  console.log("\n===================================");
  console.log("Triage complete.");
  console.log(`  Total issues: ${summary.totalIssues}`);
  console.log(
    `  Bugs: ${summary.bugs} | Feature requests: ${summary.featureRequests} | Docs bugs: ${summary.docsBugs} | Unknown: ${summary.unknown}`,
  );
  console.log(
    `  With repro: ${summary.withRepro} | Generated: ${summary.generatedRepro} | Missing: ${summary.withoutRepro}`,
  );
  console.log(
    `  Still reproduces: ${summary.stillReproduces} | Fixed: ${summary.fixed} | Compile error: ${summary.compileError} | Not verified: ${summary.notVerified}`,
  );
  console.log(`  Results written to ${opts.output}`);
  console.log(`\n  To view results in the UI, run:`);
  console.log(`    pnpm dev`);
  console.log(`  Then open: http://localhost:5173/tsp-triager/?file=triage-results.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
