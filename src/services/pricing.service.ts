import {
  ACCOUNTING_ADDONS,
  ACCOUNTING_CHARGEBEE_PLANS,
  ACCOUNTING_PACKS,
  ACCOUNTING_SECTORS,
  AccountingAddon,
  AccountingPack,
  AccountingSector,
  BANK_MONTHLY_OPENING_FEE,
  BANK_PACKS,
  BankPack,
  ELITE_MONTHLY_SUPPLEMENT,
  Frequency,
  SALES_GUARDRAILS,
  SOCIAL_SETUP_FEE,
  VAT_RATE,
  YEARLY_MONTHS_BILLED,
} from "../data/pricing";
import { config } from "../config";

export type ChargebeeSiteKey = "accounting" | "bank";

export interface OfferSelection {
  accounting?: {
    pack: AccountingPack;
    sector: AccountingSector;
    frequency: Frequency;
    vat?: "none" | "quarterly" | "monthly";
    oss?: boolean;
    ioss?: boolean;
    employees?: number;
  };
  bank?: {
    pack: BankPack;
    frequency: Frequency;
  };
  /** Remises commerciales — réservées au custom checkout sales. */
  discounts?: {
    accountingPct?: number;
    accountingJustification?: string;
    bankFreeYear?: boolean;
    bankOpeningFee?: number;
  };
}

export interface QuoteDiscount {
  label: string;
  percentage?: number;
  amount?: number;
  /** "one_time" : 1re facture ; "first_year" : 12 premiers mois */
  duration: "one_time" | "first_year";
}

export interface QuoteLine {
  key: string;
  site: ChargebeeSiteKey;
  label: string;
  kind: "plan" | "addon" | "charge";
  frequency: Frequency | "one_time";
  quantity: number;
  /** Prix unitaire HT de la grille (par période de facturation). */
  unitPrice: number;
  chargebeeItemPriceId: string | null;
  /** Prix du plan Chargebee : si différent de unitPrice, un override de prix est nécessaire. */
  chargebeeBasePrice: number | null;
  discount?: QuoteDiscount;
  /** Montant HT de la 1re facture pour cette ligne, remise incluse. */
  firstInvoiceHt: number;
}

