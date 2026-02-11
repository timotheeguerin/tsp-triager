# tsp-triager

Automated triage tool for [microsoft/typespec](https://github.com/microsoft/typespec) GitHub issues. Fetches open bug issues, extracts/generates reproductions, verifies them against the TypeSpec compiler, and produces a structured JSON report with a web dashboard UI.

## Architecture

```
src/triage.ts              # Orchestrator: fetches issues, generates agent prompts, aggregates results
src/helpers/verify-repro.ts    # Compiles TypeSpec code in a temp project, outputs JSON result
src/helpers/decode-playground.ts # Decodes lzutf8-compressed playground URLs
src/ui/                    # React + Vite dashboard for viewing triage results
```

## Setup

```bash
npm install
```

## Usage

### 1. Run triage (generates agent prompts)

```bash
npm run triage -- --limit 5
```

This fetches issues and writes agent prompts to `.prompts/`. Each prompt contains instructions for an AI agent to triage a single issue (extract repro, verify compilation, classify).

### 2. Run agents

Agents read prompts from `.prompts/issue-NNNN.md`, perform triage, and write results to `.results/issue-NNNN.json`.

### 3. Aggregate results

Re-run the triage script to aggregate agent results into `triage-results.json`:

```bash
npm run triage -- --limit 5
```

### 4. View dashboard

```bash
npm run dev
```

Open the dashboard in your browser and drop in the `triage-results.json` file.

## CLI Options

```
npm run triage -- [options]

Options:
  --output <path>       Output JSON file path (default: ./triage-results.json)
  --limit <n>           Max number of issues to process
  --verbose             Print detailed progress
  --repo <owner/repo>   GitHub repo (default: microsoft/typespec)
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
