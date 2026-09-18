import { NextResponse } from "next/server";
import { healthCheck } from "@/lib/db";

export async function GET() {
  const database = (await healthCheck()).ok;
  const llm = Boolean(process.env["ANTHROPIC_API_KEY"]);

  let graph = false;
  try {
    const { kenzaGraph } = await import("@/graph/graph");
    graph = Boolean(kenzaGraph);
  } catch {
    graph = false;
  }

  const ready = database && llm && graph;

  return NextResponse.json(
    { ready, checks: { database, llm, graph } },
    { status: ready ? 200 : 503 },
  );
}
