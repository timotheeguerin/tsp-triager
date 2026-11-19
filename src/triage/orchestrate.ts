import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CLIOptions } from "./types.js";
import { PROJECT_ROOT } from "./constants.js";
import { log } from "./utils.js";
import { fetchIssues } from "./fetch-issues.js";
import { buildAgentPrompt } from "./build-prompt.js";
import { executeAgent } from "./execute-agent.js";
import { aggregateResults, printSummary } from "./aggregate-results.js";

export async function orchestrate(opts: CLIOptions) {
  console.log("TypeSpec Issue Triage");
  console.log("===================================");
  console.log(`  Mode: ${opts.mode} | Model: ${opts.model} | Concurrency: ${opts.concurrency}`);
  log(opts, "Options:", opts);

  const startTime = performance.now();

  // Create output directories
  const tempDir = join(PROJECT_ROOT, "temp");
  const promptsDir = join(tempDir, "prompts");
  const resultsDir = join(tempDir, "results");
  if (existsSync(promptsDir)) {
    rmSync(promptsDir, { recursive: true });
  }
  mkdirSync(promptsDir, { recursive: true });
  mkdirSync(resultsDir, { recursive: true });

  // Step 1: Fetch issues
  const fetchStart = performance.now();
  const rawIssues = fetchIssues(opts);
  const fetchSeconds = (performance.now() - fetchStart) / 1000;

  // Step 2: Write agent prompts
  const promptStart = performance.now();
  console.log("\nWriting agent prompts...");
  for (const issue of rawIssues) {
    const prompt = buildAgentPrompt(issue);
    writeFileSync(join(promptsDir, `issue-${issue.number}.md`), prompt);
    log(opts, `  Written prompt for #${issue.number}`);
  }
  console.log(`  ${rawIssues.length} prompts written to ${promptsDir}/`);
  const promptSeconds = (performance.now() - promptStart) / 1000;

  // Step 3: Execute agents (cli mode) or stop here (agent mode)
  if (opts.mode === "cli") {
    console.log(`\nRunning agents (concurrency: ${opts.concurrency})...`);
    const agentStart = performance.now();

    if (opts.concurrency <= 1) {
      // Sequential execution
      for (let i = 0; i < rawIssues.length; i++) {
        const issue = rawIssues[i]!;
        console.log(`\n[${i + 1}/${rawIssues.length}] Issue #${issue.number}: ${issue.title}`);
        executeAgent(issue, opts);
      }
    } else {
      // Parallel execution with concurrency limit
      const queue = [...rawIssues];
      let index = 0;

      async function runBatch() {
        const promises: Promise<void>[] = [];
        while (index < queue.length) {
          const batch = queue.slice(index, index + opts.concurrency);
          index += batch.length;
          const batchPromises = batch.map(
            (issue, bi) =>
              new Promise<void>((resolve) => {
                const idx = index - batch.length + bi + 1;
                console.log(`\n[${idx}/${rawIssues.length}] Issue #${issue.number}: ${issue.title}`);
                executeAgent(issue, opts);
                resolve();
              }),
          );
          await Promise.all(batchPromises);
        }
        await Promise.all(promises);
      }

      await runBatch();
    }

    const agentWallSeconds = (performance.now() - agentStart) / 1000;
    console.log(`\nAll agents completed in ${Math.round(agentWallSeconds)}s`);
  } else {
    // Agent mode: just show instructions for interactive session
    console.log("\n  Agent prompts are ready. Spawn sub-agents for each issue:");
    console.log(`  Prompts: ${promptsDir}/`);
    console.log(`  Results: ${resultsDir}/`);
    console.log(`\n  Each agent should read its prompt file and write a result JSON.`);
  }

  // Step 4: Aggregate results
  const aggregateStart = performance.now();
  const result = aggregateResults(rawIssues, opts, { fetchSeconds, promptSeconds });
  const aggregateSeconds = (performance.now() - aggregateStart) / 1000;
  const totalSeconds = (performance.now() - startTime) / 1000;

  if (!result) {
    console.log("  No results found. Run agents to triage each issue.");
    console.log(`\n  Agent prompts are in: ${promptsDir}/`);
    console.log(`  Agents should write results to: ${resultsDir}/`);
    return;
  }

  // Fill in final timing
  result.timing.totalSeconds = Math.round(totalSeconds * 10) / 10;
  result.timing.aggregateSeconds = Math.round(aggregateSeconds * 10) / 10;

  writeFileSync(opts.output, JSON.stringify(result, null, 2));

  printSummary(result);
  console.log(`  Results written to ${opts.output}`);
  console.log(`\n  To view results in the UI, run:`);
  console.log(`    pnpm dev`);
  console.log(`  Then open: http://localhost:5173/tsp-triager/?file=triage-results.json`);
}
