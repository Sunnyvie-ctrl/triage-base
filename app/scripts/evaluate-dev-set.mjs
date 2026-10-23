
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SCRIPT_DIR, "..");
const PROJECT_DIR = path.resolve(APP_DIR, "..");

const CSV_PATH = path.resolve(
  PROJECT_DIR,
  process.argv[2] ?? "data/support_tickets_100_labelled.csv",
);

const TRIAGE_URL =
  process.env.TRIAGE_URL ?? "http://localhost:3033/api/triage";

const RUNS_DIR = path.join(APP_DIR, "runs");

const CATEGORIES = [
  "billing",
  "technical_bug",
  "account",
  "feature_request",
];

const PRIORITIES = ["low", "medium", "high"];

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  text = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"' && field.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (quoted) {
    throw new Error("CSV contains an unclosed quoted field.");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length < 2) {
    throw new Error("CSV has no ticket rows.");
  }

  const headers = rows[0].map((header) => header.trim());

  return rows
    .slice(1)
    .filter((values) => values.some((value) => value.trim() !== ""))
    .map((values) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          values[index] ?? "",
        ]),
      ),
    );
}

function safeFilename(value) {
  return String(value ?? "unknown")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 100);
}

function increment(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}

function makeMatrix(labels) {
  return Object.fromEntries(
    labels.map((actual) => [
      actual,
      Object.fromEntries(labels.map((predicted) => [predicted, 0])),
    ]),
  );
}

function accuracy(correct, total) {
  return total === 0 ? null : Number((correct / total).toFixed(4));
}

