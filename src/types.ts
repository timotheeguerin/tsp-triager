export interface TriageAction {
  label: string;
  icon: string;
  command: string;
  type: "area" | "comment" | "close";
}

export interface TriageIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  labels: string[];
  category: "bug" | "feature-request" | "docs-bug" | "unknown";
  reproStatus: "has-repro" | "missing" | "generated" | "unable-to-repro" | "n/a";
  reproSource: "code-block" | "playground-link" | "generated" | null;
  reproCode: string | null;
  emitter: string | null;
  compilerOptions: { emit?: string[] } | null;
  verification: "still-reproduces" | "fixed" | "compile-error" | "not-verified";
  compilerOutput: string | null;
  suggestedAction: string | null;
  playgroundLink: string | null;
  reproDescription: string | null;
  suggestedArea: string | null;
  actions: TriageAction[];
  tokenUsage?: { input: number; output: number };
  triageDurationSeconds?: number;
  model?: string;
}

export interface TriageResult {
  generatedAt: string;
  compilerVersion: string;
  model: string;
  timing: {
    totalSeconds: number;
    fetchSeconds: number;
    promptSeconds: number;
    aggregateSeconds: number;
    agentCumulativeSeconds: number;
    agentAvgSeconds: number;
    agentMinSeconds: number;
    agentMaxSeconds: number;
  };
  tokenUsage: {
    totalInput: number;
    totalOutput: number;
  };
  summary: {
    totalIssues: number;
    bugs: number;
    featureRequests: number;
    docsBugs: number;
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
