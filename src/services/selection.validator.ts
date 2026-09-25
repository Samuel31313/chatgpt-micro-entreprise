import { ACCOUNTING_SECTORS, BANK_PACKS } from "../data/pricing";
import { OfferSelection } from "./pricing.service";

const FREQUENCIES = ["monthly", "yearly"];
const PACKS = ["essentiel", "elite"];
const VAT = ["none", "quarterly", "monthly"];

/** Vérifie la structure d'une OfferSelection venant du GPT ou du formulaire sales. */
export function validateSelection(s: OfferSelection | undefined): string[] {
  const errors: string[] = [];
  if (!s || (!s.accounting && !s.bank)) return ["La sélection doit contenir 'accounting' et/ou 'bank'."];

  if (s.accounting) {
    const a = s.accounting;
    if (!PACKS.includes(a.pack)) errors.push("accounting.pack doit valoir 'essentiel' ou 'elite'.");
    if (!(a.sector in ACCOUNTING_SECTORS)) errors.push(`accounting.sector inconnu : ${a.sector}.`);
    if (!FREQUENCIES.includes(a.frequency)) errors.push("accounting.frequency doit valoir 'monthly' ou 'yearly'.");
    if (a.vat !== undefined && !VAT.includes(a.vat)) errors.push("accounting.vat doit valoir 'none', 'quarterly' ou 'monthly'.");
    if (a.employees !== undefined && (!Number.isInteger(a.employees) || a.employees < 0 || a.employees > 500)) {
      errors.push("accounting.employees doit être un entier entre 0 et 500.");
    }
  }

  if (s.bank) {
    if (!(s.bank.pack in BANK_PACKS)) errors.push(`bank.pack inconnu : ${s.bank.pack}.`);
    if (!FREQUENCIES.includes(s.bank.frequency)) errors.push("bank.frequency doit valoir 'monthly' ou 'yearly'.");
  }

  const d = s.discounts;
  if (d) {
    if (d.accountingPct !== undefined && (typeof d.accountingPct !== "number" || d.accountingPct < 0 || d.accountingPct > 100)) {
      errors.push("discounts.accountingPct doit être entre 0 et 100.");
    }
    if (d.bankOpeningFee !== undefined && (typeof d.bankOpeningFee !== "number" || d.bankOpeningFee < 0)) {
      errors.push("discounts.bankOpeningFee doit être un montant positif.");
    }
    if (d.bankFreeYear && !s.bank) errors.push("discounts.bankFreeYear nécessite un compte pro dans l'offre.");
  }

  return errors;
}
