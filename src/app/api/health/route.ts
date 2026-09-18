import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "up", timestamp: new Date().toISOString() });
}
