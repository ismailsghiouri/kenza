import { sql } from "drizzle-orm";
import { db } from "../db/client";

export { db };

export async function healthCheck(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch {
    return false;
  }
}
