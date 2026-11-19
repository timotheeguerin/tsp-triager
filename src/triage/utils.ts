import { execSync } from "node:child_process";
import lzutf8 from "lzutf8";
import type { TriageIssue, TriageAction } from "../types.js";
import type { CLIOptions } from "./types.js";

export function log(opts: CLIOptions, ...msg: unknown[]) {
  if (opts.verbose) console.log("[triage]", ...msg);
}

export function gh(args: string): string {
  return execSync(`gh ${args}`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 });
}

export function buildPlaygroundLink(code: string, emitters: string[]): string {
  const compressed = lzutf8.compress(code, { outputEncoding: "Base64" }) as string;
  const params = new URLSearchParams();
  params.set("c", compressed);
  if (emitters.length > 0) {
    params.set("e", emitters.join(","));
  }
  return `https://typespec.io/playground?${params.toString()}`;
}

export function buildActions(issue: TriageIssue, repo: string): TriageAction[] {
  const actions: TriageAction[] = [];

  if (issue.suggestedArea && !issue.labels.includes(issue.suggestedArea)) {
    const removeNeedsArea = issue.labels.includes("needs-area") ? ` --remove-label needs-area` : "";
    actions.push({
      label: `Add ${issue.suggestedArea}`,
      icon: "🏷️",
      command: `gh issue edit ${issue.number} --add-label "${issue.suggestedArea}"${removeNeedsArea} --repo ${repo}`,
      type: "area",
    });
  }

  if (issue.reproStatus === "missing" && issue.category === "bug") {
    actions.push({
      label: "Request repro",
      icon: "💬",
      command: `gh issue comment ${issue.number} --repo ${repo} --body "Thanks for filing this issue! Could you provide a minimal reproduction? You can use the [TypeSpec Playground](https://typespec.io/playground) to create one and share the link. This helps us investigate and fix the issue faster."`,
      type: "comment",
    });
  }

  if (issue.verification === "fixed") {
    actions.push({
      label: "Close as fixed",
      icon: "✅",
      command: `gh issue close ${issue.number} --repo ${repo} --comment "This issue appears to be fixed in the latest version of the compiler. Please reopen if you can still reproduce it."`,
      type: "close",
    });
  }

  if (issue.reproStatus === "generated" && issue.reproCode) {
    const playgroundUrl = issue.playgroundLink ?? "";
    const body = playgroundUrl
      ? `I was able to reproduce this issue. Here is a minimal reproduction:\n\n[Open in Playground](${playgroundUrl})`
      : `I was able to reproduce this issue with the following code:\n\n\`\`\`typespec\n${issue.reproCode}\n\`\`\``;
    actions.push({
      label: "Share repro",
      icon: "📋",
      command: `gh issue comment ${issue.number} --repo ${repo} --body ${JSON.stringify(body)}`,
      type: "comment",
    });
  }

  return actions;
}
