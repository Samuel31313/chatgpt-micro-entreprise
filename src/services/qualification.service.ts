import { AccountingSector, ACCOUNTING_SECTORS, BankPack, Frequency } from "../data/pricing";
import { buildQuote, OfferSelection, Quote } from "./pricing.service";
import { config } from "../config";

export type LegalForm = "sasu" | "sas" | "eurl" | "sarl" | "sci" | "micro" | "ei" | "association" | "autre";

export interface QualificationAnswers {
  company_status: "registered" | "in_progress" | "not_created";
  legal_form?: LegalForm;
  needs?: ("accounting" | "bank")[];
  sector?: AccountingSector | "autre";
  activity?: string;
  annual_revenue?: number;
  employees?: number;
  vat_regime?: "franchise" | "quarterly" | "monthly" | "unknown";
  eu_sales?: boolean;
  eu_imports?: boolean;
  accounting_situation?: "no_accountant" | "new_fiscal_year" | "switching_accountant" | "late_closing";
  english_speaking?: boolean;
  wants_dedicated_accountant?: boolean;
  preferred_frequency?: Frequency;
  bank_users?: number;
  bank_cards?: number;
  transfers_per_month?: number;
  needs_invoicing?: boolean;
  wants_call?: boolean;
}

export interface QualificationResult {
  route: "creation" | "self_checkout" | "sales_meeting";
  reasons: string[];
  creation?: {
    legal_form: LegalForm | null;
    /** "link" : parcours de création LegalPlace ; "choose_status" : statut à définir avec un conseiller. */
    action: "choose_status" | "link";
    url?: string;
  };
  selection?: OfferSelection;
  quote?: Quote;
  /** Compte pro micro-entreprise : grille dédiée, souscription directe sur LP Pro. */
  bank_signup_url?: string;
  upsell_hints: string[];
}

const CREATION_LINKS: Partial<Record<LegalForm, string>> = {
  micro: "https://www.legalplace.fr/contrats/creez-votre-micro-entreprise/creer",
  ei: "https://www.legalplace.fr/contrats/creez-votre-micro-entreprise/creer",
  sasu: "https://www.legalplace.fr/contrats/creation-sasu/creer",
  sas: "https://www.legalplace.fr/contrats/creation-sas/creer",
  eurl: "https://www.legalplace.fr/contrats/creation-eurl/creer",
  sarl: "https://www.legalplace.fr/contrats/creation-sarl/creer",
  sci: "https://www.legalplace.fr/contrats/creation-sci/creer",
};

const REVENUE_SALES_THRESHOLD = 1_000_000;
const EMPLOYEES_SALES_THRESHOLD = 10;

export function recommendBankPack(a: QualificationAnswers): BankPack {
  if ((a.bank_users ?? 1) > 1 || (a.bank_cards ?? 1) > 1 || (a.transfers_per_month ?? 0) > 50) return "ultime";
  if ((a.transfers_per_month ?? 0) > 20 || a.needs_invoicing) return "premium";
  return "basique";
}

