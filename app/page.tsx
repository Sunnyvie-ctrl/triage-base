"use client";

import { useState } from "react";
import type { TriageResult } from "../lib/schema";

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState("");
  const [explanation, setExplanation] = useState("");
  const [explaining, setExplaining] = useState(false);
  const [explanationError, setExplanationError] = useState("");

  const [tokens, setTokens] = useState<{ input: string; output: string; total: string } | null>(null);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setReply(null);
    setError(null);
    setTokens(null); 

    const ticket = `${subject}\n\n${body}`;

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Triage failed. Please try again.",
        );
        return;
      }

      setReply(data as TriageResult);
      setSubmittedTicket(ticket);
      setExplanation("");
      setExplanationError("");

      setTokens({
        input: res.headers.get("x-llm-input-tokens") || "0",
        output: res.headers.get("x-llm-output-tokens") || "0",
        total: res.headers.get("x-llm-total-tokens") || "0",
      });

    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function explainResult() {
    if (!reply || !submittedTicket || explaining) return;

    setExplaining(true);
    setExplanation("");
    setExplanationError("");

    try {
      const response = await fetch("/api/triage/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticket: submittedTicket,
          triage: reply,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : "Could not generate an explanation.",
        );
      }

      if (!response.body) {
        throw new Error("Streaming is not supported by this response.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setExplanation((previous) => previous + decoder.decode(value, { stream: true }));
      }

      const remaining = decoder.decode();
      if (remaining) {
        setExplanation((previous) => previous + remaining);
      }
    } catch (error) {
      setExplanationError(
        error instanceof Error ? error.message : "Could not generate an explanation.",
      );
    } finally {
      setExplaining(false);
    }
  }

  return (
    <main style={{ padding: 20, maxWidth: 800, margin: "0 auto" }}>
      <h1>Triage V2</h1>

      <form onSubmit={submitTicket}>
        <label style={{ display: "block", marginBottom: 12 }}>
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 12 }}>
          Body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Analyzing..." : "Send Ticket"}
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: "crimson", marginTop: 20 }}>
          {error}
        </p>
      )}

      {reply && (
        <section aria-live="polite" style={{ marginTop: 24 }}>
          <h2>Validated Triage Result</h2>
          <p><strong>Category:</strong> {reply.category}</p>
          <p><strong>Priority:</strong> {reply.priority}</p>
          <p><strong>Summary:</strong> {reply.summary}</p>
          <p><strong>Suggested action:</strong> {reply.suggested_action}</p>
          
          {tokens && (
            <div style={{ marginTop: 12, padding: "8px 12px", backgroundColor: "#f1f5f9", borderRadius: 6, fontSize: "0.9rem" }}>
              <strong>Token Usage:</strong> {tokens.input} input + {tokens.output} output = <strong>{tokens.total} total</strong>
            </div>
          )}

          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={explainResult} disabled={explaining}>
              {explaining ? "Generating explanation..." : "Explain this result"}
            </button>

            {explanationError && (
              <p role="alert" style={{ color: "crimson" }}>
                {explanationError}
              </p>
            )}

            {explanation && (
              <section aria-live="polite" style={{ marginTop: 12 }}>
                <h3>Why this result?</h3>
                <p style={{ whiteSpace: "pre-wrap" }}>{explanation}</p>
              </section>
            )}
          </div>
        </section>
      )}
    </main>
  );
}