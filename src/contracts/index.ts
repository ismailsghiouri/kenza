import { z } from "zod";

// ---------------------------------------------------------------------------
// WhatsApp webhook boundary
// ---------------------------------------------------------------------------

export const whatsAppInboundMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.enum(["text", "image", "audio", "document", "interactive"]),
  text: z.object({ body: z.string() }).optional(),
});

export const whatsAppWebhookPayloadSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      id: z.string(),
      changes: z.array(
        z.object({
          field: z.string(),
          value: z.object({
            messaging_product: z.literal("whatsapp"),
            metadata: z.object({
              display_phone_number: z.string(),
              phone_number_id: z.string(),
            }),
            messages: z.array(whatsAppInboundMessageSchema).optional(),
          }),
        }),
      ),
    }),
  ),
});

export type WhatsAppInboundMessage = z.infer<typeof whatsAppInboundMessageSchema>;
export type WhatsAppWebhookPayload = z.infer<typeof whatsAppWebhookPayloadSchema>;

// ---------------------------------------------------------------------------
// Agent domain contracts (mirrors src/graph/state.ts)
// ---------------------------------------------------------------------------

export const kenzaIntentSchema = z.enum([
  "search",
  "add_to_cart",
  "checkout",
  "apply_discount",
  "product_info",
  "escalation",
  "question",
  "unknown",
]);

export const kenzaCartItemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().positive(),
});

export const kenzaProductResultSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceMad: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
});

export const orderStatusSchema = z.enum([
  "en préparation",
  "livrée",
  "annulée",
  "retournée",
  "panier abandonné",
]);

export const kenzaOrderResultSchema = z.object({
  orderId: z.string(),
  status: orderStatusSchema,
  totalMad: z.number().int().nonnegative(),
});

export type KenzaIntent = z.infer<typeof kenzaIntentSchema>;
export type KenzaCartItem = z.infer<typeof kenzaCartItemSchema>;
export type KenzaProductResult = z.infer<typeof kenzaProductResultSchema>;
export type OrderStatus = z.infer<typeof orderStatusSchema>;
export type KenzaOrderResult = z.infer<typeof kenzaOrderResultSchema>;

// ---------------------------------------------------------------------------
// CSV-sourced domain contracts — mirror samples/data/*.csv column-for-column
// (shared value sets extracted from the actual hackathon dataset)
// ---------------------------------------------------------------------------

const villeSchema = z.enum([
  "Agadir",
  "Casablanca",
  "Fès",
  "Kénitra",
  "Marrakech",
  "Meknès",
  "Mohammedia",
  "Oujda",
  "Rabat",
  "Salé",
  "Tanger",
  "Tétouan",
]);

const tailleSchema = z.enum([
  "38",
  "39",
  "40",
  "41",
  "42",
  "44",
  "85",
  "90",
  "95",
  "S",
  "M",
  "L",
  "XL",
  "unique",
]);

// products — catalogue.csv
export const ProductSchema = z.object({
  ref: z.string().regex(/^REF-\d{4}$/),
  modele: z.string().min(1).max(100),
  famille: z.enum([
    "Blouson",
    "Caftan",
    "Ceinture",
    "Chaussures",
    "Chemise",
    "Foulard",
    "Pantalon",
    "Robe",
    "Sac à main",
    "Veste",
  ]),
  genre: z.enum(["femme", "homme", "mixte"]),
  couleur: z.string().min(1).max(50),
  taille: tailleSchema,
  matiere: z.enum(["coton", "cuir", "denim", "lin", "polyester", "soie", "viscose"]),
  saison: z.enum(["hiver", "mi-saison", "toute saison", "été"]),
  prixMad: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
  delaiReassortJours: z.number().int().positive().nullable(),
  codeBarre: z.string().regex(/^\d{13}$/),
  poidsG: z.number().int().positive(),
});

// customers — clients.csv
export const CustomerSchema = z.object({
  clientId: z.string().regex(/^CLI-\d{4}$/),
  nom: z.string().min(1).max(100),
  telephone: z.string().regex(/^\+212[5-7]\d{8}$/),
  ville: villeSchema,
  languePreferee: z.enum(["fr", "darija", "ar"]),
  premierAchat: z.coerce.date(),
  nbCommandes: z.number().int().nonnegative(),
  segment: z.enum(["nouveau", "régulier", "fidèle"]),
});

// orders — commandes.csv
export const OrderSchema = z
  .object({
    commandeId: z.string().regex(/^CMD-\d{5}$/),
    clientId: z.string().regex(/^CLI-\d{4}$/),
    date: z.coerce.date(),
    canal: z.enum(["whatsapp", "instagram", "boutique"]),
    statut: orderStatusSchema,
    totalArticlesMad: z.number().int().nonnegative(),
    fraisLivraisonMad: z.number().int().nonnegative(),
    totalMad: z.number().int().nonnegative(),
    villeLivraison: villeSchema,
    paiement: z.enum(["à la livraison", "carte", "virement"]),
  })
  .refine((order) => order.totalMad === order.totalArticlesMad + order.fraisLivraisonMad, {
    message: "totalMad must equal totalArticlesMad + fraisLivraisonMad",
    path: ["totalMad"],
  });

// orderLines — commandes-lignes.csv
export const OrderLineSchema = z.object({
  commandeId: z.string().regex(/^CMD-\d{5}$/),
  ref: z.string().regex(/^REF-\d{4}$/),
  modele: z.string().min(1).max(100),
  taille: tailleSchema,
  quantite: z.number().int().positive(),
  prixUnitaireMad: z.number().int().nonnegative(),
});

// deliveryZones — livraison.csv
export const DeliverySchema = z.object({
  ville: villeSchema,
  fraisMad: z.number().int().nonnegative(),
  delaiHeures: z.number().int().positive(),
  paiementALaLivraison: z.boolean(),
  retraitBoutique: z.boolean(),
});

// promotions — promotions.csv
export const PromotionSchema = z
  .object({
    ref: z.string().regex(/^REF-\d{4}$/),
    modele: z.string().min(1).max(100),
    prixNormalMad: z.number().int().nonnegative(),
    prixPromoMad: z.number().int().nonnegative(),
    debut: z.coerce.date(),
    fin: z.coerce.date(),
    condition: z.string().nullable(),
  })
  .refine((promo) => promo.prixPromoMad < promo.prixNormalMad, {
    message: "prixPromoMad must be less than prixNormalMad",
    path: ["prixPromoMad"],
  })
  .refine((promo) => promo.fin >= promo.debut, {
    message: "fin must be on or after debut",
    path: ["fin"],
  });

export type Product = z.infer<typeof ProductSchema>;
export type Customer = z.infer<typeof CustomerSchema>;
export type Order = z.infer<typeof OrderSchema>;
export type OrderLine = z.infer<typeof OrderLineSchema>;
export type Delivery = z.infer<typeof DeliverySchema>;
export type Promotion = z.infer<typeof PromotionSchema>;

// ---------------------------------------------------------------------------
// Agent invocation contract — what triggers the graph and what it returns
// ---------------------------------------------------------------------------

export const agentInputSchema = z.object({
  customerPhone: z.string(),
  conversationId: z.string(),
  rawMessage: z.string(),
});

export const agentOutputSchema = z.object({
  intent: kenzaIntentSchema,
  explanation: z.string(),
  order: kenzaOrderResultSchema.nullable(),
  report: z.string(),
  error: z.string().nullable(),
});

export type AgentInput = z.infer<typeof agentInputSchema>;
export type AgentOutput = z.infer<typeof agentOutputSchema>;
