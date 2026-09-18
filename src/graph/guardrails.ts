import { politiqueCommerciale } from "@/db/knowledge-base";
import { parseLivraison, parsePromotions } from "@/db/parsers";
import type { KenzaState } from "./state";

// ---------------------------------------------------------------------------
// validateAgainstPolicy — final gate against politique-commerciale.md, run
// on the decision the graph is about to send to the customer (cart, pricing,
// drafted explanation). Every violation maps 1:1 to an escalade obligatoire
// rule from the policy doc.
// ---------------------------------------------------------------------------

export type PolicyViolationCode =
  | "price_invention"
  | "promised_restock"
  | "discount_below_threshold"
  | "delivery_city_out_of_grid"
  | "payment_method_not_allowed"
  | "exchange_policy_violation";

export interface ValidateAgainstPolicyResult {
  valid: boolean;
  violations: string[];
}

const MAX_DISCOUNT_PERCENT = politiqueCommerciale.remise.maxPercentSansValidation;
const EXCHANGE_WINDOW_DAYS = politiqueCommerciale.retour.delaiJours;

const deliveryZonesByVille = new Map(parseLivraison().map((zone) => [zone.ville, zone]));
const KNOWN_VILLES = [...deliveryZonesByVille.keys()];

// Real Moroccan cities that are NOT in livraison.csv — used to catch the
// agent estimating a delivery for a city outside the grid instead of
// escalating, per "Une ville absente de la grille déclenche une escalade".
const VILLES_HORS_GRILLE = [
  "Essaouira", "Nador", "El Jadida", "Safi", "Béni Mellal", "Beni Mellal",
  "Errachidia", "Ouarzazate", "Al Hoceïma", "Al Hoceima", "Dakhla",
  "Laâyoune", "Laayoune", "Taza", "Khouribga", "Settat", "Larache",
  "Guelmim", "Taroudant", "Ifrane", "Chefchaouen",
];

const DELIVERY_KEYWORDS = /livr|exp[ée]di|envoy/i;
const COD_KEYWORDS = /paiement.{0,20}livraison|payer.{0,15}livraison|cash|esp[eè]ces.{0,15}livraison/i;
const RESTOCK_KEYWORDS = /r[ée]assort/i;
const RESTOCK_TIMEFRAME = /(\d+\s*(jour|jours|semaine|semaines))|dans\s+\d|le\s+\d{1,2}\/\d{1,2}/i;
const EXCHANGE_KEYWORDS = /[ée]chang|retour|rembours/i;
const WORN_KEYWORDS = /port[ée]|utilis[ée]|us[ée]/i;

// ---------------------------------------------------------------------------
// Prix — jamais inventer un prix hors catalogue (promotions actives incluses)
// ---------------------------------------------------------------------------

function checkPriceInvention(state: KenzaState): boolean {
  const catalogPrices = new Map<string, number[]>();
  const addPrice = (productId: string, price: number) => {
    catalogPrices.set(productId, [...(catalogPrices.get(productId) ?? []), price]);
  };

  for (const candidate of state.productCandidates) addPrice(candidate.ref, candidate.prixMad);
  for (const result of state.searchResults) addPrice(result.id, result.priceMad);

  const now = new Date();
  for (const promo of parsePromotions()) {
    if (promo.debut <= now && now <= promo.fin) addPrice(promo.ref, promo.prixPromoMad);
  }

  return state.cart.some((item) => {
    if (item.unitPriceMad === undefined) return false;
    const knownPrices = catalogPrices.get(item.productId);
    return knownPrices === undefined || !knownPrices.includes(item.unitPriceMad);
  });
}

// ---------------------------------------------------------------------------
// Stock — jamais promettre un réassort, même si delai_reassort_jours existe
// ---------------------------------------------------------------------------

function checkPromisedRestock(state: KenzaState): boolean {
  const text = state.explanation;
  if (!text || !RESTOCK_KEYWORDS.test(text)) return false;
  return RESTOCK_TIMEFRAME.test(text);
}

// ---------------------------------------------------------------------------
// Remise — max 10% sans validation, sinon escalade
// ---------------------------------------------------------------------------

function checkDiscountBelowThreshold(state: KenzaState): boolean {
  return state.cart.some((item) => (item.discountPercent ?? 0) > MAX_DISCOUNT_PERCENT);
}

// ---------------------------------------------------------------------------
// Livraison — jamais estimer une ville hors grille
// ---------------------------------------------------------------------------

function checkDeliveryCityOutOfGrid(state: KenzaState): boolean {
  const text = `${state.rawMessage} ${state.explanation}`;
  if (!DELIVERY_KEYWORDS.test(text)) return false;
  return VILLES_HORS_GRILLE.some((ville) => text.includes(ville));
}

// ---------------------------------------------------------------------------
// Paiement — paiement à la livraison seulement là où livraison.csv l'indique
// ---------------------------------------------------------------------------

function checkPaymentMethodNotAllowed(state: KenzaState): boolean {
  const text = `${state.rawMessage} ${state.explanation}`;
  if (!COD_KEYWORDS.test(text)) return false;

  const ville = KNOWN_VILLES.find((known) => text.includes(known));
  if (!ville) return false; // ville inconnue -> déjà couvert par delivery_city_out_of_grid

  const zone = deliveryZonesByVille.get(ville);
  return zone !== undefined && !zone.paiementALaLivraison;
}

// ---------------------------------------------------------------------------
// Échange — max 7 jours (politiqueCommerciale.retour.delaiJours), non porté
// ---------------------------------------------------------------------------

function extractDaysSincePurchase(text: string): number | null {
  const weeks = text.match(/(\d+)\s*semaines?/i);
  if (weeks) return Number(weeks[1]) * 7;
  const days = text.match(/(\d+)\s*jours?/i);
  if (days) return Number(days[1]);
  return null;
}

function checkExchangePolicyViolation(state: KenzaState): boolean {
  const text = `${state.rawMessage} ${state.explanation}`;
  if (!EXCHANGE_KEYWORDS.test(text)) return false;
  if (WORN_KEYWORDS.test(text)) return true;

  const daysSincePurchase = extractDaysSincePurchase(text);
  return daysSincePurchase !== null && daysSincePurchase > EXCHANGE_WINDOW_DAYS;
}

// ---------------------------------------------------------------------------
// Combined evaluation
// ---------------------------------------------------------------------------

export function validateAgainstPolicy(state: KenzaState): ValidateAgainstPolicyResult {
  const violations: PolicyViolationCode[] = [];

  if (checkPriceInvention(state)) violations.push("price_invention");
  if (checkPromisedRestock(state)) violations.push("promised_restock");
  if (checkDiscountBelowThreshold(state)) violations.push("discount_below_threshold");
  if (checkDeliveryCityOutOfGrid(state)) violations.push("delivery_city_out_of_grid");
  if (checkPaymentMethodNotAllowed(state)) violations.push("payment_method_not_allowed");
  if (checkExchangePolicyViolation(state)) violations.push("exchange_policy_violation");

  return { valid: violations.length === 0, violations };
}