function readNumericHeader(response, name) {
  const value = response.headers.get(name);

  if (value === null || value.trim() === "") return null;

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

async function main() {
  const csv = await fs.readFile(CSV_PATH, "utf8");
  const tickets = parseCSV(csv);

  if (tickets.length === 0) {
    throw new Error("The CSV contains no ticket rows.");
  }

  const requiredColumns = [
    "ticket_id",
    "body",
    "subject",
    "category",
    "priority",
    "tags",
  ];

  const missing = requiredColumns.filter(
    (column) => !(column in tickets[0]),
  );

  if (missing.length) {
    throw new Error(`Missing CSV columns: ${missing.join(", ")}`);
  }

  const seenIds = new Set();

  for (const ticket of tickets) {
    if (!ticket.ticket_id.trim()) {
      throw new Error("A ticket has no ticket_id.");
    }

    if (seenIds.has(ticket.ticket_id)) {
      throw new Error(`Duplicate ticket_id: ${ticket.ticket_id}`);
    }

    seenIds.add(ticket.ticket_id);

    if (!CATEGORIES.includes(ticket.category)) {
      throw new Error(
        `Unexpected expected category for ${ticket.ticket_id}: ${ticket.category}`,
      );
    }

    if (!PRIORITIES.includes(ticket.priority)) {
      throw new Error(
        `Unexpected expected priority for ${ticket.ticket_id}: ${ticket.priority}`,
      );
    }

    if (!ticket.body.trim() && !ticket.subject.trim()) {
      throw new Error(
        `Ticket ${ticket.ticket_id} has no body or subject.`,
      );
    }
  }

  const results = [];
  const outcomeCounts = {};
  const categoryMatrix = makeMatrix(CATEGORIES);
  const priorityMatrix = makeMatrix(PRIORITIES);

  let categoryCorrect = 0;
  let priorityCorrect = 0;
  let categoryEvaluated = 0;
  let priorityEvaluated = 0;
  let totalLatencyMs = 0;

  let totalEstimatedCostUsd = 0;
  let knownCostCalls = 0;

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalThoughtsTokens = 0;
  let knownInputTokenCalls = 0;
  let knownOutputTokenCalls = 0;
  let knownThoughtsTokenCalls = 0;

  let runModel = null;
  let promptVersion = null;


  let quotaExhausted = false;

  console.log(`Evaluating ${tickets.length} tickets`);
  console.log(`CSV: ${CSV_PATH}`);
  console.log(`Endpoint: ${TRIAGE_URL}`);

  for (let index = 0; index < tickets.length; index++) {
    const ticket = tickets[index];

    const ticketText = [
      ticket.subject.trim()
        ? `Subject: ${ticket.subject.trim()}`
        : "",
      ticket.body.trim(),
    ]
      .filter(Boolean)
      .join("\n\n");

    const started = Date.now();

    let status = 0;
    let prediction = null;
    let safeError = null;
    let outcome = "network_error";
    let estimatedCostUsd = null;

    const usage = {
      input_tokens: null,
      output_tokens: null,
      thoughts_tokens: null,
      total_tokens: null,
    };

    let latencyMs = 0;

    try {
      const response = await fetch(TRIAGE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket: ticketText }),
        signal: AbortSignal.timeout(60000),
      });

      status = response.status;
      outcome = String(status);


      if (status === 429) {
        quotaExhausted = true;
      }

      const body = await response.json().catch(() => null);
      latencyMs = Date.now() - started;

      if (response.ok && body && typeof body === "object") {
        prediction = {
          category: body.category ?? null,
          priority: body.priority ?? null,
          summary: body.summary ?? null,
          suggested_action: body.suggested_action ?? null,
        };
      } else {
        safeError =
          typeof body?.error === "string"
            ? body.error
            : "Request failed.";
      }

      usage.input_tokens = readNumericHeader(
        response,
        "x-llm-input-tokens",
      );
      usage.output_tokens = readNumericHeader(
        response,
        "x-llm-output-tokens",
      );
      usage.thoughts_tokens = readNumericHeader(
        response,
        "x-llm-thoughts-tokens",
      );
      usage.total_tokens = readNumericHeader(
        response,
        "x-llm-total-tokens",
      );

      estimatedCostUsd = readNumericHeader(
        response,
        "x-llm-estimated-cost-usd",
      );

      runModel ??= response.headers.get("x-llm-model");
      promptVersion ??= response.headers.get("x-llm-prompt-version");
    } catch (error) {
      latencyMs = Date.now() - started;

      safeError =
        error?.name === "TimeoutError"
          ? "Request timed out."
          : "Could not reach the triage endpoint.";
    }

    totalLatencyMs += latencyMs;
    increment(outcomeCounts, outcome);

    if (usage.input_tokens !== null) {
      totalInputTokens += usage.input_tokens;
      knownInputTokenCalls++;
    }

    if (usage.output_tokens !== null) {
      totalOutputTokens += usage.output_tokens;
      knownOutputTokenCalls++;
    }

    if (usage.thoughts_tokens !== null) {
      totalThoughtsTokens += usage.thoughts_tokens;
      knownThoughtsTokenCalls++;
    }

    if (estimatedCostUsd !== null) {
      totalEstimatedCostUsd += estimatedCostUsd;
      knownCostCalls++;
    }

    if (prediction) {
      if (CATEGORIES.includes(prediction.category)) {
        categoryEvaluated++;
        categoryMatrix[ticket.category][prediction.category]++;

        if (prediction.category === ticket.category) {
          categoryCorrect++;
        }
      }

      if (PRIORITIES.includes(prediction.priority)) {
        priorityEvaluated++;
        priorityMatrix[ticket.priority][prediction.priority]++;

        if (prediction.priority === ticket.priority) {
          priorityCorrect++;
        }
      }
    }

    results.push({
      ticket_id: ticket.ticket_id,
      expected: {
        category: ticket.category,
        priority: ticket.priority,
      },
      prediction,
      outcome,
      status,
      latency_ms: latencyMs,
      tokens: usage,
      estimated_cost_usd: estimatedCostUsd,
      tags: (ticket.tags ?? "")
        .split(/[;,|]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      error: safeError,
    });

    console.log(
      `[${index + 1}/${tickets.length}] ${ticket.ticket_id}: ${outcome}, ${latencyMs} ms`,
    );

    if (quotaExhausted) {
      console.warn(
        "HTTP 429 received. Stopping evaluation to avoid more failed requests.",
      );
      break;
    }

    if (index < tickets.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  const processedCount = results.length;
  const remainingCount = tickets.length - processedCount;
  const runComplete = processedCount === tickets.length;


  const tagAccumulators = {};

  for (const result of results) {
    for (const tag of result.tags) {
      const slice = (tagAccumulators[tag] ??= {
        tickets: 0,
        outcomes: {},
        category_correct: 0,
        category_evaluated: 0,
        priority_correct: 0,
        priority_evaluated: 0,
        total_latency_ms: 0,
        cost_sum_usd: 0,
        known_cost_calls: 0,
      });

      slice.tickets++;
      increment(slice.outcomes, result.outcome);
      slice.total_latency_ms += result.latency_ms;

      if (result.prediction) {
        if (CATEGORIES.includes(result.prediction.category)) {
          slice.category_evaluated++;

          if (result.prediction.category === result.expected.category) {
            slice.category_correct++;
          }
        }

        if (PRIORITIES.includes(result.prediction.priority)) {
          slice.priority_evaluated++;

          if (result.prediction.priority === result.expected.priority) {
            slice.priority_correct++;
          }
        }
      }

      if (result.estimated_cost_usd !== null) {
        slice.cost_sum_usd += result.estimated_cost_usd;
        slice.known_cost_calls++;
      }
    }
  }

  const tagSlices = Object.fromEntries(
    Object.entries(tagAccumulators).map(([tag, slice]) => [
      tag,
      {
        tickets: slice.tickets,
        outcome_counts: slice.outcomes,
        category_accuracy: accuracy(
          slice.category_correct,
          slice.category_evaluated,
        ),
        category_correct: slice.category_correct,
        category_evaluated: slice.category_evaluated,
        priority_accuracy: accuracy(
          slice.priority_correct,
          slice.priority_evaluated,
        ),
        priority_correct: slice.priority_correct,
        priority_evaluated: slice.priority_evaluated,
        mean_latency_ms: Number(
          (slice.total_latency_ms / slice.tickets).toFixed(1),
        ),
        estimated_cost_usd:
          slice.known_cost_calls === slice.tickets
            ? Number(slice.cost_sum_usd.toFixed(8))
            : null,
        known_cost_calls: slice.known_cost_calls,
      },
    ]),
  );

  const timestamp = new Date();
  const date = timestamp.toISOString().slice(0, 10);
  const time = timestamp.toISOString().slice(11, 19).replaceAll(":", "-");

  const model = safeFilename(
    runModel ?? process.env.LLM_MODEL ?? "unknown-model",
  );
  const version = safeFilename(promptVersion ?? "unknown-prompt");
  const filename = `${date}-${version}-${model}-${time}.json`;

  const report = {
    created_at: timestamp.toISOString(),
    endpoint: TRIAGE_URL,
    model: runModel ?? process.env.LLM_MODEL ?? null,
    prompt_version: promptVersion,

    total_tickets: tickets.length,
    processed_tickets: processedCount,
    remaining_tickets: remainingCount,
    run_complete: runComplete,
    stopped_reason: quotaExhausted ? "http_429" : null,

    outcome_counts: outcomeCounts,
    metrics: {
      category_accuracy: accuracy(categoryCorrect, categoryEvaluated),
      category_correct: categoryCorrect,
      category_evaluated: categoryEvaluated,
      priority_accuracy: accuracy(priorityCorrect, priorityEvaluated),
      priority_correct: priorityCorrect,
      priority_evaluated: priorityEvaluated,

      mean_latency_ms:
        processedCount > 0
          ? Number((totalLatencyMs / processedCount).toFixed(1))
          : null,
      total_latency_ms: totalLatencyMs,

      estimated_cost_usd:
        processedCount > 0 && knownCostCalls === processedCount
          ? Number(totalEstimatedCostUsd.toFixed(8))
          : null,
      known_cost_calls: knownCostCalls,

      token_totals: {
        input_tokens:
          processedCount > 0 && knownInputTokenCalls === processedCount
            ? totalInputTokens
            : null,
        output_tokens:
          processedCount > 0 && knownOutputTokenCalls === processedCount
            ? totalOutputTokens
            : null,
        thoughts_tokens:
          processedCount > 0 && knownThoughtsTokenCalls === processedCount
            ? totalThoughtsTokens
            : null,
        calls_with_input_usage: knownInputTokenCalls,
        calls_with_output_usage: knownOutputTokenCalls,
        calls_with_thoughts_usage: knownThoughtsTokenCalls,
      },
    },
    category_confusion_matrix: categoryMatrix,
    priority_confusion_matrix: priorityMatrix,
    tag_slices: tagSlices,
    results,
  };

  await fs.mkdir(RUNS_DIR, { recursive: true });

  const outputPath = path.join(RUNS_DIR, filename);
  await fs.writeFile(outputPath, JSON.stringify(report, null, 2), "utf8");

  console.log(
    runComplete
      ? "\nEvaluation complete."
      : "\nEvaluation stopped before all tickets were processed.",
  );
  console.log(`Saved: ${outputPath}`);
  console.log(`Processed: ${processedCount}/${tickets.length}`);
  console.log(`HTTP outcomes: ${JSON.stringify(outcomeCounts)}`);

  if (quotaExhausted) {
    console.warn(
      "This report is incomplete because the API returned HTTP 429.",
    );
  }

  console.log(
    `Category accuracy: ${report.metrics.category_accuracy ?? "N/A"}`,
  );
  console.log(
    `Priority accuracy: ${report.metrics.priority_accuracy ?? "N/A"}`,
  );
  console.log(
    `Mean latency: ${report.metrics.mean_latency_ms ?? "N/A"} ms`,
  );
  console.log(
    `Estimated cost: ${
      report.metrics.estimated_cost_usd === null
        ? "Incomplete usage/cost data"
        : `$${report.metrics.estimated_cost_usd}`
    }`,
  );
  console.log(`Tag slices: ${Object.keys(tagSlices).join(", ") || "none"}`);
}

main().catch((error) => {
  console.error(error.message ?? "Evaluation failed.");
  process.exitCode = 1;
});
