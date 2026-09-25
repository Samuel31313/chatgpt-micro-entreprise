/**
 * Grille tarifaire LegalPlace — Comptabilité (ComptaPlace) & Compte pro (LP Pro).
 *
 * Sources Notion :
 *  - "[Tarif] - Offre tarifaire : référentiel ComptaPlace & LegalPlace" (MAJ 02/09/2026)
 *  - "Quels sont les tarifs et avantages de l'offre LegalPlace Pro ?" (FAQ LP Pro, 07/2026)
 *  - "Sales Playbook" + "Marge de manœuvre sales" (Team Sales Corpo)
 *
 * Tous les prix sont en euros HT. TVA 20 %.
 */

export const VAT_RATE = 0.2;

export type Frequency = "monthly" | "yearly";

// ─── Comptabilité ────────────────────────────────────────────────────────────

export type AccountingSector =
  | "base"
  | "independant"
  | "btp"
  | "diagnostic_immo"
  | "commerce"
  | "ecommerce"
  | "restauration"
  | "transport_vtc";

export type AccountingPack = "essentiel" | "elite";

interface SectorPricing {
  label: string;
  essentielMonthly: number;
  /** TVA mensuelle déjà incluse dans le forfait (pas d'add-on TVA à facturer) */
  includesMonthlyVat: boolean;
  /** TVA trimestrielle déjà incluse dans le forfait */
  includesQuarterlyVat: boolean;
  note?: string;
}

export const ACCOUNTING_SECTORS: Record<AccountingSector, SectorPricing> = {
  base: { label: "Base (SAS / SARL)", essentielMonthly: 99, includesMonthlyVat: false, includesQuarterlyVat: false },
  independant: { label: "Indépendant (consulting, freelance)", essentielMonthly: 89, includesMonthlyVat: false, includesQuarterlyVat: false },
  btp: { label: "BTP — TVA mensuelle incluse", essentielMonthly: 169, includesMonthlyVat: true, includesQuarterlyVat: false },
  diagnostic_immo: { label: "Diagnostic immobilier, maître d'œuvre, bureau d'étude technique", essentielMonthly: 169, includesMonthlyVat: false, includesQuarterlyVat: false },
  commerce: { label: "Commerce — TVA mensuelle et suivi caisse inclus", essentielMonthly: 149, includesMonthlyVat: true, includesQuarterlyVat: false },
  ecommerce: { label: "E-commerce — TVA mensuelle incluse", essentielMonthly: 149, includesMonthlyVat: true, includesQuarterlyVat: false },
  restauration: { label: "Restauration", essentielMonthly: 149, includesMonthlyVat: false, includesQuarterlyVat: false },
  transport_vtc: { label: "Transport et VTC — TVA trimestrielle incluse", essentielMonthly: 119, includesMonthlyVat: false, includesQuarterlyVat: true },
};

/** Elite = Essentiel + 40 € HT/mois (ou + 400 € HT/an). */
export const ELITE_MONTHLY_SUPPLEMENT = 40;
/** Formule annuelle = 10 mois facturés au lieu de 12. */
export const YEARLY_MONTHS_BILLED = 10;

export const ACCOUNTING_PACKS: Record<AccountingPack, { label: string; features: string[] }> = {
  essentiel: {
    label: "Pack Essentiel",
    features: [
      "Expert-comptable ComptaPlace",
      "Bilan et liasse fiscale inclus",
      "Logiciel LP Pro avec synchronisation bancaire",
    ],
  },
  elite: {
    label: "Pack Elite",
    features: [
      "Tout le Pack Essentiel",
      "Comptable dédié joignable directement",
      "PV d'AG d'approbation des comptes inclus",
    ],
  },
};

export type AccountingAddon = "tva_trimestrielle" | "tva_mensuelle" | "oss" | "ioss" | "bulletin_paie";

/**
 * Add-ons Chargebee. Les IDs "-EUR-Yearly" suivent la convention de nommage du site (prix annuel = 10 × mensuel) ;
 * un ID différent en réalité se corrige sans déploiement via CHARGEBEE_ITEM_PRICE_OVERRIDES.
 */
export const ACCOUNTING_ADDONS: Record<
  AccountingAddon,
  { label: string; monthly: number; perUnit?: string; chargebee: { monthly: string; yearly: string | null } }
