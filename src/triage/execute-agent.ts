import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TriageIssue } from "../types.js";
import type { CLIOptions, RawIssue, AgentResult } from "./types.js";
import { PROJECT_ROOT } from "./constants.js";
import { buildAgentPrompt } from "./build-prompt.js";

interface TokenUsage {
  input: number;
  output: number;
}

/** Parse token usage from copilot CLI output. */
export function parseTokenUsage(output: string): TokenUsage | null {
  // Look for token usage patterns in copilot CLI output
  // Common formats: "Tokens: 1234 input, 567 output" or "input_tokens: 1234" etc.
  const inputMatch = output.match(/(\d[\d,]*)\s*input\s*tokens?/i) ?? output.match(/input[_\s]*tokens?\s*[:=]\s*(\d[\d,]*)/i);
  const outputMatch = output.match(/(\d[\d,]*)\s*output\s*tokens?/i) ?? output.match(/output[_\s]*tokens?\s*[:=]\s*(\d[\d,]*)/i);

  if (inputMatch || outputMatch) {
    return {
      input: inputMatch ? parseInt(inputMatch[1]!.replace(/,/g, ""), 10) : 0,
      output: outputMatch ? parseInt(outputMatch[1]!.replace(/,/g, ""), 10) : 0,
    };
  }

  // Try "Total tokens: N" pattern
  const totalMatch = output.match(/total[_\s]*tokens?\s*[:=]\s*(\d[\d,]*)/i);
  if (totalMatch) {
    const total = parseInt(totalMatch[1]!.replace(/,/g, ""), 10);
    return { input: total, output: 0 };
  }

  return null;
}

/** Execute a single copilot CLI agent for one issue. */
export function executeAgent(issue: RawIssue, opts: CLIOptions): AgentResult {
  const startTime = performance.now();
  const promptsDir = join(PROJECT_ROOT, "temp", "prompts");
  const resultsDir = join(PROJECT_ROOT, "temp", "results");
  const resultFile = join(resultsDir, `issue-${issue.number}.json`);

  // Check if result already exists
  if (existsSync(resultFile)) {
    try {
      const existing = JSON.parse(readFileSync(resultFile, "utf-8")) as TriageIssue;
      const duration = (performance.now() - startTime) / 1000;
      console.log(`  #${issue.number}: Using existing result`);
      return {
        issue,
        triageIssue: existing,
        tokenUsage: existing.tokenUsage ?? null,
        error: null,
        durationSeconds: duration,
      };
    } catch {
      // Re-triage if result is corrupt
    }
  }

  // Write prompt file
  const prompt = buildAgentPrompt(issue);
  const promptFile = join(promptsDir, `issue-${issue.number}.md`);
  writeFileSync(promptFile, prompt);

  // Build copilot CLI command
  const cmd = [
    "copilot",
    "-p",
    `"Read the prompt file at ${promptFile} and follow the instructions within."`,
    "--model",
    opts.model,
    "--allow-all-tools",
    "--allow-all-paths",
    "--no-ask-user",
    "--add-dir",
    PROJECT_ROOT,
  ].join(" ");

  console.log(`  #${issue.number}: Starting agent (model: ${opts.model})...`);

  let agentOutput = "";
  let error: string | null = null;

  try {
    agentOutput = execSync(cmd, {
      encoding: "utf-8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 10 * 60 * 1000, // 10 minute timeout per issue
      cwd: PROJECT_ROOT,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    agentOutput = (err.stdout ?? "") + (err.stderr ?? "");
    error = `Agent exited with code ${err.status ?? "unknown"}`;
  }

  const durationSeconds = (performance.now() - startTime) / 1000;

  // Parse token usage from agent output
  const tokenUsage = parseTokenUsage(agentOutput);
  if (tokenUsage) {
    console.log(
      `  #${issue.number}: Tokens — input: ${tokenUsage.input.toLocaleString()}, output: ${tokenUsage.output.toLocaleString()}`,
    );
  }

  // Read the result file the agent should have written
  let triageIssue: TriageIssue | null = null;
  if (existsSync(resultFile)) {
    try {
      triageIssue = JSON.parse(readFileSync(resultFile, "utf-8")) as TriageIssue;
      // Inject token usage if agent didn't report it but we parsed it
      if (tokenUsage && triageIssue && (!triageIssue.tokenUsage || triageIssue.tokenUsage.input === 0)) {
        triageIssue.tokenUsage = tokenUsage;
        writeFileSync(resultFile, JSON.stringify(triageIssue, null, 2));
      }
      console.log(
        `  #${issue.number}: Done (${Math.round(durationSeconds)}s) — ${triageIssue.category}, repro: ${triageIssue.reproStatus}, verification: ${triageIssue.verification}`,
      );
    } catch {
      error = (error ?? "") + "; Failed to parse result file";
    }
  } else if (!error) {
    error = "Agent did not produce a result file";
  }

  if (error) {
    console.warn(`  #${issue.number}: Error — ${error}`);
  }

  return { issue, triageIssue, tokenUsage, error, durationSeconds };
}
