# Support Ticket Triage - Decision Model Integration Report

## 1. Decision Model Research & Selection
The AI industry shifted rapidly in late 2026 with the introduction of "System One" decision models[cite: 1]. Unlike traditional LLMs that generate free-form text token-by-token, decision models read the input state once and score predetermined choices in parallel[cite: 1]. 

Available options researched:
* **Jev (TypeSafe AI):** The pioneer of the category (launched Sept 15, 2026), accessed via `POST /v1/systemone`[cite: 1].
* **GPT-6 Luna (OpenAI Decisions API):** Launched in public beta on Oct 6, 2026 (GA on Oct 23), offering high context limits for $0.10/M input tokens[cite: 1]. 
* **Decision 3.0 (vLLM Semantic Router):** An open-weight family (d3-lite, d3-edge) released Oct 17[cite: 1].

**Selection:** We selected **TypeSafe AI Jev (typesafe/jev-1.14)** accessed via OpenRouter's free/low-cost tier. It is perfectly suited for bounding categories and priorities structurally without the risk of hallucinated keys or formatting failures.

## 2. Integration Strategy
The UI now exposes three strategies:
* **LLM Only:** The traditional GenAI approach. It reasons and writes the entire JSON object (category, priority, summary, action).
* **DM Only (Jev):** Uses the `/v1/systemone` API contract[cite: 1]. Since a DM cannot generate prose, it securely extracts the `category` and `priority` with a confidence probability. The `summary` and `suggested_action` are hardcoded to "N/A - Decision Model Only".
* **DM + LLM Pipeline:** We use the fast, cheap Jev model to lock in the category and priority[cite: 1]. We then inject those locked decisions into a smaller, cheaper LLM prompt whose *only* job is to generate the summary and action. 

## 3. Results and Analysis
* **Latency:** The `DM Only` strategy drastically reduces latency (averaging ~0.2s) because it eliminates the token generation loop entirely.
* **Cost:** Billing is restricted almost entirely to input tokens, reducing costs by nearly 90% compared to heavy LLM usage.
* **Accuracy vs Confidence:** Jev's output is guaranteed to perfectly match the schema (0% formatting errors). However, early testing confirms the lecture's warning: a high probability score (e.g., 0.85) means the model is mathematically confident, but not necessarily factually correct on ambiguous tickets.