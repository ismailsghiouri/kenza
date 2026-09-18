import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import "dotenv/config";
import { eq, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import {
  products,
  customers,
  orders,
  orderItems,
  InsertProductSchema,
  InsertCustomerSchema,
  InsertOrderSchema,
  InsertOrderItemSchema,
} from "../../src/db/schema";
import { healthCheck } from "../../src/lib/db";

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

async function waitForPostgres(retries = 30, delayMs = 1000): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      await db.execute(sql`select 1`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error("Postgres did not become ready in time");
}

const validProduct = {
  ref: "REF-0001",
  modele: "Robe Kenza",
  famille: "Robes",
  genre: "femme" as const,
  couleur: "Bleu",
  taille: "M",
  matiere: "Coton",
  saison: "Été",
  prixMad: 450,
  stock: 10,
  delaiReassortJours: 7,
  codeBarre: "6111234567890",
  poidsG: 300,
};

const validCustomer = {
  clientId: "CLI-0001",
  nom: "Fatima Zahra",
  telephone: "+212612345678",
  ville: "Casablanca",
  languePreferee: "fr" as const,
  premierAchat: new Date("2024-01-15"),
  nbCommandes: 3,
  segment: "régulier" as const,
};

describe("database layer integration", () => {
  beforeAll(async () => {
    run("docker compose up -d postgres");
    await waitForPostgres();
    run("npm run db:migrate");
  }, 120_000);

  beforeEach(async () => {
    await db.execute(
      sql`truncate table order_items, promotions, orders, customers, products, delivery_zones restart identity cascade`,
    );
  });

  afterAll(() => {
    run("docker compose down");
  });

  it("connects to PostgreSQL successfully", async () => {
    const result = await db.execute(sql`select 1 as value`);
    expect(result[0]?.["value"]).toBe(1);
  });

  it("health check returns { ok: true }", async () => {
    const result = await healthCheck();
    expect(result).toEqual({ ok: true });
  });

  it("inserts a valid product", async () => {
    const parsed = InsertProductSchema.parse(validProduct);
    await db.insert(products).values(parsed);

    const rows = await db.select().from(products).where(eq(products.ref, "REF-0001"));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.modele).toBe("Robe Kenza");
  });

  it("rejects an invalid product with a negative price (Zod error)", () => {
    const invalidProduct = { ...validProduct, prixMad: -100 };
    const result = InsertProductSchema.safeParse(invalidProduct);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("prix_mad doit être supérieur à 0");
    }
  });

  it("inserts a customer and retrieves it by phone", async () => {
    await db.insert(customers).values(InsertCustomerSchema.parse(validCustomer));

    const [found] = await db
      .select()
      .from(customers)
      .where(eq(customers.telephone, "+212612345678"));

    expect(found?.clientId).toBe("CLI-0001");
    expect(found?.ville).toBe("Casablanca");
  });

  it("inserts an order and its order lines", async () => {
    await db.insert(products).values(InsertProductSchema.parse(validProduct));
    await db.insert(customers).values(InsertCustomerSchema.parse(validCustomer));

    const order = {
      commandeId: "CMD-00001",
      clientId: "CLI-0001",
      date: new Date("2024-02-01"),
      canal: "whatsapp" as const,
      statut: "en préparation" as const,
      totalArticlesMad: 450,
      fraisLivraisonMad: 30,
      totalMad: 480,
      villeLivraison: "Casablanca",
      paiement: "à la livraison" as const,
    };
    await db.insert(orders).values(InsertOrderSchema.parse(order));

    await db.insert(orderItems).values(
      InsertOrderItemSchema.parse({
        commandeId: "CMD-00001",
        ref: "REF-0001",
        modele: "Robe Kenza",
        taille: "M",
        quantite: 1,
        prixUnitaireMad: 450,
      }),
    );

    const lines = await db.select().from(orderItems).where(eq(orderItems.commandeId, "CMD-00001"));
    expect(lines).toHaveLength(1);
    expect(lines[0]?.prixUnitaireMad).toBe(450);
  });

  it("queries products by category (famille)", async () => {
    await db.insert(products).values([
      InsertProductSchema.parse(validProduct),
      InsertProductSchema.parse({
        ...validProduct,
        ref: "REF-0002",
        famille: "Chaussures",
        codeBarre: "6111234567891",
      }),
    ]);

    const robes = await db.select().from(products).where(eq(products.famille, "Robes"));
    expect(robes).toHaveLength(1);
    expect(robes[0]?.ref).toBe("REF-0001");
  });

  it("queries customers by city (ville)", async () => {
    await db.insert(customers).values([
      InsertCustomerSchema.parse(validCustomer),
      InsertCustomerSchema.parse({
        ...validCustomer,
        clientId: "CLI-0002",
        telephone: "+212612345679",
        ville: "Rabat",
      }),
    ]);

    const casaCustomers = await db.select().from(customers).where(eq(customers.ville, "Casablanca"));
    expect(casaCustomers).toHaveLength(1);
    expect(casaCustomers[0]?.clientId).toBe("CLI-0001");
  });

  it("is idempotent to seed the database twice (no error on 2nd run)", async () => {
    run("npm run db:seed");
    const [firstRun] = await db.select({ count: sql<number>`count(*)::int` }).from(products);

    expect(() => run("npm run db:seed")).not.toThrow();
    const [secondRun] = await db.select({ count: sql<number>`count(*)::int` }).from(products);

    expect(secondRun?.count).toBe(firstRun?.count);
  }, 60_000);
});
