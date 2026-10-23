import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";

type LogEntry = {
  ts: string;
  route: string;
  api: string;
  prompt_version: string;
  model: string;
  status: number;
  input_tokens: number | null;
  output_tokens: number | null;
  thoughts_tokens: number | null;
  total_tokens: number | null;
  usage_available: boolean;
  estimated_cost_usd: number | null;
};

function isLogEntry(value: unknown): value is LogEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const entry = value as Record<string, unknown>;

  const tokenFields = [
    "input_tokens",
    "output_tokens",
    "thoughts_tokens",
    "total_tokens",
  ];

  return (
    typeof entry.ts === "string" &&
    typeof entry.route === "string" &&
    typeof entry.api === "string" &&
    typeof entry.prompt_version === "string" &&
    typeof entry.model === "string" &&
    typeof entry.status === "number" &&
    Number.isFinite(entry.status) &&
    typeof entry.usage_available === "boolean" &&
    tokenFields.every(
      (key) =>
        entry[key] === null ||
        (typeof entry[key] === "number" &&
          Number.isFinite(entry[key]) &&
          (entry[key] as number) >= 0),
    ) &&
    (entry.estimated_cost_usd === null ||
      (typeof entry.estimated_cost_usd === "number" &&
        Number.isFinite(entry.estimated_cost_usd) &&
        entry.estimated_cost_usd >= 0))
  );
}

function sumKnown(
  values: (number | null | undefined)[],
) {
  const known = values.filter(
    (value): value is number =>
      typeof value === "number" &&
      Number.isFinite(value),
  );

  return {
    value: known.reduce((sum, value) => sum + value, 0),
    available: known.length,
    missing: known.length !== values.length,
  };
}

function summarize(
  entries: LogEntry[],
  keys: (keyof LogEntry)[],
) {
  const groups = new Map<string, LogEntry[]>();

  for (const entry of entries) {
    const key = keys
      .map((field) => String(entry[field]))
      .join(" | ");

    const group = groups.get(key) ?? [];
    group.push(entry);
    groups.set(key, group);
  }

  return Array.from(groups, ([key, rows]) => {
    const input = sumKnown(
      rows.map((row) => row.input_tokens),
    );

    const output = sumKnown(
      rows.map((row) => row.output_tokens),
    );

    const thoughts = sumKnown(
      rows.map((row) => row.thoughts_tokens),
    );

    const total = sumKnown(
      rows.map((row) => row.total_tokens),
    );

    const cost = sumKnown(
      rows.map((row) => row.estimated_cost_usd),
    );

    return {
      key,
      calls: rows.length,
      errors: rows.filter((row) => row.status >= 400).length,
      input_tokens: input.value,
      output_tokens: output.value,
      thoughts_tokens: thoughts.value,
      total_tokens: total.value,
      token_data_incomplete:
        input.missing ||
        output.missing ||
        thoughts.missing ||
        total.missing,
      estimated_cost_usd: cost.missing
        ? null
        : cost.value,
    };
  });
}

export async function GET() {
  const logFile = path.join(
    process.cwd(),
    "app",
    "logs",
    "llm-calls.jsonl",
  );

  let contents: string;

  try {
    contents = await readFile(logFile, "utf8");
  } catch {
    return Response.json(
      { error: "The call log is not available yet." },
      { status: 500 },
    );
  }

  const entries: LogEntry[] = [];

  for (const line of contents.split("\n")) {
    if (!line.trim()) continue;

    try {
      const value: unknown = JSON.parse(line);

      if (isLogEntry(value)) {
        entries.push(value);
      }
    } catch {
      // Ignore incomplete or invalid log lines.
    }
  }

  const input = sumKnown(
    entries.map((row) => row.input_tokens),
  );

  const output = sumKnown(
    entries.map((row) => row.output_tokens),
  );

  const thoughts = sumKnown(
    entries.map((row) => row.thoughts_tokens),
  );

  const total = sumKnown(
    entries.map((row) => row.total_tokens),
  );

  const cost = sumKnown(
    entries.map((row) => row.estimated_cost_usd),
  );

  const errorsByStatus = Object.entries(
    entries
      .filter((row) => row.status >= 400)
      .reduce<Record<string, number>>((counts, row) => {
        const status = String(row.status);
        counts[status] = (counts[status] ?? 0) + 1;
        return counts;
      }, {}),
  ).map(([status, calls]) => ({
    status: Number(status),
    calls,
  }));

  return Response.json({
    totals: {
      calls: entries.length,
      errors: entries.filter((row) => row.status >= 400)
        .length,
      errors_by_status: errorsByStatus,
      input_tokens: input.value,
      output_tokens: output.value,
      thoughts_tokens: thoughts.value,
      total_tokens: total.value,
      token_data_incomplete:
        input.missing ||
        output.missing ||
        thoughts.missing ||
        total.missing,
      estimated_cost_usd: cost.missing
        ? null
        : cost.value,
    },
    by_prompt_version: summarize(entries, [
      "prompt_version",
    ]),
    by_api: summarize(entries, ["api"]),
    by_model: summarize(entries, ["model"]),
  });
}
