import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { TriageIssue, TriageResult } from "../types.js";
import type { CLIOptions, RawIssue } from "./types.js";
import { buildPlaygroundLink, buildActions } from "./utils.js";
import { PROJECT_ROOT } from "./constants.js";

export function aggregateResults(
  rawIssues: RawIssue[],
  opts: CLIOptions,
  timing: { fetchSeconds: number; promptSeconds: number },
): TriageResult | null {
  const resultsDir = join(PROJECT_ROOT, "temp", "results");
  console.log("\nAggregating agent results...");
  const triageIssues: TriageIssue[] = [];
  let found = 0;

  for (const issue of rawIssues) {
    const resultFile = join(resultsDir, `issue-${issue.number}.json`);
    if (existsSync(resultFile)) {
      try {
        const result = JSON.parse(readFileSync(resultFile, "utf-8")) as TriageIssue;
        if (result.reproCode && !result.playgroundLink) {
          const emitters = result.compilerOptions?.emit ?? (result.emitter ? [result.emitter] : []);
          result.playgroundLink = buildPlaygroundLink(result.reproCode, emitters);
        }
        result.actions = buildActions(result, opts.repo);
        triageIssues.push(result);
        found++;
      } catch {
        console.warn(`  Warning: Failed to parse result for #${issue.number}`);
      }
    }
  }

  if (found === 0) {
    return null;
  }

  console.log(`  Found ${found}/${rawIssues.length} results.`);

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

  const tokenUsage = {
    totalInput: triageIssues.reduce((sum, i) => sum + (i.tokenUsage?.input ?? 0), 0),
    totalOutput: triageIssues.reduce((sum, i) => sum + (i.tokenUsage?.output ?? 0), 0),
  };

  const agentDurations = triageIssues
    .map((i) => i.triageDurationSeconds)
    .filter((d): d is number => d != null && d > 0);
  const agentCumulativeSeconds = agentDurations.reduce((sum, d) => sum + d, 0);
  const agentAvgSeconds =
    agentDurations.length > 0
      ? Math.round((agentCumulativeSeconds / agentDurations.length) * 10) / 10
      : 0;
  const agentMinSeconds = agentDurations.length > 0 ? Math.min(...agentDurations) : 0;
  const agentMaxSeconds = agentDurations.length > 0 ? Math.max(...agentDurations) : 0;

  const modelCounts = new Map<string, number>();
  for (const issue of triageIssues) {
    if (issue.model) {
      modelCounts.set(issue.model, (modelCounts.get(issue.model) ?? 0) + 1);
    }
  }
  const detectedModel =
    [...modelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? opts.model;

  return {
    generatedAt: new Date().toISOString(),
    compilerVersion: "latest",
    model: detectedModel,
    timing: {
      totalSeconds: 0, // filled by caller
      fetchSeconds: Math.round(timing.fetchSeconds * 10) / 10,
      promptSeconds: Math.round(timing.promptSeconds * 10) / 10,
      aggregateSeconds: 0, // filled by caller
      agentCumulativeSeconds: Math.round(agentCumulativeSeconds * 10) / 10,
      agentAvgSeconds,
      agentMinSeconds: Math.round(agentMinSeconds * 10) / 10,
      agentMaxSeconds: Math.round(agentMaxSeconds * 10) / 10,
    },
    tokenUsage,
    summary,
    issues: triageIssues,
  };
}

export function printSummary(result: TriageResult) {
  const { summary, timing, tokenUsage } = result;
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
  console.log(`\n  Timing:`);
  console.log(
    `    Fetch: ${timing.fetchSeconds}s | Prompts: ${timing.promptSeconds}s | Aggregate: ${timing.aggregateSeconds}s | Total: ${timing.totalSeconds}s`,
  );
  const agentDurations = result.issues
    .map((i) => i.triageDurationSeconds)
    .filter((d): d is number => d != null && d > 0);
  if (agentDurations.length > 0) {
    console.log(
      `    Agent: cumulative ${timing.agentCumulativeSeconds}s | avg ${timing.agentAvgSeconds}s | min ${timing.agentMinSeconds}s | max ${timing.agentMaxSeconds}s (${agentDurations.length}/${summary.totalIssues} reported)`,
    );
  }
  if (tokenUsage.totalInput > 0 || tokenUsage.totalOutput > 0) {
    const totalTokens = tokenUsage.totalInput + tokenUsage.totalOutput;
    console.log(`\n  Token usage:`);
    console.log(
      `    Input: ${tokenUsage.totalInput.toLocaleString()} | Output: ${tokenUsage.totalOutput.toLocaleString()} | Total: ${totalTokens.toLocaleString()}`,
    );
  }
}
