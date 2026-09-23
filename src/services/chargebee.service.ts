import axios from "axios";
import { config } from "../config";
import { ChargebeeSiteKey, Quote, QuoteLine } from "./pricing.service";

export interface CheckoutCustomer {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  company?: string;
}

export interface CheckoutLink {
  site: ChargebeeSiteKey;
  label: string;
  /** "api" : hosted page Chargebee (prix et remises exacts) ; "url" : checkout Chargebee par URL ; "fallback" : pas de Chargebee */
  mode: "api" | "url" | "fallback";
  url: string | null;
  amountHt: number;
  amountTtc: number;
  error?: string;
}

const SITE_LABELS: Record<ChargebeeSiteKey, string> = {
  accounting: "Abonnement comptabilité",
  bank: "Compte pro LP Pro",
};

function siteConfig(site: ChargebeeSiteKey) {
  return site === "accounting"
    ? { name: config.CHARGEBEE_ACCOUNTING_SITE, apiKey: config.CHARGEBEE_ACCOUNTING_API_KEY }
    : { name: config.CHARGEBEE_BANK_SITE, apiKey: config.CHARGEBEE_BANK_API_KEY };
}

const cents = (eur: number) => Math.round(eur * 100);

const itemPriceId = (l: QuoteLine) => config.CHARGEBEE_ITEM_PRICE_OVERRIDES[l.chargebeeItemPriceId!] || l.chargebeeItemPriceId!;

/** Le plan doit être en 1re position dans subscription_items. */
function orderedLines(lines: QuoteLine[]): QuoteLine[] {
  const rank = { plan: 0, addon: 1, charge: 2 } as const;
  return [...lines].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function customerParams(customer: CheckoutCustomer): Record<string, string> {
  const p: Record<string, string> = {
    "customer[email]": customer.email,
    "billing_address[country]": "FR",
  };
  if (customer.firstName) p["customer[first_name]"] = customer.firstName;
  if (customer.lastName) p["customer[last_name]"] = customer.lastName;
  if (customer.phone) p["customer[phone]"] = customer.phone;
  if (customer.company) {
    p["customer[company]"] = customer.company;
    p["billing_address[company]"] = customer.company;
  }
  return p;
}

/**
 * Checkout par URL (sans clé API) — même mécanique que les checkouts Webflow/Heyflow existants.
 * Impossible d'y forcer un prix ou une remise : réservé aux offres au prix catalogue Chargebee.
 */
export function buildUrlCheckout(site: ChargebeeSiteKey, lines: QuoteLine[], customer: CheckoutCustomer): string {
  const { name } = siteConfig(site);
  const params = new URLSearchParams(customerParams(customer));
  orderedLines(lines).forEach((l, i) => {
    params.set(`subscription_items[item_price_id][${i}]`, itemPriceId(l));
    if (l.quantity > 1) params.set(`subscription_items[quantity][${i}]`, String(l.quantity));
  });
  return `https://${name}.chargebee.com/hosted_pages/checkout?${params.toString()}`;
}

/**
 * Hosted page Chargebee via API (Product Catalog 2.0) : applique les prix sectoriels
 * (override de prix — "Allow price override" doit être activé sur le site) et les remises.
 */
export async function createApiCheckout(
  site: ChargebeeSiteKey,
  lines: QuoteLine[],
  customer: CheckoutCustomer,
  opts: { redirectUrl?: string; reference?: string } = {}
): Promise<string> {
  const { name, apiKey } = siteConfig(site);
  const form = new URLSearchParams(customerParams(customer));

  const ordered = orderedLines(lines);
  ordered.forEach((l, i) => {
    form.set(`subscription_items[item_price_id][${i}]`, itemPriceId(l));
    form.set(`subscription_items[quantity][${i}]`, String(l.quantity));
    if (l.chargebeeBasePrice !== l.unitPrice) {
      form.set(`subscription_items[unit_price][${i}]`, String(cents(l.unitPrice)));
    }
  });

  let di = 0;
  for (const l of ordered) {
    if (!l.discount) continue;
    // Les frais d'ouverture réduits sont déjà portés par l'override de prix.
    if (l.kind === "charge") continue;
    form.set(`discounts[apply_on][${di}]`, "specific_item_price");
    form.set(`discounts[item_price_id][${di}]`, itemPriceId(l));
    if (l.discount.percentage !== undefined) {
      form.set(`discounts[percentage][${di}]`, String(l.discount.percentage));
    } else {
      form.set(`discounts[amount][${di}]`, String(cents(l.discount.amount || 0)));
    }
    if (l.discount.duration === "one_time") {
      form.set(`discounts[duration_type][${di}]`, "one_time");
    } else {
      form.set(`discounts[duration_type][${di}]`, "limited_period");
      form.set(`discounts[period][${di}]`, "12");
      form.set(`discounts[period_unit][${di}]`, "month");
    }
    di++;
  }

  if (opts.redirectUrl) form.set("redirect_url", opts.redirectUrl);
  if (opts.reference) form.set("pass_thru_content", opts.reference);

  const { data } = await axios.post(
    `https://${name}.chargebee.com/api/v2/hosted_pages/checkout_new_for_items`,
    form.toString(),
    {
      auth: { username: apiKey, password: "" },
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }
  );
  return data.hosted_page.url as string;
}

/**
 * Génère un lien de paiement par site Chargebee (compta et compte pro sont sur deux sites distincts).
 * Choisit le mode API si une clé est configurée, sinon le checkout par URL quand l'offre le permet.
 */
export async function createCheckoutLinks(
  quote: Quote,
  customer: CheckoutCustomer,
  opts: { redirectUrl?: string; reference?: string; onlySite?: ChargebeeSiteKey } = {}
): Promise<CheckoutLink[]> {
  const sites: ChargebeeSiteKey[] = opts.onlySite ? [opts.onlySite] : ["accounting", "bank"];
  const links: CheckoutLink[] = [];

  for (const site of sites) {
    const lines = quote.lines.filter((l) => l.site === site);
    if (lines.length === 0) continue;

    const base = {
      site,
      label: SITE_LABELS[site],
      amountHt: quote.totals.bySite[site].firstInvoiceHt,
      amountTtc: quote.totals.bySite[site].firstInvoiceTtc,
    };
    const { name, apiKey } = siteConfig(site);
    const missingIds = lines.filter((l) => !l.chargebeeItemPriceId).map((l) => l.label);

    if (!name || missingIds.length > 0) {
      links.push({
        ...base,
        mode: "fallback",
        url: site === "bank" ? config.LPPRO_SIGNUP_URL : null,
        error: !name
          ? `Site Chargebee "${site}" non configuré.`
          : `Item price Chargebee manquant pour : ${missingIds.join(", ")}.`,
      });
      continue;
    }

    if (apiKey) {
      try {
        const url = await createApiCheckout(site, lines, customer, opts);
        links.push({ ...base, mode: "api", url });
      } catch (err: any) {
        const detail = err.response ? JSON.stringify(err.response.data) : err.message;
        links.push({ ...base, mode: "api", url: null, error: `Chargebee (${name}) : ${detail}` });
      }
      continue;
    }

    const needsOverride = lines.some((l) => l.discount || l.chargebeeBasePrice !== l.unitPrice);
    if (needsOverride) {
      links.push({
        ...base,
        mode: "url",
        url: null,
        error:
          "Cette offre a un prix sectoriel ou une remise : configurer la clé API Chargebee du site pour générer le lien.",
      });
      continue;
    }

    links.push({ ...base, mode: "url", url: buildUrlCheckout(site, lines, customer) });
  }

  return links;
}
