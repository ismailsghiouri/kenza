import "dotenv/config";
import { db } from "./client";
import { products, customers, discounts } from "./schema";

type Category = "phone" | "tablet" | "laptop" | "accessory";

type ProductSeed = {
  name: string;
  description: string;
  category: Category;
  priceCents: number;
  stock: number;
};

const phones: Array<[string, number]> = [
  ["iPhone 15", 899900],
  ["iPhone 15 Pro", 1199900],
  ["iPhone 14", 749900],
  ["iPhone 13", 649900],
  ["Samsung Galaxy S24", 899900],
  ["Samsung Galaxy S23", 749900],
  ["Samsung Galaxy A54", 379900],
  ["Xiaomi 14", 599900],
  ["Xiaomi Redmi Note 13", 249900],
  ["Google Pixel 8", 799900],
  ["OnePlus 12", 699900],
  ["Huawei P60", 649900],
  ["Oppo Reno 11", 449900],
  ["Realme 12 Pro", 349900],
  ["Nothing Phone 2", 549900],
];

const tablets: Array<[string, number]> = [
  ["iPad 10th Gen", 449900],
  ["iPad Air", 699900],
  ["iPad Pro 11", 999900],
  ["Samsung Galaxy Tab S9", 799900],
  ["Samsung Galaxy Tab A9", 249900],
  ["Xiaomi Pad 6", 349900],
  ["Huawei MatePad 11", 399900],
  ["Lenovo Tab P11", 299900],
  ["Microsoft Surface Go 4", 599900],
  ["Amazon Fire HD 10", 149900],
];

const laptops: Array<[string, number]> = [
  ["MacBook Air M2", 1299900],
  ["MacBook Pro 14 M3", 1999900],
  ["Dell XPS 13", 1199900],
  ["Dell Inspiron 15", 699900],
  ["HP Pavilion 15", 649900],
  ["HP Spectre x360", 1399900],
  ["Lenovo ThinkPad X1", 1499900],
  ["Lenovo IdeaPad 3", 549900],
  ["Asus ZenBook 14", 999900],
  ["Acer Swift 3", 599900],
];

const accessories: Array<[string, number]> = [
  ["AirPods Pro 2", 249900],
  ["AirPods 3", 179900],
  ["Samsung Galaxy Buds 2 Pro", 199900],
  ["Apple Watch Series 9", 449900],
  ["Apple Watch SE", 279900],
  ["Chargeur USB-C 20W", 29900],
  ["Chargeur sans fil MagSafe", 49900],
  ["Coque iPhone 15 Silicone", 19900],
  ["Coque Samsung S24 Transparente", 14900],
  ["Verre trempe iPhone", 9900],
  ["Powerbank 20000mAh", 39900],
  ["Cable USB-C vers Lightning 1m", 14900],
  ["Support telephone voiture", 12900],
  ["Souris sans fil Logitech", 24900],
  ["Clavier Bluetooth compact", 34900],
];

function buildCategory(
  entries: Array<[string, number]>,
  category: Category,
  descriptionPrefix: string
): ProductSeed[] {
  return entries.map(([name, priceCents], index) => ({
    name,
    description: `${descriptionPrefix} - ${name}`,
    category,
    priceCents,
    stock: 10 + ((index * 7) % 40),
  }));
}

const seedProducts: ProductSeed[] = [
  ...buildCategory(phones, "phone", "Smartphone"),
  ...buildCategory(tablets, "tablet", "Tablette"),
  ...buildCategory(laptops, "laptop", "Ordinateur portable"),
  ...buildCategory(accessories, "accessory", "Accessoire"),
];

const seedCustomers = [
  { phone: "+212600000001", name: "Yassine Alaoui" },
  { phone: "+212600000002", name: "Sara Bennani" },
  { phone: "+212600000003", name: "Omar Idrissi" },
  { phone: "+212600000004", name: "Imane Tazi" },
  { phone: "+212600000005", name: "Karim Fassi" },
  { phone: "+212600000006", name: "Nadia Chraibi" },
  { phone: "+212600000007", name: "Youssef Amrani" },
  { phone: "+212600000008", name: "Salma Berrada" },
  { phone: "+212600000009", name: "Hamza Kabbaj" },
  { phone: "+212600000010", name: "Rania Squalli" },
];

const seedDiscounts = [
  { code: "BIENVENUE10", description: "10% de reduction pour les nouveaux clients", percent: 10 },
  { code: "RAMADAN15", description: "15% de reduction speciale Ramadan", percent: 15 },
  { code: "FIDELITE5", description: "5% de reduction fidelite", percent: 5 },
  { code: "FLASH12", description: "12% de reduction vente flash", percent: 12 },
  { code: "WEEKEND8", description: "8% de reduction week-end", percent: 8 },
];

async function seed() {
  const existing = await db.select({ id: products.id }).from(products).limit(1);

  if (existing.length > 0) {
    console.log("Database already seeded, skipping.");
    process.exit(0);
  }

  await db.insert(products).values(seedProducts);
  await db.insert(customers).values(seedCustomers).onConflictDoNothing();
  await db.insert(discounts).values(seedDiscounts).onConflictDoNothing();

  console.log(
    `Seed complete: ${seedProducts.length} products, ${seedCustomers.length} customers, ${seedDiscounts.length} discounts.`
  );
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
