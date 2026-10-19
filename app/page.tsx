"use client";

import { useState } from "react";
import type { TriageResult } from "../lib/schema";

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<TriageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setReply(null);
    setError(null);

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
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
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
        </section>
      )}
    </main>
  );
}
