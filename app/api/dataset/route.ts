import { readFile } from "fs/promises";
import path from "path";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name") || "100";

  // Map the requested dataset to the actual filename
  const fileName =
    name === "500"
      ? "support_tickets_500.json"
      : "support_tickets_100_labelled.json";

  const filePath = path.join(process.cwd(), "data", fileName);

  try {
    const data = await readFile(filePath, "utf-8");
    return Response.json(JSON.parse(data));
  } catch (err) {
    return Response.json(
      { error: "Dataset not found. Ensure it exists in the /data folder." },
      { status: 404 }
    );
  }
}