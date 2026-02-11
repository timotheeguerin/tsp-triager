import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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
  category: "bug" | "feature-request" | "unknown";
  reproStatus: "has-repro" | "missing" | "generated" | "unable-to-repro";
  reproSource: "code-block" | "playground-link" | "generated" | null;
  reproCode: string | null;
  verification: "still-reproduces" | "fixed" | "compile-error" | "not-verified";
  compilerOutput: string | null;
  suggestedAction: string | null;
}

interface TriageResult {
  generatedAt: string;
  compilerVersion: string;
  summary: {
    totalIssues: number;
    bugs: number;
    featureRequests: number;
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

const EXCLUDED_LABELS = [
  "emitter:http-client-python",
  "emitter:http-client-csharp",
  "emitter:http-client-java",
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

  // Find unlabeled issues (no "bug" and no "feature-request" label)
  const bugNumbers = new Set(bugIssues.map((i) => i.number));
  const unlabeled = allIssues.filter((issue) => {
    if (bugNumbers.has(issue.number)) return false;
    const labelNames = issue.labels.map((l) => l.name);
    return !labelNames.includes("bug") && !labelNames.includes("feature-request");
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

  return `You are triaging a GitHub issue from the microsoft/typespec repository.
Your job is to analyze this issue and produce a JSON triage result.

## Issue Details
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

## Your Tasks

### 1. Classify the issue
- If it has the "bug" label → category = "bug"
- If it has the "feature-request" label → category = "feature-request"
- Otherwise, analyze the content:
  - Title starting with "[Bug]" or body containing "Describe the bug" + "Reproduction" → "bug"
  - Keywords like "error", "crash", "broken", "regression", "doesn't work" → lean "bug"
  - Keywords like "feature", "proposal", "suggestion", "enhancement" → "feature-request"
  - If unclear → "unknown"

### 2. Extract a reproduction (only for bugs)
Look for TypeSpec reproduction code in the issue body and comments:

**a) Playground links**: Look for URLs like \`https://typespec.io/playground?...\`
   - If found, decode using: \`npx tsx ${DECODE_SCRIPT} "<url>"\`
   - This outputs the TypeSpec source code to stdout

**b) TypeSpec code blocks**: Look for fenced code blocks with \`\`\`typespec or \`\`\`tsp language tags.
   - Also check unlabeled code blocks that contain TypeSpec keywords (import, model, op, namespace, using, interface, enum, union, scalar, decorators with @)

**c) Important**: Skip code blocks tagged as other languages (yaml, python, json, js, ts, csharp, bash, shell, etc.) unless they clearly contain TypeSpec code.

Prefer playground links over code blocks (they're more likely to be complete).

### 3. Verify the reproduction (only if you found repro code)
Save the repro TypeSpec code to a temp file and verify it compiles:

\`\`\`bash
cat > ./temp/triage-${issue.number}.tsp << 'TYPESPEC_EOF'
<repro code here>
TYPESPEC_EOF

npx tsx ${VERIFY_SCRIPT} ./temp/triage-${issue.number}.tsp
\`\`\`

The verify script outputs JSON: \`{ "success": boolean, "diagnostics": string, "exitCode": number }\`

Interpret the result by comparing the compiler output to the bug description:
- **success=true** (no errors): The bug may be fixed → verification = "fixed"
- **success=false, errors match the described bug**: → verification = "still-reproduces"
- **success=false, errors are unrelated** (broken/incomplete snippet): → verification = "compile-error"

### 4. If no repro found, try to create one
If the issue describes a bug but has no repro, try writing minimal TypeSpec code that demonstrates it.
Then verify with the same helper. If successful: reproSource = "generated", reproStatus = "generated".
If you can't create a working repro after a few attempts: reproStatus = "unable-to-repro".

### 5. Output
After completing analysis, output your result as a JSON file.
Write the result to: ${join(PROJECT_ROOT, ".results", `issue-${issue.number}.json`)}

The JSON must match this schema exactly:
\`\`\`json
{
  "number": ${issue.number},
  "title": "${issue.title.replace(/"/g, '\\"')}",
  "url": "${issue.url}",
  "author": "${issue.author.login}",
  "createdAt": "${issue.createdAt}",
  "labels": ${JSON.stringify(labelNames)},
  "category": "bug|feature-request|unknown",
  "reproStatus": "has-repro|missing|generated|unable-to-repro",
  "reproSource": "code-block|playground-link|generated|null",
  "reproCode": "the TypeSpec code or null",
  "verification": "still-reproduces|fixed|compile-error|not-verified",
  "compilerOutput": "compiler output string or null",
  "suggestedAction": "one of the suggested actions below"
}
\`\`\`

Suggested actions:
- "Bug confirmed — still reproduces with latest compiler."
- "May be fixed — no longer reproduces with latest compiler. Consider closing."
- "Repro code has errors unrelated to the bug. Needs manual review."
- "Missing reproduction. Needs repro from reporter."
- "Could not verify — needs manual review."
- "Feature request — not a bug."
- "Unclassified issue — needs manual review."
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

  // Create output directories
  const promptsDir = join(PROJECT_ROOT, ".prompts");
  const resultsDir = join(PROJECT_ROOT, ".results");
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
  // Each sub-agent reads the prompt, does the triage, and writes result JSON to .results/
  // After all agents complete, run this script again to aggregate.

  // Check if we should aggregate existing results
  console.log("\nChecking for existing agent results...");
  const triageIssues: TriageIssue[] = [];
  let found = 0;

  for (const issue of rawIssues) {
    const resultFile = join(resultsDir, `issue-${issue.number}.json`);
    if (existsSync(resultFile)) {
      try {
        const result = JSON.parse(readFileSync(resultFile, "utf-8"));
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
    `  Bugs: ${summary.bugs} | Feature requests: ${summary.featureRequests} | Unknown: ${summary.unknown}`,
  );
  console.log(
    `  With repro: ${summary.withRepro} | Generated: ${summary.generatedRepro} | Missing: ${summary.withoutRepro}`,
  );
  console.log(
    `  Still reproduces: ${summary.stillReproduces} | Fixed: ${summary.fixed} | Compile error: ${summary.compileError} | Not verified: ${summary.notVerified}`,
  );
  console.log(`  Results written to ${opts.output}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
