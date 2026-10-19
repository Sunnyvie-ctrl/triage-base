"use client";

import { useState } from "react";

export default function TriagePage() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setReply(null);

    const ticket = `${subject}\n\n${body}`;

    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });

      const text = await res.text();
      if (!res.ok) {
        setReply(`Error: ${text}`);
      } else {
        setReply(text);
      }
    } catch {
      setReply("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 20 }}>
      <h1>Triage V1</h1>

      <form onSubmit={submitTicket}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Subject
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>

        <label style={{ display: "block", marginBottom: 8 }}>
          Body
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            style={{ display: "block", width: "100%", marginTop: 4 }}
          />
        </label>

        <button type="submit" disabled={loading}>
          {loading ? "Sending..." : "Send Ticket"}
        </button>
      </form>

      <section style={{ marginTop: 20 }}>
        <h2>LLM Reply (plain text)</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{reply ?? "No reply yet."}</pre>
      </section>
    </main>
  );
}
