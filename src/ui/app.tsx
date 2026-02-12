import { useState, useCallback, useEffect, type JSX } from "react";
import type { TriageResult } from "../types.js";
import { Summary } from "./summary.js";
import { IssueTable } from "./issue-table.js";
import "./styles.css";

export function App(): JSX.Element {
  const [data, setData] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceLabel, setSourceLabel] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    // Load from a local/relative file URL
    const fileParam = params.get("file");
    if (fileParam) {
      setLoading(true);
      setError(null);
      const fileUrl = fileParam.startsWith("http") ? fileParam : `${import.meta.env.BASE_URL}${fileParam.replace(/^\//, "")}`;
      fetch(fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`Failed to fetch ${fileParam} (${res.status})`);
          return res.json() as Promise<TriageResult>;
        })
        .then((result) => {
          setData(result);
          setSourceLabel(fileParam);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to load file");
        })
        .finally(() => {
          setLoading(false);
        });
      return;
    }

    const prParam = params.get("pr");
    if (!prParam) return;

    const prNumber = Number(prParam);
    if (!Number.isInteger(prNumber) || prNumber <= 0) {
      setError("Invalid pr query parameter");
      return;
    }

    const repo = params.get("repo") ?? inferRepoFromLocation();
    if (!repo) {
      setError("Unable to determine repo. Provide ?repo=owner/name&pr=123");
      return;
    }

    setLoading(true);
    setError(null);
    fetchTriageResultsFromPr(repo, prNumber)
      .then((result) => {
        setData(result);
        setSourceLabel(`PR #${prNumber} (${repo})`);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load PR results");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleFileLoad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as TriageResult;
        setData(parsed);
        setSourceLabel(file.name);
        setError(null);
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as TriageResult;
        setData(parsed);
        setSourceLabel(file.name);
        setError(null);
      } catch {
        setError("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
  }, []);

  if (!data) {
    return (
      <div className="app">
        <header className="header">
          <h1>TypeSpec Issue Triager</h1>
        </header>
        <div className="drop-zone" onDrop={handleDrop} onDragOver={handleDragOver}>
          <div className="drop-zone-content">
            <p className="drop-zone-icon">📋</p>
            {loading ? (
              <p>Loading results from PR...</p>
            ) : (
              <p>
                Drop a <code>triage-results.json</code> file here
              </p>
            )}
            <p className="drop-zone-or">or</p>
            <label className="file-input-label">
              Browse files
              <input type="file" accept=".json" onChange={handleFileLoad} hidden />
            </label>
          </div>
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <h1>TypeSpec Issue Triager</h1>
        <div className="header-meta">
          <span>Compiler v{data.compilerVersion}</span>
          {data.model && data.model !== "unknown" && <span>Model: {data.model}</span>}
          <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
          <button className="reset-btn" onClick={() => setData(null)}>
            Load different file
          </button>
        </div>
        {sourceLabel && <div className="header-meta">Loaded from {sourceLabel}</div>}
      </header>
      <Summary summary={data.summary} timing={data.timing} tokenUsage={data.tokenUsage} />
      <IssueTable issues={data.issues} />
    </div>
  );
}

function inferRepoFromLocation(): string | null {
  const host = window.location.hostname;
  if (!host.endsWith("github.io")) return null;

  const owner = host.replace(/\.github\.io$/, "");
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  if (pathParts.length === 0) return null;

  return `${owner}/${pathParts[0]}`;
}

async function fetchTriageResultsFromPr(repo: string, prNumber: number): Promise<TriageResult> {
  const prResponse = await fetch(`https://api.github.com/repos/${repo}/pulls/${prNumber}`);
  if (!prResponse.ok) {
    throw new Error(`Failed to fetch PR metadata (${prResponse.status})`);
  }

  const prData = (await prResponse.json()) as {
    head?: { sha?: string; repo?: { full_name?: string } };
  };
  const sha = prData.head?.sha;
  const fullName = prData.head?.repo?.full_name;
  if (!sha || !fullName) {
    throw new Error("PR metadata missing head info");
  }

  const rawUrl = `https://raw.githubusercontent.com/${fullName}/${sha}/.outputs/triage-results.json`;
  const resultResponse = await fetch(rawUrl);
  if (!resultResponse.ok) {
    throw new Error(`Failed to fetch triage results (${resultResponse.status})`);
  }

  return (await resultResponse.json()) as TriageResult;
}
