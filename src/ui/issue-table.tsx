import { useState, useMemo, type JSX } from "react";
import type { TriageIssue } from "../types.js";

interface IssueTableProps {
  issues: TriageIssue[];
}

type SortField = "number" | "title" | "category" | "reproStatus" | "verification";
type SortDir = "asc" | "desc";

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  bug: { label: "🐛 Bug", className: "badge badge-bug" },
  "feature-request": { label: "🚀 Feature", className: "badge badge-feature" },
  unknown: { label: "❓ Unknown", className: "badge badge-unknown" },
};

const REPRO_BADGE: Record<string, { label: string; className: string }> = {
  "has-repro": { label: "✅ Has Repro", className: "badge badge-success" },
  generated: { label: "🔧 Generated", className: "badge badge-warning" },
  missing: { label: "❌ Missing", className: "badge badge-error" },
  "unable-to-repro": { label: "🤷 Unable", className: "badge badge-error" },
};

const VERIFY_BADGE: Record<string, { label: string; className: string }> = {
  "still-reproduces": { label: "🔴 Reproduces", className: "badge badge-error" },
  fixed: { label: "🟢 Fixed", className: "badge badge-success" },
  "compile-error": { label: "⚠️ Compile Error", className: "badge badge-warning" },
  "not-verified": { label: "⬜ Not Verified", className: "badge badge-neutral" },
};

function Badge({ config }: { config: { label: string; className: string } }): JSX.Element {
  return <span className={config.className}>{config.label}</span>;
}

function ReproSnippet({ issue }: { issue: TriageIssue }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  if (!issue.reproCode && !issue.compilerOutput) return null;

  return (
    <div className="repro-section">
      {issue.reproCode && (
        <details open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
          <summary className="repro-toggle">Repro Code</summary>
          <pre className="code-block">{issue.reproCode}</pre>
        </details>
      )}
      {issue.compilerOutput && (
        <details
          open={showOutput}
          onToggle={(e) => setShowOutput((e.target as HTMLDetailsElement).open)}
        >
          <summary className="repro-toggle">Compiler Output</summary>
          <pre className="code-block compiler-output">{issue.compilerOutput}</pre>
        </details>
      )}
    </div>
  );
}

export function IssueTable({ issues }: IssueTableProps): JSX.Element {
  const [sortField, setSortField] = useState<SortField>("number");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterVerification, setFilterVerification] = useState<string>("all");
  const [filterRepro, setFilterRepro] = useState<string>("all");
  const [search, setSearch] = useState("");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const sortIndicator = (field: SortField) => {
    if (sortField !== field) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  };

  const filtered = useMemo(() => {
    let result = [...issues];

    if (filterCategory !== "all") {
      result = result.filter((i) => i.category === filterCategory);
    }
    if (filterVerification !== "all") {
      result = result.filter((i) => i.verification === filterVerification);
    }
    if (filterRepro !== "all") {
      result = result.filter((i) => i.reproStatus === filterRepro);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.number.toString().includes(q) ||
          i.author.toLowerCase().includes(q) ||
          i.labels.some((l) => l.toLowerCase().includes(q)),
      );
    }

    result.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const cmp = typeof aVal === "number" ? aVal - (bVal as number) : String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [issues, filterCategory, filterVerification, filterRepro, search, sortField, sortDir]);

  return (
    <div className="table-container">
      <div className="filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search issues..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          <option value="bug">Bugs</option>
          <option value="feature-request">Feature Requests</option>
          <option value="unknown">Unknown</option>
        </select>
        <select value={filterRepro} onChange={(e) => setFilterRepro(e.target.value)}>
          <option value="all">All Repro Status</option>
          <option value="has-repro">Has Repro</option>
          <option value="generated">Generated</option>
          <option value="missing">Missing</option>
          <option value="unable-to-repro">Unable to Repro</option>
        </select>
        <select value={filterVerification} onChange={(e) => setFilterVerification(e.target.value)}>
          <option value="all">All Verification</option>
          <option value="still-reproduces">Still Reproduces</option>
          <option value="fixed">Fixed</option>
          <option value="compile-error">Compile Error</option>
          <option value="not-verified">Not Verified</option>
        </select>
        <span className="filter-count">{filtered.length} issues</span>
      </div>

      <table className="issue-table">
        <thead>
          <tr>
            <th className="sortable" onClick={() => handleSort("number")}>
              #{sortIndicator("number")}
            </th>
            <th className="sortable" onClick={() => handleSort("title")}>
              Title{sortIndicator("title")}
            </th>
            <th>Labels</th>
            <th className="sortable" onClick={() => handleSort("category")}>
              Category{sortIndicator("category")}
            </th>
            <th className="sortable" onClick={() => handleSort("reproStatus")}>
              Repro{sortIndicator("reproStatus")}
            </th>
            <th className="sortable" onClick={() => handleSort("verification")}>
              Verification{sortIndicator("verification")}
            </th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((issue) => (
            <tr key={issue.number}>
              <td>
                <a href={issue.url} target="_blank" rel="noopener noreferrer">
                  #{issue.number}
                </a>
              </td>
              <td className="title-cell">
                <a href={issue.url} target="_blank" rel="noopener noreferrer">
                  {issue.title}
                </a>
                <span className="author">by {issue.author}</span>
                <ReproSnippet issue={issue} />
              </td>
              <td className="labels-cell">
                {issue.labels.map((l) => (
                  <span key={l} className="label-tag">
                    {l}
                  </span>
                ))}
              </td>
              <td>
                <Badge config={CATEGORY_BADGE[issue.category] ?? CATEGORY_BADGE.unknown} />
              </td>
              <td>
                <Badge config={REPRO_BADGE[issue.reproStatus] ?? REPRO_BADGE.missing} />
              </td>
              <td>
                <Badge config={VERIFY_BADGE[issue.verification] ?? VERIFY_BADGE["not-verified"]} />
              </td>
              <td className="action-cell">{issue.suggestedAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