> = {
  tva_trimestrielle: { label: "TVA trimestrielle", monthly: 10, chargebee: { monthly: "TVA-trimestrielle-EUR-Monthly", yearly: "TVA-trimestrielle-EUR-Yearly" } },
  tva_mensuelle: { label: "TVA mensuelle", monthly: 20, chargebee: { monthly: "TVA-mensuelle-EUR-Monthly", yearly: "TVA-mensuelle-EUR-Yearly" } },
  oss: { label: "Déclaration OSS (ventes UE)", monthly: 20, chargebee: { monthly: "OSS-EUR-Monthly", yearly: "OSS-EUR-Yearly" } },
  ioss: { label: "Déclaration IOSS (import UE)", monthly: 20, chargebee: { monthly: "IOSS-EUR-Monthly", yearly: "IOSS-EUR-Yearly" } },
  bulletin_paie: { label: "Bulletin de paie", monthly: 29, perUnit: "par salarié / mois", chargebee: { monthly: "Bulletin-de-paie-EUR-Monthly", yearly: "Bulletin-de-paie-EUR-Yearly" } },
};

/** One-shot pour reprise d'un dossier existant avec salariés (paramétrage et adhésion aux caisses). */
export const SOCIAL_SETUP_FEE = {
  label: "Mise en place / reprise du dossier social",
  price: 50,
  chargebee: "Frais-mise-en-place-mission-comptable-EUR",
};

/**
 * Plans Chargebee (site lp-so-compta — comptabilité stand-alone, c.-à-d. société déjà créée).
 * Les plans sont au tarif "Base" : tout autre secteur nécessite un override de prix (mode API).
 */
export const ACCOUNTING_CHARGEBEE_PLANS: Record<AccountingPack, Record<Frequency, { id: string; basePrice: number }>> = {
  essentiel: {
    monthly: { id: "Comptabilit-SAS-et-SARL-EUR-Monthly", basePrice: 99 },
    yearly: { id: "Comptabilit-SAS-et-SARL-EUR-Yearly", basePrice: 990 },
  },
  elite: {
    monthly: { id: "Comptabilite-SAS-SARL-offre-Elite-EUR-Monthly", basePrice: 139 },
    yearly: { id: "Comptabilite-SAS-SARL-offre-Elite-EUR-Yearly", basePrice: 1390 },
  },
};

// ─── Compte pro LP Pro ──────────────────────────────────────────────────────

export type BankPack = "basique" | "premium" | "ultime";

export const BANK_PACKS: Record<
  BankPack,
  { label: string; yearly: number; monthly: number; cards: number; transfersPerMonth: number; features: string[] }
> = {
  basique: {
    label: "LP Pro Basique",
    yearly: 132,
    monthly: 11,
    cards: 1,
    transfersPerMonth: 20,
    features: ["1 carte Mastercard", "20 virements / mois", "App mobile, Apple & Google Pay"],
  },
  premium: {
    label: "LP Pro Premium",
    yearly: 180,
    monthly: 15,
    cards: 1,
    transfersPerMonth: 50,
    features: ["1 carte Mastercard", "50 virements / mois", "Module de facturation", "Support premium", "Tableau de bord avancé"],
  },
  ultime: {
    label: "LP Pro Ultime",
    yearly: 239,
    monthly: 19.9,
    cards: 2,
    transfersPerMonth: 100,
    features: ["2 cartes Mastercard", "100 virements / mois", "Module de facturation", "Utilisateurs illimités", "Support premium"],
  },
};

/** Formule mensuelle : frais uniques d'ouverture (79 € HT), inclus en formule annuelle. */
export const BANK_MONTHLY_OPENING_FEE = 79;

// ─── Marges de manœuvre sales ───────────────────────────────────────────────

export const SALES_GUARDRAILS = {
  /** Compta annuelle : alignement concurrent jusqu'à -10 % du total annuel, justification obligatoire. */
  accountingYearlyMaxDiscountPct: 10,
  /** Compta mensuelle : aucune remise. */
  accountingMonthlyMaxDiscountPct: 0,
  /** Compte pro : aucune remise directe. */
  bankMaxDiscountPct: 0,
  /** Compte pro mensuel : frais d'ouverture divisibles par 2 (79 € → 39,50 €). */
  bankOpeningFeeMinPrice: 39.5,
  /** LP Pro Basique 1 an offert — uniquement si compta annuelle dans l'offre. */
  bankFreeYearRequiresYearlyAccounting: true,
};
