import type { JSX } from "react";
import type { TriageResult } from "../types.js";

interface SummaryProps {
  summary: TriageResult["summary"];
  timing?: TriageResult["timing"];
  tokenUsage?: TriageResult["tokenUsage"];
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function StatCard({
  label,
  value,
  color,
  format,
}: {
  label: string;
  value: number;
  color?: string;
  format?: "duration" | "number";
}): JSX.Element {
  const display = format === "duration" ? formatDuration(value) : value.toLocaleString();
  return (
    <div className="stat-card" style={color ? { borderTopColor: color } : undefined}>
      <div className="stat-value">{display}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Summary({ summary, timing, tokenUsage }: SummaryProps): JSX.Element {
  return (
    <div className="summary">
      <div className="stat-group">
        <h3>Issues</h3>
        <div className="stat-cards">
          <StatCard label="Total" value={summary.totalIssues} />
          <StatCard label="Bugs" value={summary.bugs} color="#d93f0b" />
          <StatCard label="Feature Requests" value={summary.featureRequests} color="#0075ca" />
          <StatCard label="Docs Bugs" value={summary.docsBugs} color="#0969da" />
          <StatCard label="Unknown" value={summary.unknown} color="#999" />
        </div>
      </div>
      <div className="stat-group">
        <h3>Reproductions</h3>
        <div className="stat-cards">
          <StatCard label="Has Repro" value={summary.withRepro} color="#2da44e" />
          <StatCard label="Generated" value={summary.generatedRepro} color="#bf8700" />
          <StatCard label="Missing" value={summary.withoutRepro} color="#d93f0b" />
        </div>
      </div>
      <div className="stat-group">
        <h3>Verification</h3>
        <div className="stat-cards">
          <StatCard label="Still Reproduces" value={summary.stillReproduces} color="#d93f0b" />
          <StatCard label="Fixed" value={summary.fixed} color="#2da44e" />
          <StatCard label="Compile Error" value={summary.compileError} color="#bf8700" />
          <StatCard label="Not Verified" value={summary.notVerified} color="#999" />
        </div>
      </div>
      {timing && (
        <div className="stat-group">
          <h3>Timing</h3>
          <div className="stat-cards">
            <StatCard label="Total" value={timing.totalSeconds} format="duration" />
            <StatCard label="Fetch" value={timing.fetchSeconds} format="duration" />
            <StatCard label="Prompts" value={timing.promptSeconds} format="duration" />
            <StatCard label="Aggregate" value={timing.aggregateSeconds} format="duration" />
          </div>
          {timing.agentWallClockSeconds > 0 && (
            <>
              <h4 style={{ margin: "0.5rem 0 0.25rem", color: "#8b949e" }}>Agent Processing</h4>
              <div className="stat-cards">
                <StatCard label="Wall Clock" value={timing.agentWallClockSeconds} format="duration" color="#58a6ff" />
                <StatCard label="Cumulative" value={timing.agentCumulativeSeconds} format="duration" />
                <StatCard label="Average" value={timing.agentAvgSeconds} format="duration" />
                <StatCard label="Min" value={timing.agentMinSeconds} format="duration" />
                <StatCard label="Max" value={timing.agentMaxSeconds} format="duration" />
              </div>
            </>
          )}
        </div>
      )}
      {tokenUsage && (tokenUsage.totalInput > 0 || tokenUsage.totalOutput > 0) && (
        <div className="stat-group">
          <h3>Token Usage</h3>
          <div className="stat-cards">
            <StatCard label="Input" value={tokenUsage.totalInput} />
            <StatCard label="Output" value={tokenUsage.totalOutput} />
            <StatCard label="Total" value={tokenUsage.totalInput + tokenUsage.totalOutput} />
          </div>
        </div>
      )}
    </div>
  );
}
