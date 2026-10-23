import { readFile, appendFile, mkdir } from "fs/promises";
import path from "path";

const logDir = path.join(process.cwd(), "app", "logs");
const logFile = path.join(logDir, "runs.jsonl");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const logEntry = JSON.stringify({ ...body, ts: new Date().toISOString() }) + "\n";
    
    // Ensure directory exists
    await mkdir(logDir, { recursive: true });
    await appendFile(logFile, logEntry, "utf8");
    
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: "Failed to save run log." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const contents = await readFile(logFile, "utf8");
    const runs = contents
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    return Response.json(runs);
  } catch {
    return Response.json([]); // Return empty array if file doesn't exist yet
  }
}