import type { CLIOptions, RawIssue } from "./types.js";
import { EXCLUDED_LABELS } from "./constants.js";
import { gh, log } from "./utils.js";

export function fetchIssues(opts: CLIOptions): RawIssue[] {
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
