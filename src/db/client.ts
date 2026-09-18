import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

let lazyDb: Db | undefined;

function getDb(): Db {
  if (!lazyDb) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    lazyDb = drizzle(postgres(connectionString), { schema });
  }
  return lazyDb;
}

// Proxy defers connecting/validating DATABASE_URL until the db is actually
// queried, so importing this module (e.g. during `next build`'s page-data
// collection) doesn't require a database connection to be configured.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
