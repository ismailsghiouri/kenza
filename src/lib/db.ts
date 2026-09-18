import { sql } from "drizzle-orm";
import { db } from "../db/client";

export { db };

export type HealthCheckResult = { ok: boolean; error?: string };

export async function healthCheck(): Promise<HealthCheckResult> {
  try {
    await db.execute(sql`select 1`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
