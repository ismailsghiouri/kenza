import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { products, InsertProductSchema } from "@/db/schema";
import { kenzaGraph, ensureCheckpointerReady } from "@/graph/graph";

// ---------------------------------------------------------------------------
// Infra — même pattern docker compose + drizzle migrate que
// tests/integration/db.test.ts, plus un vrai serveur `next dev` : cette suite
// tape les routes HTTP réelles avec fetch(), pas le graphe/la DB directement.
// ---------------------------------------------------------------------------

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

// La route /api/webhook (src/app/api/webhook/route.ts) utilise toujours le
// kenzaGraph réel (classifieur Claude en dur, pas d'injection possible via
// HTTP) : sans clé, un POST déclenche une vraie erreur Anthropic -> 500
// "Graph error", et /api/readiness renvoie checks.llm=false. On skip donc
// proprement les tests qui en dépendent plutôt que de les laisser échouer.
const hasAnthropicKey = Boolean(process.env["ANTHROPIC_API_KEY"]);

function run(command: string): void {
  execSync(command, { stdio: "pipe" });
}

// Après un `docker compose down` (par ex. déclenché par un autre fichier de
// test), le port 5433 peut rester momentanément indisponible côté Windows/
// Docker Desktop (relai WSL2) avant d'être vraiment libéré : on retente
// `docker compose up` plutôt que d'échouer immédiatement.
async function dockerComposeUpPostgres(retries = 10, delayMs = 1000): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      run("docker compose up -d postgres");
      return;
    } catch (err) {
      if (attempt === retries - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
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

async function waitForServer(retries = 60, delayMs = 1000): Promise<void> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      if (res.ok) return;
    } catch {
      // le serveur n'écoute pas encore
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Next.js server did not become ready in time");
}

let serverProcess: ChildProcess;

const GALAXY_REF = "REF-0001";

async function seedProduct(): Promise<void> {
  await db.insert(products).values(
    InsertProductSchema.parse({
      ref: GALAXY_REF,
      modele: "Samsung Galaxy S23",
      famille: "Téléphone",
      genre: "mixte",
      couleur: "Noir",
      taille: "Unique",
      matiere: "Aluminium",
      saison: "Toute saison",
      prixMad: 5000,
      stock: 20,
      delaiReassortJours: 7,
      codeBarre: "6111234500001",
      poidsG: 200,
    }),
  );
}

describe("API integration — webhook, health, readiness", () => {
  beforeAll(async () => {
    await dockerComposeUpPostgres();
    await waitForPostgres();
    run("npm run db:migrate");
    await ensureCheckpointerReady(); // crée checkpoints/checkpoint_blobs/checkpoint_writes

    serverProcess = spawn("npx", ["next", "dev", "--turbo", "-p", String(PORT)], {
      stdio: "pipe",
      env: { ...process.env },
      shell: process.platform === "win32",
    });
    // Sans lecteur, les buffers stdout/stderr se remplissent et le process
    // Next.js se bloque en écriture une fois le pipe plein (Windows).
    serverProcess.stdout?.on("data", () => {});
    serverProcess.stderr?.on("data", () => {});
    await waitForServer();

    // Compile la route /api/webhook (Next dev compile à la demande) avant les
    // tests, pour éviter qu'un premier appel dépasse le testTimeout par défaut.
    try {
      await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    } catch {
      // best-effort warm-up
    }
  }, 180_000);

  beforeEach(async () => {
    await db.execute(
      sql`truncate table order_items, promotions, orders, customers, products, delivery_zones restart identity cascade`,
    );
    await db.execute(sql`truncate table checkpoints, checkpoint_blobs, checkpoint_writes`);
    await seedProduct();
  });

  afterAll(() => {
    // spawn() with shell:true (nécessaire pour npx sur Windows) donne le pid
    // du cmd.exe wrapper : un simple .kill() ne tue pas les process enfants
    // (next dev + son serveur), qui restent alors bloqués sur le port PORT.
    if (serverProcess?.pid) {
      try {
        if (process.platform === "win32") {
          run(`taskkill /pid ${serverProcess.pid} /T /F`);
        } else {
          serverProcess.kill();
        }
      } catch {
        // best-effort cleanup
      }
    }
    run("docker compose down");
  });

  it.skipIf(!hasAnthropicKey)(
    "TEST 1: POST /api/webhook avec message valide",
    async () => {
      const res = await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: "212612345678", text: "Kat3 Galaxy?" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toHaveProperty("request_id");
      expect(json).toHaveProperty("message");
      expect(json).toHaveProperty("intent");
    },
    30_000,
  );

  it(
    "TEST 2: POST /api/webhook sans phone",
    async () => {
      const res = await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Kat3 Galaxy?" }),
      });

      expect(res.status).toBe(400);
      const json = await res.json();
      // src/app/api/webhook/route.ts renvoie "phone is required", pas "Missing phone"
      expect(json.error).toBe("phone is required");
    },
    30_000,
  );

  it("TEST 3: GET /api/health", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("up");
  });

  it.skipIf(!hasAnthropicKey)(
    "TEST 4: GET /api/readiness",
    async () => {
      const res = await fetch(`${BASE_URL}/api/readiness`);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({
        ready: true,
        checks: { database: true, llm: true, graph: true },
      });
    },
    30_000,
  );

  it.skipIf(!hasAnthropicKey)(
    "TEST 5: message sauvegardé en checkpoint",
    async () => {
      const phone = "212611111111";
      const res = await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text: "Kat3 Galaxy?" }),
      });
      expect(res.status).toBe(200);

      // Le checkpointer LangGraph (PostgresSaver) indexe par thread_id (=
      // phone dans la route webhook), pas par request_id : il n'y a pas de
      // colonne request_id dans la table checkpoints.
      const rows = await db.execute(
        sql`select * from checkpoints where thread_id = ${phone}`,
      );
      expect(rows.length).toBeGreaterThan(0);
    },
    30_000,
  );

  it.skipIf(!hasAnthropicKey)(
    "TEST 6: workflow persiste entre appels (search puis add_to_cart, même phone)",
    async () => {
      const phone = "212622222222";

      const searchRes = await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text: "Kat3 Samsung Galaxy?" }),
      });
      expect(searchRes.status).toBe(200);

      const addRes = await fetch(`${BASE_URL}/api/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, text: "Ajoute 1 Galaxy à mon panier" }),
      });
      expect(addRes.status).toBe(200);

      // Même thread_id (phone) sur les deux appels : le state LangGraph doit
      // avoir accumulé les 2 tours (messages user+assistant x2 minimum).
      const state = await kenzaGraph.getState({ configurable: { thread_id: phone } });
      expect(state.values.messages.length).toBeGreaterThanOrEqual(4);
    },
    30_000,
  );
});
