# tsp-triager

Automated triage tool for [microsoft/typespec](https://github.com/microsoft/typespec) GitHub issues. Fetches open bug issues, extracts/generates reproductions, verifies them against the TypeSpec compiler, and produces a structured JSON report with a web dashboard UI.

## Architecture

```
src/triage/
  cli.ts                    # CLI entry point: parse args, dispatch
  orchestrate.ts            # Main pipeline: fetch → prompts → agents → aggregate
  fetch-issues.ts           # Fetch issues from GitHub via `gh`
  build-prompt.ts           # Build per-issue agent prompts from template
  execute-agent.ts          # Invoke copilot CLI for a single issue, capture token usage
  aggregate-results.ts      # Aggregate per-issue results into final report
  types.ts                  # Pipeline types (RawIssue, CLIOptions, AgentResult)
  constants.ts              # Shared constants (labels, emitters, paths)
  utils.ts                  # Utilities (playground links, actions, gh wrapper)
src/types.ts                # Shared UI types (TriageIssue, TriageResult)
src/helpers/
  verify-repro.ts           # Compiles TypeSpec code in a temp project, outputs JSON result
  decode-playground.ts      # Decodes lzutf8-compressed playground URLs
src/ui/                     # React + Vite dashboard for viewing triage results
```

## Setup

```bash
pnpm install
```

## Usage

### CLI mode (default) — full automated triage

Fetches issues, invokes copilot CLI for each one, and aggregates results:

```bash
pnpm triage --limit 5
pnpm triage --model claude-sonnet-4 --concurrency 3
```

Each issue gets its own copilot CLI agent that reads the prompt, triages, and writes a result JSON. Token usage is captured from agent output.

### Agent mode — for interactive sessions

Generates prompts for an interactive agent session to spawn sub-agents:

```bash
pnpm triage --mode agent --limit 10
```

Prompts are written to `temp/prompts/`. The calling agent spawns sub-agents for each issue, which write results to `temp/results/`.

### View dashboard

```bash
pnpm dev
```

Open the dashboard in your browser and drop in the `triage-results.json` file.

## CLI Options

```
pnpm triage [options]

Options:
  --output <path>        Output JSON file path (default: ./triage-results.json)
  --limit <n>            Max number of issues to process
  --verbose              Print detailed progress
  --repo <owner/repo>    GitHub repo (default: microsoft/typespec)
  --model <model>        AI model for copilot CLI agents (default: claude-sonnet-4)
  --concurrency <n>      Number of parallel agents (default: 1)
  --mode <cli|agent>     Execution mode (default: cli)
                           cli   — invoke copilot CLI as subprocess for each issue
                           agent — generate prompts only (for interactive agent sessions)
```

## JSON Output Schema

```json
{
  "generatedAt": "ISO timestamp",
  "compilerVersion": "latest",
  "summary": { "totalIssues": 0, "bugs": 0, "featureRequests": 0, ... },
  "issues": [
    {
      "number": 1234,
      "title": "...",
      "category": "bug | feature-request | unknown",
      "reproStatus": "has-repro | missing | generated | unable-to-repro",
      "verification": "still-reproduces | fixed | compile-error | not-verified",
      "reproCode": "...",
      "compilerOutput": "...",
      "suggestedAction": "..."
    }
  ]
}
```
