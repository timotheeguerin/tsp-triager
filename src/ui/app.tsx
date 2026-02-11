import { useState, useCallback, type JSX } from "react";
import type { TriageResult } from "../types.js";
import { Summary } from "./summary.js";
import { IssueTable } from "./issue-table.js";
import "./styles.css";

export function App(): JSX.Element {
  const [data, setData] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileLoad = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as TriageResult;
        setData(parsed);
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
            <p>Drop a <code>triage-results.json</code> file here</p>
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
          <span>Generated {new Date(data.generatedAt).toLocaleString()}</span>
          <button className="reset-btn" onClick={() => setData(null)}>
            Load different file
          </button>
        </div>
      </header>
      <Summary summary={data.summary} />
      <IssueTable issues={data.issues} />
    </div>
  );
}
