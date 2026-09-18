import "dotenv/config";
import { db } from "./client";
import { products, customers, deliveryZones, orders, orderItems, promotions } from "./schema";
import { parseAllData } from "./parsers";

async function seed() {
  const existing = await db.select({ ref: products.ref }).from(products).limit(1);

  if (existing.length > 0) {
    console.log("Database already seeded, skipping.");
    process.exit(0);
  }

  const data = parseAllData();

  await db.insert(deliveryZones).values(data.deliveryZones).onConflictDoNothing();
  console.log(`✅ ${data.deliveryZones.length} delivery zones`);

  await db.insert(products).values(data.products).onConflictDoNothing();
  console.log(`✅ ${data.products.length} products`);

  await db.insert(customers).values(data.customers).onConflictDoNothing();
  console.log(`✅ ${data.customers.length} customers`);

  await db.insert(orders).values(data.orders).onConflictDoNothing();
  console.log(`✅ ${data.orders.length} orders`);

  await db.insert(orderItems).values(data.orderItems);
  console.log(`✅ ${data.orderItems.length} order items`);

  await db.insert(promotions).values(data.promotions);
  console.log(`✅ ${data.promotions.length} promotions`);

  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