export interface Quote {
  lines: QuoteLine[];
  totals: {
    firstInvoiceHt: number;
    firstInvoiceTtc: number;
    /** Coût récurrent ramené au mois, hors remises temporaires. */
    monthlyEquivalentHt: number;
    /** Coût sur les 12 premiers mois, remises incluses. */
    firstYearHt: number;
    firstYearTtc: number;
    bySite: Record<ChargebeeSiteKey, { firstInvoiceHt: number; firstInvoiceTtc: number }>;
  };
  /** Écarts aux marges de manœuvre sales : l'offre doit être validée par un manager. */
  guardrailViolations: string[];
  warnings: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function periodPrice(monthly: number, frequency: Frequency): number {
  return frequency === "yearly" ? monthly * YEARLY_MONTHS_BILLED : monthly;
}

export function accountingMonthlyPrice(pack: AccountingPack, sector: AccountingSector): number {
  const base = ACCOUNTING_SECTORS[sector].essentielMonthly;
  return pack === "elite" ? base + ELITE_MONTHLY_SUPPLEMENT : base;
}

export function buildQuote(selection: OfferSelection): Quote {
  const lines: QuoteLine[] = [];
  const violations: string[] = [];
  const warnings: string[] = [];
  const d = selection.discounts || {};

  // ── Comptabilité ──
  if (selection.accounting) {
    const a = selection.accounting;
    const sector = ACCOUNTING_SECTORS[a.sector];
    const plan = ACCOUNTING_CHARGEBEE_PLANS[a.pack][a.frequency];
    const pct = d.accountingPct || 0;
    const maxPct =
      a.frequency === "yearly"
        ? SALES_GUARDRAILS.accountingYearlyMaxDiscountPct
        : SALES_GUARDRAILS.accountingMonthlyMaxDiscountPct;

    if (pct > maxPct) {
      violations.push(
        `Remise compta de ${pct} % > ${maxPct} % autorisés en formule ${a.frequency === "yearly" ? "annuelle" : "mensuelle"}.`
      );
    }
    if (pct > 0 && !d.accountingJustification?.trim()) {
      violations.push("Remise compta sans justification (devis ou lettre de mission concurrent requis).");
    }

    const accountingDiscount: QuoteDiscount | undefined =
      pct > 0 ? { label: `Remise commerciale -${pct} %`, percentage: pct, duration: "first_year" } : undefined;

    const withDiscount = (price: number) => round2(price * (1 - pct / 100));

    const planPrice = periodPrice(accountingMonthlyPrice(a.pack, a.sector), a.frequency);
    lines.push({
      key: `accounting_${a.pack}`,
      site: "accounting",
      label: `Comptabilité ${ACCOUNTING_PACKS[a.pack].label} — ${sector.label}`,
      kind: "plan",
      frequency: a.frequency,
      quantity: 1,
      unitPrice: planPrice,
      chargebeeItemPriceId: plan.id,
      chargebeeBasePrice: plan.basePrice,
      discount: accountingDiscount,
      firstInvoiceHt: withDiscount(planPrice),
    });

    const addons: { key: AccountingAddon; qty: number }[] = [];
    if (a.vat === "monthly" && !sector.includesMonthlyVat) addons.push({ key: "tva_mensuelle", qty: 1 });
    if (a.vat === "quarterly" && !sector.includesMonthlyVat && !sector.includesQuarterlyVat) {
      addons.push({ key: "tva_trimestrielle", qty: 1 });
    }
    if (a.oss) addons.push({ key: "oss", qty: 1 });
    if (a.ioss) addons.push({ key: "ioss", qty: 1 });
    if (a.employees && a.employees > 0) addons.push({ key: "bulletin_paie", qty: a.employees });

    for (const { key, qty } of addons) {
      const addon = ACCOUNTING_ADDONS[key];
      const price = periodPrice(addon.monthly, a.frequency);
      const cbId = addon.chargebee[a.frequency];
      if (!cbId) {
        warnings.push(
          `L'option "${addon.label}" n'a pas d'item_price Chargebee en formule annuelle : à ajouter manuellement par l'équipe compta.`
        );
      }
      lines.push({
        key: `addon_${key}`,
        site: "accounting",
        label: addon.perUnit ? `${addon.label} (${qty} ${addon.perUnit})` : addon.label,
        kind: "addon",
        frequency: a.frequency,
        quantity: qty,
        unitPrice: price,
        chargebeeItemPriceId: cbId,
        chargebeeBasePrice: price,
        discount: accountingDiscount,
        firstInvoiceHt: withDiscount(price * qty),
      });
    }

    if (a.employees && a.employees > 0) {
      lines.push({
        key: "social_setup",
        site: "accounting",
        label: SOCIAL_SETUP_FEE.label,
        kind: "charge",
        frequency: "one_time",
        quantity: 1,
        unitPrice: SOCIAL_SETUP_FEE.price,
        chargebeeItemPriceId: SOCIAL_SETUP_FEE.chargebee,
        chargebeeBasePrice: SOCIAL_SETUP_FEE.price,
        firstInvoiceHt: SOCIAL_SETUP_FEE.price,
      });
    }
  }

  // ── Compte pro ──
  if (selection.bank) {
    const b = selection.bank;
    const pack = BANK_PACKS[b.pack];
    const planPrice = b.frequency === "yearly" ? pack.yearly : pack.monthly;
    const cbIds = config.CHARGEBEE_BANK_ITEM_PRICES;

    let bankDiscount: QuoteDiscount | undefined;
    if (d.bankFreeYear) {
      if (SALES_GUARDRAILS.bankFreeYearRequiresYearlyAccounting && selection.accounting?.frequency !== "yearly") {
        violations.push("Compte pro offert 1 an : réservé aux clients qui signent la compta ANNUELLE.");
      }
      if (b.frequency !== "yearly") {
        violations.push("Compte pro offert 1 an : uniquement sur la formule annuelle du compte pro.");
      }
      // L'avantage porte sur le pack Basique (132 € HT) ; un pack supérieur paie la différence.
      const offered = Math.min(BANK_PACKS.basique.yearly, planPrice);
      bankDiscount =
        offered >= planPrice
          ? { label: "1 an de compte pro offert", percentage: 100, duration: "first_year" }
          : { label: `LP Pro Basique offert 1 an (-${offered} € HT)`, amount: offered, duration: "first_year" };
    }

    const discountedPlan = bankDiscount
      ? bankDiscount.percentage
        ? round2(planPrice * (1 - bankDiscount.percentage / 100))
        : round2(planPrice - (bankDiscount.amount || 0))
      : planPrice;

    lines.push({
      key: `bank_${b.pack}`,
      site: "bank",
      label: `${pack.label} — ${b.frequency === "yearly" ? "annuel" : "mensuel"}`,
      kind: "plan",
      frequency: b.frequency,
      quantity: 1,
      unitPrice: planPrice,
      chargebeeItemPriceId: cbIds[`${b.pack}_${b.frequency}`] || null,
      chargebeeBasePrice: planPrice,
      discount: bankDiscount,
      firstInvoiceHt: discountedPlan,
    });

    if (b.frequency === "monthly") {
      const fee = d.bankOpeningFee ?? BANK_MONTHLY_OPENING_FEE;
      if (fee < SALES_GUARDRAILS.bankOpeningFeeMinPrice) {
        violations.push(
          `Frais d'ouverture compte pro à ${fee} € < minimum autorisé (${SALES_GUARDRAILS.bankOpeningFeeMinPrice} €).`
        );
      }
      lines.push({
        key: "bank_opening_fee",
        site: "bank",
        label: "Frais d'ouverture du compte pro (formule mensuelle)",
        kind: "charge",
        frequency: "one_time",
        quantity: 1,
        unitPrice: fee,
        chargebeeItemPriceId: cbIds["opening_fee"] || null,
        chargebeeBasePrice: BANK_MONTHLY_OPENING_FEE,
        discount:
          fee < BANK_MONTHLY_OPENING_FEE
            ? { label: `Frais d'ouverture à ${fee} € au lieu de ${BANK_MONTHLY_OPENING_FEE} €`, amount: BANK_MONTHLY_OPENING_FEE - fee, duration: "one_time" }
            : undefined,
        firstInvoiceHt: fee,
      });
    }
  }

  // ── Totaux ──
  const bySite: Quote["totals"]["bySite"] = {
    accounting: { firstInvoiceHt: 0, firstInvoiceTtc: 0 },
    bank: { firstInvoiceHt: 0, firstInvoiceTtc: 0 },
  };
  let monthlyEquivalent = 0;
  let firstYear = 0;

  for (const l of lines) {
    bySite[l.site].firstInvoiceHt += l.firstInvoiceHt;
    if (l.frequency === "one_time") {
      firstYear += l.firstInvoiceHt;
      continue;
    }
    const perPeriod = l.unitPrice * l.quantity;
    monthlyEquivalent += l.frequency === "yearly" ? perPeriod / 12 : perPeriod;
    // Les remises "first_year" s'appliquent sur toutes les factures des 12 premiers mois.
    const firstYearFull = l.frequency === "yearly" ? perPeriod : perPeriod * 12;
    const ratio = perPeriod > 0 ? l.firstInvoiceHt / perPeriod : 1;
    firstYear += firstYearFull * ratio;
  }

  for (const site of Object.keys(bySite) as ChargebeeSiteKey[]) {
    bySite[site].firstInvoiceHt = round2(bySite[site].firstInvoiceHt);
    bySite[site].firstInvoiceTtc = round2(bySite[site].firstInvoiceHt * (1 + VAT_RATE));
  }
  const firstInvoiceHt = round2(bySite.accounting.firstInvoiceHt + bySite.bank.firstInvoiceHt);

  return {
    lines,
    totals: {
      firstInvoiceHt,
      firstInvoiceTtc: round2(firstInvoiceHt * (1 + VAT_RATE)),
      monthlyEquivalentHt: round2(monthlyEquivalent),
      firstYearHt: round2(firstYear),
      firstYearTtc: round2(firstYear * (1 + VAT_RATE)),
      bySite,
    },
    guardrailViolations: violations,
    warnings,
  };
}

/** Grille publique, telle que présentée au client par le GPT. */
export function publicPricingGrid() {
  return {
    currency: "EUR",
    vat_rate: VAT_RATE,
    note: "Prix HT. Formule annuelle = 10 mois facturés au lieu de 12 (2 mois offerts).",
    accounting: {
      sectors: Object.entries(ACCOUNTING_SECTORS).map(([key, s]) => ({
        key,
        label: s.label,
        essentiel: { monthly: s.essentielMonthly, yearly: s.essentielMonthly * YEARLY_MONTHS_BILLED },
        elite: {
          monthly: s.essentielMonthly + ELITE_MONTHLY_SUPPLEMENT,
          yearly: (s.essentielMonthly + ELITE_MONTHLY_SUPPLEMENT) * YEARLY_MONTHS_BILLED,
        },
      })),
      packs: ACCOUNTING_PACKS,
      options: Object.entries(ACCOUNTING_ADDONS).map(([key, a]) => ({
        key,
        label: a.label,
        monthly: a.monthly,
        per_unit: a.perUnit || null,
      })),
    },
    bank: {
      packs: Object.entries(BANK_PACKS).map(([key, p]) => ({
        key,
        label: p.label,
        yearly: p.yearly,
        monthly: p.monthly,
        monthly_opening_fee: BANK_MONTHLY_OPENING_FEE,
        features: p.features,
      })),
    },
  };
}
