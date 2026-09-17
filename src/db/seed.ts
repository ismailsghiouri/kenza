import { db } from "./client";
import { products } from "./schema";

async function seed() {
  await db.insert(products).values([
    { name: "T-shirt Kenza", description: "T-shirt en coton bio", priceCents: 2500, stock: 100 },
    { name: "Casquette Kenza", description: "Casquette brodée", priceCents: 1500, stock: 50 },
  ]);

  console.log("Seed complete");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
