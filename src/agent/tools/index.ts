import { db } from "@/db/client";
import { products } from "@/db/schema";
import { ilike } from "drizzle-orm";

export async function searchProducts(query: string) {
  return db.select().from(products).where(ilike(products.name, `%${query}%`));
}
