import { useState, useMemo, useCallback, type JSX } from "react";
import Markdown from "react-markdown";
import type { TriageIssue, TriageAction } from "../types.js";

interface IssueTableProps {
  issues: TriageIssue[];
}

type SortField = "number" | "title" | "category" | "reproStatus" | "verification";
type SortDir = "asc" | "desc";

const CATEGORY_BADGE: Record<string, { label: string; className: string }> = {
  bug: { label: "🐛 Bug", className: "badge badge-bug" },
  "feature-request": { label: "🚀 Feature", className: "badge badge-feature" },
  "docs-bug": { label: "📝 Docs Bug", className: "badge badge-docs" },
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
  const [showDescription, setShowDescription] = useState(false);

  if (!issue.reproCode && !issue.compilerOutput && !issue.reproDescription) return null;

  return (
    <div className="repro-section">
      {issue.playgroundLink && (
        <a href={issue.playgroundLink} target="_blank" rel="noopener noreferrer" className="playground-link">
          ▶ Open in Playground
        </a>
      )}
      {issue.reproDescription && (
        <details
          open={showDescription}
          onToggle={(e) => setShowDescription((e.target as HTMLDetailsElement).open)}
        >
          <summary className="repro-toggle">Repro Details</summary>
          <div className="repro-description">
            <Markdown>{issue.reproDescription}</Markdown>
          </div>
        </details>
      )}
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

interface ActionButtonsProps {
  issue: TriageIssue;
  selectedCommands: Map<string, { command: string; label: string }>;
  onToggle: (key: string, action: TriageAction, issueNumber: number) => void;
}

function ActionButtons({ issue, selectedCommands, onToggle }: ActionButtonsProps): JSX.Element {
  const actions = issue.actions ?? [];

  if (actions.length === 0) {
    return <span className="action-text">{issue.suggestedAction}</span>;
  }

  const ACTION_CLASS: Record<string, string> = {
    area: "action-btn action-btn-area",
    comment: "action-btn action-btn-comment",
    close: "action-btn action-btn-close",
  };

  return (
    <div className="action-buttons">
      {actions.map((action) => {
        const key = `${issue.number}-${action.label}`;
        const isSelected = selectedCommands.has(key);
        return (
          <button
            key={action.label}
            className={`${ACTION_CLASS[action.type] ?? "action-btn"}${isSelected ? " action-btn-selected" : ""}`}
            title={action.command}
            onClick={() => onToggle(key, action, issue.number)}
          >
            {isSelected ? "✓" : action.icon} {action.label}
          </button>
        );
      })}
      {issue.suggestedAction && <span className="action-text">{issue.suggestedAction}</span>}
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
  const [selectedCommands, setSelectedCommands] = useState<Map<string, { command: string; label: string }>>(new Map());
  const [copied, setCopied] = useState(false);

  const toggleCommand = useCallback((key: string, action: TriageAction, issueNumber: number) => {
    setSelectedCommands((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { command: action.command, label: `#${issueNumber}: ${action.label}` });
      }
      return next;
    });
  }, []);

  const copyAll = useCallback(() => {
    const script = Array.from(selectedCommands.values())
      .map((v) => v.command)
      .join("\n");
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [selectedCommands]);

  const clearAll = useCallback(() => {
    setSelectedCommands(new Map());
  }, []);

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
          <option value="docs-bug">Docs Bugs</option>
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
                {issue.suggestedArea && !issue.labels.includes(issue.suggestedArea) && (
                  <span className="label-tag label-tag-suggested" title="Suggested area">
                    ✨ {issue.suggestedArea}
                  </span>
                )}
              </td>
              <td>
                <Badge config={CATEGORY_BADGE[issue.category] ?? CATEGORY_BADGE["unknown"]} />
              </td>
              <td>
                <Badge config={REPRO_BADGE[issue.reproStatus] ?? REPRO_BADGE["missing"]} />
              </td>
              <td>
                <Badge config={VERIFY_BADGE[issue.verification] ?? VERIFY_BADGE["not-verified"]} />
              </td>
              <td className="action-cell">
                <ActionButtons
                  issue={issue}
                  selectedCommands={selectedCommands}
                  onToggle={toggleCommand}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedCommands.size > 0 && (
        <div className="checkout-bar">
          <span className="checkout-count">{selectedCommands.size} action{selectedCommands.size > 1 ? "s" : ""} selected</span>
          <div className="checkout-items">
            {Array.from(selectedCommands.entries()).map(([key, val]) => (
              <span key={key} className="checkout-item">{val.label}</span>
            ))}
          </div>
          <div className="checkout-actions">
            <button className="checkout-clear" onClick={clearAll}>Clear</button>
            <button className="checkout-copy" onClick={copyAll}>
              {copied ? "✓ Copied!" : `📋 Copy ${selectedCommands.size} command${selectedCommands.size > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
