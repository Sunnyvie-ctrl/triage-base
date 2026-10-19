"use client";

import { useCallback, useEffect, useState } from "react";
import "./admin.css";

type Summary = {
  key: string;
  calls: number;
  errors: number;
  input_tokens: number;
  output_tokens: number;
  thoughts_tokens: number;
  total_tokens: number;
  token_data_incomplete: boolean;
  estimated_cost_usd: number | null;
};

type AdminData = {
  totals: {
    calls: number;
    errors: number;
    errors_by_status: { status: number; calls: number }[];
    input_tokens: number;
    output_tokens: number;
    thoughts_tokens: number;
    total_tokens: number;
    token_data_incomplete: boolean;
    estimated_cost_usd: number | null;
  };
  by_prompt_version: Summary[];
  by_api: Summary[];
  by_model: Summary[];
};

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

const formatCost = (value: number | null) =>
  value === null ? "N/A" : `$${value.toFixed(4)}`;

function Metric({
  label,
  value,
  detail,
  tone = "",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <div className="admin-metric">
      <div className="admin-metric-label">{label}</div>
      <div className={`admin-metric-value ${tone}`}>{value}</div>
      <div className="admin-muted">{detail}</div>
    </div>
  );
}

function TokenBar({
  label,
  value,
  total,
  tone,
}: {
  label: string;
  value: number;
  total: number;
  tone: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div className="admin-token-row">
      <div className="admin-token-heading">
        <span>{label}</span>
        <strong>{formatNumber(value)}</strong>
      </div>
      <div className="admin-progress">
        <div
          className={`admin-progress-fill ${tone}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function SummaryTable({
  title,
  rows,
}: {
  title: string;
  rows: Summary[];
}) {
  return (
    <section className="admin-panel">
      <div className="admin-panel-heading">
        <h2>{title}</h2>
        <span>{rows.length} groups</span>
      </div>

      {rows.length === 0 ? (
        <p className="admin-empty">No data recorded yet.</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Calls</th>
                <th>Errors</th>
                <th>Tokens</th>
                <th>Cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="admin-name-cell" title={row.key}>
                    {row.key}
                  </td>
                  <td>{formatNumber(row.calls)}</td>
                  <td>
                    <span
                      className={
                        row.errors > 0
                          ? "admin-status admin-status-error"
                          : "admin-status admin-status-ok"
                      }
                    >
                      {formatNumber(row.errors)}
                    </span>
                  </td>
                  <td>
                    {formatNumber(row.total_tokens)}
                    {row.token_data_incomplete ? " *" : ""}
                  </td>
                  <td>{formatCost(row.estimated_cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AdminPage() {
  const [data, setData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const result = (await response.json()) as AdminData;
      setData(result);
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch {
      setError("Could not load analytics. Check that the server is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = data?.totals;
  const errorRate =
    totals && totals.calls > 0
      ? (totals.errors / totals.calls) * 100
      : 0;

  const tokenSum = totals
    ? totals.input_tokens +
      totals.output_tokens +
      totals.thoughts_tokens
    : 0;

  return (
    <main className="admin-page">
      <header className="admin-header">
        <div>
          <div className="admin-eyebrow">KESTREL ANALYTICS / MONITORING</div>
          <h1>AI Usage Dashboard</h1>
          <p className="admin-subtitle">
            Monitor requests, token usage, errors and estimated costs.
          </p>
        </div>

        <button
          className="admin-refresh"
          onClick={() => void refresh()}
          disabled={loading}
        >
          {loading ? "Loading..." : "↻ Refresh"}
        </button>
      </header>

      {error && <div className="admin-alert">{error}</div>}

      <div className="admin-section-title">
        <div>
          <h2>Overview</h2>
          <p>Summary of recorded model calls</p>
        </div>
        <span className="admin-updated">
          {updatedAt ? `Updated ${updatedAt}` : "Loading data"}
        </span>
      </div>

      <section className="admin-metrics">
        <Metric
          label="Total requests"
          value={totals ? formatNumber(totals.calls) : "—"}
          detail="Recorded model calls"
        />
        <Metric
          label="Estimated cost"
          value={totals ? formatCost(totals.estimated_cost_usd) : "—"}
          detail="Calculated from token prices"
          tone="admin-value-purple"
        />
        <Metric
          label="Total tokens"
          value={totals ? formatNumber(totals.total_tokens) : "—"}
          detail="Provider-reported total"
          tone="admin-value-blue"
        />
        <Metric
          label="Error rate"
          value={totals ? `${errorRate.toFixed(1)}%` : "—"}
          detail={`${totals ? formatNumber(totals.errors) : "—"} failed requests`}
          tone={errorRate > 0 ? "admin-value-red" : "admin-value-green"}
        />
      </section>

      <section className="admin-two-columns">
        <div className="admin-panel admin-token-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Token usage</h2>
              <p>Breakdown by token type</p>
            </div>
            <strong>{formatNumber(tokenSum)}</strong>
          </div>

          <TokenBar
            label="Input tokens"
            value={totals?.input_tokens ?? 0}
            total={tokenSum}
            tone="admin-fill-blue"
          />
          <TokenBar
            label="Output tokens"
            value={totals?.output_tokens ?? 0}
            total={tokenSum}
            tone="admin-fill-green"
          />
          <TokenBar
            label="Thinking tokens"
            value={totals?.thoughts_tokens ?? 0}
            total={tokenSum}
            tone="admin-fill-purple"
          />

          {totals?.token_data_incomplete && (
            <p className="admin-warning">
              Some token data is missing. The breakdown may be incomplete.
            </p>
          )}
        </div>

        <div className="admin-panel">
          <div className="admin-panel-heading">
            <div>
              <h2>Request health</h2>
              <p>Recorded HTTP errors</p>
            </div>
            <span
              className={
                errorRate > 0
                  ? "admin-status admin-status-error"
                  : "admin-status admin-status-ok"
              }
            >
              {errorRate > 0 ? "Needs attention" : "Healthy"}
            </span>
          </div>

          <div className="admin-health-summary">
            <div>
              <span className="admin-health-number">
                {totals ? formatNumber(totals.calls - totals.errors) : "—"}
              </span>
              <span className="admin-muted">Successful calls</span>
            </div>
            <div>
              <span className="admin-health-number">
                {totals ? formatNumber(totals.errors) : "—"}
              </span>
              <span className="admin-muted">Failed calls</span>
            </div>
          </div>

          <div className="admin-error-list">
            {totals?.errors_by_status.length ? (
              totals.errors_by_status.map((item) => (
                <div className="admin-error-item" key={item.status}>
                  <span>HTTP {item.status}</span>
                  <strong>{item.calls} calls</strong>
                </div>
              ))
            ) : (
              <p className="admin-empty">No recorded errors.</p>
            )}
          </div>
        </div>
      </section>

      <div className="admin-section-title admin-table-title">
        <div>
          <h2>Usage analytics</h2>
          <p>Compare usage across your models and endpoints.</p>
        </div>
      </div>

      <section className="admin-table-grid">
        <SummaryTable title="By model" rows={data?.by_model ?? []} />
        <SummaryTable title="By API" rows={data?.by_api ?? []} />
        <SummaryTable
          title="By prompt version"
          rows={data?.by_prompt_version ?? []}
        />
      </section>

      <footer className="admin-footer">
        Data from local logs. Costs are estimates, not live provider billing.
      </footer>
    </main>
  );
}
