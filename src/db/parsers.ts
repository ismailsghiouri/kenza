import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const DATA_DIR = path.join(process.cwd(), "samples", "data");

// ---------------------------------------------------------------------------
// Minimal CSV parsing (handles quoted fields with embedded commas/quotes)
// ---------------------------------------------------------------------------

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const header = splitCsvLine(lines[0]!);
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(header.map((key, i) => [key, values[i] ?? ""]));
  });
}

// ---------------------------------------------------------------------------
// Field coercion helpers — CSV values arrive as strings
// ---------------------------------------------------------------------------

function toInt(value: string, field: string): number {
  const n = Number(value);
  if (value.trim() === "" || !Number.isFinite(n)) {
    throw new Error(`Expected an integer for "${field}", got "${value}"`);
  }
  return Math.trunc(n);
}

function toNullableInt(value: string): number | null {
  return value.trim() === "" ? null : toInt(value, "nullable int");
}

function toBoolFr(value: string, field: string): boolean {
  if (value === "oui") return true;
  if (value === "non") return false;
  throw new Error(`Expected "oui" or "non" for "${field}", got "${value}"`);
}

function toDate(value: string, field: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Expected a valid date for "${field}", got "${value}"`);
  }
  return date;
}

function toNullableString(value: string): string | null {
  return value.trim() === "" ? null : value;
}

// ---------------------------------------------------------------------------
// products — catalogue.csv
// ---------------------------------------------------------------------------

export const productInsertSchema = z.object({
  ref: z.string().regex(/^REF-\d{4}$/),
  modele: z.string().min(1),
  famille: z.string().min(1),
  genre: z.enum(["femme", "homme", "mixte"]),
  couleur: z.string().min(1),
  taille: z.string().min(1),
  matiere: z.string().min(1),
  saison: z.string().min(1),
  prixMad: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  delaiReassortJours: z.number().int().positive().nullable(),
  codeBarre: z.string().regex(/^\d+$/),
  poidsG: z.number().int().positive(),
});

export type ProductInsert = z.infer<typeof productInsertSchema>;

export function parseCatalogue(filePath: string = path.join(DATA_DIR, "catalogue.csv")): ProductInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    productInsertSchema.parse({
      ref: row["ref"],
      modele: row["modele"],
      famille: row["famille"],
      genre: row["genre"],
      couleur: row["couleur"],
      taille: row["taille"],
      matiere: row["matiere"],
      saison: row["saison"],
      prixMad: toInt(row["prix_mad"] ?? "", "prix_mad"),
      stock: toInt(row["stock"] ?? "", "stock"),
      delaiReassortJours: toNullableInt(row["delai_reassort_jours"] ?? ""),
      codeBarre: row["code_barre"],
      poidsG: toInt(row["poids_g"] ?? "", "poids_g"),
    }),
  );
}

// ---------------------------------------------------------------------------
// customers — clients.csv
// ---------------------------------------------------------------------------

export const customerInsertSchema = z.object({
  clientId: z.string().regex(/^CLI-\d{4}$/),
  nom: z.string().min(1),
  telephone: z.string().regex(/^\+212[5-7]\d{8}$/),
  ville: z.string().min(1),
  languePreferee: z.enum(["fr", "darija", "ar"]),
  premierAchat: z.date(),
  nbCommandes: z.number().int().nonnegative(),
  segment: z.enum(["nouveau", "régulier", "fidèle"]),
});

export type CustomerInsert = z.infer<typeof customerInsertSchema>;

export function parseClients(filePath: string = path.join(DATA_DIR, "clients.csv")): CustomerInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    customerInsertSchema.parse({
      clientId: row["client_id"],
      nom: row["nom"],
      telephone: row["telephone"],
      ville: row["ville"],
      languePreferee: row["langue_preferee"],
      premierAchat: toDate(row["premier_achat"] ?? "", "premier_achat"),
      nbCommandes: toInt(row["nb_commandes"] ?? "", "nb_commandes"),
      segment: row["segment"],
    }),
  );
}

// ---------------------------------------------------------------------------
// deliveryZones — livraison.csv
// ---------------------------------------------------------------------------

export const deliveryZoneInsertSchema = z.object({
  ville: z.string().min(1),
  fraisMad: z.number().int().nonnegative(),
  delaiHeures: z.number().int().positive(),
  paiementALaLivraison: z.boolean(),
  retraitBoutique: z.boolean(),
});

export type DeliveryZoneInsert = z.infer<typeof deliveryZoneInsertSchema>;

export function parseLivraison(
  filePath: string = path.join(DATA_DIR, "livraison.csv"),
): DeliveryZoneInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    deliveryZoneInsertSchema.parse({
      ville: row["ville"],
      fraisMad: toInt(row["frais_mad"] ?? "", "frais_mad"),
      delaiHeures: toInt(row["delai_heures"] ?? "", "delai_heures"),
      paiementALaLivraison: toBoolFr(row["paiement_a_la_livraison"] ?? "", "paiement_a_la_livraison"),
      retraitBoutique: toBoolFr(row["retrait_boutique"] ?? "", "retrait_boutique"),
    }),
  );
}

// ---------------------------------------------------------------------------
// orders — commandes.csv
// ---------------------------------------------------------------------------

export const orderInsertSchema = z.object({
  commandeId: z.string().regex(/^CMD-\d{5}$/),
  clientId: z.string().regex(/^CLI-\d{4}$/),
  date: z.date(),
  canal: z.enum(["whatsapp", "instagram", "boutique"]),
  statut: z.enum(["en préparation", "livrée", "annulée", "retournée", "panier abandonné"]),
  totalArticlesMad: z.number().int().nonnegative(),
  fraisLivraisonMad: z.number().int().nonnegative(),
  totalMad: z.number().int().nonnegative(),
  villeLivraison: z.string().min(1),
  paiement: z.enum(["à la livraison", "carte", "virement"]),
});

export type OrderInsert = z.infer<typeof orderInsertSchema>;

export function parseCommandes(filePath: string = path.join(DATA_DIR, "commandes.csv")): OrderInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    orderInsertSchema.parse({
      commandeId: row["commande_id"],
      clientId: row["client_id"],
      date: toDate(row["date"] ?? "", "date"),
      canal: row["canal"],
      statut: row["statut"],
      totalArticlesMad: toInt(row["total_articles_mad"] ?? "", "total_articles_mad"),
      fraisLivraisonMad: toInt(row["frais_livraison_mad"] ?? "", "frais_livraison_mad"),
      totalMad: toInt(row["total_mad"] ?? "", "total_mad"),
      villeLivraison: row["ville_livraison"],
      paiement: row["paiement"],
    }),
  );
}

// ---------------------------------------------------------------------------
// orderItems — commandes-lignes.csv
// ---------------------------------------------------------------------------

export const orderItemInsertSchema = z.object({
  commandeId: z.string().regex(/^CMD-\d{5}$/),
  ref: z.string().regex(/^REF-\d{4}$/),
  modele: z.string().min(1),
  taille: z.string().min(1),
  quantite: z.number().int().positive(),
  prixUnitaireMad: z.number().int().nonnegative(),
});

export type OrderItemInsert = z.infer<typeof orderItemInsertSchema>;

export function parseCommandesLignes(
  filePath: string = path.join(DATA_DIR, "commandes-lignes.csv"),
): OrderItemInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    orderItemInsertSchema.parse({
      commandeId: row["commande_id"],
      ref: row["ref"],
      modele: row["modele"],
      taille: row["taille"],
      quantite: toInt(row["quantite"] ?? "", "quantite"),
      prixUnitaireMad: toInt(row["prix_unitaire_mad"] ?? "", "prix_unitaire_mad"),
    }),
  );
}

// ---------------------------------------------------------------------------
// promotions — promotions.csv
// ---------------------------------------------------------------------------

export const promotionInsertSchema = z.object({
  ref: z.string().regex(/^REF-\d{4}$/),
  modele: z.string().min(1),
  prixNormalMad: z.number().int().nonnegative(),
  prixPromoMad: z.number().int().nonnegative(),
  debut: z.date(),
  fin: z.date(),
  condition: z.string().nullable(),
});

export type PromotionInsert = z.infer<typeof promotionInsertSchema>;

export function parsePromotions(
  filePath: string = path.join(DATA_DIR, "promotions.csv"),
): PromotionInsert[] {
  const rows = parseCsv(readFileSync(filePath, "utf-8"));

  return rows.map((row) =>
    promotionInsertSchema.parse({
      ref: row["ref"],
      modele: row["modele"],
      prixNormalMad: toInt(row["prix_normal_mad"] ?? "", "prix_normal_mad"),
      prixPromoMad: toInt(row["prix_promo_mad"] ?? "", "prix_promo_mad"),
      debut: toDate(row["debut"] ?? "", "debut"),
      fin: toDate(row["fin"] ?? "", "fin"),
      condition: toNullableString(row["condition"] ?? ""),
    }),
  );
}

// ---------------------------------------------------------------------------
// Convenience: parse every hackathon data file at once
// ---------------------------------------------------------------------------

export function parseAllData() {
  return {
    products: parseCatalogue(),
    customers: parseClients(),
    deliveryZones: parseLivraison(),
    orders: parseCommandes(),
    orderItems: parseCommandesLignes(),
    promotions: parsePromotions(),
  };
}
