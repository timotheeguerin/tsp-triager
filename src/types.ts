export interface TriageIssue {
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  labels: string[];
  category: "bug" | "feature-request" | "unknown";
  reproStatus: "has-repro" | "missing" | "generated" | "unable-to-repro";
  reproSource: "code-block" | "playground-link" | "generated" | null;
  reproCode: string | null;
  verification: "still-reproduces" | "fixed" | "compile-error" | "not-verified";
  compilerOutput: string | null;
  suggestedAction: string | null;
}

export interface TriageResult {
  generatedAt: string;
  compilerVersion: string;
  summary: {
    totalIssues: number;
    bugs: number;
    featureRequests: number;
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
