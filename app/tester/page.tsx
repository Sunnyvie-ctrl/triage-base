"use client";

import { useState } from "react";

type TestResult = {
  id: number;
  ticketSnippet: string;
  actualCategory?: string;
  actualPriority?: string;
  predictedCategory?: string;
  predictedPriority?: string;
  catMatch?: boolean;
  prioMatch?: boolean;
  success: boolean;
  error?: string;
};

export default function TesterPage() {
  const [dataset, setDataset] = useState<"100" | "500">("100");
  const [sampleSize, setSampleSize] = useState<number>(10);
  const [strategy, setStrategy] = useState<"llm" | "dm" | "dm+llm">("llm"); // NEW: Strategy state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<TestResult[]>([]);
  const [summary, setSummary] = useState<any>(null);

  async function runTest(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true);
    setResults([]);
    setSummary(null);

    try {
      const res = await fetch(`/api/dataset?name=${dataset}`);
      
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        throw new Error(`Dataset API returned HTML instead of JSON (Status ${res.status}). Check if /api/dataset exists.`);
      }

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const shuffled = [...data].sort(() => 0.5 - Math.random());
      const sample = shuffled.slice(0, sampleSize);

      setProgress({ current: 0, total: sample.length });

      const currentResults: TestResult[] = [];
      let catMismatches = 0;
      let prioMismatches = 0;
      
      let totalLatencyMs = 0;
      let totalCost = 0;
      const outcomeCounts: Record<string, number> = {};
      let usedModel = "unknown";

      for (let i = 0; i < sample.length; i++) {
        const item = sample[i];
        const ticketText = item.ticket || item.text || item.body || item.Ticket || "";
        const actualCategory = item.category || item.Category;
        const actualPriority = item.priority || item.Priority;

        const startTime = Date.now();

        try {
          const triageRes = await fetch("/api/triage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            // NEW: Passing strategy here for the batch test
            body: JSON.stringify({ ticket: ticketText, strategy }),
          });

          const latency = Date.now() - startTime;
          totalLatencyMs += latency;

          const triageData = await triageRes.json();

          if (triageRes.ok) {
            usedModel = triageRes.headers.get("x-llm-model") || usedModel;
            const costHeader = triageRes.headers.get("x-llm-estimated-cost-usd");
            if (costHeader) totalCost += parseFloat(costHeader);

            const predictedCategory = triageData.category;
            const predictedPriority = triageData.priority;

            outcomeCounts[predictedCategory] = (outcomeCounts[predictedCategory] || 0) + 1;

            let catMatch = true;
            let prioMatch = true;

            if (dataset === "100") {
              catMatch = String(actualCategory).toLowerCase() === String(predictedCategory).toLowerCase();
              prioMatch = String(actualPriority).toLowerCase() === String(predictedPriority).toLowerCase();

              if (!catMatch) catMismatches++;
              if (!prioMatch) prioMismatches++;
            }

            currentResults.push({
              id: i + 1,
              ticketSnippet: ticketText.substring(0, 80) + "...",
              actualCategory,
              actualPriority,
              predictedCategory,
              predictedPriority,
              catMatch,
              prioMatch,
              success: true,
            });
          } else {
            currentResults.push({ id: i + 1, ticketSnippet: "N/A", success: false, error: triageData.error });
          }
        } catch (err) {
          currentResults.push({ id: i + 1, ticketSnippet: "N/A", success: false, error: "Network Error" });
        }

        setResults([...currentResults]);
        setProgress({ current: i + 1, total: sample.length });
      }

      const accuracy = dataset === "100" 
        ? parseFloat((((sample.length - catMismatches) / sample.length) * 100).toFixed(1)) 
        : null;

      const runSummary = {
        model: usedModel,
        dataset,
        sampleSize: sample.length,
        accuracy,
        avgLatencyMs: Math.round(totalLatencyMs / sample.length),
        totalCostUsd: totalCost,
        outcomeCounts,
      };

      setSummary({ ...runSummary, catMismatches, prioMismatches });

      await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(runSummary),
      });

    } catch (err) {
      alert("Failed to run test: " + (err instanceof Error ? err.message : "Unknown error"));
    } finally {
      setRunning(false);
    }
  }

  return (
    <main style={{ padding: 20, maxWidth: 1000, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1>Smoke Test Runner</h1>
      
      <form onSubmit={runTest} style={{ padding: 20, backgroundColor: "#f8fafc", borderRadius: 8, marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
          
          {/* NEW: Architecture Strategy Dropdown inside Tester */}
          <label>
            <strong>Strategy:</strong><br/>
            <select value={strategy} onChange={(e) => setStrategy(e.target.value as any)} disabled={running} style={{ padding: 6, marginTop: 4, minWidth: 150 }}>
              <option value="llm">LLM Only</option>
              <option value="dm">Decision Model</option>
              <option value="dm+llm">DM + LLM Pipeline</option>
            </select>
          </label>

          <label>
            <strong>Dataset:</strong><br/>
            <select value={dataset} onChange={(e) => setDataset(e.target.value as "100" | "500")} disabled={running} style={{ padding: 6, marginTop: 4 }}>
              <option value="100">100 Labelled Tickets</option>
              <option value="500">500 Unlabelled Tickets</option>
            </select>
          </label>
          
          <label>
            <strong>Sample Size:</strong><br/>
            <input 
              type="number" 
              value={sampleSize} 
              onChange={(e) => setSampleSize(Number(e.target.value))} 
              min="1" max="500" 
              disabled={running} 
              style={{ padding: 6, marginTop: 4, width: 100 }}
            />
          </label>
        </div>
        
        <button type="submit" disabled={running} style={{ padding: "8px 16px", cursor: running ? "not-allowed" : "pointer" }}>
          {running ? `Running... (${progress.current}/${progress.total})` : "Start Smoke Test"}
        </button>
      </form>

      {summary && (
        <div style={{ padding: 16, backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, marginBottom: 24 }}>
          <h3>Evaluation Summary</h3>
          <ul style={{ fontSize: "1.1rem" }}>
            <li><strong>Model Used:</strong> {summary.model}</li>
            <li><strong>Avg Latency:</strong> {summary.avgLatencyMs} ms / ticket</li>
            <li><strong>Total Estimated Cost:</strong> ${summary.totalCostUsd.toFixed(5)}</li>
            {dataset === "100" && (
              <>
                <li>
                  <strong>Category Accuracy:</strong> {summary.accuracy}% ({summary.catMismatches} mismatches)
                </li>
                <li>
                  <strong>Priority Mismatches:</strong> {summary.prioMismatches}
                </li>
              </>
            )}
          </ul>
        </div>
      )}

      {results.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
              <th style={{ padding: 10 }}>#</th>
              <th style={{ padding: 10 }}>Ticket Snippet</th>
              {dataset === "100" && <th style={{ padding: 10 }}>Actual (Cat / Prio)</th>}
              <th style={{ padding: 10 }}>Predicted (Cat / Prio)</th>
            </tr>
          </thead>
          <tbody>
            {results.map((res) => (
              <tr key={res.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: 10 }}>{res.id}</td>
                <td style={{ padding: 10, fontSize: "0.85rem", color: "#475569" }}>{res.ticketSnippet}</td>
                
                {dataset === "100" && (
                  <td style={{ padding: 10 }}>
                    <div>{res.actualCategory}</div>
                    <div style={{ fontSize: "0.85rem", color: "gray" }}>{res.actualPriority}</div>
                  </td>
                )}
                
                <td style={{ padding: 10 }}>
                  {res.success ? (
                    <>
                      <div style={{ color: res.catMatch === false ? "red" : "inherit" }}>
                        {res.predictedCategory} {res.catMatch === false && "❌"}
                      </div>
                      <div style={{ fontSize: "0.85rem", color: res.prioMatch === false ? "red" : "gray" }}>
                        {res.predictedPriority} {res.prioMatch === false && "❌"}
                      </div>
                    </>
                  ) : (
                    <span style={{ color: "red" }}>{res.error}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}