export function qualify(a: QualificationAnswers): QualificationResult {
  const upsell: string[] = [];

  // 1. Pas encore de société → flow de création LegalPlace
  if (a.company_status === "not_created") {
    const form = a.legal_form && a.legal_form !== "autre" ? a.legal_form : null;
    const creation: QualificationResult["creation"] =
      form && CREATION_LINKS[form]
        ? { legal_form: form, action: "link", url: CREATION_LINKS[form] }
        : { legal_form: null, action: "choose_status" };
    return {
      route: "creation",
      reasons: ["La société n'est pas encore créée : on commence par la création avec LegalPlace (création offerte avec un abonnement comptable annuel)."],
      creation,
      upsell_hints: ["Proposer la comptabilité annuelle à la création : la prestation de création LegalPlace est offerte."],
    };
  }

  const needs = a.needs && a.needs.length > 0 ? a.needs : ["accounting", "bank"];
  const reasons: string[] = [];

  if (a.company_status === "in_progress") {
    reasons.push("Création en cours : un sales doit construire l'offre création + compta + compte pro (custom checkout).");
  }
  if (a.wants_call) reasons.push("Le client souhaite échanger avec un conseiller.");

  const form = a.legal_form;
  const isMicro = form === "micro" || form === "ei";

  if (needs.includes("accounting")) {
    if (form === "sci") reasons.push("Comptabilité SCI : tarif au lot (+ supplément holding) à valider par un manager.");
    if (isMicro || form === "association" || form === "autre" || !form) {
      reasons.push("Forme juridique hors offre comptable en ligne (SAS/SASU/SARL/EURL) : étude par un conseiller.");
    }
    if (!a.sector || a.sector === "autre") reasons.push("Activité à vérifier (éligibilité ComptaPlace).");
    if ((a.annual_revenue ?? 0) > REVENUE_SALES_THRESHOLD) reasons.push("Chiffre d'affaires > 1 M€ : dossier à chiffrer sur mesure.");
    if ((a.employees ?? 0) > EMPLOYEES_SALES_THRESHOLD) reasons.push(`Plus de ${EMPLOYEES_SALES_THRESHOLD} salariés : volet social sur devis.`);
    if (a.accounting_situation === "late_closing") reasons.push("Bilan en retard : bilan et liasse standalone sur devis (à partir de 900 € HT).");
    if (a.accounting_situation === "switching_accountant" && (a.employees ?? 0) > 0) {
      reasons.push("Reprise en cours d'exercice avec salariés : reprise des cumuls de paie sur devis.");
    }
    if (a.english_speaking) reasons.push("Client anglophone : supplément (150 € HT/mois) à valider par un conseiller.");
  }

  if (reasons.length > 0) {
    return { route: "sales_meeting", reasons, upsell_hints: upsell };
  }

  // 2. Offre self-serve au prix grille
  const frequency: Frequency = a.preferred_frequency || "yearly";
  const selection: OfferSelection = {};
  let bankSignupUrl: string | undefined;

  if (needs.includes("accounting")) {
    const sector = a.sector as AccountingSector;
    const vat =
      a.vat_regime === "monthly" ? "monthly" : a.vat_regime === "quarterly" ? "quarterly" : "none";
    selection.accounting = {
      pack: a.wants_dedicated_accountant ? "elite" : "essentiel",
      sector,
      frequency,
      vat,
      oss: !!a.eu_sales,
      ioss: !!a.eu_imports,
      employees: a.employees || 0,
    };
    if (!a.wants_dedicated_accountant) {
      upsell.push("Pack Elite (+40 € HT/mois) : comptable dédié et PV d'AG d'approbation des comptes inclus.");
    }
    if (frequency === "monthly") upsell.push("Formule annuelle : 2 mois offerts.");
    if (ACCOUNTING_SECTORS[sector].includesMonthlyVat && a.vat_regime === "monthly") {
      upsell.push("La TVA mensuelle est déjà incluse dans le forfait de ce secteur.");
    }
  }

  if (needs.includes("bank")) {
    if (isMicro) {
      bankSignupUrl = config.LPPRO_SIGNUP_URL;
    } else {
      selection.bank = { pack: recommendBankPack(a), frequency };
      if (!needs.includes("accounting")) {
        upsell.push("Avec la comptabilité LegalPlace, vos relevés LP Pro sont synchronisés automatiquement (plus d'import de relevés).");
      }
    }
  }

  const hasQuote = !!(selection.accounting || selection.bank);
  const hasSomethingToSell = hasQuote || !!bankSignupUrl;
  return {
    route: hasSomethingToSell ? "self_checkout" : "sales_meeting",
    reasons: hasSomethingToSell ? [] : ["Aucune offre en ligne adaptée : orientation vers un conseiller."],
    selection: hasQuote ? selection : undefined,
    quote: hasQuote ? buildQuote(selection) : undefined,
    bank_signup_url: bankSignupUrl,
    upsell_hints: upsell,
  };
}

/** Lien Calendly pré-rempli pour le RDV sales. */
export function salesMeetingUrl(p: { name?: string; email?: string; summary?: string }): string {
  const url = new URL(config.SALES_CALENDLY_URL);
  if (p.name) url.searchParams.set("name", p.name);
  if (p.email) url.searchParams.set("email", p.email);
  if (p.summary) url.searchParams.set("a1", p.summary.slice(0, 500));
  return url.toString();
}
