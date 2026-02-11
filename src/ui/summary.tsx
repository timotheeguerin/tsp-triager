import type { JSX } from "react";
import type { TriageResult } from "../types.js";

interface SummaryProps {
  summary: TriageResult["summary"];
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}): JSX.Element {
  return (
    <div className="stat-card" style={color ? { borderTopColor: color } : undefined}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Summary({ summary }: SummaryProps): JSX.Element {
  return (
    <div className="summary">
      <div className="stat-group">
        <h3>Issues</h3>
        <div className="stat-cards">
          <StatCard label="Total" value={summary.totalIssues} />
          <StatCard label="Bugs" value={summary.bugs} color="#d93f0b" />
          <StatCard label="Feature Requests" value={summary.featureRequests} color="#0075ca" />
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
    </div>
  );
}
