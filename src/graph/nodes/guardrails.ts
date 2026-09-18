import { politiqueCommerciale } from "@/db/knowledge-base";
import type { KenzaState, StateAnnotation } from "../state";

export type KenzaNodeState = typeof StateAnnotation.State;
export type KenzaNodeResult = Partial<KenzaState>;

// ---------------------------------------------------------------------------
// Guardrail violations — each one mirrors a rule from politique-commerciale.md
// ---------------------------------------------------------------------------

export type GuardrailViolationCode =
  | "REMISE_SOUS_PLANCHER"
  | "PRIX_HORS_CATALOGUE"
  | "VILLE_HORS_GRILLE"
  | "ESCALADE_OBLIGATOIRE";

export interface GuardrailViolation {
  code: GuardrailViolationCode;
  message: string;
}

export interface GuardrailResult {
  approved: boolean;
  requiresEscalation: boolean;
  violations: GuardrailViolation[];
}

function approve(): GuardrailResult {
  return { approved: true, requiresEscalation: false, violations: [] };
}

function reject(violations: GuardrailViolation[]): GuardrailResult {
  return { approved: false, requiresEscalation: true, violations };
}

// ---------------------------------------------------------------------------
// Individual rule checks (pure, unit-testable)
// ---------------------------------------------------------------------------

/** Refuse une remise qui dépasse le plancher autorisé sans validation humaine. */
export function validateDiscount(
  requestedPercent: number,
  maxPercent: number = politiqueCommerciale.remise.maxPercentSansValidation,
): GuardrailViolation | null {
  if (requestedPercent > maxPercent) {
    return {
      code: "REMISE_SOUS_PLANCHER",
      message: `Remise de ${requestedPercent}% refusée : dépasse le plancher de ${maxPercent}% autorisé sans validation humaine.`,
    };
  }
  return null;
}

/** Refuse un prix qui n'existe pas dans le catalogue (ou les promotions actives). */
export function validatePrice(
  proposedPriceMad: number,
  catalogPricesMad: number[],
): GuardrailViolation | null {
  if (!catalogPricesMad.includes(proposedPriceMad)) {
    return {
      code: "PRIX_HORS_CATALOGUE",
      message: `Prix de ${proposedPriceMad} MAD refusé : absent du catalogue.`,
    };
  }
  return null;
}

/** Une ville absente de la grille de livraison déclenche une escalade, jamais une estimation. */
export function validateDeliveryCity(
  ville: string,
  knownVilles: string[],
): GuardrailViolation | null {
  if (!knownVilles.includes(ville)) {
    return {
      code: "VILLE_HORS_GRILLE",
      message: `Ville "${ville}" absente de la grille de livraison : escalade obligatoire, pas d'estimation.`,
    };
  }
  return null;
}

const ESCALATION_KEYWORDS: Record<string, string> = {
  "société": "Facturation au nom d'une société",
  "facture pro": "Facturation au nom d'une société",
  "réclamation": "réclamation",
  "litige": "litige",
  "remboursement en espèces": "remboursement en espèces",
  "rembourser en espèces": "remboursement en espèces",
};

/** Détecte les motifs d'escalade obligatoire mentionnés dans le message du client. */
export function detectMandatoryEscalation(customerMessage: string): GuardrailViolation | null {
  const normalized = customerMessage.toLowerCase();
  for (const [keyword, motif] of Object.entries(ESCALATION_KEYWORDS)) {
    if (normalized.includes(keyword)) {
      return {
        code: "ESCALADE_OBLIGATOIRE",
        message: `Escalade obligatoire : motif détecté ("${motif}").`,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Combined evaluation
// ---------------------------------------------------------------------------

export interface GuardrailInput {
  customerMessage: string;
  requestedDiscountPercent?: number;
  proposedPriceMad?: number;
  catalogPricesMad?: number[];
  deliveryVille?: string;
  knownVilles?: string[];
}

export function evaluateGuardrails(input: GuardrailInput): GuardrailResult {
  const violations: GuardrailViolation[] = [];

  const escalationViolation = detectMandatoryEscalation(input.customerMessage);
  if (escalationViolation) violations.push(escalationViolation);

  if (input.requestedDiscountPercent !== undefined) {
    const discountViolation = validateDiscount(input.requestedDiscountPercent);
    if (discountViolation) violations.push(discountViolation);
  }

  if (input.proposedPriceMad !== undefined && input.catalogPricesMad) {
    const priceViolation = validatePrice(input.proposedPriceMad, input.catalogPricesMad);
    if (priceViolation) violations.push(priceViolation);
  }

  if (input.deliveryVille !== undefined && input.knownVilles) {
    const villeViolation = validateDeliveryCity(input.deliveryVille, input.knownVilles);
    if (villeViolation) violations.push(villeViolation);
  }

  return violations.length === 0 ? approve() : reject(violations);
}

// ---------------------------------------------------------------------------
// Graph node — audits the agent's decision before it reaches the customer
// ---------------------------------------------------------------------------

export function guardrailsNode(state: KenzaNodeState): KenzaNodeResult {
  const result = evaluateGuardrails({
    customerMessage: state.rawMessage,
    ...(state.order ? { proposedPriceMad: state.order.totalMad } : {}),
    catalogPricesMad: state.searchResults.map((product) => product.priceMad),
  });

  if (!result.approved) {
    const reasons = result.violations.map((violation) => violation.message).join(" ");
    return {
      error: reasons,
      explanation:
        "Votre demande nécessite une validation par notre équipe. Nous revenons vers vous rapidement.",
    };
  }

  return {};
}
