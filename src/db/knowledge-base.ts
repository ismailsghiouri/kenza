import { readFileSync } from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "samples", "docs");

// ---------------------------------------------------------------------------
// Minimal markdown parsing — enough structure to lift typed business rules
// out of politique-commerciale.md / faq-boutique.md without duplicating the
// source of truth in code.
// ---------------------------------------------------------------------------

interface MarkdownSection {
  heading: string;
  content: string;
}

function parseMarkdownSections(raw: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: MarkdownSection | null = null;

  for (const line of raw.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*)/);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: heading[1]!.trim(), content: "" };
    } else if (current) {
      current.content += `${line}\n`;
    }
  }
  if (current) sections.push(current);

  return sections.map((section) => ({
    heading: section.heading,
    content: section.content.replace(/\s+/g, " ").trim(),
  }));
}

function firstBulletList(content: string): string[] {
  const firstSentence = content.split(/(?<=[.:])\s*-\s*/)[0] ?? content;
  return firstSentence
    .replace(/^-\s*/, "")
    .replace(/\.$/, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractPercent(content: string): number | null {
  const match = content.match(/(\d+)\s*%/);
  return match ? Number(match[1]) : null;
}

function extractDays(content: string): number | null {
  const match = content.match(/(\d+)\s*jours?/);
  return match ? Number(match[1]) : null;
}

// ---------------------------------------------------------------------------
// Typed sections — politique-commerciale.md
// ---------------------------------------------------------------------------

export interface RemiseRules {
  maxPercentSansValidation: number;
  promotionsPriorisees: boolean;
}

export interface StockRules {
  stockZeroIndisponible: boolean;
  proposerAlternativeDisponible: boolean;
  jamaisPromettreDateReassort: boolean;
}

export interface LivraisonRules {
  sourceUnique: string;
  villeAbsenteEscalade: boolean;
  paiementALaLivraisonConditionnel: boolean;
}

export interface RetourRules {
  delaiJours: number;
  rembourseEspecesInterdit: boolean;
}

export interface EscaladeRules {
  motifsObligatoires: string[];
  transmettreContexteComplet: boolean;
}

export interface PolitiqueCommerciale {
  remise: RemiseRules;
  stock: StockRules;
  livraison: LivraisonRules;
  retour: RetourRules;
  escalade: EscaladeRules;
  sections: MarkdownSection[];
}

export function parsePolitiqueCommerciale(
  filePath: string = path.join(DOCS_DIR, "politique-commerciale.md"),
): PolitiqueCommerciale {
  const raw = readFileSync(filePath, "utf-8");
  const sections = parseMarkdownSections(raw);
  const byHeading = new Map(sections.map((section) => [section.heading, section.content]));

  const remiseContent = byHeading.get("Prix et remises") ?? "";
  const stockContent = byHeading.get("Stock et délais") ?? "";
  const livraisonContent = byHeading.get("Livraison") ?? "";
  const retourContent = byHeading.get("Retours et échanges") ?? "";
  const escaladeContent = byHeading.get("Escalade obligatoire") ?? "";

  return {
    remise: {
      maxPercentSansValidation: extractPercent(remiseContent) ?? 10,
      promotionsPriorisees: /promotions.*priment/i.test(remiseContent),
    },
    stock: {
      stockZeroIndisponible: /stock zéro est.*indisponible/i.test(stockContent),
      proposerAlternativeDisponible: /alternative réellement disponible/i.test(stockContent),
      jamaisPromettreDateReassort: /ne promet.*jamais.*réassort/i.test(stockContent),
    },
    livraison: {
      sourceUnique: livraisonContent.match(/`([^`]+\.csv)`/)?.[1] ?? "livraison.csv",
      villeAbsenteEscalade: /ville absente.*escalade/i.test(livraisonContent),
      paiementALaLivraisonConditionnel: /paiement à la livraison n'est possible que/i.test(livraisonContent),
    },
    retour: {
      delaiJours: extractDays(retourContent) ?? 7,
      rembourseEspecesInterdit: /remboursement en espèces n'est pas accordé/i.test(retourContent),
    },
    escalade: {
      motifsObligatoires: firstBulletList(escaladeContent),
      transmettreContexteComplet: /contexte complet/i.test(escaladeContent),
    },
    sections,
  };
}

// ---------------------------------------------------------------------------
// Typed sections — faq-boutique.md
// ---------------------------------------------------------------------------

export interface FaqEntry {
  question: string;
  reponse: string;
}

export interface FaqBoutique {
  entries: FaqEntry[];
  raw: string;
}

export function parseFaqBoutique(filePath: string = path.join(DOCS_DIR, "faq-boutique.md")): FaqBoutique {
  const raw = readFileSync(filePath, "utf-8");

  const entries = raw
    .split(/\r?\n\r?\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .map((paragraph) => paragraph.match(/^\*\*(.+?)\*\*\s*(.+)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({ question: match[1]!.trim(), reponse: match[2]!.trim() }));

  return { entries, raw };
}

// ---------------------------------------------------------------------------
// Constants Claude can use directly — parsed once at module load
// ---------------------------------------------------------------------------

export const politiqueCommerciale = parsePolitiqueCommerciale();
export const faqBoutique = parseFaqBoutique();

/** Combined raw markdown, suitable for injection into a Claude system prompt. */
export function getKnowledgeBaseContext(): string {
  return [
    politiqueCommerciale.sections.map((s) => `## ${s.heading}\n${s.content}`).join("\n\n"),
    faqBoutique.raw.trim(),
  ].join("\n\n---\n\n");
}
