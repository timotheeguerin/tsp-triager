import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RawIssue } from "./types.js";
import {
  PROJECT_ROOT,
  VERIFY_SCRIPT,
  DECODE_SCRIPT,
  INSTRUCTIONS_FILE,
  KNOWN_EMITTERS,
} from "./constants.js";

export function buildAgentPrompt(issue: RawIssue): string {
  const labelNames = issue.labels.map((l) => l.name);
  const commentsText = issue.comments
    .map((c, i) => `--- Comment ${i + 1} ---\n${c.body}`)
    .join("\n\n");

  const instructionsTemplate = readFileSync(INSTRUCTIONS_FILE, "utf-8");

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
