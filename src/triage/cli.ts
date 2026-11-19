import { join } from "node:path";
import type { CLIOptions, TriageMode } from "./types.js";
import { PROJECT_ROOT, DEFAULT_MODEL, DEFAULT_CONCURRENCY, DEFAULT_REPO } from "./constants.js";
import { orchestrate } from "./orchestrate.js";

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const opts: CLIOptions = {
    output: join(PROJECT_ROOT, "triage-results.json"),
    limit: null,
    verbose: false,
    repo: DEFAULT_REPO,
    model: DEFAULT_MODEL,
    concurrency: DEFAULT_CONCURRENCY,
    mode: "cli",
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--output":
        opts.output = args[++i]!;
        break;
      case "--limit":
        opts.limit = parseInt(args[++i]!, 10);
        break;
      case "--verbose":
        opts.verbose = true;
        break;
      case "--repo":
        opts.repo = args[++i]!;
        break;
      case "--model":
        opts.model = args[++i]!;
        break;
      case "--concurrency":
        opts.concurrency = parseInt(args[++i]!, 10);
        break;
      case "--mode":
        opts.mode = args[++i] as TriageMode;
        break;
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: pnpm triage [options]

Options:
  --output <path>        Output JSON file path (default: ./triage-results.json)
  --limit <n>            Max number of issues to process
  --verbose              Print detailed progress
  --repo <owner/repo>    GitHub repo (default: ${DEFAULT_REPO})
  --model <model>        AI model for copilot CLI agents (default: ${DEFAULT_MODEL})
  --concurrency <n>      Number of parallel agents (default: ${DEFAULT_CONCURRENCY})
  --mode <cli|agent>     Execution mode (default: cli)
                           cli   — invoke copilot CLI as subprocess for each issue
                           agent — generate prompts only (for interactive agent sessions)
  --help                 Show this help message

Examples:
  pnpm triage --limit 5
  pnpm triage --model claude-sonnet-4 --concurrency 3
  pnpm triage --mode agent --limit 10
`);
}

orchestrate(parseArgs()).catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
