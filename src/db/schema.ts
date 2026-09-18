import { pgTable, text, integer, date, boolean, uuid, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// ---------------------------------------------------------------------------
// Enums — fixed value sets defined by the Kenza boutique's business rules
// (see politique-commerciale.md / faq-boutique.md)
// ---------------------------------------------------------------------------

export const genreEnum = pgEnum("genre", ["femme", "homme", "mixte"]);

export const languePrefereeEnum = pgEnum("langue_preferee", ["fr", "darija", "ar"]);

export const segmentEnum = pgEnum("segment", ["nouveau", "régulier", "fidèle"]);

export const canalEnum = pgEnum("canal", ["whatsapp", "instagram", "boutique"]);

export const statutCommandeEnum = pgEnum("statut_commande", [
  "en préparation",
  "livrée",
  "annulée",
  "retournée",
  "panier abandonné",
]);

export const paiementEnum = pgEnum("paiement", ["à la livraison", "carte", "virement"]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

// ---------------------------------------------------------------------------
// products — mirrors catalogue.csv (one row per ref/taille variant)
// ---------------------------------------------------------------------------

export const products = pgTable("products", {
  ref: text("ref").primaryKey(),
  modele: text("modele").notNull(),
  famille: text("famille").notNull(),
  genre: genreEnum("genre").notNull(),
  couleur: text("couleur").notNull(),
  taille: text("taille").notNull(),
  matiere: text("matiere").notNull(),
  saison: text("saison").notNull(),
  prixMad: integer("prix_mad").notNull(),
  stock: integer("stock").notNull().default(0),
  delaiReassortJours: integer("delai_reassort_jours"),
  codeBarre: text("code_barre").notNull().unique(),
  poidsG: integer("poids_g").notNull(),
});

export const InsertProductSchema = createInsertSchema(products);
export const SelectProductSchema = createSelectSchema(products);

// ---------------------------------------------------------------------------
// customers — mirrors clients.csv
// ---------------------------------------------------------------------------

export const customers = pgTable("customers", {
  clientId: text("client_id").primaryKey(),
  nom: text("nom").notNull(),
  telephone: text("telephone").notNull().unique(),
  ville: text("ville").notNull(),
  languePreferee: languePrefereeEnum("langue_preferee").notNull(),
  premierAchat: date("premier_achat", { mode: "date" }).notNull(),
  nbCommandes: integer("nb_commandes").notNull().default(0),
  segment: segmentEnum("segment").notNull(),
});

export const InsertCustomerSchema = createInsertSchema(customers);
export const SelectCustomerSchema = createSelectSchema(customers);

// ---------------------------------------------------------------------------
// deliveryZones — mirrors livraison.csv
// ---------------------------------------------------------------------------

export const deliveryZones = pgTable("delivery_zones", {
  ville: text("ville").primaryKey(),
  fraisMad: integer("frais_mad").notNull(),
  delaiHeures: integer("delai_heures").notNull(),
  paiementALaLivraison: boolean("paiement_a_la_livraison").notNull(),
  retraitBoutique: boolean("retrait_boutique").notNull(),
});

export const InsertDeliveryZoneSchema = createInsertSchema(deliveryZones);
export const SelectDeliveryZoneSchema = createSelectSchema(deliveryZones);

// ---------------------------------------------------------------------------
// orders — mirrors commandes.csv
// ---------------------------------------------------------------------------

export const orders = pgTable("orders", {
  commandeId: text("commande_id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => customers.clientId),
  date: date("date", { mode: "date" }).notNull(),
  canal: canalEnum("canal").notNull(),
  statut: statutCommandeEnum("statut").notNull(),
  totalArticlesMad: integer("total_articles_mad").notNull(),
  fraisLivraisonMad: integer("frais_livraison_mad").notNull(),
  totalMad: integer("total_mad").notNull(),
  villeLivraison: text("ville_livraison").notNull(),
  paiement: paiementEnum("paiement").notNull(),
});

export const InsertOrderSchema = createInsertSchema(orders);
export const SelectOrderSchema = createSelectSchema(orders);

// ---------------------------------------------------------------------------
// orderItems — mirrors commandes-lignes.csv (no natural single-column key,
// so a synthetic uuid id is added)
// ---------------------------------------------------------------------------

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  commandeId: text("commande_id")
    .notNull()
    .references(() => orders.commandeId),
  ref: text("ref")
    .notNull()
    .references(() => products.ref),
  modele: text("modele").notNull(),
  taille: text("taille").notNull(),
  quantite: integer("quantite").notNull(),
  prixUnitaireMad: integer("prix_unitaire_mad").notNull(),
});

export const InsertOrderItemSchema = createInsertSchema(orderItems);
export const SelectOrderItemSchema = createSelectSchema(orderItems);

// ---------------------------------------------------------------------------
// promotions — mirrors promotions.csv (no natural single-column key,
// so a synthetic uuid id is added)
// ---------------------------------------------------------------------------

export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  ref: text("ref")
    .notNull()
    .references(() => products.ref),
  modele: text("modele").notNull(),
  prixNormalMad: integer("prix_normal_mad").notNull(),
  prixPromoMad: integer("prix_promo_mad").notNull(),
  debut: date("debut", { mode: "date" }).notNull(),
  fin: date("fin", { mode: "date" }).notNull(),
  condition: text("condition"),
});

export const InsertPromotionSchema = createInsertSchema(promotions);
export const SelectPromotionSchema = createSelectSchema(promotions);

// ---------------------------------------------------------------------------
// conversations / messages — WhatsApp agent conversation history
// (not sourced from the CSV exports)
// ---------------------------------------------------------------------------

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clientId: text("client_id")
    .notNull()
    .references(() => customers.clientId),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertConversationSchema = createInsertSchema(conversations);
export const SelectConversationSchema = createSelectSchema(conversations);

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const InsertMessageSchema = createInsertSchema(messages);
export const SelectMessageSchema = createSelectSchema(messages);
