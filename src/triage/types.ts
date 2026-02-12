import type { TriageIssue } from "../types.js";

export interface RawIssue {
  number: number;
  title: string;
  url: string;
  author: { login: string };
  labels: { name: string }[];
  body: string;
  createdAt: string;
  comments: { body: string }[];
}

export type TriageMode = "cli" | "agent";

export interface CLIOptions {
  output: string;
  limit: number | null;
  verbose: boolean;
  repo: string;
  model: string;
  concurrency: number;
  mode: TriageMode;
}

export interface AgentResult {
  issue: RawIssue;
  triageIssue: TriageIssue | null;
  tokenUsage: { input: number; output: number } | null;
  error: string | null;
  durationSeconds: number;
}
